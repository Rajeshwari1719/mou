const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { auth, authorize } = require('../middleware');
const { writeAudit } = require('../audit');
const { isValidDate, normalizeString } = require('../validation');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 20, fieldSize: 64 * 1024 } });
const { rateLimit } = require('../rateLimit');

const excelCellToString = (cell) => {
  if (cell === null || cell === undefined) return '';
  const value = cell && typeof cell === 'object' && 'value' in cell ? cell.value : cell;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value && typeof value === 'object' && 'text' in value) return String(value.text).trim();
  if (value && typeof value === 'object' && Array.isArray(value.richText)) return value.richText.map((part) => part.text || '').join('').trim();
  return String(value).trim();
};

const dateToIso = (value) => {
  const text = normalizeString(value);
  if (!text) return '';
  // Excel serial date numbers (1900-2100 range)
  if (/^\d+(\.\d+)?$/.test(text) && Number(text) > 20000 && Number(text) < 80000) {
    const serial = Number(text);
    const ms = Math.round((serial - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  // Common date formats: DD/MM/YYYY, DD-MM-YYYY, DD-Mon-YYYY (09-Apr-2021), etc.
  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const build = (day, month, year) => {
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    return null;
  };
  const dmy = text.match(/^(\d{1,2})[\/\-. ](\d{1,2})[\/\-. ](\d{4})$/);
  if (dmy) {
    // Prefer DD/MM/YYYY (common in India); swap only if the first part is clearly a month
    const [, a, b, y] = dmy;
    if (Number(a) > 12) return build(Number(a), Number(b), y);
    return build(Number(a), Number(b), y) || build(Number(b), Number(a), y);
  }
  const dmyText = text.match(/^(\d{1,2})[\/\-. ]([A-Za-z]{3,})[\/\-. ](\d{4})$/);
  if (dmyText) {
    const month = MONTHS[dmyText[2].slice(0, 3).toLowerCase()];
    if (month) return build(Number(dmyText[1]), month, dmyText[3]);
  }
  // Also handle "Apr-2021-09" style or ISO with time suffix
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return text;
};

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

// Header parsing deliberately separates normalization, context, and field matching.
// This prevents "Name of the College" from ever being treated as a contact name.
const normalizeHeader = (value) => normalizeString(value)
  .replace(/[\u00a0\u1680\u2000-\u200b\u202f\u205f\u3000\ufeff]/g, " ")
  .replace(/[\r\n]+/g, " ")
  .toLowerCase()
  .replace(/[_\-.\/\\]+/g, " ")
  .replace(/[^a-z0-9 ]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const childContactField = (value) => {
  const h = normalizeHeader(value);
  if (h === 'name' || h === 'contact name') return 'contact_name';
  if (h === 'designation' || h === 'contact designation') return 'contact_designation';
  if (h === 'email' || h === 'email id' || h === 'e mail' || h === 'contact email') return 'contact_email';
  if (h === 'phone' || h === 'phone no' || h === 'phone number' || h === 'contact number' || h === 'contact phone') return 'contact_phone';
  return null;
};

const matchHeader = (header, parent = '') => {
  const h = normalizeHeader(header);
  const p = normalizeHeader(parent);
  const combined = `${p} ${h}`.trim();
  const isContact = p === 'contact person' || p.startsWith('contact person ') || combined.startsWith('contact person ');
  if (isContact) {
    const contactField = childContactField(h) || childContactField(combined.replace(/^contact person /, ''));
    if (contactField) return contactField;
  }
  // Single-row grouped headers such as "Contact Person - Email ID".
  if (!p && h.startsWith('contact person ')) {
    const contactField = childContactField(h.replace(/^contact person /, ''));
    if (contactField) return contactField;
  }
  if (h === 'name of the college' || h === 'college name' || h.includes('college')) return 'college_name';
  if (h === 'sr no' || h === 'serial no' || h === 'serial number' || h.startsWith('sr no ')) return 'serial_no';
  if (h.includes('national') || h.includes('national or international')) return 'national_or_international';
  if (h.includes('department')) return 'department_name';
  if (h.includes('date of mou') || h === 'mou date') return 'mou_date';
  if (h.includes('valid up to') || h.includes('valid upto') || h.includes('valid until') || h.includes('expiry')) return 'valid_upto';
  if (h.includes('purpose')) return 'purpose';
  if (h.includes('activities')) return 'activities';
  if (h.includes('benefited') || h.includes('studetns') || h.includes('students')) return 'students_benefited';
  if (h.includes('designation')) return 'contact_designation';
  if (h === 'email' || h === 'email id' || h === 'e mail' || h.includes('email')) return 'contact_email';
  if (h === 'phone' || h === 'phone no' || h === 'phone number' || h === 'contact number' || h.includes('phone')) return 'contact_phone';
  // A bare Name is only a contact name in a header context; never use this for a college header.
  if (h === 'name' || h === 'contact name') return 'contact_name';
  return null;
};

const cellText = (cell, isXlsx) => isXlsx ? excelCellToString(cell) : normalizeString(cell);

const getMergedParent = (sheet, rowNumber, columnNumber) => {
  if (!sheet) return '';
  const merge = (sheet.model && sheet.model.merges || []).find((range) => {
    const match = String(range).match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
    if (!match) return false;
    const colNumber = (letters) => letters.toUpperCase().split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
    const startCol = colNumber(match[1]);
    const endCol = colNumber(match[3]);
    return rowNumber >= Number(match[2]) && rowNumber <= Number(match[4]) && columnNumber >= startCol && columnNumber <= endCol;
  });
  if (!merge) return '';
  const start = String(merge).match(/^([A-Z]+)(\d+)/i);
  return start ? excelCellToString(sheet.getCell(`${start[1]}${start[2]}`)) : '';
};

const hasTwoRowHeader = (rows, isXlsx, sheet) => {
  if (!rows[1]) return false;
  let recognizedChildren = 0;
  let contactParent = false;
  const max = Math.max(rows[0].cells.length, rows[1].cells.length);
  let activeParent = '';
  for (let c = 0; c < max; c++) {
    const directParent = cellText(rows[0].cells[c], isXlsx);
    const mergedParent = getMergedParent(sheet, 1, c + 1);
    const parent = directParent || mergedParent;
    if (parent) activeParent = parent;
    const child = cellText(rows[1].cells[c], isXlsx);
    if (normalizeHeader(parent) === 'contact person' || normalizeHeader(activeParent) === 'contact person') contactParent = true;
    if (childContactField(child)) recognizedChildren++;
  }
  // The child labels themselves are reliable evidence of a grouped header. A
  // single child is enough when Contact Person is present in row 1; this avoids
  // rejecting workbooks whose merged cells expose only one child value.
  return (contactParent && recognizedChildren >= 1) || recognizedChildren >= 2;
};

router.post('/import-excel', auth, authorize('admin'), rateLimit({ windowMs: 60 * 60 * 1000, limit: 10 }), upload.single('file'), async (req, res) => {
  const uploadedFile = req.file || null;
  if (!uploadedFile) {
    const receivedFields = Array.isArray(req.files)
      ? req.files.map((file) => file.fieldname).join(', ')
      : '';
    return res.status(400).json({
      success: false,
      message: receivedFields
        ? `No file was received in the "file" field. Received: ${receivedFields}.`
        : 'No file uploaded. Send the workbook as multipart/form-data using the field name "file".',
    });
  }
  req.file = uploadedFile;
  if (/[/\\\0]/.test(req.file.originalname) || req.file.originalname.length > 255) return res.status(400).json({ success: false, message: 'The uploaded filename is invalid.' });
  const isXlsx = /\.xlsx$/i.test(req.file.originalname) || (req.file.buffer[0] === 0x50 && req.file.buffer[1] === 0x4b);
  const isCsv = /\.csv$/i.test(req.file.originalname);
  if (!isXlsx && !isCsv) {
    return res.status(400).json({ success: false, message: 'Unsupported file type. Upload an .xlsx or .csv file.' });
  }
  if ((isXlsx && !(req.file.buffer[0] === 0x50 && req.file.buffer[1] === 0x4b)) || (isCsv && req.file.buffer.includes(0))) {
    return res.status(400).json({ success: false, message: 'The uploaded filename or file contents are invalid.' });
  }

  let rows;
  let sheet = null;
  try {
    if (isXlsx) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);
      sheet = workbook.worksheets[0];
      if (!sheet) return res.status(400).json({ success: false, message: 'The uploaded workbook has no sheets.' });
      if (sheet.rowCount > 5000 || sheet.columnCount > 100) return res.status(400).json({ success: false, message: 'The workbook exceeds the supported limit of 5,000 rows and 100 columns.' });
      rows = [];
      sheet.eachRow((row, rowNumber) => {
        const values = [];
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => { values[colNumber - 1] = cell; });
        rows.push({ rowNumber, cells: values });
      });
    } else {
      const text = req.file.buffer.toString('utf8').replace(/^\uFEFF/, '');
      const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
      if (lines.length > 5001) return res.status(400).json({ success: false, message: 'The file exceeds the supported limit of 5,000 data rows.' });
      rows = lines.map((line, i) => ({ rowNumber: i + 1, cells: parseCsvLine(line) }));
    }
  } catch (e) {
    
    return res.status(400).json({ success: false, message: 'The file could not be parsed. Upload a valid .xlsx or CSV file.' });
  }

  if (rows.length < 2) return res.status(400).json({ success: false, message: 'The file must have a header row and at least one data row.' });
  if (rows.length > 5001 || rows.some((row) => row.cells.length > 100)) return res.status(400).json({ success: false, message: 'The file exceeds the supported limit of 5,000 data rows and 100 columns.' });

  // Detect a grouped header from recognizable header vocabulary, not from whether row 2
  // happens to contain values. This is safe for both merged and unmerged Contact Person cells.
  let headerRowCount = hasTwoRowHeader(rows, isXlsx, sheet) ? 2 : 1;
  const mapping = {};
  const maxLen = Math.max(rows[0].cells.length, headerRowCount === 2 ? rows[1].cells.length : 0);
  let activeParent = '';
  for (let c = 0; c < maxLen; c++) {
    const directParent = cellText(rows[0].cells[c], isXlsx);
    const mergedParent = headerRowCount === 2 ? getMergedParent(sheet, 1, c + 1) : '';
    const cellParent = directParent || mergedParent;
    if (cellParent) activeParent = cellParent;
    const child = headerRowCount === 2 ? cellText(rows[1].cells[c], isXlsx) : '';

    // Child headers are authoritative. They must map directly even if ExcelJS
    // returns an empty value for a non-anchor cell in a merged parent range.
    let field = headerRowCount === 2 ? childContactField(child) : null;
    if (!field) {
      const parent = normalizeHeader(activeParent) === 'contact person' ? activeParent : cellParent;
      field = matchHeader(child || parent, child ? parent : '');
    }
    if (field && mapping[field] === undefined) mapping[field] = c;
  }

  // Defensive child scan for Excel exports that omit merge metadata or contain
  // a blank spacer row. It is limited to header rows and never scans data.
  for (let r = 0; r < Math.min(rows.length, 3); r++) {
    for (let c = 0; c < rows[r].cells.length; c++) {
      const field = childContactField(cellText(rows[r].cells[c], isXlsx));
      if (field && mapping[field] === undefined) mapping[field] = c;
    }
  }

  // Final defensive pass over the first three physical rows. Some Excel files
  // contain a blank spacer row or lose merged-cell metadata during export. The
  // child labels remain sufficient to identify the four contact columns.
  let contactChildRow = -1;
  for (let r = 0; r < Math.min(rows.length, 3); r++) {
    for (let c = 0; c < rows[r].cells.length; c++) {
      const field = childContactField(cellText(rows[r].cells[c], isXlsx));
      if (field) {
        if (mapping[field] === undefined) mapping[field] = c;
        contactChildRow = Math.max(contactChildRow, r);
      }
    }
  }
  if (contactChildRow >= 0 && Object.keys(mapping).filter((field) => field.startsWith('contact_')).length >= 2) {
    headerRowCount = Math.max(headerRowCount, contactChildRow + 1);
  }

  // Mandatory columns (order does not matter) â€” all must be present in the header
  const MANDATORY_FIELDS = [
    ['Sr. No.', 'serial_no'],
    ['National / International', 'national_or_international'],
    ['Name of the College', 'college_name'],
    ['Department', 'department_name'],
    ['Date of MOU', 'mou_date'],
    ['MOU valid upto', 'valid_upto'],
    ['Broad Purpose(s) of the MOU', 'purpose'],
    ['Activities conducted so far', 'activities'],
    ['Number of students benefited so far', 'students_benefited'],
    ['Contact person name', 'contact_name'],
    ['Contact person designation', 'contact_designation'],
    ['Contact person email', 'contact_email'],
    ['Contact person phone', 'contact_phone'],
  ];
  const missingColumns = MANDATORY_FIELDS.filter(([, field]) => mapping[field] === undefined).map(([label]) => label);
  if (missingColumns.length) {
    return res.status(400).json({
      success: false,
      message: `Missing required column${missingColumns.length === 1 ? '' : 's'}: ${missingColumns.join(', ')}. The importer checks the first two header rows, including grouped Contact Person headers.`,
      missingColumns,
    });
  }

  const results = { inserted: 0, updated: 0, skipped: 0, duplicates: 0, errors: [] };
  const dryRun = req.query.dry_run === 'true';
  const fileHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
  if (!dryRun) {
    try {
      const preview = jwt.verify(String(req.query.preview_token || ''), process.env.JWT_SECRET, { issuer: 'college-mou-import-preview' });
      if (String(preview.sub) !== String(req.userId) || preview.fileHash !== fileHash) throw new Error('preview mismatch');
    } catch {
      return res.status(400).json({ success: false, message: 'Validate this exact file with a dry run before importing it.' });
    }
  }
  results.previewRows = [];
  const con = await pool.getConnection();
  try {
    await con.beginTransaction();

    const seenInFile = new Set(); // avoid duplicate entries within the same file

    for (let i = headerRowCount; i < rows.length; i++) {
      const { rowNumber, cells } = rows[i];
      const get = (field) => {
        const idx = mapping[field];
        if (idx === undefined) return '';
        return normalizeString(isXlsx ? excelCellToString(cells[idx]) : cells[idx]);
      };

      const collegeName = get('college_name');
      if (!collegeName && !get('mou_date') && !get('purpose') && !get('contact_name')) { results.skipped++; continue; } // fully blank row

      // Blank/invalid optional fields are kept blank (NULL); only report rows where nothing usable remains
      const rowErrors = [];
      const mouDateRaw = dateToIso(get('mou_date'));
      const validUptoRaw = dateToIso(get('valid_upto'));
      if (get('mou_date') && !isValidDate(mouDateRaw)) rowErrors.push(`Invalid "Date of MOU" (got "${get('mou_date')}", expected e.g. 09-Apr-2021 or 09/04/2021)`);
      if (get('valid_upto') && !isValidDate(validUptoRaw)) rowErrors.push(`Invalid "MOU valid upto" date (got "${get('valid_upto')}")`);
      const studentsRaw = get('students_benefited');
      const students = studentsRaw && /^\d+$/.test(studentsRaw) ? Number(studentsRaw) : null;
      if (studentsRaw && !/^\d+$/.test(studentsRaw)) rowErrors.push('Student count must be a non-negative whole number');
      const nationalText = get('national_or_international');
      const national = /^international$/i.test(nationalText) ? 'International' : (/^national$/i.test(nationalText) ? 'National' : null);
      if (nationalText && !national) rowErrors.push('National/International must be National or International');
      const serialRaw = get('serial_no');
      const serialNo = serialRaw && /^\d+$/.test(serialRaw) ? Number(serialRaw) : null;
      if (serialRaw && !serialNo) rowErrors.push('Serial number must be a non-negative whole number');
      if (!collegeName) rowErrors.push('College name is required');
      if (!get('mou_date')) rowErrors.push('MOU date is required');
      if (!get('valid_upto')) rowErrors.push('MOU valid upto date is required');
      if (mouDateRaw && validUptoRaw && isValidDate(mouDateRaw) && isValidDate(validUptoRaw) && validUptoRaw < mouDateRaw) rowErrors.push('MOU valid upto cannot be earlier than Date of MOU');
      const email = get('contact_email');
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) rowErrors.push('Invalid email address');
      const phone = get('contact_phone');
      if (phone && !/^[+()\d\s-]{7,30}$/.test(phone)) rowErrors.push('Invalid phone number');
      if (rowErrors.length) { results.errors.push({ row: rowNumber, errors: rowErrors }); continue; }

      // Resolve college; if blank, MOU still stores with no college (schema requires college_id, so skip if truly unusable)
      let collegeId = null;
      if (collegeName) {
        const [existingCollege] = await con.execute('SELECT id FROM colleges WHERE name = ? LIMIT 1', [collegeName]);
        if (existingCollege.length) collegeId = existingCollege[0].id;
        else if (!dryRun) { const [created] = await con.execute('INSERT INTO colleges (name) VALUES (?)', [collegeName]); collegeId = created.insertId; }
      }
      if (!collegeId && !dryRun) {
        results.errors.push({ row: rowNumber, errors: ['College name is required â€” row skipped (a MOU cannot exist without a partner).'] });
        continue;
      }

      // Duplicate detection: same college + MOU date appearing twice in the file (or already checked against DB below)
      const dupKey = `${collegeName.toLowerCase()}|${mouDateRaw || ''}`;
      if (seenInFile.has(dupKey)) { results.duplicates++; continue; }
      seenInFile.add(dupKey);

      // Resolve or create department
      let departmentId = null;
      const departmentName = get('department_name');
      if (departmentName && collegeId) {
        const [existingDept] = await con.execute('SELECT id FROM departments WHERE college_id = ? AND name = ? LIMIT 1', [collegeId, departmentName]);
        if (existingDept.length) departmentId = existingDept[0].id;
        else if (!dryRun) { const [created] = await con.execute('INSERT INTO departments (college_id, name) VALUES (?, ?)', [collegeId, departmentName]); departmentId = created.insertId; }
      }

      // Upsert MOU by (college_id, mou_date) unique key; NULL mou_date rows are always inserted
      const [dup] = collegeId && mouDateRaw && isValidDate(mouDateRaw)
        ? await con.execute('SELECT id FROM mous WHERE college_id = ? AND mou_date = ? LIMIT 1', [collegeId, mouDateRaw])
        : [[]];
      if (dryRun) {
        const action = dup.length ? 'UPDATE' : 'INSERT';
        if (dup.length) results.updated++; else results.inserted++;
        results.previewRows.push({ row: rowNumber, partner: collegeName, mou_date: mouDateRaw, action });
        continue;
      }
      let mouId;
      if (dup.length) {
        mouId = dup[0].id;
        await con.execute(
          'UPDATE mous SET serial_no=COALESCE(?,serial_no), national_or_international=COALESCE(?,national_or_international), department_id=COALESCE(?,department_id), valid_upto=COALESCE(?,valid_upto), purpose=COALESCE(?,purpose), activities=COALESCE(?,activities), students_benefited=COALESCE(?,students_benefited), contact_name=COALESCE(?,contact_name), contact_designation=COALESCE(?,contact_designation), contact_email=COALESCE(?,contact_email), contact_phone=COALESCE(?,contact_phone), updated_at=NOW() WHERE id=?',
          [serialNo, national, departmentId, validUptoRaw || null, get('purpose') || null, get('activities') || null, students, get('contact_name') || null, get('contact_designation') || null, get('contact_email') || null, get('contact_phone') || null, mouId]
        );
        results.updated++;
      } else {
        const [created] = await con.execute(
          'INSERT INTO mous (serial_no, national_or_international, college_id, department_id, mou_date, valid_upto, purpose, activities, students_benefited, contact_name, contact_designation, contact_email, contact_phone) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
          [serialNo, national, collegeId, departmentId, mouDateRaw, validUptoRaw || null, get('purpose') || null, get('activities') || null, students, get('contact_name') || null, get('contact_designation') || null, get('contact_email') || null, get('contact_phone') || null]
        );
        mouId = created.insertId;
        results.inserted++;
      }

      await writeAudit(con, {
        userId: req.userId,
        tableName: 'mous',
        recordId: mouId,
        action: dup.length ? 'UPDATE' : 'INSERT',
        newValues: { source: 'excel', file: req.file.originalname },
        request: req,
      });
    }

    if (dryRun) {
      await con.rollback();
      const previewToken = jwt.sign({ sub: String(req.userId), fileHash }, process.env.JWT_SECRET, { issuer: 'college-mou-import-preview', expiresIn: '15m' });
      return res.json({ success: true, preview: true, previewToken, expiresIn: 900, results });
    }
    await writeAudit(con, { userId: req.userId, tableName: 'mous', recordId: null, action: 'BULK_IMPORT', newValues: { file: req.file.originalname, ...results }, request: req });
    await con.commit();
    res.json({ success: true, results });
  } catch (e) {
    await con.rollback();
    
    res.status(500).json({ success: false, message: 'Import failed. All changes were rolled back.' });
  } finally { con.release(); }
});

module.exports = router;
