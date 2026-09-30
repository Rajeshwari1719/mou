const express = require('express');
const pool = require('../db');
const { auth, authorize, adminOnly } = require('../middleware');
const { writeAudit } = require('../audit');
const { validateMou } = require('../validation');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 25, 1), 100);
    const offset = (page - 1) * limit;
    const values = [];
    const filters = [];
    const search = String(req.query.search || '').trim();
    if (search) {
      filters.push('(c.name LIKE ? OR d.name LIKE ? OR m.purpose LIKE ? OR CAST(m.serial_no AS CHAR) LIKE ?)');
      values.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (req.query.status === 'ACTIVE') filters.push('m.valid_upto >= UTC_DATE()');
    if (req.query.status === 'EXPIRING_SOON') filters.push('m.valid_upto >= UTC_DATE() AND m.valid_upto <= DATE_ADD(UTC_DATE(), INTERVAL 30 DAY)');
    if (req.query.status === 'EXPIRED') filters.push('m.valid_upto < UTC_DATE()');
    if (req.query.college_id && /^\d+$/.test(String(req.query.college_id))) { filters.push('m.college_id = ?'); values.push(Number(req.query.college_id)); }
    if (req.query.department_id && /^\d+$/.test(String(req.query.department_id))) { filters.push('m.department_id = ?'); values.push(Number(req.query.department_id)); }
    if (['National', 'International'].includes(req.query.type)) { filters.push('m.national_or_international = ?'); values.push(req.query.type); }
    if (req.query.from_date && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from_date)) { filters.push('m.mou_date >= ?'); values.push(req.query.from_date); }
    if (req.query.to_date && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to_date)) { filters.push('m.mou_date <= ?'); values.push(req.query.to_date); }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const [mous] = await connection.execute(`
      SELECT m.*, c.name as college_name, d.name as department_name,
         CASE WHEN m.valid_upto < UTC_DATE() THEN 'EXPIRED'
          WHEN m.valid_upto <= DATE_ADD(UTC_DATE(), INTERVAL 30 DAY) THEN 'EXPIRING_SOON'
          ELSE 'ACTIVE' END AS status
      FROM mous m
      JOIN colleges c ON m.college_id = c.id
      LEFT JOIN departments d ON m.department_id = d.id
      ${where}
      ORDER BY m.mou_date DESC, m.id DESC
      LIMIT ${limit} OFFSET ${offset}
    `, values);
    const [[count]] = await connection.execute(`SELECT COUNT(*) AS total FROM mous m JOIN colleges c ON c.id = m.college_id LEFT JOIN departments d ON d.id = m.department_id ${where}`, values);
    res.json({ mous, pagination: { page, limit, total: count.total, totalPages: Math.ceil(count.total / limit) } });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch MOUs' }); }
  finally { connection.release(); }
});

router.get('/:id', auth, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const [mous] = await connection.execute(`
      SELECT m.*, c.name as college_name, d.name as department_name,
         CASE WHEN m.valid_upto < UTC_DATE() THEN 'EXPIRED'
          WHEN m.valid_upto <= DATE_ADD(UTC_DATE(), INTERVAL 30 DAY) THEN 'EXPIRING_SOON'
          ELSE 'ACTIVE' END AS status
      FROM mous m
      JOIN colleges c ON m.college_id = c.id
      LEFT JOIN departments d ON m.department_id = d.id
      WHERE m.id = ?
    `, [req.params.id]);
    res.json({ mou: mous[0] || null });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch MOU' }); }
  finally { connection.release(); }
});

