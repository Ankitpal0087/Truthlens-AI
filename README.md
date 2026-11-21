# TruthLens AI

TruthLens AI is a fake-news detection web application. It is organized into three independent services:

- `frontend`: React, Vite, Tailwind CSS
- `backend`: Node.js and Express.js
- `ml-api`: Python and FastAPI, using the existing trained Logistic Regression model

The ML service does not train or modify the existing model. It loads `ml-api/model/logistic_model.pkl` and `ml-api/model/vectorizer.pkl` and reproduces the notebook's `wordopt` preprocessing. The Express backend provides JWT authentication backed by MongoDB.

## Requirements for Windows

Install these tools first:

- Node.js 18 or newer
- Python 3.10 or newer
- MongoDB Community Server or a reachable MongoDB deployment

## Project structure

```text
TruthLens AI/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── database.js
│   │   │   └── env.js
│   │   ├── controllers/authController.js
│   │   ├── middleware/auth.js
│   │   ├── models/User.js
│   │   ├── routes/authRoutes.js
│   │   ├── utils/
│   │   │   ├── security.js
│   │   │   └── validation.js
│   │   ├── app.js
│   │   └── server.js
│   ├── .env.example
│   ├── package.json
│   └── test/auth.test.js
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── index.css
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   ├── postcss.config.js
│   ├── tailwind.config.js
│   └── vite.config.js
├── ml-api/
│   ├── app.py
│   ├── model/
│   │   ├── logistic_model.pkl
│   │   └── vectorizer.pkl
│   ├── .env.example
│   └── requirements.txt
└── .gitignore
```

## Windows setup

Open three PowerShell windows from the project root.

### Frontend

```powershell
cd "D:\TruthLens AI\frontend"
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

### Backend

```powershell
cd "D:\TruthLens AI\backend"
Copy-Item .env.example .env
npm install
npm run dev
```

The backend listens on `http://127.0.0.1:5001`. Ensure MongoDB is running and `.env` contains a valid `MONGODB_URI` and a long random `JWT_SECRET`.

Run backend unit tests:

```powershell
cd "D:\TruthLens AI\backend"
npm test
```

### Authentication API

The frontend includes login and account-creation forms backed by these endpoints. After authentication it opens the News Testing workspace, which sends article text to the ML API's `POST /predict` endpoint. It stores the JWT access token locally and revalidates it with `GET /api/auth/me` after a browser refresh. Logout removes the client token; the backend remains stateless as described below.

Registration uses `POST /api/auth/register` with `fullName`, `email`, `phone`, and `password`. Login uses `POST /api/auth/login` with `identifier` (email or phone) and `password`.

Use the returned JWT as `Authorization: Bearer <token>` for:

- `GET /api/auth/me` — authenticated basic profile
- `POST /api/auth/logout` — client-side token removal guidance

Password reset routes are `POST /api/auth/forgot-password` and `POST /api/auth/reset-password`. SMTP is not configured by default, so no email is sent and reset tokens are never returned in API responses. Configure all `SMTP_*` variables and add an email provider integration before enabling delivery. Reset tokens are stored only as hashes with an expiration time.

Logout is stateless: removing the token from the client prevents normal reuse, but an already-issued JWT remains valid until it expires. A future token-revocation store would be needed for immediate server-side invalidation.

### ML API

```powershell
cd "D:\TruthLens AI\ml-api"
py -3 -m venv .venv
\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
Copy-Item .env.example .env
python -m uvicorn app:app --reload --host 127.0.0.1 --port 8007
```

The ML service listens on `http://127.0.0.1:8007`.

The News Testing button calls the ML service directly through `POST /predict` with
`{ "text": "..." }`; it is not an Express or MongoDB route and does not require a JWT.
During Vite development, `/predict` is proxied to `http://127.0.0.1:8007`. Built or
preview frontends use that same local URL by default, while separately deployed
frontends must set `VITE_ML_API_URL` to the reachable ML API URL. Start the ML
service before using News Testing.

Check model loading:

```powershell
Invoke-RestMethod http://127.0.0.1:8007/health
```

Predict from PowerShell:

```powershell
$body = @{ text = 'The government announced a new public policy today.' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8007/predict -ContentType 'application/json' -Body $body
```

The prediction response contains `label` (`Fake` or `Real`), `class_id` (`0` or `1`), and a probability-based `confidence` when supported by the saved estimator. Confidence is an estimator probability, not a factual guarantee. The API applies a compatibility shim for the saved Logistic Regression artifact when scikit-learn 1.7.x loads a model serialized by 1.9.x, restoring the missing `multi_class="auto"` parameter needed by `predict_proba()`.

Authenticated history endpoints are mounted under `/api/predictions`: `GET /algorithms`, `POST /`, `GET /`, `GET /analytics`, `GET /export.csv`, `GET /:id`, and `DELETE /:id`. Prediction records store only a 500-character excerpt, result metadata, confidence when valid, algorithm, model version, status, owner, and timestamps. All history queries are scoped to the authenticated user.

Only Logistic Regression is currently available because it is the only saved model artifact in `ml-api/model/`. The dashboard does not present unsupported algorithms as selectable options.

### Model compatibility note

The saved pickle artifacts report scikit-learn version `1.9.0`, while Python 3.10 currently supports the installed scikit-learn `1.7.2`. The artifacts load and `predict()` works, but scikit-learn warns about the version difference and `predict_proba()` is unavailable in this runtime, so the API returns `confidence: null`. Do not retrain or overwrite the artifacts. A Python 3.11+ environment with the matching scikit-learn release can be used later if probability output is required.

## Environment files

Copy each `.env.example` to `.env` locally and replace placeholders with local values. Do not commit `.env` files or place passwords, JWT secrets, or database credentials in source code.

## Security and database notes

Passwords are hashed with bcrypt and never returned. Authentication errors use generic messages, authentication routes are rate-limited, CORS is restricted to the comma-separated origins in `CORS_ORIGIN`, and secrets/connection strings belong only in the ignored `.env` file.

The backend can start when MongoDB is unavailable so `/api/health` reports `503` and authentication routes return a safe service-unavailable response. No real MongoDB authentication tests are claimed unless a local MongoDB instance is provided.

