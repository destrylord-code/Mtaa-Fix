import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import db from '../config/db.js';
import { detectMedia, uploadDir } from '../middlewares/uploadMiddlewares.js';
import { canAccessReport } from '../services/jurisdiction.js';
import { uploadToCloudinary } from '../utils/cloudinary.js';

const configuredCloudinary = () => process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET && !process.env.CLOUDINARY_CLOUD_NAME.startsWith('your_');

export const saveUpload = async (file, userId) => {
  if (!file) { const error = new Error('No image file provided.'); error.statusCode = 400; throw error; }
  const { mime, extension } = detectMedia(file.buffer, file.mimetype);
  if (configuredCloudinary() && mime.startsWith('image/')) {
    const result = await uploadToCloudinary(file.buffer, { transformation: [{ quality: 'auto' }, { width: 1600, crop: 'limit' }] });
    return { url: result.secure_url, publicId: result.public_id, mime, sizeBytes: file.size };
  }
  const filename = `report-${Date.now()}-${randomBytes(12).toString('hex')}${extension}`;
  await fs.writeFile(path.join(uploadDir, filename), file.buffer, { flag: 'wx', mode: 0o600 });
  const url = `/uploads/${filename}`;
  await db.createAttachment({ url, ownerId: userId, name: filename, mimeType: mime, sizeBytes: file.size });
  return { url, mime, sizeBytes: file.size };
};

export const uploadImage = async (req, res, next) => {
  try {
    if (req.file && !req.file.mimetype.startsWith('image/')) return res.status(400).json({ status: 'error', message: 'Choose an image file.' });
    const result = await saveUpload(req.file, req.user.id);
    return res.status(201).json({ status: 'success', message: 'Image uploaded successfully.', data: result });
  } catch (error) { next(error); }
};

/** Persist evidence from the report multipart form with the same validation as standalone uploads. */
export const persistReportMedia = async (req, res, next) => {
  try {
    req.uploadedMedia = [];
    for (const file of req.files || []) req.uploadedMedia.push(await saveUpload(file, req.user.id));
    next();
  } catch (error) { next(error); }
};

export const downloadUpload = async (req, res, next) => {
  try {
    const filename = req.params.filename;
    if (!/^report-[a-zA-Z0-9.-]+$/.test(filename)) return res.status(404).json({ status: 'error', message: 'File not found.' });
    const url = `/uploads/${filename}`;
    const attachment = await db.findAttachmentByUrl(url);
    let allowed = req.user.role === 'SUPER_ADMIN' || attachment?.ownerId === req.user.id;
    if (!allowed && attachment?.reportId) {
      const report = await db.findReportById(attachment.reportId);
      allowed = canAccessReport(req.user, report);
    }
    // Legacy files may predate ownership metadata, but must still belong to a report.
    if (!allowed && !attachment) {
      const { reports } = await db.findReports({ mediaUrl: url, limit: 1 });
      allowed = reports.some((report) => canAccessReport(req.user, report));
    }
    if (!allowed) return res.status(404).json({ status: 'error', message: 'File not found.' });
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    return res.sendFile(path.join(uploadDir, filename));
  } catch (error) {
    if (error.code === 'ENOENT') return res.status(404).json({ status: 'error', message: 'File not found.' });
    next(error);
  }
};

export default { uploadImage, persistReportMedia, downloadUpload };
