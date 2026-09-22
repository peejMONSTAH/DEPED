import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('Provide the backup directory.');
const files = [];
async function walk(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Backup must not contain symlinks.');
    if (entry.isDirectory()) await walk(target);
    else if (entry.isFile() && target !== path.join(root, 'manifest.json')) {
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(target)) hash.update(chunk);
      files.push({ path: path.relative(root, target).split(path.sep).join('/'), bytes: (await fs.stat(target)).size, sha256: hash.digest('hex') });
    }
  }
}
await walk(root);
await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify({ createdAt: new Date().toISOString(), files }, null, 2), { flag: 'wx' });
