const required = (name, errors) => {
  const value = String(process.env[name] || '').trim();
  if (!value) errors.push(`${name} is required.`);
  return value;
};

const validateConfig = () => {
  const errors = [];
  required('MONGODB_URI', errors);
  const jwt = required('JWT_SECRET', errors);
  const production = process.env.NODE_ENV === 'production';
  const otp = production ? required('OTP_SECRET', errors) : String(process.env.OTP_SECRET || jwt);
  if (production && jwt.length < 32) errors.push('JWT_SECRET must contain at least 32 characters in production.');
  if (production && otp.length < 32) errors.push('OTP_SECRET must contain at least 32 characters in production.');
  if (production && jwt && otp && jwt === otp) errors.push('JWT_SECRET and OTP_SECRET must be different.');
  if (production) required('CORS_ORIGINS', errors);
  if (production) required('CLIENT_URL', errors);
  if (errors.length) throw new Error(`Invalid server configuration:\n- ${errors.join('\n- ')}`);
};

const csv = (value) => String(value || '').split(',').map((item) => item.trim()).filter(Boolean);

module.exports = {
  validateConfig,
  corsOrigins: () => {
    const configured = csv(process.env.CORS_ORIGINS);
    if (configured.length) return configured;
    if (process.env.NODE_ENV === 'production') return [];
    return ['http://localhost:5173', 'http://127.0.0.1:5173', '*'];
  },
  jsonLimit: () => process.env.JSON_BODY_LIMIT || '100kb',
  shutdownTimeoutMs: () => Math.max(1000, Number(process.env.SHUTDOWN_TIMEOUT_MS) || 10000),
};
