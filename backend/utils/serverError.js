function serverError(res, operation, error) {
  console.error(`[${operation}] failed`, error?.code || 'unknown');
  return res.status(500).json({ error: 'Request failed' });
}

module.exports = { serverError };
