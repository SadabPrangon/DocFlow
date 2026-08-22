require('dotenv').config();
const { spawnSync } = require('child_process');
const { validateConfig, corsOrigins } = require('../config');

let failed = false;
const report = (ok, name, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); if (!ok) failed = true; };
try { validateConfig(); report(true, 'Required environment configuration'); } catch (error) { report(false, 'Required environment configuration', error.message.replace(/\n/g, ' ')); }
report(corsOrigins().length > 0, 'CORS origin policy', corsOrigins().join(', '));
report(Number(process.versions.node.split('.')[0]) >= 20, 'Node.js runtime', process.version);
const dump = spawnSync('mongodump', ['--version'], { encoding: 'utf8', shell: false });
report(!dump.error && dump.status === 0, 'MongoDB database tools', dump.error ? 'mongodump is not installed' : String(dump.stdout).split('\n')[0]);
report(Boolean(process.env.METRICS_TOKEN) || process.env.NODE_ENV !== 'production', 'Metrics access token', process.env.METRICS_TOKEN ? 'configured' : 'required in production');
report(Boolean(process.env.SMTP_HOST || (process.env.EMAIL_USER && process.env.EMAIL_PASS)), 'Email provider', 'required for OTP and email reminders');
const sslcommerz = require('../lib/sslcommerz');
const provider = sslcommerz.isConfigured() ? `sslcommerz (${sslcommerz.sandbox() ? 'sandbox' : 'live'})` : process.env.STRIPE_SECRET_KEY ? 'stripe' : '';
report(Boolean(provider), 'Online payment provider', provider || 'none configured; online checkout returns 503');
const callbackHost = String(process.env.SERVER_PUBLIC_URL || '');
const localCallback = !callbackHost || /localhost|127\.0\.0\.1/i.test(callbackHost);
if (sslcommerz.isConfigured()) report(!(localCallback && process.env.NODE_ENV === 'production'), 'SSLCommerz callback URL', localCallback ? `${callbackHost || 'unset'} - the gateway cannot reach this from the internet, so IPN will not deliver` : callbackHost);
const ollama = require("../lib/ollama");
ollama.isAvailable().then((ready) => {
  report(true, "Care assistant", ollama.enabled() ? (ready ? `ollama ready (${ollama.model()})` : `${ollama.model()} unreachable at ${ollama.host()}; keyword fallback in use`) : "disabled by AI_ASSISTANT=false");
  if (failed) process.exitCode = 1;
});

