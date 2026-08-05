const crypto = require('crypto');

const startedAt = Date.now();
let ready = false;
const metrics = { requests: 0, errors: 0, durationMs: 0, byStatus: new Map() };

const setReady = (value) => { ready = Boolean(value); };
const isReady = () => ready;

const requestContext = (req, res, next) => {
  const incoming = String(req.headers['x-request-id'] || '');
  req.id = /^[a-zA-Z0-9._-]{1,100}$/.test(incoming) ? incoming : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  const began = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - began) / 1e6;
    metrics.requests += 1;
    metrics.durationMs += durationMs;
    metrics.byStatus.set(res.statusCode, (metrics.byStatus.get(res.statusCode) || 0) + 1);
    if (res.statusCode >= 500) metrics.errors += 1;
    if (process.env.NODE_ENV !== 'test') {
      console.log(JSON.stringify({ level: res.statusCode >= 500 ? 'error' : 'info', event: 'http_request', requestId: req.id, method: req.method, path: req.originalUrl.split('?')[0], status: res.statusCode, durationMs: Number(durationMs.toFixed(2)), timestamp: new Date().toISOString() }));
    }
  });
  next();
};

const securityHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
};

const createRateLimiter = ({ windowMs, limit, keyPrefix = '' }) => {
  const buckets = new Map();
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  }, Math.min(windowMs, 60000));
  cleanup.unref();
  const middleware = (req, res, next) => {
    if (process.env.NODE_ENV === 'test') return next();
    const now = Date.now();
    const key = `${keyPrefix}:${req.ip}`;
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) { bucket = { count: 0, resetAt: now + windowMs }; buckets.set(key, bucket); }
    bucket.count += 1;
    res.setHeader('RateLimit-Limit', limit);
    res.setHeader('RateLimit-Remaining', Math.max(0, limit - bucket.count));
    res.setHeader('RateLimit-Reset', Math.ceil(bucket.resetAt / 1000));
    if (bucket.count > limit) {
      res.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
      return res.status(429).json({ success: false, message: 'Too many requests. Please try again later.', requestId: req.id });
    }
    next();
  };
  middleware.stop = () => clearInterval(cleanup);
  return middleware;
};

const prometheus = () => {
  const average = metrics.requests ? metrics.durationMs / metrics.requests : 0;
  const lines = [
    '# HELP docflow_uptime_seconds Process uptime in seconds.',
    '# TYPE docflow_uptime_seconds gauge',
    `docflow_uptime_seconds ${Math.floor((Date.now() - startedAt) / 1000)}`,
    '# HELP docflow_http_requests_total Total completed HTTP requests.',
    '# TYPE docflow_http_requests_total counter',
    `docflow_http_requests_total ${metrics.requests}`,
    '# HELP docflow_http_errors_total Total HTTP 5xx responses.',
    '# TYPE docflow_http_errors_total counter',
    `docflow_http_errors_total ${metrics.errors}`,
    '# HELP docflow_http_request_duration_ms_average Average request duration.',
    '# TYPE docflow_http_request_duration_ms_average gauge',
    `docflow_http_request_duration_ms_average ${average.toFixed(3)}`,
  ];
  for (const [status, count] of metrics.byStatus) lines.push(`docflow_http_responses_total{status="${status}"} ${count}`);
  return `${lines.join('\n')}\n`;
};

module.exports = { requestContext, securityHeaders, createRateLimiter, prometheus, setReady, isReady };
