const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const pool = require('../db');
const { auth, authorize } = require('../middleware');
const { writeAudit } = require('../audit');
const { validateProject, isValidDate, normalizeString } = require('../validation');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const projectQuery = `
  SELECT p.*, m.serial_no AS mou_serial_no, m.mou_date, m.valid_upto,
         m.purpose AS mou_purpose, m.national_or_international,
         c.name AS college_name, d.name AS department_name
  FROM projects p
  LEFT JOIN mous m ON p.mou_id = m.id
  LEFT JOIN colleges c ON m.college_id = c.id
  LEFT JOIN departments d ON m.department_id = d.id
`;

router.get('/', auth, async (req, res) => {
  const [rows] = await pool.query(`${projectQuery} ORDER BY p.start_date DESC`);
  res.json({ projects: rows });
});

router.get('/:id', auth, async (req, res) => {
  const [rows] = await pool.query(`${projectQuery} WHERE p.id = ?`, [req.params.id]);
  res.json({ project: rows[0] || null });
});

router.post('/', auth, authorize('admin'), async (req, res) => {
  if (!/^\d+$/.test(String(req.body.mou_id || ''))) return res.status(400).json({ success: false, message: 'A valid MOU is required.' });
  const { mou_id, title, description, start_date, end_date, status } = req.body;
  const validationErrors = validateProject(req.body);
  if (validationErrors.length) return res.status(400).json({ success: false, message: validationErrors.join(' ') });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [mous] = await connection.execute('SELECT id FROM mous WHERE id = ? FOR SHARE', [mou_id]);
    if (!mous.length) { await connection.rollback(); return res.status(404).json({ success: false, message: 'Associated MOU not found.' }); }
    const [result] = await connection.execute('INSERT INTO projects (mou_id, title, description, start_date, end_date, status) VALUES (?,?,?,?,?,?)', [mou_id, title.trim(), description || null, start_date || null, end_date || null, status || 'Active']);
    await writeAudit(connection, { userId: req.userId, tableName: 'projects', recordId: result.insertId, action: 'INSERT', newValues: req.body, request: req });
    await connection.commit();
    res.status(201).json({ success: true, id: result.insertId, message: 'Project created successfully.' });
  } catch (error) { await connection.rollback();  res.status(500).json({ success: false, message: 'Failed to create project.' }); } finally { connection.release(); }
});

router.put('/:id', auth, authorize('admin'), async (req, res) => {
  if (!/^\d+$/.test(String(req.params.id || ''))) return res.status(400).json({ success: false, message: 'Invalid project id.' });
  if (!/^\d+$/.test(String(req.body.mou_id || ''))) return res.status(400).json({ success: false, message: 'A valid MOU is required.' });
  const { mou_id, title, description, start_date, end_date, status } = req.body;
  const validationErrors = validateProject(req.body);
  if (validationErrors.length) return res.status(400).json({ success: false, message: validationErrors.join(' ') });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.execute('SELECT * FROM projects WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!existing.length) { await connection.rollback(); return res.status(404).json({ success: false, message: 'Project not found.' }); }
    const [mous] = await connection.execute('SELECT id FROM mous WHERE id = ? FOR SHARE', [mou_id]);
    if (!mous.length) { await connection.rollback(); return res.status(404).json({ success: false, message: 'Associated MOU not found.' }); }
    await connection.execute('UPDATE projects SET mou_id=?, title=?, description=?, start_date=?, end_date=?, status=?, updated_at=NOW() WHERE id=?', [mou_id, title.trim(), description || null, start_date || null, end_date || null, status || 'Active', req.params.id]);
    await writeAudit(connection, { userId: req.userId, tableName: 'projects', recordId: req.params.id, action: 'UPDATE', oldValues: existing[0], newValues: req.body, request: req });
    await connection.commit();
    res.json({ success: true, message: 'Project updated successfully.' });
  } catch (error) { await connection.rollback();  res.status(500).json({ success: false, message: 'Failed to update project.' }); } finally { connection.release(); }
});

router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  if (!/^\d+$/.test(String(req.params.id || ''))) return res.status(400).json({ success: false, message: 'Invalid project id.' });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.execute('SELECT * FROM projects WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!existing.length) { await connection.rollback(); return res.status(404).json({ success: false, message: 'Project not found.' }); }
    await connection.execute('DELETE FROM projects WHERE id=?', [req.params.id]);
    await writeAudit(connection, { userId: req.userId, tableName: 'projects', recordId: req.params.id, action: 'DELETE', oldValues: existing[0], request: req });
    await connection.commit();
    res.json({ success: true, message: 'Project deleted successfully.' });
  } catch (error) { await connection.rollback();  res.status(500).json({ success: false, message: 'Unable to delete this project.' }); } finally { connection.release(); }
});

// Parse a CSV line honouring quoted fields ("a,b", c -> ["a,b", "c"])
const parseCsvLine = (line) => {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',' || ch === '\t' || ch === ';') { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
};

const excelCellToString = (cell) => {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  if (typeof cell === 'object' && 'text' in cell) return String(cell.text).trim();
  return String(cell).trim();
};

