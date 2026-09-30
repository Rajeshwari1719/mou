const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { auth, adminOnly } = require('../middleware');
const { writeAudit } = require('../audit');

const router = express.Router();

router.put('/auth/password', auth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || newPassword.length < 8) return res.status(400).json({ error: 'Current password and a new password of at least 8 characters are required.' });
  try {
    const [rows] = await pool.execute('SELECT password_hash FROM users WHERE id=?', [req.userId]);
    if (!rows.length || !(await bcrypt.compare(currentPassword, rows[0].password_hash))) return res.status(400).json({ error: 'Current password is incorrect.' });
    const hash = await bcrypt.hash(newPassword, 12);
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute('UPDATE users SET password_hash=? WHERE id=?', [hash, req.userId]);
      await writeAudit(connection, { userId: req.userId, tableName: 'users', recordId: req.userId, action: 'UPDATE', newValues: { password_changed: true }, request: req });
      await connection.commit();
    } catch (error) { await connection.rollback();  return res.status(500).json({ error: 'Failed to change password' }); } finally { connection.release(); }
    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (e) {  res.status(500).json({ error: 'Failed to change password' }); }
});

router.get('/notifications', auth, async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT n.*, c.name AS college_name FROM notifications n LEFT JOIN mous m ON n.mou_id=m.id LEFT JOIN colleges c ON m.college_id=c.id WHERE n.user_id=? ORDER BY n.created_at DESC LIMIT 100`, [req.userId]);
    res.json({ notifications: rows });
  } catch (e) {  res.status(500).json({ error: 'Failed to fetch notifications' }); }
});

router.patch('/notifications/:id/read', auth, async (req, res) => {
  try { await pool.execute('UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?', [req.params.id, req.userId]); res.json({ success: true }); }
  catch (e) {  res.status(500).json({ error: 'Failed to update notification' }); }
});

router.get('/audit-logs', auth, adminOnly, async (req,res)=>{ try{const[logs]=await pool.query(`SELECT a.*,u.name AS user_name,u.email AS user_email FROM audit_logs a LEFT JOIN users u ON a.user_id=u.id ORDER BY a.created_at DESC LIMIT 200`);res.json({logs});}catch(e){res.status(500).json({error:'Failed to fetch audit logs'});}});

router.get('/contacts', auth, async (req,res)=>{ try{const[contacts]=await pool.query(`SELECT m.id AS mou_id,m.contact_name AS name,m.contact_designation AS designation,m.contact_email AS email,m.contact_phone AS phone,c.name AS college_name FROM mous m JOIN colleges c ON c.id=m.college_id WHERE m.contact_name IS NOT NULL AND m.contact_name<>'' ORDER BY m.contact_name`);res.json({contacts});}catch(e){res.status(500).json({error:'Failed to fetch contacts'});}});

module.exports = router;
