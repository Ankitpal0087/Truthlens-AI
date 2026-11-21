const mongoose = require('mongoose');

const predictionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    textExcerpt: { type: String, required: true, trim: true, maxlength: 500 },
    label: { type: String, enum: ['Fake', 'Real', 'Other', 'Uncertain'], required: true },
    algorithm: { type: String, enum: ['logistic-regression'], required: true },
    modelVersion: { type: String, required: true, maxlength: 50 },
    confidence: { type: Number, min: 0, max: 1, default: null },
    requestStatus: { type: String, enum: ['success'], default: 'success', required: true },
  },
  { timestamps: true },
);

predictionSchema.index({ user: 1, createdAt: -1 });
predictionSchema.index({ user: 1, label: 1, createdAt: -1 });
predictionSchema.index({ user: 1, algorithm: 1, createdAt: -1 });

module.exports = mongoose.model('Prediction', predictionSchema);
