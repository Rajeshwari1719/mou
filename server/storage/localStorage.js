const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..', process.env.UPLOAD_DIR || 'uploads');
const validKey = (key) => typeof key === 'string' && /^[0-9a-f-]{36}\.(pdf|doc|docx|xls|xlsx)$/i.test(path.basename(key)) && path.basename(key) === key;

const resolveKey = (key) => {
  if (!validKey(key)) throw new Error('Invalid storage key.');
  const target = path.resolve(root, key);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error('Invalid storage key.');
  return target;
};

const put = async (key, buffer) => {
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(resolveKey(key), buffer, { flag: 'wx', mode: 0o600 });
};

const remove = async (key) => {
  try { await fs.unlink(resolveKey(key)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
};

const download = async (key, res, filename, contentType) => {
  let target;
  try { target = resolveKey(path.basename(key || '')); }
  catch { return false; }
  try { await fs.access(target); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  return new Promise((resolve, reject) => {
    res.download(target, filename, { headers: { 'Content-Type': contentType || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' } }, (error) => error ? reject(error) : resolve(true));
  });
};

module.exports = { put, remove, download };
