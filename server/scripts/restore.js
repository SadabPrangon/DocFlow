require('dotenv').config();
const { existsSync, readFileSync } = require('fs');
const { resolve, relative, isAbsolute } = require('path');
const { spawnSync } = require('child_process');
const crypto = require('crypto');

if (process.env.CONFIRM_RESTORE !== 'YES') throw new Error('Set CONFIRM_RESTORE=YES to confirm this destructive restore operation.');
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
const backupDir = resolve(__dirname, '..', 'backups'); const target = resolve(process.argv[2] || ''); const rel = relative(backupDir, target);
if (!target.endsWith('.archive.gz') || !existsSync(target) || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Provide an existing .archive.gz file inside server/backups.');
const checksumFile = `${target}.sha256`;
if (!existsSync(checksumFile) && process.env.ALLOW_UNVERIFIED_BACKUP !== 'YES') throw new Error('Backup checksum is missing. Set ALLOW_UNVERIFIED_BACKUP=YES only for a trusted legacy archive.');
if (existsSync(checksumFile)) {
  const expected = readFileSync(checksumFile, 'utf8').trim().split(/\s+/)[0];
  const actual = crypto.createHash('sha256').update(readFileSync(target)).digest('hex');
  if (!/^[a-f0-9]{64}$/.test(expected) || expected !== actual) throw new Error('Backup checksum verification failed. Restore was cancelled.');
  console.log('Backup checksum verified.');
}
const result = spawnSync('mongorestore', [`--uri=${process.env.MONGODB_URI}`, `--archive=${target}`, '--gzip', '--drop'], { stdio: 'inherit', shell: false });
if (result.error) throw new Error(`mongorestore could not start: ${result.error.message}. Install MongoDB Database Tools.`);
if (result.status !== 0) process.exit(result.status || 1);
console.log('Restore completed successfully.');