router.post('/', auth, authorize('admin'), async (req, res) => {
  const { serial_no, national_or_international, college_id, department_id, college_name, department_name, mou_date, valid_upto, purpose, activities, students_benefited, contact_name, contact_designation, contact_email, contact_phone } = req.body;
  const trimmedCollegeName = String(college_name || '').trim();
  const trimmedMouDate = String(mou_date || '').trim();

  const validationErrors = validateMou(req.body);
  if (validationErrors.length) return res.status(400).json({ success: false, message: validationErrors.join(' ') });

  if ((!college_id && !trimmedCollegeName) || !trimmedMouDate) {
    return res.status(400).json({ error: 'Partner name and MOU date are required' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    let resolvedCollegeId = college_id;
    if (!resolvedCollegeId) {
      const [existing] = await connection.execute('SELECT id FROM colleges WHERE name = ?', [trimmedCollegeName]);
      if (existing.length) resolvedCollegeId = existing[0].id;
      else { const [created] = await connection.execute('INSERT INTO colleges (name) VALUES (?)', [trimmedCollegeName]); resolvedCollegeId = created.insertId; }
    }
    let resolvedDepartmentId = department_id || null;
    if (!resolvedDepartmentId && department_name?.trim()) {
      const [existing] = await connection.execute('SELECT id FROM departments WHERE college_id = ? AND name = ?', [resolvedCollegeId, department_name.trim()]);
      if (existing.length) resolvedDepartmentId = existing[0].id;
      else { const [created] = await connection.execute('INSERT INTO departments (college_id, name) VALUES (?, ?)', [resolvedCollegeId, department_name.trim()]); resolvedDepartmentId = created.insertId; }
    }
    const [duplicate] = await connection.execute('SELECT id FROM mous WHERE college_id = ? AND mou_date = ? LIMIT 1', [resolvedCollegeId, trimmedMouDate]);
    if (duplicate.length) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'An MOU for this partner with the same signing date already exists.' });
    }
    const [result] = await connection.execute(
      'INSERT INTO mous (serial_no, national_or_international, college_id, department_id, mou_date, valid_upto, purpose, activities, students_benefited, contact_name, contact_designation, contact_email, contact_phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        serial_no ?? null,
        national_or_international || 'National',
        resolvedCollegeId,
        resolvedDepartmentId ?? null,
        trimmedMouDate,
        valid_upto || null,
        purpose ?? null,
        activities ?? null,
        students_benefited ?? 0,
        contact_name ?? null,
        contact_designation ?? null,
        contact_email ?? null,
        contact_phone ?? null,
      ]
    );
    await writeAudit(connection, { userId: req.userId, tableName: 'mous', recordId: result.insertId, action: 'INSERT', newValues: { ...req.body, college_id: resolvedCollegeId, department_id: resolvedDepartmentId }, request: req });
    await connection.commit();
    res.status(201).json({ success: true, id: result.insertId, message: 'MOU created successfully.' });
  } catch (err) { await connection.rollback(); console.error(JSON.stringify({ level: 'error', requestId: req.requestId, errorCode: err.code || 'DATABASE_ERROR', errorType: err.name })); res.status(err.code === 'ER_DUP_ENTRY' ? 409 : 500).json({ success: false, message: err.code === 'ER_DUP_ENTRY' ? 'An MOU with these details already exists.' : 'Failed to create MOU.' }); }
  finally { connection.release(); }
});

