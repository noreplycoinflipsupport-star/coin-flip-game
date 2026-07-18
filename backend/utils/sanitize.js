function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function sanitizeInput(obj, fields) {
  const sanitized = { ...obj };
  const targetFields = fields || Object.keys(sanitized);
  for (const field of targetFields) {
    if (typeof sanitized[field] === 'string') {
      sanitized[field] = sanitized[field].trim().replace(/<[^>]*>/g, '');
    }
  }
  return sanitized;
}

module.exports = { escapeHtml, sanitizeInput };