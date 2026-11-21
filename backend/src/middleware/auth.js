const User = require('../models/User');
const { verifyAccessToken } = require('../utils/security');

async function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ message: 'Authentication required.' });
    req.user = user;
    return next();
  } catch (_error) {
    return res.status(401).json({ message: 'Authentication required.' });
  }
}

module.exports = { requireAuth };
