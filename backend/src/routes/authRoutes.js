const express = require('express');
const rateLimit = require('express-rate-limit');

const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many authentication attempts. Try again later.' },
});

router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.post('/forgot-password', authLimiter, authController.forgotPassword);
router.post('/reset-password', authLimiter, authController.resetPassword);
router.get('/me', requireAuth, authController.profile);
router.post('/logout', requireAuth, authController.logout);

module.exports = router;
