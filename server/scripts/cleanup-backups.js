const { existsSync, readdirSync, lstatSync, unlinkSync } = require('fs');
const { resolve, join } = require('path');

const backupDir = resolve(__dirname, '..', 'backups');
const retentionDays = Math.max(1, Number(process.env.BACKUP_RETENTION_DAYS) || 35);
const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
let removed = 0;
if (!existsSync(backupDir)) { console.log('Backup retention complete: backup directory does not exist.'); process.exit(0); }
for (const name of readdirSync(backupDir, { withFileTypes: true })) {
  if (!name.isFile() || !/^docflow-.*\.archive\.gz(?:\.sha256)?$/.test(name.name)) continue;
  const target = join(backupDir, name.name);
  const stat = lstatSync(target);
  if (stat.isSymbolicLink() || stat.mtimeMs >= cutoff) continue;
  unlinkSync(target); removed += 1;
}
console.log(`Backup retention complete: removed ${removed} file(s) older than ${retentionDays} days.`);
