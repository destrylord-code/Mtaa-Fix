import multer from 'multer';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '../uploads'));
fs.mkdirSync(uploadDir, { recursive: true });

/** Validate contents, not just the caller-controlled MIME/extension. SVG/HTML is excluded. */
export function detectMedia(buffer, declaredMime) {
  let mime;
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) mime = 'image/jpeg';
  else if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) mime = 'image/png';
  else if (buffer.subarray(0, 6).toString('ascii').match(/^GIF8[79]a$/)) mime = 'image/gif';
  else if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') mime = 'image/webp';
  else if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') mime = 'application/pdf';
  else if (buffer.subarray(4, 8).toString('ascii') === 'ftyp') mime = 'video/mp4';
  if (!mime || (declaredMime !== mime && !(mime === 'video/mp4' && declaredMime === 'video/quicktime'))) {
    throw Object.assign(new Error('File contents do not match a supported image, MP4 video, or PDF.'), { statusCode: 400 });
  }
  return { mime, extension: { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp', 'application/pdf': '.pdf', 'video/mp4': '.mp4' }[mime] };
}

const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'application/pdf']);
const fileFilter = (req, file, cb) => {
  if (!allowed.has(file.mimetype)) return cb(Object.assign(new Error('Unsupported file type. Use JPEG, PNG, WebP, GIF, MP4, or PDF.'), { statusCode: 400 }));
  cb(null, true);
};
export const uploadMedia = multer({ storage: multer.memoryStorage(), fileFilter, limits: { fileSize: 15 * 1024 * 1024, files: 5, fields: 25 } });
export default { uploadMedia };
