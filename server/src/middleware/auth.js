import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { HttpError } from '../errors.js';

export function signToken(user) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new HttpError(500, 'Server auth is not configured.');
  return jwt.sign({ sub: user._id.toString() }, secret, { expiresIn: '30d' });
}

export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw new HttpError(401, 'Log in again.');
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user) throw new HttpError(401, 'Log in again.');
    req.user = user;
    next();
  } catch (err) {
    if (err instanceof HttpError) {
      next(err);
      return;
    }
    next(new HttpError(401, 'Log in again.'));
  }
}
