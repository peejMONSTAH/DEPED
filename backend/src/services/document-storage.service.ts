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

export async function readDocument(key: string): Promise<Buffer> {
  if (key.startsWith('supabase:')) {
    const { data, error } = await cloud().download(key.slice(9));
    if (error || !data) throw error || new Error('Document file is missing.');
    return Buffer.from(await data.arrayBuffer());
  }
  return fs.readFile(localPath(key));
}

// Used only to compensate a failed database write for a newly uploaded object.
export async function discardUncommittedDocument(key: string): Promise<void> {
  if (key.startsWith('supabase:')) {
    const { error } = await cloud().remove([key.slice(9)]);
    if (error) throw error;
  } else await fs.unlink(localPath(key));
}
