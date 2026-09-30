require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');
const pool = require('./db');
const app = require('./app');
const { assertSafeTestDatabase } = require('./test-setup');
const { getDbConfig } = require('./dbConfig');

const testDbConfig = getDbConfig();
assertSafeTestDatabase({ nodeEnv: process.env.NODE_ENV, dbName: testDbConfig.database, dbHost: testDbConfig.host, dbUser: testDbConfig.user });
process.env.JWT_SECRET ||= 'test-only-secret-which-is-not-used-outside-the-isolated-suite';

const iso = (date) => date.toISOString().slice(0, 10);
const addDays = (amount) => { const date = new Date(); date.setUTCDate(date.getUTCDate() + amount); return iso(date); };
const postJson = (url, token, body) => fetch(url, { method: 'POST', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('HTTP integration: auth, RBAC, CRUD, documents, import, notifications, audit, and dashboard', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const ids = { users: [], colleges: [], departments: [], mous: [], projects: [], students: [], interns: [], documents: [], files: [] };
  let adminToken;
  let viewerToken;

  const request = (method, path, token, body) => fetch(`${base}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), 'User-Agent': 'college-mou-integration-test', 'X-Request-ID': 'caller-value-is-replaced' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  t.after(async () => {
    try {
      for (const documentId of ids.documents) {
        const [rows] = await pool.execute('SELECT file_path FROM documents WHERE id=?', [documentId]);
        if (rows[0]?.file_path) await require('./storage').remove(require('node:path').basename(rows[0].file_path)).catch(() => {});
      }
      if (ids.users.length) {
        const placeholders = ids.users.map(() => '?').join(',');
        await pool.execute(`DELETE FROM users WHERE id IN (${placeholders})`, ids.users);
      }
      if (ids.mous.length) {
        const placeholders = ids.mous.map(() => '?').join(',');
        await pool.execute(`DELETE FROM mous WHERE id IN (${placeholders})`, ids.mous);
      }
      if (ids.projects.length) await pool.execute(`DELETE FROM projects WHERE id IN (${ids.projects.map(() => '?').join(',')})`, ids.projects);
      if (ids.students.length) await pool.execute(`DELETE FROM students WHERE id IN (${ids.students.map(() => '?').join(',')})`, ids.students);
      if (ids.departments.length) await pool.execute(`DELETE FROM departments WHERE id IN (${ids.departments.map(() => '?').join(',')})`, ids.departments);
      if (ids.colleges.length) await pool.execute(`DELETE FROM colleges WHERE id IN (${ids.colleges.map(() => '?').join(',')})`, ids.colleges);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await pool.end();
    }
  });

  await t.test('signup always creates Viewer; login, duplicate email, and safe errors work', async () => {
    for (const role of [undefined, 'viewer', 'admin', 'forged-role']) {
      const email = `signup-${role || 'missing'}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
      const response = await postJson(`${base}/api/auth/signup`, null, { name: 'Integration Viewer', email, password: 'StrongPass123!', confirmPassword: 'StrongPass123!', ...(role ? { role } : {}) });
      const data = await response.json();
      assert.equal(response.status, 201);
      assert.equal(data.data.role, 'viewer');
      assert.match(response.headers.get('x-request-id'), /^[0-9a-f-]{36}$/i);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.match(response.headers.get('content-security-policy') || '', /default-src 'none'/);
      ids.users.push(data.data.id);
      if (role === 'admin') assert.notEqual(data.data.role, 'admin');
      if (role === 'viewer') {
        const duplicate = await postJson(`${base}/api/auth/signup`, null, { name: 'Duplicate', email, password: 'StrongPass123!', confirmPassword: 'StrongPass123!' });
        assert.equal(duplicate.status, 409);
      }
    }
    const email = `auth-${Date.now()}@example.test`;
    const signup = await postJson(`${base}/api/auth/signup`, null, { name: 'Login Viewer', email, password: 'StrongPass123!', confirmPassword: 'StrongPass123!' });
    const signupBody = await signup.json(); ids.users.push(signupBody.data.id);
    const invalid = await postJson(`${base}/api/auth/login`, null, { email, password: 'incorrect' });
    assert.equal(invalid.status, 401);
    assert.equal((await invalid.json()).error.code, 'AUTHENTICATION_ERROR');
    const login = await postJson(`${base}/api/auth/login`, null, { email, password: 'StrongPass123!' });
    assert.equal(login.status, 200);
    viewerToken = (await login.json()).token;
    const [loginAudit] = await pool.execute("SELECT id FROM audit_logs WHERE user_id=? AND table_name='users' AND action='LOGIN' ORDER BY id DESC LIMIT 1", [signupBody.data.id]);
    assert.ok(loginAudit.length, 'successful login should be audited');
    const badToken = await request('GET', '/api/mous', 'not-a-jwt');
    assert.equal(badToken.status, 401);
    const expired = jwt.sign({ id: signupBody.data.id }, process.env.JWT_SECRET, { issuer: 'college-mou-management', expiresIn: -1 });
    assert.equal((await request('GET', '/api/mous', expired)).status, 401);
    const missingRoute = await request('GET', '/api/no-such-route', null);
    assert.equal(missingRoute.status, 404);
    assert.equal((await missingRoute.json()).error.code, 'NOT_FOUND');
  });

  await t.test('create a scoped Admin fixture and enforce every protected write route', async () => {
    const email = `admin-${Date.now()}@example.test`;
    const connection = await pool.getConnection();
    try {
      const hash = await bcrypt.hash('AdminPass123!', 10);
      const [result] = await connection.execute('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)', ['Integration Admin', email, hash, 'admin']);
      ids.users.push(result.insertId);
    } finally { connection.release(); }
    const login = await postJson(`${base}/api/auth/login`, null, { email, password: 'AdminPass123!' });
    assert.equal(login.status, 200);
    adminToken = (await login.json()).token;
    const viewerId = ids.users[0];
    const forgedAdmin = jwt.sign({ id: viewerId, role: 'admin' }, process.env.JWT_SECRET, { issuer: 'college-mou-management', expiresIn: '1h' });
    const expired = jwt.sign({ id: viewerId, role: 'admin' }, process.env.JWT_SECRET, { issuer: 'college-mou-management', expiresIn: -1 });
    const writes = [
      ['POST', '/api/colleges', {}], ['PUT', '/api/colleges/999999', { name: 'x' }], ['DELETE', '/api/colleges/999999'],
      ['POST', '/api/departments', {}], ['PUT', '/api/departments/999999', { name: 'x' }], ['DELETE', '/api/departments/999999'],
      ['POST', '/api/mous', {}], ['PUT', '/api/mous/999999', {}], ['DELETE', '/api/mous/999999'],
      ['POST', '/api/mous/import-excel', {}], ['POST', '/api/projects', {}], ['PUT', '/api/projects/999999', {}], ['DELETE', '/api/projects/999999'], ['POST', '/api/projects/import', {}],
      ['POST', '/api/students', {}], ['PUT', '/api/students/999999', {}], ['DELETE', '/api/students/999999'],
      ['POST', '/api/interns', {}], ['PUT', '/api/interns/999999', {}], ['DELETE', '/api/interns/999999'],
      ['POST', '/api/documents/upload', {}], ['DELETE', '/api/documents/999999'],
    ];
    for (const [method, path, body] of writes) {
      for (const token of [null, 'bad.jwt.token', expired]) {
        const response = await request(method, path, token, body);
        assert.equal(response.status, 401, `${method} ${path} should reject missing/invalid/expired credentials`);
        assert.equal((await response.json()).error.code, 'AUTHENTICATION_ERROR');
      }
      const manipulated = await request(method, path, forgedAdmin, body);
      assert.equal(manipulated.status, 403, `${method} ${path} must ignore a forged role claim`);
      assert.equal((await manipulated.json()).error.code, 'AUTHORIZATION_ERROR');
      const admin = await request(method, path, adminToken, body);
      assert.notEqual(admin.status, 403, `${method} ${path} should pass Admin authorization`);
      const viewer = await request(method, path, viewerToken, body);
      assert.equal(viewer.status, 403, `${method} ${path} must reject Viewer writes`);
    }
    for (const [method, path, body] of [['PUT', '/api/auth/profile', { name: 'Viewer Updated' }], ['PUT', '/api/auth/password', {}], ['PATCH', '/api/notifications/999999/read', {}]]) {
      const response = await request(method, path, viewerToken, body);
      assert.notEqual(response.status, 401);
      assert.notEqual(response.status, 403);
    }
  });

  await t.test('MOU, project, student, intern, documents, notifications, audit, dates, and dashboard use MySQL', async () => {
    const stamp = Date.now();
    const dashboardBefore = await (await request('GET', '/api/reports', viewerToken)).json();
    let response = await request('POST', '/api/colleges', adminToken, { name: `Integration Partner ${stamp}` });
    assert.equal(response.status, 201); const college = await response.json(); ids.colleges.push(college.id);
    response = await request('POST', '/api/departments', adminToken, { college_id: college.id, name: `Engineering ${stamp}` });
    assert.equal(response.status, 201); const department = await response.json(); ids.departments.push(department.id);

    const mouBody = { college_id: college.id, department_id: department.id, mou_date: '2026-01-15', valid_upto: addDays(90), purpose: 'Integration test', students_benefited: 2, contact_email: 'contact@example.test', contact_phone: '+91 98765 43210' };
    response = await request('POST', '/api/mous', adminToken, mouBody);
    assert.equal(response.status, 201); const mou = await response.json(); ids.mous.push(mou.id);
    const readMou = await request('GET', `/api/mous/${mou.id}`, viewerToken);
    assert.equal(readMou.status, 200); assert.equal((await readMou.json()).mou.mou_date, '2026-01-15');
    assert.equal((await (await request('GET', `/api/mous/${mou.id}`, viewerToken)).json()).mou.status, 'ACTIVE');
    const dashboardAfterCreate = await (await request('GET', '/api/reports', viewerToken)).json();
    assert.equal(Number(dashboardAfterCreate.totalMous), Number(dashboardBefore.totalMous) + 1);
    const connection = await pool.getConnection();
    try { await connection.execute('UPDATE mous SET valid_upto=? WHERE id=?', [addDays(30), mou.id]); }
    finally { connection.release(); }
    assert.equal((await (await request('GET', `/api/mous/${mou.id}`, viewerToken)).json()).mou.status, 'EXPIRING_SOON');
    assert.equal((await request('POST', '/api/mous', adminToken, mouBody)).status, 409);
    response = await request('PUT', `/api/mous/${mou.id}`, adminToken, { ...mouBody, purpose: 'Updated' }); assert.equal(response.status, 200);
    assert.equal((await request('POST', '/api/mous', adminToken, { ...mouBody, mou_date: '2026-02-30' })).status, 400);

    const projectBody = { mou_id: mou.id, title: 'Integration Project', start_date: '2026-02-01', end_date: '2026-03-01', status: 'Active' };
    response = await request('POST', '/api/projects', adminToken, projectBody); assert.equal(response.status, 201); const project = await response.json(); ids.projects.push(project.id);
    assert.equal((await request('GET', `/api/projects/${project.id}`, viewerToken)).status, 200);
    assert.equal((await request('PUT', `/api/projects/${project.id}`, adminToken, { ...projectBody, title: 'Updated Project' })).status, 200);
    assert.equal((await request('POST', '/api/projects', adminToken, { ...projectBody, mou_id: 999999 })).status, 404);

    response = await request('POST', '/api/students', adminToken, { name: 'Integration Student', email: `student-${stamp}@example.test`, college_id: college.id, department_id: department.id });
    assert.equal(response.status, 201); const student = await response.json(); ids.students.push(student.id);
    assert.equal((await request('PUT', `/api/students/${student.id}`, adminToken, { name: 'Updated Student', email: `student-${stamp}@example.test`, college_id: college.id, department_id: department.id })).status, 200);

    response = await request('POST', '/api/interns', adminToken, { mou_id: mou.id, student_id: student.id, project_id: project.id, start_date: '2026-02-01', end_date: '2026-02-28', status: 'Active' });
    assert.equal(response.status, 201); const intern = await response.json(); ids.interns.push(intern.id);
    assert.equal((await request('PUT', `/api/interns/${intern.id}`, adminToken, { mou_id: mou.id, student_id: student.id, project_id: project.id, start_date: '2026-02-01', end_date: '2026-03-01', status: 'Completed' })).status, 200);

    const form = new FormData(); form.append('mou_id', String(mou.id)); form.append('document_type', 'Other');
    form.append('file', new Blob([Buffer.from('%PDF-1.4\nIntegration document\n%%EOF')], { type: 'application/pdf' }), 'agreement.pdf');
    response = await fetch(`${base}/api/documents/upload`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: form });
    assert.equal(response.status, 201); const document = await response.json(); ids.documents.push(document.id);
    const download = await request('GET', `/api/documents/${document.id}/download`, viewerToken); assert.equal(download.status, 200);
    assert.equal((await request('GET', `/api/documents/${document.id}/download`, null)).status, 401);
    const badForm = new FormData(); badForm.append('mou_id', String(mou.id)); badForm.append('file', new Blob(['not a PDF'], { type: 'application/pdf' }), 'bad.pdf');
    const invalidFile = await fetch(`${base}/api/documents/upload`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: badForm }); assert.equal(invalidFile.status, 400);
    const oversizedForm = new FormData(); oversizedForm.append('mou_id', String(mou.id)); oversizedForm.append('file', new Blob([Buffer.alloc(10 * 1024 * 1024 + 1)], { type: 'application/pdf' }), 'large.pdf');
    const oversizedFile = await fetch(`${base}/api/documents/upload`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: oversizedForm });
    assert.equal(oversizedFile.status, 413);
    assert.equal((await oversizedFile.json()).error.code, 'PAYLOAD_TOO_LARGE');

    const reminderConnection = await pool.getConnection();
    try { await reminderConnection.execute('UPDATE mous SET valid_upto=? WHERE id=?', [addDays(90), mou.id]); }
    finally { reminderConnection.release(); }
    await require('./jobs-expiryReminderJob').runExpiryReminderJob();
    const notifications = await request('GET', '/api/notifications', viewerToken); assert.equal(notifications.status, 200);
    const notificationRows = (await notifications.json()).notifications;
    assert.ok(notificationRows.some((item) => item.mou_id === mou.id));
    await require('./jobs-expiryReminderJob').runExpiryReminderJob();
    const [duplicateCount] = await pool.execute('SELECT COUNT(*) AS count FROM notifications WHERE user_id=? AND reminder_key=?', [ids.users[0], `mou:${mou.id}:90`]);
    assert.equal(Number(duplicateCount[0].count), 1);

    const audit = await request('GET', '/api/audit-logs', adminToken); assert.equal(audit.status, 200);
    const auditBody = await audit.json();
    assert.ok(auditBody.logs.some((entry) => Number(entry.record_id) === mou.id && entry.table_name === 'mous' && entry.action === 'INSERT'));
    const [metadata] = await pool.execute('SELECT request_id, ip_address, user_agent FROM audit_logs WHERE user_id=? AND table_name=? AND record_id=? AND action=? ORDER BY id DESC LIMIT 1', [ids.users.at(-1), 'mous', mou.id, 'INSERT']);
    assert.equal(metadata[0]?.user_agent, 'college-mou-integration-test');
    assert.ok(metadata[0]?.request_id);
    assert.ok(metadata[0]?.ip_address);

    const reports = await request('GET', '/api/reports', viewerToken); assert.equal(reports.status, 200);
    assert.ok(Number((await reports.json()).totalMous) >= 1);
    assert.equal((await request('DELETE', `/api/documents/${document.id}`, viewerToken)).status, 403);
    assert.equal((await request('DELETE', `/api/documents/${document.id}`, adminToken)).status, 200);
    ids.documents = [];
    assert.equal((await request('DELETE', `/api/interns/${intern.id}`, adminToken)).status, 200);
    assert.equal((await request('DELETE', `/api/students/${student.id}`, adminToken)).status, 200);
    assert.equal((await request('DELETE', `/api/projects/${project.id}`, adminToken)).status, 200);
    assert.equal((await request('DELETE', `/api/mous/${mou.id}`, adminToken)).status, 200);
    assert.equal((await request('DELETE', `/api/departments/${department.id}`, adminToken)).status, 200);
    assert.equal((await request('DELETE', `/api/colleges/${college.id}`, adminToken)).status, 200);
    const dashboardAfterDelete = await (await request('GET', '/api/reports', viewerToken)).json();
    assert.equal(Number(dashboardAfterDelete.totalMous), Number(dashboardBefore.totalMous));
    ids.mous = []; ids.projects = []; ids.students = []; ids.departments = []; ids.colleges = [];
  });

  await t.test('MOU Excel import validates without changing data in dry-run mode', async () => {
    const missingHeaderBook = new ExcelJS.Workbook(); const missingHeaderSheet = missingHeaderBook.addWorksheet('Missing headers');
    missingHeaderSheet.addRow(['Unrecognized']); missingHeaderSheet.addRow(['value']);
    const missingHeaderForm = new FormData(); missingHeaderForm.append('file', new Blob([await missingHeaderBook.xlsx.writeBuffer()]), 'missing-headers.xlsx');
    const missingHeader = await fetch(`${base}/api/mous/import-excel?dry_run=true`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: missingHeaderForm });
    assert.equal(missingHeader.status, 400);
    assert.equal((await missingHeader.json()).error.code, 'VALIDATION_ERROR');
    const malformedForm = new FormData(); malformedForm.append('file', new Blob([Buffer.from('PK malformed workbook')]), 'malformed.xlsx');
    assert.equal((await fetch(`${base}/api/mous/import-excel?dry_run=true`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: malformedForm })).status, 400);

    const partner = `Dry Run ${Date.now()}`;
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('MOUs');
    sheet.addRow(['Sr. No.', 'National / International', 'Name of the College', 'Department', 'Date of MOU', 'MOU valid upto', 'Broad Purpose(s) of the MOU', 'Activities conducted so far', 'Number of students benefited so far', 'Contact person name', 'Contact person designation', 'Contact person email', 'Contact person phone']);
    sheet.addRow([91, 'National', partner, '', '2026-01-01', '2027-01-01', 'Purpose must remain', 'Activity must remain', 0, 'Integration Contact', 'Senior Representative', 'valid@example.test', '+91 98765 43210']);
    const buffer = await workbook.xlsx.writeBuffer();
    const form = new FormData(); form.append('file', new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'preview.xlsx');
    const response = await fetch(`${base}/api/mous/import-excel?dry_run=true`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: form });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.success, true);
    assert.equal(result.preview, true);
    assert.equal(result.results.inserted, 1, JSON.stringify(result.results));
    assert.ok(result.previewToken);
    const [beforeImport] = await pool.execute('SELECT id FROM colleges WHERE name=?', [partner]);
    assert.equal(beforeImport.length, 0, 'dry run must not create partner rows');

    const commitForm = new FormData(); commitForm.append('file', new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'preview.xlsx');
    const committed = await fetch(`${base}/api/mous/import-excel?preview_token=${encodeURIComponent(result.previewToken)}`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: commitForm });
    assert.equal(committed.status, 200);
    assert.equal((await committed.json()).results.inserted, 1);
    const [importAudit] = await pool.execute("SELECT id FROM audit_logs WHERE user_id=? AND table_name='mous' AND action='BULK_IMPORT' ORDER BY id DESC LIMIT 1", [ids.users.at(-1)]);
    assert.ok(importAudit.length, 'committed import should be audited');
    const [[imported]] = await pool.execute('SELECT c.id AS college_id,m.id AS mou_id,m.purpose,m.activities,m.contact_name,m.contact_phone FROM colleges c JOIN mous m ON m.college_id=c.id WHERE c.name=?', [partner]);
    ids.colleges.push(imported.college_id); ids.mous.push(imported.mou_id);

    const blankWorkbook = new ExcelJS.Workbook(); const blankSheet = blankWorkbook.addWorksheet('MOUs');
    blankSheet.addRow(['Sr. No.', 'National / International', 'Name of the College', 'Department', 'Date of MOU', 'MOU valid upto', 'Broad Purpose(s) of the MOU', 'Activities conducted so far', 'Number of students benefited so far', 'Contact person name', 'Contact person designation', 'Contact person email', 'Contact person phone']);
    blankSheet.addRow(['', '', partner, '', '2026-01-01', '2027-01-01', '', '', '', '', '', '', '']);
    const blankBuffer = await blankWorkbook.xlsx.writeBuffer();
    const blankPreviewForm = new FormData(); blankPreviewForm.append('file', new Blob([blankBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'blank-cells.xlsx');
    const blankPreviewResponse = await fetch(`${base}/api/mous/import-excel?dry_run=true`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: blankPreviewForm });
    const blankPreview = await blankPreviewResponse.json(); assert.equal(blankPreview.results.updated, 1);
    const blankCommitForm = new FormData(); blankCommitForm.append('file', new Blob([blankBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'blank-cells.xlsx');
    const blankCommit = await fetch(`${base}/api/mous/import-excel?preview_token=${encodeURIComponent(blankPreview.previewToken)}`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: blankCommitForm });
    assert.equal(blankCommit.status, 200);
    const [[afterBlankUpdate]] = await pool.execute('SELECT purpose,activities,contact_name,contact_phone FROM mous WHERE id=?', [imported.mou_id]);
    assert.equal(afterBlankUpdate.purpose, 'Purpose must remain');
    assert.equal(afterBlankUpdate.activities, 'Activity must remain');
    assert.equal(afterBlankUpdate.contact_name, 'Integration Contact');
    assert.equal(afterBlankUpdate.contact_phone, '+91 98765 43210');

    const invalidBook = new ExcelJS.Workbook(); const invalidSheet = invalidBook.addWorksheet('Invalid rows');
    invalidSheet.addRow(['Sr. No.', 'National / International', 'Name of the College', 'Department', 'Date of MOU', 'MOU valid upto', 'Broad Purpose(s) of the MOU', 'Activities conducted so far', 'Number of students benefited so far', 'Contact person name', 'Contact person designation', 'Contact person email', 'Contact person phone']);
    const invalidPartner = `Invalid Import ${Date.now()}`;
    invalidSheet.addRow([94, 'National', invalidPartner, '', '2026-02-30', '2026-01-01', '', '', '', '', '', 'bad-email', '']);
    const invalidForm = new FormData(); invalidForm.append('file', new Blob([await invalidBook.xlsx.writeBuffer()]), 'invalid-rows.xlsx');
    const invalidPreviewResponse = await fetch(`${base}/api/mous/import-excel?dry_run=true`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: invalidForm });
    const invalidPreview = await invalidPreviewResponse.json();
    assert.equal(invalidPreviewResponse.status, 200);
    assert.ok(invalidPreview.results.errors.length >= 1);
    assert.ok(invalidPreview.results.errors[0].errors.some((message) => /invalid|earlier|email/i.test(message)));
    const [invalidNotStored] = await pool.execute('SELECT id FROM colleges WHERE name=?', [invalidPartner]);
    assert.equal(invalidNotStored.length, 0);

    const rollbackPartner = `Rollback ${Date.now()}`;
    const rollbackBook = new ExcelJS.Workbook(); const rollbackSheet = rollbackBook.addWorksheet('MOUs');
    rollbackSheet.addRow(['Sr. No.', 'National / International', 'Name of the College', 'Department', 'Date of MOU', 'MOU valid upto', 'Broad Purpose(s) of the MOU', 'Activities conducted so far', 'Number of students benefited so far', 'Contact person name', 'Contact person designation', 'Contact person email', 'Contact person phone']);
    rollbackSheet.addRow([93, 'National', rollbackPartner, '', '2026-01-01', '2027-01-01', 'Rollback fixture', 'Rollback activity', 1, 'Rollback Contact', 'Representative', 'rollback@example.test', '+91 98765 43210']);
    const rollbackBuffer = await rollbackBook.xlsx.writeBuffer();
    const previewForm = new FormData(); previewForm.append('file', new Blob([rollbackBuffer]), 'rollback.xlsx');
    const previewResponse = await fetch(`${base}/api/mous/import-excel?dry_run=true`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: previewForm });
    const rollbackPreview = await previewResponse.json();
    assert.equal(previewResponse.status, 200);
    const triggerName = `test_fail_import_${process.pid}`;
    await pool.query(`CREATE TRIGGER ${triggerName} BEFORE INSERT ON audit_logs FOR EACH ROW BEGIN IF NEW.action = 'BULK_IMPORT' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'isolated rollback test'; END IF; END`);
    try {
      const commitForm = new FormData(); commitForm.append('file', new Blob([rollbackBuffer]), 'rollback.xlsx');
      const failedCommit = await fetch(`${base}/api/mous/import-excel?preview_token=${encodeURIComponent(rollbackPreview.previewToken)}`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: commitForm });
      assert.equal(failedCommit.status, 500);
      const [rolledBack] = await pool.execute('SELECT id FROM colleges WHERE name=?', [rollbackPartner]);
      assert.equal(rolledBack.length, 0, 'failed import transaction must leave no partner row');
    } finally { await pool.query(`DROP TRIGGER IF EXISTS ${triggerName}`); }
  });
});
