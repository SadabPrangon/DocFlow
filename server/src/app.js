const express = require('express');
const cors = require('cors');
const authRoutes = require('../routes/authRoutes');
const userRoutes = require('../routes/userRoutes');
const appointmentRoutes = require('../routes/appointmentRoutes');
const notificationRoutes = require('../routes/notificationRoutes');
const clinicalRoutes = require('../routes/clinicalRoutes');
const paymentRoutes = require('../routes/paymentRoutes');
const sslcommerzRoutes = require('../routes/sslcommerzRoutes');
const aiRoutes = require('../routes/aiRoutes');
const paymentController = require('../controllers/paymentController');
const mongoose = require('mongoose');
const { corsOrigins, jsonLimit } = require('../config');
const operations = require('../lib/operations');

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
app.use(operations.requestContext);
app.use(operations.securityHeaders);
const allowedOrigins = corsOrigins();
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return callback(null, true);
    const error = new Error('Origin is not allowed by CORS.'); error.status = 403; return callback(error);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
  exposedHeaders: ['X-Request-Id', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
  maxAge: 600,
}));
app.use(operations.createRateLimiter({ windowMs: 15 * 60 * 1000, limit: Number(process.env.API_RATE_LIMIT) || 300, keyPrefix: 'api' }));
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), paymentController.webhook);
app.use('/api/payments/sslcommerz', express.urlencoded({ extended: false, limit: jsonLimit() }), sslcommerzRoutes);
app.use(express.json({ limit: jsonLimit() }));
app.get('/', (req, res) => res.json({ success: true, message: 'DocFlow API is running' }));
app.get('/api/health/live', (req, res) => res.json({ success: true, status: 'live', uptimeSeconds: Math.floor(process.uptime()) }));
app.get('/api/health/ready', (req, res) => {
  const databaseReady = mongoose.connection.readyState === 1;
  const ready = operations.isReady() && databaseReady;
  res.status(ready ? 200 : 503).json({ success: ready, status: ready ? 'ready' : 'not_ready', checks: { database: databaseReady ? 'up' : 'down' } });
});
app.get('/api/health', (req, res) => res.redirect(307, '/api/health/ready'));
app.get('/api/metrics', (req, res) => {
  const expected = String(process.env.METRICS_TOKEN || '');
  const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (!expected || suppliedBuffer.length !== expectedBuffer.length || !require('crypto').timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    return res.status(401).json({ success: false, message: 'Metrics authorization required.', requestId: req.id });
  }
  res.type('text/plain; version=0.0.4').send(operations.prometheus());
});
app.use('/api/auth', operations.createRateLimiter({ windowMs: 15 * 60 * 1000, limit: Number(process.env.AUTH_RATE_LIMIT) || 30, keyPrefix: 'auth' }));
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/clinical', clinicalRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/ai', aiRoutes);
app.use((req, res) => res.status(404).json({ success: false, message: 'API route not found.', requestId: req.id }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const malformed = error instanceof SyntaxError && error.status === 400 && 'body' in error;
  const status = malformed ? 400 : Number(error.status || error.statusCode) || 500;
  if (process.env.NODE_ENV !== 'test') console.error(JSON.stringify({ level: 'error', event: 'request_error', requestId: req.id, status, message: error.message, timestamp: new Date().toISOString() }));
  res.status(status).json({ success: false, message: malformed ? 'Malformed JSON request body.' : status >= 500 ? 'An unexpected server error occurred.' : error.message, requestId: req.id });
});
module.exports = app;
