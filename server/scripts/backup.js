require('dotenv').config();
const { mkdirSync, statSync, readFileSync, writeFileSync } = require('fs');
const { join, resolve } = require('path');
const { spawnSync } = require('child_process');
const crypto = require('crypto');

if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
const backupDir = resolve(__dirname, '..', 'backups'); mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-'); const target = join(backupDir, `docflow-${stamp}.archive.gz`);
const result = spawnSync('mongodump', [`--uri=${process.env.MONGODB_URI}`, `--archive=${target}`, '--gzip'], { stdio: 'inherit', shell: false });
if (result.error) throw new Error(`mongodump could not start: ${result.error.message}. Install MongoDB Database Tools.`);
if (result.status !== 0) process.exit(result.status || 1);
const size = statSync(target).size;
if (!size) throw new Error('Backup archive is empty.');
const sha256 = crypto.createHash('sha256').update(readFileSync(target)).digest('hex');
writeFileSync(`${target}.sha256`, `${sha256}  ${require('path').basename(target)}\n`, { encoding: 'utf8', mode: 0o600 });
console.log(`Backup created and checksummed: ${target} (${size} bytes)`);
