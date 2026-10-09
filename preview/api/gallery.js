import { list, put } from '@vercel/blob';
import { randomUUID } from 'node:crypto';

const MAX_BYTES = 3 * 1024 * 1024;
const TYPES = {
  'image/jpeg': { ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
  'image/png': { ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47] },
  'image/webp': { ext: 'webp', magic: [0x52, 0x49, 0x46, 0x46] },
};

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host;
    const requestHost = req.headers['x-forwarded-host'] || req.headers.host;
    return Boolean(requestHost) && originHost === requestHost;
  } catch {
    return false;
  }
}

export default async function gallery(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!sameOrigin(req)) return res.status(403).json({ error: 'הבקשה נדחתה.' });

  try {
    if (req.method === 'GET') {
      const result = await list({ prefix: 'gallery/', limit: 1000 });
      const items = result.blobs
        .filter((blob) => /^gallery\/[a-zA-Z0-9_-]+\.(jpg|png|webp)$/.test(blob.pathname))
        .map((blob) => ({ url: blob.url, uploadedAt: blob.uploadedAt }))
        .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
      return res.status(200).json({ items });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'שיטת הבקשה אינה נתמכת.' });
    }

    const dataUrl = req.body && req.body.dataUrl;
    if (typeof dataUrl !== 'string') return res.status(400).json({ error: 'לא התקבלה תמונה תקינה.' });
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
    if (!match) return res.status(400).json({ error: 'אפשר להעלות JPG, PNG או WebP בלבד.' });

    const contentType = match[1];
    const file = Buffer.from(match[2], 'base64');
    if (!file.length || file.length > MAX_BYTES) return res.status(413).json({ error: 'התמונה חייבת להיות עד 3MB.' });
    const expected = TYPES[contentType];
    if (!expected.magic.every((byte, index) => file[index] === byte)) {
      return res.status(400).json({ error: 'סוג התמונה אינו תואם לתוכן הקובץ.' });
    }

    const pathname = `gallery/${Date.now()}-${randomUUID()}.${expected.ext}`;
    const blob = await put(pathname, file, {
      access: 'public',
      contentType,
      addRandomSuffix: false,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return res.status(201).json({ url: blob.url });
  } catch (error) {
    console.error('Gallery operation failed:', error && error.message);
    return res.status(500).json({ error: 'הגלריה אינה זמינה כרגע. נסו שוב מאוחר יותר.' });
  }
};

export const config = { api: { bodyParser: { sizeLimit: '4.5mb' } } };
