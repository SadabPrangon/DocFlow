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
if (failed) process.exitCode = 1;
