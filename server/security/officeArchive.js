const EOCD = 0x06054b50;
const CENTRAL_FILE = 0x02014b50;
const MAX_ENTRIES = 5000;
const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;

const validateOfficeArchive = (buffer, extension) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) return false;
  const searchStart = Math.max(0, buffer.length - 22 - 65535);
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= searchStart; offset--) {
    if (buffer.readUInt32LE(offset) === EOCD) { eocd = offset; break; }
  }
  if (eocd < 0) return false;
  const disk = buffer.readUInt16LE(eocd + 4);
  const centralDisk = buffer.readUInt16LE(eocd + 6);
  const diskEntries = buffer.readUInt16LE(eocd + 8);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  const commentLength = buffer.readUInt16LE(eocd + 20);
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== entryCount || entryCount < 1 || entryCount > MAX_ENTRIES) return false;
  if (eocd + 22 + commentLength !== buffer.length || centralOffset + centralSize !== eocd) return false;

  let offset = centralOffset;
  let uncompressedBytes = 0;
  const entries = new Set();
  for (let index = 0; index < entryCount; index++) {
    if (offset + 46 > eocd || buffer.readUInt32LE(offset) !== CENTRAL_FILE) return false;
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const compressed = buffer.readUInt32LE(offset + 20);
    const uncompressed = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const fileCommentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const end = offset + 46 + nameLength + extraLength + fileCommentLength;
    if (end > eocd || nameLength < 1 || localOffset >= centralOffset || (flags & 1) !== 0 || ![0, 8].includes(method)) return false;
    if (compressed === 0xffffffff || uncompressed === 0xffffffff || localOffset === 0xffffffff) return false;
    const rawName = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    const normalizedName = rawName.replace(/\\/g, '/');
    if (normalizedName.startsWith('/') || /^[a-z]:/i.test(normalizedName) || normalizedName.split('/').some((part) => part === '..') || normalizedName.includes('\0') || entries.has(normalizedName)) return false;
    entries.add(normalizedName);
    uncompressedBytes += uncompressed;
    if (uncompressedBytes > MAX_UNCOMPRESSED_BYTES || (compressed === 0 && uncompressed > 0) || (compressed > 0 && uncompressed / compressed > 1000)) return false;
    offset = end;
  }
  if (offset !== centralOffset + centralSize || !entries.has('[Content_Types].xml')) return false;
  return extension === 'docx' ? entries.has('word/document.xml') : extension === 'xlsx' ? entries.has('xl/workbook.xml') : false;
};

module.exports = { validateOfficeArchive };
