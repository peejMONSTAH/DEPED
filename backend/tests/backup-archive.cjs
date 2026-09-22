const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
test('offsite backup encryption round-trips and rejects tampering without retaining plaintext', () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'digital201-crypto-test-'));
  const input = path.join(scratch, 'input'), encrypted = path.join(scratch, 'encrypted'), output = path.join(scratch, 'output');
  const env = { ...process.env, BACKUP_ENCRYPTION_PASSPHRASE: 'synthetic-backup-test-passphrase-not-for-real-data' };
  const run = (mode, src, dest) => execFileSync(process.execPath, [path.join(__dirname, '../scripts/backup-archive.mjs'), mode, src, dest], { env, stdio: 'pipe' });
  try {
    fs.writeFileSync(input, 'Synthetic test archive content.');
    run('encrypt', input, encrypted); run('decrypt', encrypted, output);
    assert.deepEqual(fs.readFileSync(input), fs.readFileSync(output));
    const modified = fs.readFileSync(encrypted); modified[40] ^= 1; fs.writeFileSync(encrypted, modified);
    assert.throws(() => run('decrypt', encrypted, path.join(scratch, 'tampered')));
    assert.ok(!fs.existsSync(path.join(scratch, 'tampered')));
    assert.throws(() => run('encrypt', input, output), 'existing outputs must not be overwritten');
    assert.deepEqual(fs.readFileSync(input), fs.readFileSync(output));
  } finally { fs.rmSync(scratch, { recursive: true }); }
});
