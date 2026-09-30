const redact = (value) => {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/(password|token|secret|credential|authorization)/i.test(key))
    .map(([key, child]) => [key, redact(child)]));
};

const writeAudit = async (connection, { userId, tableName, recordId, action, oldValues = null, newValues = null, request = null, allowLegacyRequestIdSchema = true }) => {
  if (!userId) return;
  const values = [userId, tableName, recordId || null, action, oldValues ? JSON.stringify(redact(oldValues)) : null, newValues ? JSON.stringify(redact(newValues)) : null, request?.ip || null, request?.get?.('user-agent')?.slice(0, 255) || null];
  try {
    await connection.execute(
      'INSERT INTO audit_logs (user_id, table_name, record_id, action, old_values, new_values, ip_address, user_agent, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [...values, request?.requestId || null]
    );
  } catch (error) {
    // Older installations may not have applied migration 002 yet. Keep signup
    // usable while still recording the event; migration 002 adds request_id.
    if (!allowLegacyRequestIdSchema || error.code !== 'ER_BAD_FIELD_ERROR' || !/request_id/i.test(error.message || '')) throw error;
    console.warn(JSON.stringify({ level: 'warn', event: 'audit_request_id_column_missing', requestId: request?.requestId || null }));
    await connection.execute(
      'INSERT INTO audit_logs (user_id, table_name, record_id, action, old_values, new_values, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      values
    );
  }
};

module.exports = { writeAudit, redact };
