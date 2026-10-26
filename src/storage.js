// Слой хранения файлов: локальный диск (data/) или S3-совместимое объектное хранилище
// (reg.cloud: endpoint https://s3.regru.cloud). Переключение — наличием S3_* в env:
// заданы BUCKET+KEYS → S3, иначе диск. Коды объектов относительные: uploads/..., renders/..., products/...
import fs from 'node:fs';
import path from 'node:path';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { log } from './openrouter.js';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

const ENDPOINT = process.env.S3_ENDPOINT || 'https://s3.regru.cloud';
const REGION = process.env.S3_REGION || 'us-east-1';
const BUCKET = process.env.S3_BUCKET || '';
const ACCESS_KEY = process.env.S3_ACCESS_KEY || '';
const SECRET_KEY = process.env.S3_SECRET_KEY || '';
const URL_TTL = Number(process.env.S3_URL_TTL || 86400); // presigned GET, сек

export const s3Enabled = () => Boolean(BUCKET && ACCESS_KEY && SECRET_KEY);

let client = null;
if (s3Enabled()) {
  client = new S3Client({
    endpoint: ENDPOINT,
    region: REGION,
    forcePathStyle: true, // s3.regru.cloud/<bucket>/<key>
    credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
  });
  log({ event: 'storage', mode: 's3', endpoint: ENDPOINT, bucket: BUCKET, region: REGION });
} else {
  log({ event: 'storage', mode: 'disk', dir: DATA_DIR });
}

export async function putBuffer(key, buf, contentType) {
  if (s3Enabled()) {
    await client.send(new PutObjectCommand({
      Bucket: BUCKET, Key: key, Body: buf, ContentType: contentType || 'application/octet-stream',
    }));
    return key;
  }
  const p = resolveDisk(key);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, buf);
  return key;
}

export async function getBuffer(stored) {
  if (s3Enabled()) {
    const r = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: keyOf(stored) }));
    return Buffer.from(await r.Body.transformToByteArray());
  }
  return fs.readFileSync(resolveDisk(stored));
}

export async function remove(stored) {
  try {
    if (s3Enabled()) {
      await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: keyOf(stored) }));
    } else {
      fs.unlinkSync(resolveDisk(stored));
    }
  } catch (e) {
    log({ event: 'storage_remove_error', stored, error: String(e.message || e).slice(0, 200) });
  }
}

// URL для отдачи через наши /files//renders//products/: если S3 — редирект на presigned URL
export async function redirectUrl(stored) {
  if (!s3Enabled()) return null;
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: keyOf(stored) });
  return getSignedUrl(client, cmd, { expiresIn: URL_TTL });
}

// старое поведение: отдать файл с диска. stored — относительный ключ или абсолютный путь (старые строки БД)
export function resolveDisk(stored) {
  if (!stored) return path.join(DATA_DIR, 'missing');
  return path.isAbsolute(stored) ? stored : path.join(DATA_DIR, stored);
}
function keyOf(stored) {
  // из абсолютного пути (legacy) вытащить относительную часть после data/
  if (path.isAbsolute(stored)) {
    const m = stored.match(/\/(uploads|renders|products|refcache)\/(.+)$/);
    if (m) return `${m[1]}/${m[2]}`;
  }
  return stored;
}
export { keyOf };
