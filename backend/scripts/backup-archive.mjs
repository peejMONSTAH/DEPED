// Encrypt/decrypt an offsite archive. The passphrase is supplied only through the environment.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
const [mode, input, output] = process.argv.slice(2);
const passphrase = process.env.BACKUP_ENCRYPTION_PASSPHRASE;
if (!['encrypt', 'decrypt'].includes(mode) || !input || !output || !passphrase || passphrase.length < 32) {
  throw new Error('Usage: backup-archive.mjs encrypt|decrypt <input> <new-output>; BACKUP_ENCRYPTION_PASSPHRASE must be at least 32 characters.');
}
const magic = Buffer.from('D201BAK1');
let ownsOutput = false;
try {
  // Never overwrite an existing backup or an unrelated file.
  const destination = await open(output, 'wx', 0o600);
  ownsOutput = true;
  await destination.close();
  if (mode === 'encrypt') {
    const salt = randomBytes(16), nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', scryptSync(passphrase, salt, 32), nonce);
    const header = Buffer.concat([magic, salt, nonce]);
    cipher.setAAD(header);
    const handle = await open(output, 'r+');
    try { await handle.write(header); } finally { await handle.close(); }
    await pipeline(createReadStream(input), cipher, createWriteStream(output, { flags: 'a', mode: 0o600 }));
    const tail = await open(output, 'a');
    try { await tail.write(cipher.getAuthTag()); } finally { await tail.close(); }
  } else {
    const source = await open(input, 'r');
    const header = Buffer.alloc(36), tag = Buffer.alloc(16);
    let size;
    try {
      size = (await source.stat()).size;
      if (size < 52) throw new Error('Truncated backup archive.');
      await source.read(header, 0, 36, 0);
      await source.read(tag, 0, 16, size - 16);
    } finally { await source.close(); }
    if (!header.subarray(0, 8).equals(magic)) throw new Error('Unsupported backup archive format.');
    const decipher = createDecipheriv('aes-256-gcm', scryptSync(passphrase, header.subarray(8, 24), 32), header.subarray(24, 36));
    decipher.setAAD(header); decipher.setAuthTag(tag);
    await pipeline(createReadStream(input, { start: 36, end: size - 17 }), decipher, createWriteStream(output, { flags: 'w', mode: 0o600 }));
  }
} catch (error) {
  if (ownsOutput) await unlink(output).catch(() => {});
  throw error;
}
