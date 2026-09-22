/** Export all referenced documents, including revisions, from the same database as pg_dump. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(backendRoot, '.env') });
const destination = process.argv[2];
if (!destination) throw new Error('Usage: node backend/scripts/backup-storage.mjs <destination-directory>');
const databaseUrl = process.env.DIGITAL201_BACKUP_DATABASE_URL || process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('The backup database connection must be explicitly configured.');
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const references = new Set();
const addReference = value => { if (typeof value === 'string' && value) references.add(value); };
try {
  for (const row of await prisma.uploadedDocument.findMany({ select: { storagePath: true } })) addReference(row.storagePath);
  // Deleted/replaced dossier rows and upload revisions remain part of the restored history.
  for (const row of await prisma.personnelFile.findMany({ select: { storagePath: true } })) addReference(row.storagePath);
  for (const row of await prisma.documentRevision.findMany({ select: { snapshot: true } })) addReference(row.snapshot?.storagePath);
} finally { await prisma.$disconnect(); }

const cloudPaths = [...references].filter(key => key.startsWith('supabase:'));
if (cloudPaths.length && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY)) {
  throw new Error('Database references Supabase documents, but storage credentials are missing. Backup is incomplete.');
}
const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'hris-documents';
const storage = cloudPaths.length ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY).storage.from(bucket) : null;
const root = path.resolve(destination);
const safeTarget = relative => {
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep)) throw new Error('Unsafe document path in backup references.');
  return target;
};
let downloaded = 0, bytes = 0;
const missing = [];
await fs.mkdir(root, { recursive: true });
for (const key of references) {
  if (key.startsWith('supabase:')) {
    const target = safeTarget(path.join('storage', key.slice(9)));
    const { data, error } = await storage.download(key.slice(9));
    if (error || !data) { missing.push(key); continue; }
    const buffer = Buffer.from(await data.arrayBuffer());
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, buffer, { flag: 'wx' });
    downloaded++; bytes += buffer.length;
  } else {
    // Local deployments copy uploads first. Never read arbitrary paths stored in a row.
    const normalized = key.replaceAll('\\', '/');
    if (!normalized.startsWith('uploads/')) { missing.push(key); continue; }
    try { await fs.access(safeTarget(normalized)); } catch { missing.push(key); }
  }
}
await fs.writeFile(path.join(root, 'storage-manifest.json'), JSON.stringify({
  bucket, takenAt: new Date().toISOString(), referencedDocuments: references.size,
  objectsDownloaded: downloaded, bytesDownloaded: bytes, referencedButMissing: missing,
}, null, 2));
console.log('[storage] ' + downloaded + ' objects exported; ' + references.size + ' current/historical references checked.');
if (missing.length) { console.error('[storage] ' + missing.length + ' referenced files are missing. Backup is incomplete.'); process.exit(1); }
