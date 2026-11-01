import { Router } from 'express';
import multer from 'multer';
import { Conversation } from '../models/Conversation.js';
import { asyncHandler, HttpError } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { signUpload, uploadBuffer } from '../services/cloudinary.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const AUDIO_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/aac',
  'audio/wav',
  'audio/x-wav',
  'audio/x-m4a',
  'audio/m4a',
  'audio/3gpp',
  'audio/webm',
  'video/webm',
]);

function detectKind(file) {
  const name = (file.originalname || '').toLowerCase();
  if (IMAGE_TYPES.has(file.mimetype) || /\.(jpe?g|png|webp|heic|heif)$/.test(name)) return 'image';
  if (AUDIO_TYPES.has(file.mimetype) || /\.(m4a|mp3|aac|wav|3gp|caf|webm)$/.test(name)) return 'voice';
  return null;
}

export const mediaRouter = Router();

mediaRouter.use(requireAuth);

mediaRouter.post(
  '/sign',
  asyncHandler(async (req, res) => {
    const voice = req.body?.kind !== 'image';
    const signed = signUpload(voice ? 'chatbox/voice' : 'chatbox/images');
    res.json({ ...signed, resourceType: voice ? 'video' : 'image' });
  })
);

mediaRouter.post(
  '/',
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (!err) {
        next();
        return;
      }
      if (err.code === 'LIMIT_FILE_SIZE') {
        next(new HttpError(400, 'File must be under 15 MB.'));
        return;
      }
      next(new HttpError(400, 'Could not read that file.'));
    });
  },
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'Choose a photo or voice message.');

    const conversation = await Conversation.findOne({ participants: req.user._id });
    if (!conversation) throw new HttpError(400, 'Connect with someone before sending files.');

    const kind = detectKind(req.file);
    if (!kind) throw new HttpError(400, 'Send a photo or a voice message.');

    const uploaded = await uploadBuffer(req.file.buffer, {
      folder: kind === 'image' ? 'chatbox/images' : 'chatbox/voice',
      resourceType: kind === 'image' ? 'image' : 'video',
    });

    res.json({ url: uploaded.secure_url, kind });
  })
);
