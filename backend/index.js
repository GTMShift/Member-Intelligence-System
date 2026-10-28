require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
const membersRouter = require('./routes/members');
const companiesRouter = require('./routes/companies');
const employmentRouter = require('./routes/employment');
const enrichmentRouter = require('./routes/enrichment');
const enrichmentStatusRouter = require('./routes/enrichmentStatus');
const eventsRouter = require('./routes/events');
const substackRouter = require('./routes/substackImport');
const formResponsesRouter = require('./routes/formResponses');
const emailWebhookRouter = require('./routes/emailWebhook');
const { requireAuth, requireRole } = require('./middleware/auth');
const { requireWebhookSecret } = require('./middleware/webhookAuth');
const { createRateLimiter } = require('./middleware/rateLimit');

const adminOnly = [requireAuth, requireRole(['admin'])];

const allowedOrigins = new Set([
  'https://member-intelligence-system.vercel.app',
  ...(process.env.NODE_ENV === 'production' ? [] : [
    'http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000',
  ]),
]);

app.disable('x-powered-by');
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 0));
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  });
  next();
});

app.use(cors({
  origin(origin, callback) {
    // CORS only controls browsers; protected routes still require authentication.
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }
    const error = new Error('Origin not allowed');
    error.status = 403;
    return callback(error);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-webhook-secret'],
}));
app.use(express.json({ limit: '1mb' }));

app.use('/members/:id/enrich', ...adminOnly, enrichmentRouter);
app.use('/enrich/status', ...adminOnly, enrichmentStatusRouter);
app.use('/members', ...adminOnly, membersRouter);
app.use('/companies', ...adminOnly, companiesRouter);
app.use('/members/:id/employment', ...adminOnly, employmentRouter);
app.use('/events', eventsRouter);
app.use('/substack', ...adminOnly, substackRouter);
app.use('/form-responses', createRateLimiter({ windowMs: 60_000, maxRequests: 20 }), formResponsesRouter);
app.use('/webhook/email', requireWebhookSecret, emailWebhookRouter);

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error('[request] failed', error?.status || 500);
  res.status(error?.status || 500).json({ error: error?.status === 403 ? 'Origin not allowed' : 'Internal server error' });
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  if (process.env.GMAIL_CREDENTIALS_B64 && process.env.GMAIL_TOKEN_B64 && process.env.EMAIL_WEBHOOK_SECRET) {
    const { startMonitoring } = require('./services/gmailMonitor');
    startMonitoring();
    console.log('Gmail monitor started');
  } else {
    console.log('Gmail monitor not started — Gmail credentials, token, or EMAIL_WEBHOOK_SECRET not set');
  }
});
