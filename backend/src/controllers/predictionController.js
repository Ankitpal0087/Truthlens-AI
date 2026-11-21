const mongoose = require('mongoose');
const path = require('path');
const { spawn } = require('child_process');
const Prediction = require('../models/Prediction');
const { env } = require('../config/env');

const ALGORITHMS = Object.freeze([
  {
    id: 'logistic-regression',
    name: 'Logistic Regression',
    modelVersion: 'logistic-regression-artifact-1',
    supportsConfidence: true,
    available: true,
  },
]);
const ALGORITHM_IDS = new Set(ALGORITHMS.map((algorithm) => algorithm.id));
const MAX_TEXT_LENGTH = 100_000;
let mlApiProcess = null;
let mlApiStartPromise = null;

function getAlgorithm(id) {
  return ALGORITHMS.find((algorithm) => algorithm.id === id);
}

function invalidAlgorithm(res) {
  return res.status(400).json({ message: 'The selected algorithm is not available.' });
}

function excerpt(text) {
  return text.trim().replace(/\s+/g, ' ').slice(0, 500);
}

async function waitForMlApi() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${env.mlApiUrl}/health`);
      if (response.ok) return true;
    } catch (_error) {
      // The service may still be loading the saved model.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function startMlApiIfNeeded() {
  if (!env.mlApiAutostart) return false;
  if (mlApiProcess && mlApiProcess.exitCode === null) return waitForMlApi();
  if (mlApiStartPromise) return mlApiStartPromise;

  mlApiStartPromise = (async () => {
    const mlApiDir = path.resolve(env.mlApiDir);
    mlApiProcess = spawn(
      env.mlApiPython,
      ['-m', 'uvicorn', 'app:app', '--host', '127.0.0.1', '--port', '8007'],
      { cwd: mlApiDir, windowsHide: true, stdio: 'ignore' },
    );
    mlApiProcess.once('error', (error) => {
      console.error(`ML API auto-start failed (${error.message}).`);
    });
    mlApiProcess.once('exit', (code) => {
      if (code !== 0) console.error(`ML API exited unexpectedly (code=${code ?? 'unknown'}).`);
      mlApiProcess = null;
    });
    return waitForMlApi();
  })().finally(() => {
    mlApiStartPromise = null;
  });
  return mlApiStartPromise;
}

async function requestMlApi(text, algorithm) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let response;
  try {
    response = await fetch(`${env.mlApiUrl}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, algorithm }),
      signal: controller.signal,
    });
  } catch (error) {
    const wrapped = new Error(
      error.name === 'AbortError'
        ? `ML API request timed out after 15 seconds (${env.mlApiUrl}).`
        : `ML API could not be reached at ${env.mlApiUrl}.`,
      { cause: error },
    );
    wrapped.code = error.name === 'AbortError' ? 'ML_API_TIMEOUT' : 'ML_API_UNREACHABLE';
    throw wrapped;
  } finally {
    clearTimeout(timeout);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.detail || body.message || `ML service returned HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function callMlApi(text, algorithm) {
  try {
    return await requestMlApi(text, algorithm);
  } catch (error) {
    if (error.code !== 'ML_API_UNREACHABLE' || !(await startMlApiIfNeeded())) throw error;
    return requestMlApi(text, algorithm);
  }
}

async function listAlgorithms(_req, res) {
  return res.json({ algorithms: ALGORITHMS });
}

async function createPrediction(req, res) {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  const algorithm = typeof req.body?.algorithm === 'string' ? req.body.algorithm : 'logistic-regression';
  if (!text || text.length > MAX_TEXT_LENGTH) {
    return res.status(400).json({ message: 'News text must be between 1 and 100,000 characters.' });
  }
  if (!ALGORITHM_IDS.has(algorithm)) return invalidAlgorithm(res);

  try {
    const result = await callMlApi(text, algorithm);
    const selectedAlgorithm = getAlgorithm(algorithm);
    const confidence = typeof result.confidence === 'number' && Number.isFinite(result.confidence)
      ? result.confidence
      : null;
    const prediction = await Prediction.create({
      user: req.user._id,
      textExcerpt: excerpt(text),
      label: ['Fake', 'Real'].includes(result.label) ? result.label : 'Uncertain',
      algorithm,
      modelVersion: result.model_version || selectedAlgorithm.modelVersion,
      confidence,
      requestStatus: 'success',
    });
    return res.status(201).json({
      prediction: {
        id: prediction._id,
        createdAt: prediction.createdAt,
        textExcerpt: prediction.textExcerpt,
        label: prediction.label,
        algorithm: prediction.algorithm,
        modelVersion: prediction.modelVersion,
        confidence: prediction.confidence,
        requestStatus: prediction.requestStatus,
      },
      result,
    });
  } catch (error) {
    console.error(
      `Prediction request failed (${error.name || 'Error'}, code=${error.code || 'unknown'}, `
      + `status=${error.status || 'unknown'}, message=${error.message || 'No details'}).`,
    );
    if (error.status === 400) return res.status(400).json({ message: error.message });
    if (error.code === 'ML_API_UNREACHABLE' || error.code === 'ML_API_TIMEOUT') {
      return res.status(503).json({
        message: 'The ML prediction service is not reachable. Start the ML API on port 8007 and try again.',
      });
    }
    return res.status(503).json({ message: 'The news analysis service is unavailable.' });
  }
}

function buildMatch(req) {
  const match = { user: req.user._id };
  const { label, algorithm, search, dateFrom, dateTo } = req.query;
  if (label && ['Fake', 'Real', 'Other', 'Uncertain'].includes(label)) match.label = label;
  if (algorithm && ALGORITHM_IDS.has(algorithm)) match.algorithm = algorithm;
  if (search) match.textExcerpt = { $regex: String(search).slice(0, 100), $options: 'i' };
  if (dateFrom || dateTo) {
    match.createdAt = {};
    if (dateFrom && !Number.isNaN(Date.parse(dateFrom))) match.createdAt.$gte = new Date(dateFrom);
    if (dateTo && !Number.isNaN(Date.parse(dateTo))) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      match.createdAt.$lte = end;
    }
    if (!Object.keys(match.createdAt).length) delete match.createdAt;
  }
  return match;
}

function serializePrediction(item) {
  return {
    id: item._id,
    createdAt: item.createdAt,
    textExcerpt: item.textExcerpt,
    label: item.label,
    algorithm: item.algorithm,
    modelVersion: item.modelVersion,
    confidence: item.confidence,
    requestStatus: item.requestStatus,
  };
}

async function listPredictions(req, res) {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
  const match = buildMatch(req);
  const [items, total] = await Promise.all([
    Prediction.find(match).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Prediction.countDocuments(match),
  ]);
  return res.json({ items: items.map(serializePrediction), page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });
}

async function getPrediction(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid prediction id.' });
  const item = await Prediction.findOne({ _id: req.params.id, user: req.user._id }).lean();
  if (!item) return res.status(404).json({ message: 'Prediction not found.' });
  return res.json({ prediction: serializePrediction(item) });
}

async function deletePrediction(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid prediction id.' });
  const deleted = await Prediction.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!deleted) return res.status(404).json({ message: 'Prediction not found.' });
  return res.json({ message: 'Prediction deleted.' });
}

async function analytics(req, res) {
  const match = buildMatch(req);
  const [byLabel, byDay, byAlgorithm, confidence] = await Promise.all([
    Prediction.aggregate([{ $match: match }, { $group: { _id: '$label', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Prediction.aggregate([
      { $match: match },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Prediction.aggregate([{ $match: match }, { $group: { _id: '$algorithm', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Prediction.aggregate([
      { $match: { ...match, confidence: { $type: 'number' } } },
      { $group: { _id: null, count: { $sum: 1 }, average: { $avg: '$confidence' }, minimum: { $min: '$confidence' }, maximum: { $max: '$confidence' } } },
    ]),
  ]);
  const total = byLabel.reduce((sum, entry) => sum + entry.count, 0);
  return res.json({
    total,
    labels: byLabel.map((entry) => ({ label: entry._id, count: entry.count })),
    daily: byDay.map((entry) => ({ date: entry._id, count: entry.count })),
    algorithms: byAlgorithm.map((entry) => ({ algorithm: entry._id, count: entry.count })),
    confidence: confidence[0] ? { count: confidence[0].count, average: confidence[0].average, minimum: confidence[0].minimum, maximum: confidence[0].maximum } : null,
  });
}

async function exportCsv(req, res) {
  const items = await Prediction.find(buildMatch(req)).sort({ createdAt: -1 }).lean();
  const cell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const rows = [
    ['Date', 'News excerpt', 'Label', 'Algorithm', 'Model version', 'Confidence', 'Status'],
    ...items.map((item) => [item.createdAt?.toISOString(), item.textExcerpt, item.label, item.algorithm, item.modelVersion, item.confidence ?? '', item.requestStatus]),
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="truthlens-prediction-history.csv"');
  return res.send(rows.map((row) => row.map(cell).join(',')).join('\r\n'));
}

module.exports = { analytics, createPrediction, deletePrediction, exportCsv, getPrediction, listAlgorithms, listPredictions };
