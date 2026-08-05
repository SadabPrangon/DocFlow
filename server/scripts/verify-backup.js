const { existsSync, readFileSync, lstatSync } = require('fs');
const { resolve, relative, isAbsolute } = require('path');
const crypto = require('crypto');

const backupDir = resolve(__dirname, '..', 'backups');
const target = resolve(process.argv[2] || '');
const rel = relative(backupDir, target);
if (!target.endsWith('.archive.gz') || !existsSync(target) || rel.startsWith('..') || isAbsolute(rel) || lstatSync(target).isSymbolicLink()) throw new Error('Provide a regular .archive.gz file inside server/backups.');
const checksumFile = `${target}.sha256`;
if (!existsSync(checksumFile)) throw new Error('Checksum manifest is missing.');
const expected = readFileSync(checksumFile, 'utf8').trim().split(/\s+/)[0];
const actual = crypto.createHash('sha256').update(readFileSync(target)).digest('hex');
if (!/^[a-f0-9]{64}$/.test(expected) || expected !== actual) throw new Error('Backup checksum does not match.');
console.log(`Backup verified: ${target}`);
