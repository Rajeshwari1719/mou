const express = require('express');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { auth } = require('../middleware');
const { writeAudit } = require('../audit');
const { EMAIL_PATTERN, normalizeEmail, validateSignup, publicSignupRole } = require('../authValidation');
const { rateLimit } = require('../rateLimit');

const router = express.Router();

const normalizeUser = (user) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  age: user.age ?? null,
  gender: user.gender ?? null,
  phone: user.phone ?? null,
  department: user.department ?? null,
  designation: user.designation ?? null,
  address: user.address ?? null,
});

router.post('/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 5 }), async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { password } = req.body;
  if (!email || !password) return res.status(422).json({ success: false, message: 'Email and password are required.' });
  if (!EMAIL_PATTERN.test(email)) return res.status(422).json({ success: false, message: 'Enter a valid email address.' });
  const connection = await pool.getConnection();
  try {
    const [users] = await connection.execute(
      'SELECT id, email, name, password_hash, role FROM users WHERE email = ?',
      [email]
    );
    if (!users.length) return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    const user = users[0];
    const match = await bcryptjs.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ success: false, message: 'Invalid email or password.' });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '8h', issuer: 'college-mou-management' });
    await writeAudit(connection, { userId: user.id, tableName: 'users', recordId: user.id, action: 'LOGIN', newValues: { email: user.email }, request: req });
    res.json({ success: true, token, user: normalizeUser(user) });
  } catch (err) {
    
    res.status(500).json({ error: 'Login failed' });
  } finally {
    connection.release();
  }
});

router.post('/signup', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10 }), async (req, res) => {
  const validationErrors = validateSignup(req.body);
  if (validationErrors.length) return res.status(422).json({ success: false, message: validationErrors.join(' ') });

  const email = normalizeEmail(req.body.email);
  const name = String(req.body.name).trim();
  const role = publicSignupRole(req.body.role);
  const connection = await pool.getConnection();
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [existing] = await connection.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    if (existing.length) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }
    const passwordHash = await bcryptjs.hash(String(req.body.password), 12);
    const [result] = await connection.execute('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', [name, email, passwordHash, role]);
    await writeAudit(connection, { userId: result.insertId, tableName: 'users', recordId: result.insertId, action: 'INSERT', newValues: { email, role }, request: req, allowLegacyRequestIdSchema: true });
    await connection.commit();
    transactionStarted = false;
    res.status(201).json({ success: true, message: 'Account created successfully. You can now sign in.', data: { id: result.insertId, email, role } });
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    console.error(JSON.stringify({ level: 'error', event: 'signup_failed', requestId: req.requestId, errorCode: error.code || 'UNKNOWN' }));
    res.status(500).json({ success: false, message: 'Unable to create the account.' });
  } finally {
    connection.release();
  }
});

router.get('/me', auth, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const [users] = await connection.execute(
      'SELECT id, email, name, role, age, gender, phone, department, designation, address FROM users WHERE id = ?',
      [req.userId]
    );
    if (!users.length) return res.status(404).json({ error: 'User not found' });
    res.json({ user: normalizeUser(users[0]) });
  } catch (err) {
    
    res.status(500).json({ error: 'Failed' });
  } finally {
    connection.release();
  }
});

router.put('/profile', auth, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const [[oldValues]] = await connection.execute('SELECT id, email, name, age, gender, phone, department, designation, address FROM users WHERE id=?', [req.userId]);
    const allowedFields = ['name', 'email', 'age', 'gender', 'phone', 'department', 'designation', 'address'];
    const updates = [];
    const values = [];

    allowedFields.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(req.body, field)) return;
      const value = req.body[field];
      if (field === 'name' && (!value || !String(value).trim())) {
        throw new Error('Name is required');
      }
      if (field === 'email' && (!value || !String(value).trim())) {
        throw new Error('Email is required');
      }

      if (field === 'age') {
        const ageValue = value === '' || value === null || value === undefined ? null : Number(value);
        updates.push('age = ?');
        values.push(Number.isNaN(ageValue) ? null : ageValue);
        return;
      }

      const normalizedValue = value === '' || value === null || value === undefined ? null : String(value).trim();
      updates.push(`${field} = ?`);
      values.push(normalizedValue);
    });

    if (!updates.length) return res.status(400).json({ error: 'No valid profile fields provided' });

    const email = req.body.email ? String(req.body.email).trim().toLowerCase() : null;
    if (email) {
      const [conflicts] = await connection.execute('SELECT id FROM users WHERE email = ? AND id != ?', [email, req.userId]);
      if (conflicts.length) return res.status(409).json({ error: 'Email already exists' });
    }

    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
    await connection.execute(query, [...values, req.userId]);

    const [updatedUsers] = await connection.execute(
      'SELECT id, email, name, role, age, gender, phone, department, designation, address FROM users WHERE id = ?',
      [req.userId]
    );

    if (!updatedUsers.length) return res.status(404).json({ error: 'User not found' });

    await writeAudit(connection, { userId: req.userId, tableName: 'users', recordId: req.userId, action: 'UPDATE', oldValues, newValues: updatedUsers[0], request: req });

    res.json({ success: true, user: normalizeUser(updatedUsers[0]) });
  } catch (err) {
    
    const status = err.message === 'Email already exists' || err.message === 'Name is required' || err.message === 'Email is required' ? 400 : 500;
    res.status(status).json({ error: err.message || 'Profile update failed' });
  } finally {
    connection.release();
  }
});

module.exports = router;
