const express = require('express');
const pool = require('../db');
const { auth, adminOnly } = require('../middleware');
const { writeAudit } = require('../audit');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const [departments] = await connection.execute(`
      SELECT d.id, d.name, d.college_id, c.name as college_name 
      FROM departments d 
      JOIN colleges c ON d.college_id = c.id 
      ORDER BY c.name, d.name
    `);
    res.json({ departments });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch departments' }); }
  finally { connection.release(); }
});

router.get('/college/:collegeId', auth, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const [departments] = await connection.execute('SELECT id, name FROM departments WHERE college_id = ? ORDER BY name', [req.params.collegeId]);
    res.json({ departments });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch departments' }); }
  finally { connection.release(); }
});

router.post('/', auth, adminOnly, async (req, res) => {
  const { college_id, name } = req.body;
  if (!college_id || !name) return res.status(400).json({ error: 'Partner ID and name required' });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute('INSERT INTO departments (college_id, name) VALUES (?, ?)', [college_id, name]);
    await writeAudit(connection, { userId: req.userId, tableName: 'departments', recordId: result.insertId, action: 'INSERT', newValues: req.body, request: req });
    await connection.commit();
    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) { await connection.rollback(); res.status(500).json({ error: 'Failed to create department' }); }
  finally { connection.release(); }
});

router.put('/:id', auth, adminOnly, async (req, res) => {
  const { name } = req.body;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[oldValues]] = await connection.execute('SELECT * FROM departments WHERE id=? FOR UPDATE', [req.params.id]);
    await connection.execute('UPDATE departments SET name=? WHERE id=?', [name, req.params.id]);
    if (oldValues) await writeAudit(connection, { userId: req.userId, tableName: 'departments', recordId: req.params.id, action: 'UPDATE', oldValues, newValues: req.body, request: req });
    await connection.commit();
    res.json({ success: true });
  } catch (err) { await connection.rollback(); res.status(500).json({ error: 'Failed to update department' }); }
  finally { connection.release(); }
});

router.delete('/:id', auth, adminOnly, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[oldValues]] = await connection.execute('SELECT * FROM departments WHERE id=? FOR UPDATE', [req.params.id]);
    await connection.execute('DELETE FROM departments WHERE id = ?', [req.params.id]);
    if (oldValues) await writeAudit(connection, { userId: req.userId, tableName: 'departments', recordId: req.params.id, action: 'DELETE', oldValues, request: req });
    await connection.commit();
    res.json({ success: true });
  } catch (err) { await connection.rollback(); res.status(500).json({ error: 'Failed to delete department' }); }
  finally { connection.release(); }
});

module.exports = router;
