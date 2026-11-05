const { timingSafeEqual } = require('node:crypto');

function requireWebhookSecret(req, res, next) {
  const expected = process.env.EMAIL_WEBHOOK_SECRET;
  if (!expected) return res.status(503).json({ error: 'Email webhook is not configured' });

  const supplied = req.get('x-webhook-secret') || '';
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) {
    return res.status(401).json({ error: 'Webhook authentication required' });
  }
  return next();
}

module.exports = { requireWebhookSecret };
