const express = require('express');
const { requireAuth } = require('../middleware/auth');
const controller = require('../controllers/predictionController');

const router = express.Router();
router.use(requireAuth);
router.get('/algorithms', controller.listAlgorithms);
router.get('/analytics', controller.analytics);
router.get('/export.csv', controller.exportCsv);
router.post('/', controller.createPrediction);
router.get('/', controller.listPredictions);
router.get('/:id', controller.getPrediction);
router.delete('/:id', controller.deletePrediction);

module.exports = router;
