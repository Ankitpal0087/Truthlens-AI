import logging
import os
import pickle
import re
import string
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()

logger = logging.getLogger("truthlens-ml-api")

BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "model"
# Allow deployments to keep the artifacts outside the source tree.  The
# defaults preserve the existing local layout.
MODEL_PATH = Path(os.getenv("MODEL_PATH") or (MODEL_DIR / "logistic_model.pkl"))
VECTORIZER_PATH = Path(os.getenv("VECTORIZER_PATH") or (MODEL_DIR / "vectorizer.pkl"))
MAX_TEXT_LENGTH = 100_000
LABELS = {0: "Fake", 1: "Real"}
ALGORITHM_ID = "logistic-regression"
MODEL_VERSION = "logistic-regression-artifact-1"

model: Optional[Any] = None
vectorizer: Optional[Any] = None
load_error: Optional[str] = None


def wordopt(text: str) -> str:
    """Reproduce the notebook's original text preprocessing exactly."""
    text = text.lower()
    text = re.sub(r"\[.*?\]", "", text)
    text = re.sub(r"https?://\S+|www\.\S+", "", text)
    text = re.sub(r"<.*?>+", "", text)
    text = re.sub(r"[%s]" % re.escape(string.punctuation), "", text)
    text = re.sub(r"\n", "", text)
    text = re.sub(r"\w*\d\w*", "", text)
    return text


def load_artifacts() -> None:
    global model, vectorizer, load_error

    try:
        with MODEL_PATH.open("rb") as model_file:
            loaded_model = pickle.load(model_file)
        with VECTORIZER_PATH.open("rb") as vectorizer_file:
            loaded_vectorizer = pickle.load(vectorizer_file)

        classes = getattr(loaded_model, "classes_", None)
        class_values = classes.tolist() if hasattr(classes, "tolist") else list(classes or [])
        if set(class_values) != set(LABELS):
            raise ValueError("The saved estimator does not contain the expected classes.")

        # The artifact was serialized with scikit-learn 1.9.0 and is currently
        # loaded by 1.7.x. That version changed LogisticRegression persistence:
        # older runtimes may deserialize a valid fitted estimator without the
        # `multi_class` parameter required by predict_proba(). The notebook used
        # LogisticRegression() with the default setting, which is `auto` here.
        if type(loaded_model).__name__ == "LogisticRegression" and not hasattr(loaded_model, "multi_class"):
            loaded_model.multi_class = "auto"
            logger.warning(
                "Applied LogisticRegression compatibility shim for missing multi_class "
                "on a cross-version model artifact."
            )

        model = loaded_model
        vectorizer = loaded_vectorizer
        load_error = None
        logger.info("Model and vectorizer loaded successfully.")
    except Exception as exc:
        model = None
        vectorizer = None
        load_error = type(exc).__name__
        logger.exception(
            "Unable to load ML artifacts (model_path=%s, vectorizer_path=%s, error_type=%s).",
            MODEL_PATH,
            VECTORIZER_PATH,
            type(exc).__name__,
        )


class PredictionRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=MAX_TEXT_LENGTH)
    algorithm: str = ALGORITHM_ID


app = FastAPI(
    title="TruthLens AI ML API",
    version="0.2.0",
    description="Prediction service backed by the existing TruthLens AI Logistic Regression model.",
)

frontend_origins = [
    origin.strip()
    for origin in os.getenv(
        "FRONTEND_ORIGIN",
        "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173,http://localhost:4173",
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

load_artifacts()


@app.get("/health")
def health() -> dict[str, object]:
    loaded = model is not None and vectorizer is not None
    return {
        "service": "truthlens-ml-api",
        "status": "ok" if loaded else "unavailable",
        "model_loaded": model is not None,
        "vectorizer_loaded": vectorizer is not None,
        "load_error": load_error,
    }


@app.post("/predict")
def predict(request: PredictionRequest) -> dict[str, object]:
    if request.algorithm != ALGORITHM_ID:
        raise HTTPException(status_code=400, detail="The selected algorithm is not available.")
    if not request.text.strip():
        raise HTTPException(status_code=422, detail="News text must not be empty.")
    if model is None or vectorizer is None:
        raise HTTPException(status_code=503, detail="The prediction service is unavailable.")

    try:
        processed_text = wordopt(request.text)
        transformed_text = vectorizer.transform([processed_text])
        predicted_class = int(model.predict(transformed_text)[0])
        result: dict[str, object] = {
            "label": LABELS[predicted_class],
            "class_id": predicted_class,
            "algorithm": ALGORITHM_ID,
            "model_version": MODEL_VERSION,
        }

        result["confidence"] = None
        if hasattr(model, "predict_proba"):
            try:
                probabilities = model.predict_proba(transformed_text)[0]
                probability_values = [float(value) for value in probabilities]
                probability_sum = sum(probability_values)
                if (
                    not probability_values
                    or any(value < 0 or value > 1 for value in probability_values)
                    or abs(probability_sum - 1.0) > 1e-6
                ):
                    raise ValueError("The estimator returned an invalid probability vector.")
                result["confidence"] = max(probability_values)
                result["confidence_note"] = (
                    "Model probability estimate, not a guarantee of factual accuracy."
                )
            except Exception as exc:
                logger.warning(
                    "The loaded estimator could not calculate a valid probability vector "
                    "(error_type=%s).",
                    type(exc).__name__,
                )
                result["confidence_note"] = "Probability estimate unavailable for this estimator runtime."

        return result
    except (KeyError, ValueError, TypeError):
        logger.exception(
            "Prediction input/model error (text_length=%d, model_loaded=%s, vectorizer_loaded=%s).",
            len(request.text),
            model is not None,
            vectorizer is not None,
        )
        raise HTTPException(status_code=422, detail="The news text could not be processed.")
    except Exception as exc:
        logger.exception(
            "Prediction failed (text_length=%d, model_type=%s, vectorizer_type=%s, error_type=%s).",
            len(request.text),
            type(model).__name__ if model is not None else "unavailable",
            type(vectorizer).__name__ if vectorizer is not None else "unavailable",
            type(exc).__name__,
        )
        raise HTTPException(status_code=500, detail="Prediction failed.")

