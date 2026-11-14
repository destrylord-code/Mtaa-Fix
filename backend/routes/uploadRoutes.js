import express from 'express';
import { authenticate } from '../middlewares/authMiddleware.js';
import { uploadMedia } from '../middlewares/uploadMiddlewares.js';
import { uploadImage } from '../controllers/uploadController.js';
import { rateLimit } from 'express-rate-limit';
const router = express.Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, skip: () => process.env.NODE_ENV === 'test', message: { status: 'error', message: 'Upload limit reached. Try again later.' } });
router.post('/upload-image', authenticate, limiter, uploadMedia.single('image'), uploadImage);
export default router;
