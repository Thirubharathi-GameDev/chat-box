import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { asyncHandler, HttpError } from '../errors.js';
import { assertPassword, assertUserId } from '../validate.js';
import { signToken } from '../middleware/auth.js';
import { publicUser } from '../services/serialize.js';

export const authRouter = Router();

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const userId = assertUserId(req.body?.userId);
    const password = assertPassword(req.body?.password);
    const passwordHash = await bcrypt.hash(password, 10);
    try {
      const user = await User.create({ userId, passwordHash, displayName: '' });
      res.status(201).json({ token: signToken(user), user: publicUser(user) });
    } catch (err) {
      if (err?.code === 11000) throw new HttpError(409, 'That user ID is taken.');
      throw err;
    }
  })
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const userId = assertUserId(req.body?.userId);
    const password = assertPassword(req.body?.password);
    const user = await User.findOne({ userId });
    const matches = await bcrypt.compare(
      password,
      user?.passwordHash || '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'
    );
    if (!user || !matches) {
      throw new HttpError(401, 'User ID or password is wrong.');
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  })
);