const dateToIso = (value) => {
  // Excel serial date numbers
  if (/^\d+(\.\d+)?$/.test(String(value)) && Number(value) > 20000 && Number(value) < 60000) {
    const serial = Number(value);
    const ms = Math.round((serial - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  return value;
};

router.post('/import', auth, authorize('admin'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });
  const isXlsx = /\.xlsx$/i.test(req.file.originalname) || (req.file.buffer[0] === 0x50 && req.file.buffer[1] === 0x4b);

  let rows;
  try {
    if (isXlsx) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);
      const sheet = workbook.worksheets[0];
      if (!sheet) return res.status(400).json({ success: false, message: 'The uploaded workbook has no sheets.' });
      rows = [];
      sheet.eachRow((row, rowNumber) => {
        const values = [];
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => { values[colNumber - 1] = cell; });
        rows.push({ rowNumber, cells: values });
      });
    } else {
      const text = req.file.buffer.toString('utf8').replace(/^\uFEFF/, '');
      const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
      rows = lines.map((line, i) => ({ rowNumber: i + 1, cells: parseCsvLine(line) }));
    }
  } catch (e) {
    
    return res.status(400).json({ success: false, message: 'The file could not be parsed. Upload a valid .xlsx or CSV file.' });
  }

  if (!rows.length) return res.status(400).json({ success: false, message: 'The uploaded file is empty.' });

  const headerRow = rows[0];
  const headers = headerRow.cells.map((c) => normalizeString(isXlsx ? excelCellToString(c) : c).toLowerCase());
  const find = (names) => headers.findIndex((h) => names.includes(h));
  const titleIdx = find(['title']);
  const mouIdx = find(['mou', 'mou_id', 'mou_reference', 'mou reference']);
  const statusIdx = find(['status']);
  const startIdx = find(['start_date', 'start']);
  const endIdx = find(['end_date', 'end']);
  const descIdx = find(['description', 'project_description']);

  const missingHeaders = [
    ['title', titleIdx], ['mou reference', mouIdx], ['status', statusIdx],
    ['start_date', startIdx], ['end_date', endIdx],
  ].filter(([, idx]) => idx === -1).map(([name]) => name);
  if (missingHeaders.length) {
    return res.status(400).json({ success: false, message: `Missing required column(s): ${missingHeaders.join(', ')}.` });
  }

  const results = { inserted: 0, errors: [] };
  const con = await pool.getConnection();
  try {
    await con.beginTransaction();
    for (let i = 1; i < rows.length; i++) {
      const { rowNumber, cells } = rows[i];
      const rowNumberForErrors = isXlsx ? rowNumber : i + 1;
      const get = (idx) => normalizeString(isXlsx ? excelCellToString(cells[idx]) : cells[idx]);
      const title = get(titleIdx);
      const mouRef = get(mouIdx);
      const description = descIdx >= 0 ? get(descIdx) : '';
      const status = get(statusIdx) || 'Active';
      const start_raw = dateToIso(get(startIdx));
      const end_raw = dateToIso(get(endIdx));

      const rowErrors = [];
      if (!title) rowErrors.push('Missing title');
      if (!mouRef) rowErrors.push('Missing MOU reference');
      if (!['Planned', 'Active', 'Completed', 'Cancelled'].includes(status)) rowErrors.push('Invalid project status');
      if (!start_raw) rowErrors.push('Missing start date');
      else if (!isValidDate(start_raw)) rowErrors.push(`Invalid start date "${start_raw}" (must be YYYY-MM-DD)`);
      if (!end_raw) rowErrors.push('Missing end date');
      else if (!isValidDate(end_raw)) rowErrors.push(`Invalid end date "${end_raw}" (must be YYYY-MM-DD)`);
      if (isValidDate(start_raw) && isValidDate(end_raw) && end_raw < start_raw) rowErrors.push('End date cannot be earlier than start date');

      let resolvedMouId = null;
      if (mouRef) {
        if (/^\d+$/.test(mouRef)) {
          const [r] = await con.execute('SELECT id FROM mous WHERE id = ?', [Number(mouRef)]);
          if (r.length) resolvedMouId = r[0].id;
        } else {
          const [r] = await con.execute('SELECT m.id FROM mous m JOIN colleges c ON c.id = m.college_id WHERE c.name = ? LIMIT 1', [mouRef]);
          if (r.length) resolvedMouId = r[0].id;
        }
      }
      if (mouRef && !resolvedMouId) rowErrors.push(`Referenced MOU "${mouRef}" does not exist`);

      if (rowErrors.length) { results.errors.push({ row: rowNumberForErrors, errors: rowErrors }); continue; }

      await con.execute(
        'INSERT INTO projects (mou_id, title, description, start_date, end_date, status) VALUES (?,?,?,?,?,?)',
        [resolvedMouId, title, description || null, start_raw, end_raw, status]
      );
      results.inserted++;
    }
    await writeAudit(con, { userId: req.userId, tableName: 'projects', recordId: null, action: 'BULK_IMPORT', newValues: { filename: req.file.originalname, inserted: results.inserted, errors: results.errors }, request: req });
    await con.commit();
    res.json({ success: true, results });
  } catch (e) {
    await con.rollback();
    
    res.status(500).json({ success: false, message: 'Import failed. All changes were rolled back.' });
  } finally { con.release(); }
});

module.exports = router;
