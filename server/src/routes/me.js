import { Router } from 'express';
import { asyncHandler, HttpError } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { publicUser } from '../services/serialize.js';
import { assertDisplayName } from '../validate.js';

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
    res.json({ user: publicUser(req.user) });
  })
);

meRouter.post(
  '/push-token',
  asyncHandler(async (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!token || token.length > 4096) {
      throw new HttpError(400, 'Missing notification token.');
    }
    req.user.pushToken = token;
    await req.user.save();
    res.json({ ok: true });
  })
);
