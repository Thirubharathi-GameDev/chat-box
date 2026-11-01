import { Router } from 'express';
import multer from 'multer';
import { asyncHandler, HttpError } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadBuffer } from '../services/cloudinary.js';
import { User } from '../models/User.js';
import { publicUser } from '../services/serialize.js';
import { emitProfileUpdate } from '../sockets/chat.js';
import { assertDisplayName, assertNickname } from '../validate.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

function isImage(file) {
  const name = (file.originalname || '').toLowerCase();
  return (
    ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(file.mimetype) ||
    /\.(jpe?g|png|webp|heic|heif)$/.test(name)
  );
}

export const meRouter = Router();

meRouter.use(requireAuth);

meRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ user: publicUser(req.user) });
  })
);

meRouter.patch(
  '/',
  asyncHandler(async (req, res) => {
    req.user.displayName = assertDisplayName(req.body?.displayName);
    await req.user.save();
    emitProfileUpdate(req.user);
    res.json({ user: publicUser(req.user) });
  })
);

meRouter.patch(
  '/nickname',
  asyncHandler(async (req, res) => {
    req.user.partnerNickname = assertNickname(req.body?.nickname ?? '');
    await req.user.save();
    res.json({ user: publicUser(req.user) });
  })
);

meRouter.post(
  '/photo',
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (!err) {
        next();
        return;
      }
      if (err.code === 'LIMIT_FILE_SIZE') {
        next(new HttpError(400, 'Photo must be under 8 MB.'));
        return;
      }
      next(new HttpError(400, 'Could not read that photo.'));
    });
  },
  asyncHandler(async (req, res) => {
    if (!req.file || !isImage(req.file)) throw new HttpError(400, 'Choose a photo.');
    const uploaded = await uploadBuffer(req.file.buffer, {
      folder: 'chatbox/profiles',
      resourceType: 'image',
    });
    req.user.photoUrl = uploaded.secure_url;
    await req.user.save();
    emitProfileUpdate(req.user);
    res.json({ user: publicUser(req.user) });
  })
);

meRouter.post(
  '/push-token',
  asyncHandler(async (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (token.length > 4096) {
      throw new HttpError(400, 'Missing notification token.');
    }
    if (token) {
      await User.updateMany({ _id: { $ne: req.user._id }, pushToken: token }, { $set: { pushToken: '' } });
    }
    req.user.pushToken = token;
    await req.user.save();
    res.json({ ok: true });
  })
);
