function createRateLimiter({ windowMs, maxRequests }) {
  const requests = new Map();
  let lastCleanup = Date.now();

  return (req, res, next) => {
    const now = Date.now();
    if (now - lastCleanup >= windowMs) {
      for (const [ip, entry] of requests) {
        if (now - entry.start >= windowMs) requests.delete(ip);
      }
      lastCleanup = now;
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const entry = requests.get(ip);
    const current = !entry || now - entry.start >= windowMs
      ? { start: now, count: 0 }
      : entry;
    current.count += 1;
    requests.set(ip, current);

    if (current.count > maxRequests) {
      res.set('Retry-After', String(Math.ceil((current.start + windowMs - now) / 1000)));
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    return next();
  };
}

module.exports = { createRateLimiter };
