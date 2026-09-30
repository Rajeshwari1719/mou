const jwt = require('jsonwebtoken');
const pool = require('./db');

const auth = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'Authentication required.' });
  if (!process.env.JWT_SECRET) return res.status(500).json({ success: false, message: 'Authentication is not configured.' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { issuer: 'college-mou-management' });
    if (!decoded.id) return res.status(401).json({ success: false, message: 'Invalid token.' });
    const [users] = await pool.execute('SELECT id, email, name, role FROM users WHERE id = ?', [decoded.id]);
    if (!users.length) return res.status(401).json({ success: false, message: 'User account is no longer active.' });
    req.user = users[0];
    req.userId = users[0].id;
    req.userRole = users[0].role;
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Authentication required.' });
  if (!roles.includes(req.userRole)) return res.status(403).json({ success: false, message: 'You do not have permission to perform this action.' });
  next();
};

const adminOnly = (req, res, next) => {
  return authorize('admin')(req, res, next);
};

module.exports = { auth, authorize, adminOnly };
