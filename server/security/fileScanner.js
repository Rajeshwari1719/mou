const path = require('node:path');

let configuredScanner;
const loadScanner = () => {
  if (configuredScanner) return configuredScanner;
  const scannerModule = process.env.MALWARE_SCANNER_MODULE;
  if (!scannerModule) return null;
  const resolved = path.isAbsolute(scannerModule) ? scannerModule : path.resolve(process.cwd(), scannerModule);
  configuredScanner = require(resolved);
  if (typeof configuredScanner.scanBuffer !== 'function') throw new Error('Malware scanner module must export scanBuffer(buffer, metadata).');
  return configuredScanner;
};

const scanBuffer = async (buffer, metadata) => {
  const scanner = loadScanner();
  if (!scanner) {
    if (process.env.NODE_ENV === 'production') {
      const error = new Error('Document scanning is unavailable.');
      error.status = 503;
      error.publicMessage = 'Document upload is temporarily unavailable.';
      throw error;
    }
    return { clean: true, engine: 'development-noop' };
  }
  const result = await scanner.scanBuffer(buffer, metadata);
  if (!result || result.clean !== true) {
    const error = new Error('Malware scanner rejected a document.');
    error.status = 400;
    error.publicMessage = 'The document did not pass security scanning.';
    throw error;
  }
  return result;
};

module.exports = { scanBuffer };