router.put('/:id', auth, authorize('admin'), async (req, res) => {
  if (!/^\d+$/.test(String(req.params.id || ''))) return res.status(400).json({ success: false, message: 'Invalid MOU id.' });
  const {
    serial_no,
    national_or_international,
    college_id,
    department_id,
    college_name,
    department_name,
    mou_date,
    valid_upto,
    purpose,
    activities,
    students_benefited,
    contact_name,
    contact_designation,
    contact_email,
    contact_phone,
  } = req.body;

  const trimmedCollegeName = String(college_name || '').trim();
  const trimmedMouDate = String(mou_date || '').trim();

  const validationErrors = validateMou(req.body);
  if (validationErrors.length) return res.status(400).json({ success: false, message: validationErrors.join(' ') });

  if ((!college_id && !trimmedCollegeName) || !trimmedMouDate) {
    return res.status(400).json({ error: 'Partner name and MOU date are required' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existingRows] = await connection.execute('SELECT * FROM mous WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!existingRows.length) { await connection.rollback(); return res.status(404).json({ success: false, message: 'MOU not found.' }); }
    let resolvedCollegeId = college_id;
    if (!resolvedCollegeId && trimmedCollegeName) {
      const [existingCollege] = await connection.execute('SELECT id FROM colleges WHERE name = ?', [trimmedCollegeName]);
      if (existingCollege.length) {
        resolvedCollegeId = existingCollege[0].id;
      } else {
        const [created] = await connection.execute('INSERT INTO colleges (name) VALUES (?)', [trimmedCollegeName]);
        resolvedCollegeId = created.insertId;
      }
    }

    let resolvedDepartmentId = department_id || null;
    if (!resolvedDepartmentId && department_name?.trim()) {
      const [existingDepartment] = await connection.execute('SELECT id FROM departments WHERE college_id = ? AND name = ?', [resolvedCollegeId, department_name.trim()]);
      if (existingDepartment.length) {
        resolvedDepartmentId = existingDepartment[0].id;
      } else {
        const [created] = await connection.execute('INSERT INTO departments (college_id, name) VALUES (?, ?)', [resolvedCollegeId, department_name.trim()]);
        resolvedDepartmentId = created.insertId;
      }
    }

    const [duplicate] = await connection.execute('SELECT id FROM mous WHERE college_id = ? AND mou_date = ? AND id <> ? LIMIT 1', [resolvedCollegeId, trimmedMouDate, req.params.id]);
    if (duplicate.length) { await connection.rollback(); return res.status(409).json({ success: false, message: 'An MOU for this partner with the same signing date already exists.' }); }

    await connection.execute(
      'UPDATE mous SET serial_no=?, national_or_international=?, college_id=?, department_id=?, mou_date=?, valid_upto=?, purpose=?, activities=?, students_benefited=?, contact_name=?, contact_designation=?, contact_email=?, contact_phone=?, updated_at=NOW() WHERE id=?',
      [
        serial_no ?? null,
        national_or_international || 'National',
        resolvedCollegeId ?? null,
        resolvedDepartmentId ?? null,
        trimmedMouDate,
        valid_upto || null,
        purpose ?? null,
        activities ?? null,
        students_benefited ?? 0,
        contact_name ?? null,
        contact_designation ?? null,
        contact_email ?? null,
        contact_phone ?? null,
        req.params.id,
      ]
    );
    await writeAudit(connection, { userId: req.userId, tableName: 'mous', recordId: req.params.id, action: 'UPDATE', oldValues: existingRows[0], newValues: req.body, request: req });
    await connection.commit();
    res.json({ success: true, message: 'MOU updated successfully.' });
  } catch (err) { await connection.rollback();  res.status(err.code === 'ER_DUP_ENTRY' ? 409 : 500).json({ success: false, message: err.code === 'ER_DUP_ENTRY' ? 'An MOU with these details already exists.' : 'Failed to update MOU.' }); }
  finally { connection.release(); }
});

router.delete('/:id', auth, adminOnly, async (req, res) => {
  if (!/^\d+$/.test(String(req.params.id || ''))) return res.status(400).json({ success: false, message: 'Invalid MOU id.' });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute('SELECT * FROM mous WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!rows.length) { await connection.rollback(); return res.status(404).json({ success: false, message: 'MOU not found.' }); }
    const [result] = await connection.execute('DELETE FROM mous WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) { await connection.rollback(); return res.status(404).json({ success: false, message: 'MOU was not deleted.' }); }
    await writeAudit(connection, { userId: req.userId, tableName: 'mous', recordId: req.params.id, action: 'DELETE', oldValues: rows[0], request: req });
    await connection.commit();
    res.json({ success: true, message: 'MOU deleted successfully.' });
  } catch (err) { await connection.rollback();  res.status(500).json({ success: false, message: 'Unable to delete this MOU. Please try again.' }); }
  finally { connection.release(); }
});

module.exports = router;
