const express = require('express');
const pool = require('../db');
const { auth, adminOnly } = require('../middleware');
const { writeAudit } = require('../audit');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const [colleges] = await connection.execute('SELECT * FROM colleges ORDER BY name');
    res.json({ colleges });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch colleges' }); }
  finally { connection.release(); }
});

router.post('/', auth, adminOnly, async (req, res) => {
  const { name, short_name, address, city, state, country, contact_person, email, phone } = req.body;
  if (!name) return res.status(400).json({ error: 'College name required' });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute('INSERT INTO colleges (name, short_name, address, city, state, country, contact_person, email, phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [name, short_name ?? null, address ?? null, city ?? null, state ?? null, country ?? null, contact_person ?? null, email ?? null, phone ?? null]);
    await writeAudit(connection, { userId: req.userId, tableName: 'colleges', recordId: result.insertId, action: 'INSERT', newValues: req.body, request: req });
    await connection.commit();
    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) { await connection.rollback(); console.error(JSON.stringify({ level: 'error', requestId: req.requestId, errorCode: err.code || 'DATABASE_ERROR', errorType: err.name, errorMessage: String(err.message).slice(0, 120) })); res.status(500).json({ error: 'Failed to create college' }); }
  finally { connection.release(); }
});

router.put('/:id', auth, adminOnly, async (req, res) => {
  const { name, short_name, address, city, state, country, contact_person, email, phone } = req.body;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[oldValues]] = await connection.execute('SELECT * FROM colleges WHERE id=? FOR UPDATE', [req.params.id]);
    await connection.execute('UPDATE colleges SET name=?, short_name=?, address=?, city=?, state=?, country=?, contact_person=?, email=?, phone=? WHERE id=?', [name ?? oldValues?.name, short_name ?? oldValues?.short_name ?? null, address ?? oldValues?.address ?? null, city ?? oldValues?.city ?? null, state ?? oldValues?.state ?? null, country ?? oldValues?.country ?? null, contact_person ?? oldValues?.contact_person ?? null, email ?? oldValues?.email ?? null, phone ?? oldValues?.phone ?? null, req.params.id]);
    if (oldValues) await writeAudit(connection, { userId: req.userId, tableName: 'colleges', recordId: req.params.id, action: 'UPDATE', oldValues, newValues: req.body, request: req });
    await connection.commit();
    res.json({ success: true });
  } catch (err) { await connection.rollback(); res.status(500).json({ error: 'Failed to update college' }); }
  finally { connection.release(); }
});

router.delete('/:id', auth, adminOnly, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[oldValues]] = await connection.execute('SELECT * FROM colleges WHERE id=? FOR UPDATE', [req.params.id]);
    await connection.execute('DELETE FROM colleges WHERE id = ?', [req.params.id]);
    if (oldValues) await writeAudit(connection, { userId: req.userId, tableName: 'colleges', recordId: req.params.id, action: 'DELETE', oldValues, request: req });
    await connection.commit();
    res.json({ success: true });
  } catch (err) { await connection.rollback(); res.status(500).json({ error: 'Failed to delete college' }); }
  finally { connection.release(); }
});

module.exports = router;
