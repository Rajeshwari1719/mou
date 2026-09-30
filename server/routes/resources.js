const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const path = require('path');
const crypto = require('crypto');
const pool = require('../db');
const { auth, authorize } = require('../middleware');
const { writeAudit } = require('../audit');
const { validateIntern, validateStudent, positiveId, isValidDate } = require('../validation');
const storage = require('../storage');
const { rateLimit } = require('../rateLimit');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const DOCUMENT_TYPES = [
  'Signed MOU',
  'Annexure',
  'Renewal Letter',
  'Amendment',
  'Activity Report',
  'Internship Agreement',
  'Project Agreement',
  'Supporting Document',
  'Other',
];
const FILE_TYPES = ['pdf', 'doc', 'docx', 'xls', 'xlsx'];
const FILE_MIME_TYPES = {
  pdf: ['application/pdf'],
  doc: ['application/msword', 'application/octet-stream'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/octet-stream'],
  xls: ['application/vnd.ms-excel', 'application/octet-stream'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream'],
};

const normalizeDocumentItem = (row) => ({
  id: row.id,
  mou_id: row.mou_id,
  mou_name: row.mou_name || row.mou_title || null,
  college_name: row.college_name || null,
  title: row.title || row.document_name || row.file_name || 'Document',
  document_name: row.document_name || row.title || row.file_name || 'Document',
  document_type: row.document_type || 'Other',
  file_path: row.file_path || null,
  file_type: row.file_type || 'application/octet-stream',
  version: row.version || '1.0',
  uploaded_by: row.uploaded_by || null,
  uploaded_by_name: row.uploaded_by_name || null,
  uploaded_at: row.uploaded_at || null,
  document_date: row.document_date || null,
  expiry_date: row.expiry_date || null,
  required: Number(row.required) === 1 || row.required === true || row.required === '1',
  remarks: row.remarks || null,
  description: row.description || null,
});

const crud = (name, table, fields, joins = '') => {
  const invalidRouteId = (value) => !/^\d+$/.test(String(value || ''));
  router.get(`/${name}`, auth, asyncRoute(async (_req, res) => {
    let query = `SELECT ${table}.* FROM ${table} ORDER BY ${table}.created_at DESC`;
    if (name === 'interns') {
      query = `SELECT i.*, s.name AS student_name, p.title AS project_title FROM interns i LEFT JOIN students s ON i.student_id = s.id LEFT JOIN projects p ON i.project_id = p.id ORDER BY i.created_at DESC`;
    }
    if (name === 'students') {
      query = `SELECT s.* FROM students s ORDER BY s.created_at DESC`;
    }
    const [rows] = await pool.query(query);
    res.json({ [name]: rows });
  }));
  router.post(`/${name}`, auth, authorize('admin'), asyncRoute(async (req, res) => {
    if (name === 'interns') {
      const errors = validateIntern(req.body);
      if (errors.length) return res.status(400).json({ success: false, message: errors.join(' ') });
    }
    if (name === 'students') {
      const errors = validateStudent(req.body);
      if (errors.length) return res.status(400).json({ success: false, message: errors.join(' ') });
    }
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      if (name === 'interns') {
        const [mous] = await connection.execute('SELECT id, college_id, department_id FROM mous WHERE id=? FOR SHARE', [req.body.mou_id]);
        if (!mous.length) { await connection.rollback(); return res.status(404).json({ success: false, message: 'Associated MOU was not found.' }); }
        if (req.body.project_id) {
          const [projects] = await connection.execute('SELECT id FROM projects WHERE id=? AND mou_id=? FOR SHARE', [req.body.project_id, req.body.mou_id]);
          if (!projects.length) { await connection.rollback(); return res.status(400).json({ success: false, message: 'Select a project associated with the selected MOU.' }); }
        }
        if (req.body.intern_name?.trim()) {
          const [createdStudent] = await connection.execute('INSERT INTO students (name, college_id, department_id) VALUES (?, ?, ?)', [req.body.intern_name.trim(), mous[0].college_id, mous[0].department_id]);
          req.body.student_id = createdStudent.insertId;
        } else {
          const [students] = await connection.execute('SELECT id FROM students WHERE id=? FOR SHARE', [req.body.student_id]);
          if (!students.length) { await connection.rollback(); return res.status(404).json({ success: false, message: 'Associated intern was not found.' }); }
        }
      }
      const values = fields.map((f) => req.body[f] ?? null);
      const [result] = await connection.execute(`INSERT INTO ${table} (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`, values);
      await writeAudit(connection, { userId: req.userId, tableName: table, recordId: result.insertId, action: 'INSERT', newValues: req.body, request: req });
      await connection.commit();
      res.status(201).json({ success: true, id: result.insertId });
    } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
  }));
  router.put(`/${name}/:id`, auth, authorize('admin'), asyncRoute(async (req, res) => {
    if (invalidRouteId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid resource id.' });
    if (name === 'interns') {
      const errors = validateIntern(req.body);
      if (errors.length) return res.status(400).json({ success: false, message: errors.join(' ') });
    }
    if (name === 'students') {
      const errors = validateStudent(req.body);
      if (errors.length) return res.status(400).json({ success: false, message: errors.join(' ') });
    }
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [existing] = await connection.execute(`SELECT * FROM ${table} WHERE id=? FOR UPDATE`, [req.params.id]);
      if (!existing.length) { await connection.rollback(); return res.status(404).json({ success: false, message: `${name.slice(0, -1)} not found.` }); }
      if (name === 'interns') {
        const [mous] = await connection.execute('SELECT id, college_id, department_id FROM mous WHERE id=? FOR SHARE', [req.body.mou_id]);
        if (!mous.length) { await connection.rollback(); return res.status(404).json({ success: false, message: 'Associated MOU was not found.' }); }
        if (req.body.project_id) {
          const [projects] = await connection.execute('SELECT id FROM projects WHERE id=? AND mou_id=? FOR SHARE', [req.body.project_id, req.body.mou_id]);
          if (!projects.length) { await connection.rollback(); return res.status(400).json({ success: false, message: 'Select a project associated with the selected MOU.' }); }
        }
        req.body.student_id = existing[0].student_id;
        if (req.body.intern_name?.trim()) {
          await connection.execute('UPDATE students SET name=?, college_id=?, department_id=? WHERE id=?', [req.body.intern_name.trim(), mous[0].college_id, mous[0].department_id, existing[0].student_id]);
        }
      }
      const values = fields.map((f) => req.body[f] ?? null);
      await connection.execute(`UPDATE ${table} SET ${fields.map((f) => `${f}=?`).join(',')} WHERE id=?`, [...values, req.params.id]);
      await writeAudit(connection, { userId: req.userId, tableName: table, recordId: req.params.id, action: 'UPDATE', oldValues: existing[0], newValues: req.body, request: req });
      await connection.commit();
      res.json({ success: true });
    } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
  }));
  router.delete(`/${name}/:id`, auth, authorize('admin'), asyncRoute(async (req, res) => {
    if (invalidRouteId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid resource id.' });
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [existing] = await connection.execute(`SELECT * FROM ${table} WHERE id=? FOR UPDATE`, [req.params.id]);
      if (!existing.length) { await connection.rollback(); return res.status(404).json({ success: false, message: `${name.slice(0, -1)} not found.` }); }
      await connection.execute(`DELETE FROM ${table} WHERE id=?`, [req.params.id]);
      await writeAudit(connection, { userId: req.userId, tableName: table, recordId: req.params.id, action: 'DELETE', oldValues: existing[0], request: req });
      await connection.commit();
      res.json({ success: true });
    } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
  }));
};

crud('students', 'students', ['name', 'email', 'phone', 'college_id', 'department_id'], 'LEFT JOIN colleges c ON students.college_id=c.id');
crud('interns', 'interns', ['mou_id', 'student_id', 'project_id', 'start_date', 'end_date', 'status'], 'LEFT JOIN students s ON interns.student_id=s.id');

router.get('/documents', auth, asyncRoute(async (_req, res) => {
  const connection = await pool.getConnection();
  try {
    const [documents] = await connection.query(`
      SELECT d.*, m.mou_date, m.valid_upto, c.name AS college_name, u.name AS uploaded_by_name,
             COALESCE(d.document_name, d.title, d.file_path) AS document_name,
             COALESCE(d.document_type, 'Other') AS document_type,
             COALESCE(d.version, '1.0') AS version,
             COALESCE(d.required, 0) AS required,
             m.id AS mou_number
      FROM documents d
      LEFT JOIN mous m ON d.mou_id = m.id
      LEFT JOIN colleges c ON m.college_id = c.id
      LEFT JOIN users u ON d.uploaded_by = u.id
      ORDER BY d.uploaded_at DESC
    `);
    res.json({ documents: documents.map(normalizeDocumentItem) });
  } finally {
    connection.release();
  }
}));
router.post('/documents/upload', auth, authorize('admin'), rateLimit({ windowMs: 60 * 60 * 1000, limit: 30 }), upload.single('file'), asyncRoute(async (req, res) => {
  if (!req.file || !req.body.mou_id) {
    return res.status(400).json({ error: 'Select an MOU and a document to upload.' });
  }

  const ext = path.extname(req.file.originalname).toLowerCase().replace('.', '');
  const bytes = req.file.buffer;
  const isPdf = ext === 'pdf' && bytes.subarray(0, 5).toString() === '%PDF-';
  const isOle = ['doc', 'xls'].includes(ext) && bytes.subarray(0, 8).equals(Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]));
  const isOfficeZip = ['docx', 'xlsx'].includes(ext) && require('../security/officeArchive').validateOfficeArchive(bytes, ext);
  if (!FILE_TYPES.includes(ext) || !FILE_MIME_TYPES[ext].includes(req.file.mimetype) || !(isPdf || isOle || isOfficeZip) || req.file.originalname.length > 255 || /[/\\\0]/.test(req.file.originalname)) {
    return res.status(400).json({ error: 'Invalid file type. Only PDF, DOC, DOCX, XLS, and XLSX files are supported.' });
  }
  await require('../security/fileScanner').scanBuffer(bytes, { filename: req.file.originalname, extension: ext, mimeType: req.file.mimetype });

  const connection = await pool.getConnection();
  let storedKey = null;
  try {
    await connection.beginTransaction();
    const [mous] = await connection.execute('SELECT id FROM mous WHERE id = ?', [req.body.mou_id]);
    if (!mous.length) { await connection.rollback(); return res.status(404).json({ success: false, message: 'Associated MOU not found.' }); }
    if (!DOCUMENT_TYPES.includes(req.body.document_type || 'Other')) { await connection.rollback(); return res.status(400).json({ success: false, message: 'Invalid document type.' }); }
    if (req.body.document_date && !isValidDate(req.body.document_date)) { await connection.rollback(); return res.status(400).json({ success: false, message: 'Document date is invalid.' }); }
    if (req.body.expiry_date && !isValidDate(req.body.expiry_date)) { await connection.rollback(); return res.status(400).json({ success: false, message: 'Expiry date is invalid.' }); }
    if (req.body.document_date && req.body.expiry_date && req.body.expiry_date < req.body.document_date) { await connection.rollback(); return res.status(400).json({ success: false, message: 'Expiry date cannot be earlier than document date.' }); }

    const mouId = Number(req.body.mou_id);
    const documentType = req.body.document_type || 'Other';
    const documentName = req.body.document_name || req.body.title || req.file.originalname;
    const description = req.body.description || null;
    const version = req.body.version || '1.0';
    const documentDate = req.body.document_date || null;
    const expiryDate = req.body.expiry_date || null;
    const requiredFlag = req.body.required === 'true' || req.body.required === '1' || req.body.required === true ? 1 : 0;
    const remarks = req.body.remarks || null;
    const storedName = `${crypto.randomUUID()}.${ext}`;
    storedKey = storedName;
    await storage.put(storedKey, req.file.buffer);

    let uploadedBy = null;
    if (req.userId) {
      const [rows] = await connection.execute('SELECT id FROM users WHERE id = ?', [req.userId]);
      if (rows.length) uploadedBy = req.userId;
    }

    const [result] = await connection.execute(
      `INSERT INTO documents (
        mou_id, title, document_name, document_type, description, file_path, file_type, version,
        document_date, expiry_date, required, remarks, uploaded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        mouId,
        documentName,
        documentName,
        documentType,
        description,
        storedName,
        req.file.mimetype || 'application/octet-stream',
        version,
        documentDate || null,
        expiryDate || null,
        requiredFlag,
        remarks,
        uploadedBy,
      ]
    );
    await writeAudit(connection, { userId: req.userId, tableName: 'documents', recordId: result.insertId, action: 'INSERT', newValues: { ...req.body, file_path: storedName }, request: req });
    await connection.commit();
    res.status(201).json({ success: true, id: result.insertId, file_path: storedName });
  } catch (error) {
    await connection.rollback();
    if (storedKey) await storage.remove(storedKey);
    throw error;
  } finally {
    connection.release();
  }
}));
router.get('/documents/:id/download', auth, asyncRoute(async (req, res) => {
  if (!/^\d+$/.test(String(req.params.id || ''))) return res.status(400).json({ success: false, message: 'Invalid document id.' });
  const [rows] = await pool.execute('SELECT file_path, document_name, file_type FROM documents WHERE id=?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ success: false, message: 'Document not found.' });
  const downloaded = await storage.download(rows[0].file_path, res, rows[0].document_name || 'document', rows[0].file_type);
  if (!downloaded && !res.headersSent) return res.status(404).json({ success: false, message: 'Document file is missing.' });
}));
router.delete('/documents/:id', auth, authorize('admin'), asyncRoute(async (req, res) => {
  if (!/^\d+$/.test(String(req.params.id || ''))) return res.status(400).json({ success: false, message: 'Invalid document id.' });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute('SELECT * FROM documents WHERE id=? FOR UPDATE', [req.params.id]);
    if (!rows.length) { await connection.rollback(); return res.status(404).json({ success: false, message: 'Document not found.' }); }
    await connection.execute('DELETE FROM documents WHERE id=?', [req.params.id]);
    await writeAudit(connection, { userId: req.userId, tableName: 'documents', recordId: req.params.id, action: 'DELETE', oldValues: rows[0], request: req });
    await connection.commit();
    if (rows[0].file_path) await storage.remove(path.basename(rows[0].file_path));
    res.json({ success: true });
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}));

router.get('/reports', auth, asyncRoute(async (_req, res) => {
  const [[mous]] = await pool.query(`
    SELECT COUNT(*) total,
           SUM(valid_upto IS NOT NULL AND valid_upto > DATE_ADD(UTC_DATE(), INTERVAL 30 DAY)) active,
           SUM(valid_upto IS NOT NULL AND valid_upto < UTC_DATE()) expired,
           SUM(valid_upto IS NOT NULL AND valid_upto >= UTC_DATE() AND valid_upto <= DATE_ADD(UTC_DATE(), INTERVAL 30 DAY)) expiringSoon
      FROM mous
  `);
  const [[students]] = await pool.query('SELECT COUNT(*) total FROM students');
  const [[projects]] = await pool.query(`
    SELECT COUNT(*) total,
           SUM(p.mou_id IS NOT NULL AND m.valid_upto >= UTC_DATE()) covered
    FROM projects p LEFT JOIN mous m ON p.mou_id = m.id
  `);
  const [[interns]] = await pool.query('SELECT COUNT(*) total FROM interns');
  const percentage = (value, total) => total ? Math.round((Number(value || 0) / Number(total)) * 100) : 0;
  res.json({
    totalMous: mous.total,
    activeMous: mous.active || 0,
    expiredMous: mous.expired || 0,
    expiringSoonMous: mous.expiringSoon || 0,
    students: students.total,
    projects: projects.total,
    interns: interns.total,
    mouPerformance: percentage(mous.active, mous.total),
    projectCoverage: percentage(projects.covered, projects.total),
  });
}));
router.get('/reports/export/:type', auth, asyncRoute(async (_req, res) => {
  const [mouRows] = await pool.query(`
    SELECT m.*, c.name AS partner, d.name AS department,
           (SELECT COUNT(*) FROM projects p WHERE p.mou_id = m.id) AS project_count,
           (SELECT GROUP_CONCAT(p.title ORDER BY p.start_date, p.id SEPARATOR '; ')
              FROM projects p WHERE p.mou_id = m.id) AS project_titles,
           (SELECT COUNT(*) FROM interns i WHERE i.mou_id = m.id) AS intern_count,
           (SELECT GROUP_CONCAT(s.name ORDER BY s.name SEPARATOR '; ')
              FROM interns i JOIN students s ON s.id = i.student_id
             WHERE i.mou_id = m.id) AS intern_names
      FROM mous m
      LEFT JOIN colleges c ON c.id = m.college_id
      LEFT JOIN departments d ON d.id = m.department_id
     ORDER BY m.mou_date ASC, m.id ASC
  `);
  const [projectRows] = await pool.query(`
    SELECT p.id AS project_id, p.mou_id, p.title, p.description, p.start_date,
           p.end_date, p.status, p.created_at, p.updated_at,
           m.serial_no AS mou_serial_no, m.national_or_international AS mou_type,
           m.mou_date, m.valid_upto, m.purpose AS mou_purpose,
           c.name AS mou_partner, d.name AS mou_department
      FROM projects p
      LEFT JOIN mous m ON m.id = p.mou_id
      LEFT JOIN colleges c ON c.id = m.college_id
      LEFT JOIN departments d ON d.id = m.department_id
     ORDER BY m.mou_date ASC, m.id ASC, p.start_date ASC, p.id ASC
  `);
  const [internRows] = await pool.query(`
    SELECT i.id AS intern_id, i.mou_id, i.student_id, s.name AS student_name,
           s.email AS student_email, s.phone AS student_phone, i.start_date,
           i.end_date, i.status, i.created_at, i.updated_at,
           m.serial_no AS mou_serial_no, m.national_or_international AS mou_type,
           m.mou_date, m.valid_upto, c.name AS mou_partner,
           d.name AS mou_department,
           (SELECT GROUP_CONCAT(p.title ORDER BY p.start_date, p.id SEPARATOR '; ')
              FROM projects p WHERE p.mou_id = i.mou_id) AS related_projects
      FROM interns i
      LEFT JOIN students s ON s.id = i.student_id
      LEFT JOIN mous m ON m.id = i.mou_id
      LEFT JOIN colleges c ON c.id = m.college_id
      LEFT JOIN departments d ON d.id = m.department_id
     ORDER BY m.mou_date ASC, m.id ASC, i.start_date ASC, i.id ASC
  `);

  const book = new ExcelJS.Workbook();
  const addSheet = (name, rows, fallbackColumns) => {
    const sheet = book.addWorksheet(name);
    const columns = rows.length ? Object.keys(rows[0]) : fallbackColumns;
    sheet.columns = columns.map((key) => ({ header: key.replaceAll('_', ' '), key, width: Math.min(Math.max(key.length + 4, 16), 30) }));
    sheet.addRows(rows);
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + Math.min(columns.length, 26))}1` };
    return sheet;
  };

  addSheet('MOU Directory', mouRows, ['id', 'partner', 'mou_date', 'valid_upto', 'project_count', 'project_titles', 'intern_count', 'intern_names']);
  addSheet('Projects', projectRows, ['project_id', 'mou_id', 'title', 'description', 'start_date', 'end_date', 'status']);
  addSheet('Interns', internRows, ['intern_id', 'mou_id', 'student_id', 'student_name', 'start_date', 'end_date', 'status', 'related_projects']);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="mou-report.xlsx"');
  await book.xlsx.write(res); res.end();
}));

module.exports = router;
