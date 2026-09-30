const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { validateMou, validateProject, validateIntern, validateStudent } = require('./validation');
const { normalizeEmail, validateSignup, publicSignupRole } = require('./authValidation');
const { assertSafeTestDatabase } = require('./test-setup');
const storage = require('./storage');
const { assertMigrationEnvironment, assertNonDestructiveSql, splitSqlStatements } = require('./migrationRunner');
const { validateOfficeArchive } = require('./security/officeArchive');

test('test database guard rejects non-test and production databases', () => {
  assert.throws(() => assertSafeTestDatabase({ nodeEnv: 'development', dbName: 'college_mou_dev' }));
  assert.throws(() => assertSafeTestDatabase({ nodeEnv: 'test', dbName: 'college_mou_prod' }));
  assert.throws(() => assertSafeTestDatabase({ nodeEnv: 'test', dbName: 'college_mou_test', dbHost: 'prod-db.internal' }));
  assert.throws(() => assertSafeTestDatabase({ nodeEnv: 'test', dbName: 'college_mou' }));
  assert.doesNotThrow(() => assertSafeTestDatabase({ nodeEnv: 'test', dbName: 'college_mou_test' }));
});

test('local storage rejects traversal and unexpected keys', async () => {
  await assert.rejects(storage.remove('../outside.pdf'), /Invalid storage key/);
  await assert.rejects(storage.remove('C:\\outside.pdf'), /Invalid storage key/);
});

test('Office upload validation rejects incomplete archives and accepts valid OOXML workbooks', async () => {
  assert.equal(validateOfficeArchive(Buffer.from('PK\\x03\\x04'), 'xlsx'), false);
  assert.equal(validateOfficeArchive(Buffer.alloc(0), 'docx'), false);
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('MOU').addRow(['Partner', 'MOU date']);
  const buffer = await workbook.xlsx.writeBuffer();
  assert.equal(validateOfficeArchive(Buffer.from(buffer), 'xlsx'), true);
  assert.equal(validateOfficeArchive(Buffer.from(buffer), 'docx'), false);
});

test('migration runner refuses unsafe targets and destructive SQL', () => {
  assert.throws(() => assertMigrationEnvironment({ nodeEnv: 'production', dbName: 'college_mou_prod' }), /explicit production approval/);
  assert.throws(() => assertMigrationEnvironment({ nodeEnv: 'development', dbName: 'college_mou', allowDevelopment: true }), /database name containing/);
  assert.doesNotThrow(() => assertMigrationEnvironment({ nodeEnv: 'test', dbName: 'college_mou_test' }));
  for (const sql of ['DROP TABLE users;', 'ALTER TABLE users DROP COLUMN email;', 'TRUNCATE users;', 'DELETE FROM users;']) assert.throws(() => assertNonDestructiveSql(sql));
  assert.deepEqual(splitSqlStatements('CREATE TABLE a(id int);\nALTER TABLE a ADD COLUMN x int;'), ['CREATE TABLE a(id int)', 'ALTER TABLE a ADD COLUMN x int']);
});

test('rejects an MOU with reversed dates and invalid email', () => {
  const errors = validateMou({ college_id: 1, mou_date: '2026-12-01', valid_upto: '2026-01-01', contact_email: 'bad-email' });
  assert.ok(errors.some((error) => error.includes('Expiry date')));
  assert.ok(errors.some((error) => error.includes('email')));
});

test('rejects a project without a valid MOU or with reversed dates', () => {
  const errors = validateProject({ mou_id: '', title: 'Project', start_date: '2026-08-01', end_date: '2026-07-01', status: 'Active' });
  assert.ok(errors.some((error) => error.includes('MOU')));
  assert.ok(errors.some((error) => error.includes('End date')));
});

test('rejects an intern with an invalid status', () => {
  const errors = validateIntern({ mou_id: 1, student_id: 1, start_date: '2026-01-01', end_date: '2026-02-01', status: 'INVALID' });
  assert.ok(errors.some((error) => error.includes('status')));
});

test('rejects a student without a college', () => {
  const errors = validateStudent({ name: 'Student', email: 'student@example.com', college_id: '' });
  assert.ok(errors.some((error) => error.includes('college')));
});

test('validates signup password strength, confirmation, and role', () => {
  const errors = validateSignup({ name: 'Test User', email: 'test@example.com', password: 'weak', confirmPassword: 'different', role: 'admin' });
  assert.ok(errors.some((error) => error.includes('Password must')));
  assert.ok(errors.some((error) => error.includes('do not match')));
});

test('public signup validation does not treat client supplied roles as authority', () => {
  for (const role of [undefined, 'viewer', 'admin', 'fake', 'superadmin']) {
    assert.deepEqual(validateSignup({ name: 'User', email: `${role || 'none'}@example.com`, password: 'ValidPass1!', confirmPassword: 'ValidPass1!', role }), []);
    assert.equal(publicSignupRole(role), 'viewer');
  }
});

test('normalizes signup email for duplicate checks', () => {
  assert.equal(normalizeEmail('  USER@Example.COM '), 'user@example.com');
});

