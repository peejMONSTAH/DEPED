/**
 * Backs up the documents themselves.
 *
 * `backup-daily.ps1` dumps Postgres and copies `backend/uploads`, but in
 * production every document is written to Supabase Storage (see
 * document-storage.service.ts) and that folder is empty. A restore from those
 * backups produced a database full of `supabase:` pointers to files that no
 * longer existed anywhere. This pulls the objects down and then reconciles them
 * against the rows that reference them, so a backup that silently misses files
 * fails loudly instead of looking fine.
 *
 * Usage: node backend/scripts/backup-storage.mjs <destination-directory>
 *
 * Lives under backend/ so it resolves @supabase/supabase-js and @prisma/client
 * from the backend package, and can be run from any working directory.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';

const destination = process.argv[2];
if (!destination) {
  console.error('usage: node backend/scripts/backup-storage.mjs <destination-directory>');
  process.exit(2);
}

const readEnvFile = async () => {
  // Anchored to this file, not the caller's working directory.
  const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const envPath = path.join(backendRoot, '.env');
  const out = {};
  try {
    const raw = await fs.readFile(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    // Fall back to the ambient environment when there is no .env (CI, containers).
  }
  return out;
};

const fileEnv = await readEnvFile();
const env = key => process.env[key] || fileEnv[key];

const supabaseUrl = env('SUPABASE_URL');
const serviceKey = env('SUPABASE_SERVICE_KEY');
const bucket = env('SUPABASE_STORAGE_BUCKET') || 'hris-documents';

if (!supabaseUrl || !serviceKey) {
  // Local-disk deployments have nothing in object storage; the PowerShell script
  // already copies backend/uploads for those.
  console.log('[storage] SUPABASE_URL/SUPABASE_SERVICE_KEY not set — object storage backup skipped.');
  process.exit(0);
}

const storage = createClient(supabaseUrl, serviceKey).storage.from(bucket);

/** Supabase list() is per-prefix and paginated, so walk the tree. */
const listAll = async (prefix = '') => {
  const found = [];
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await storage.list(prefix, { limit: pageSize, offset });
    if (error) throw new Error(`list '${prefix}': ${error.message}`);
    if (!data || data.length === 0) break;
    for (const entry of data) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name;
      // A folder placeholder has no id; anything else is an object.
      if (entry.id === null || entry.id === undefined) found.push(...await listAll(full));
      else found.push({ key: full, size: entry.metadata?.size ?? null });
    }
    if (data.length < pageSize) break;
  }
  return found;
};

console.log(`[storage] enumerating bucket '${bucket}' …`);
const objects = await listAll();
console.log(`[storage] ${objects.length} object(s) found`);

const root = path.join(destination, 'storage');
await fs.mkdir(root, { recursive: true });

let downloaded = 0;
let bytes = 0;
const failures = [];

for (const object of objects) {
  const { data, error } = await storage.download(object.key);
  if (error || !data) {
    failures.push({ key: object.key, reason: error?.message || 'empty response' });
    continue;
  }
  const target = path.join(root, object.key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const buffer = Buffer.from(await data.arrayBuffer());
  await fs.writeFile(target, buffer);
  downloaded += 1;
  bytes += buffer.length;
}

// Reconcile: every stored path a row points at must be present in the backup.
const prisma = new PrismaClient();
const referenced = new Set();
try {
  for (const row of await prisma.uploadedDocument.findMany({ select: { storagePath: true } })) {
    if (row.storagePath?.startsWith('supabase:')) referenced.add(row.storagePath.slice('supabase:'.length));
  }
  for (const row of await prisma.personnelFile.findMany({ where: { deletedAt: null }, select: { payload: true } })) {
    const p = row.payload?.storagePath;
    if (typeof p === 'string' && p.startsWith('supabase:')) referenced.add(p.slice('supabase:'.length));
  }
} finally {
  await prisma.$disconnect();
}

const backedUp = new Set(objects.map(o => o.key));
const missing = [...referenced].filter(key => !backedUp.has(key));

const manifest = {
  bucket,
  takenAt: new Date().toISOString(),
  objectsInBucket: objects.length,
  objectsDownloaded: downloaded,
  bytesDownloaded: bytes,
  rowsReferencingStorage: referenced.size,
  referencedButMissing: missing,
  downloadFailures: failures,
};
await fs.writeFile(path.join(destination, 'storage-manifest.json'), JSON.stringify(manifest, null, 2));

console.log(`[storage] downloaded ${downloaded}/${objects.length} object(s), ${(bytes / 1024 / 1024).toFixed(2)} MB`);
console.log(`[storage] ${referenced.size} database row(s) reference object storage`);

if (failures.length > 0) {
  console.error(`[storage] FAILED to download ${failures.length} object(s):`);
  failures.slice(0, 10).forEach(f => console.error(`  ${f.key}: ${f.reason}`));
  process.exit(1);
}
if (missing.length > 0) {
  console.error(`[storage] ${missing.length} referenced document(s) are NOT in the backup — a restore would lose them:`);
  missing.slice(0, 10).forEach(k => console.error(`  ${k}`));
  process.exit(1);
}
console.log('[storage] every referenced document is present in this backup.');
