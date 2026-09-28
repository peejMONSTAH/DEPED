import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

const cloud = () => {
  if (!config.supabase.url || !config.supabase.serviceKey) throw new Error('Private document storage is not configured.');
  return createClient(config.supabase.url, config.supabase.serviceKey).storage.from(config.supabase.bucket);
};
const root = path.resolve(process.cwd(), 'uploads');
function localPath(key: string) {
  const resolved = path.resolve(process.cwd(), key);
  if (!resolved.startsWith(root + path.sep)) throw new Error('Invalid document storage path.');
  return resolved;
}

export async function storeDocument(buffer: Buffer, mime: string, folder: string): Promise<string> {
  const key = `${folder}/${randomUUID()}`;
  if (config.env === 'production' || process.env.DOCUMENT_STORAGE === 'supabase') {
    const { error } = await cloud().upload(key, buffer, { contentType: mime, upsert: false });
    if (error) throw error;
    return `supabase:${key}`;
  }
  const file = `uploads/${key}`;
  await fs.mkdir(path.dirname(localPath(file)), { recursive: true });
  await fs.writeFile(localPath(file), buffer, { flag: 'wx' });
  return file;
}

/** The record exists but its file does not (e.g. kept on a server disk that was since wiped). */
export const MISSING_FILE_MESSAGE = 'The file for this document is missing. The personnel needs to upload it again.';
const missingFile = () => Object.assign(new Error(MISSING_FILE_MESSAGE), { statusCode: 404 });

export async function readDocument(key: string): Promise<Buffer> {
  if (key.startsWith('supabase:')) {
    const { data, error } = await cloud().download(key.slice(9));
    if (!data && (!error || /not.?found/i.test(String((error as any)?.message)) || [400, 404].includes(Number((error as any)?.statusCode ?? (error as any)?.status)))) {
      throw missingFile();
    }
    if (error || !data) throw error;
    return Buffer.from(await data.arrayBuffer());
  }
  try {
    return await fs.readFile(localPath(key));
  } catch (err: any) {
    if (err?.code === 'ENOENT') throw Object.assign(missingFile(), { code: 'ENOENT' });
    throw err;
  }
}

// Used only to compensate a failed database write for a newly uploaded object.
export async function discardUncommittedDocument(key: string): Promise<void> {
  if (key.startsWith('supabase:')) {
    const { error } = await cloud().remove([key.slice(9)]);
    if (error) throw error;
  } else await fs.unlink(localPath(key));
}

let storageCheck: { at: number; value: { status: 'OPERATIONAL' | 'DEGRADED' | 'UNAVAILABLE' | 'NOT_CONFIGURED'; name: string; detail: string; remedy?: string } } | null = null;

/** A one-object listing of the private bucket, cached for five minutes. */
export async function checkStorageHealth() {
  if (storageCheck && Date.now() - storageCheck.at < 5 * 60_000) return storageCheck.value;
  let value: NonNullable<typeof storageCheck>['value'];
  if (!config.supabase.url || !config.supabase.serviceKey) {
    value = config.env === 'production'
      ? { status: 'NOT_CONFIGURED', name: 'Document storage', detail: 'Supabase storage is not configured.', remedy: 'Set SUPABASE_URL and SUPABASE_SERVICE_KEY on Railway.' }
      : { status: 'DEGRADED', name: 'Document storage', detail: 'Using local development storage; files are not in Supabase.', remedy: 'Set DOCUMENT_STORAGE=supabase with the Supabase keys.' };
  } else {
    const t0 = Date.now();
    const { error } = await cloud().list('', { limit: 1 });
    value = error
      ? { status: 'UNAVAILABLE', name: 'Document storage', detail: 'The private bucket could not be listed.', remedy: 'Check the Supabase project, bucket name and service key.' }
      : { status: 'OPERATIONAL', name: 'Document storage', detail: `Private bucket reachable in ${Date.now() - t0} ms.` };
  }
  storageCheck = { at: Date.now(), value };
  return value;
}
