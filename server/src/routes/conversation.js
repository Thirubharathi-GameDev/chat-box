import { Router } from 'express';
import mongoose from 'mongoose';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { User } from '../models/User.js';
import { asyncHandler, HttpError } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { publicConversation, publicMessage } from '../services/serialize.js';

export const conversationRouter = Router();

conversationRouter.use(requireAuth);

async function findOwnConversation(user, id) {
  if (id !== undefined) {
    if (!mongoose.isValidObjectId(id)) throw new HttpError(404, 'Chat not found.');
    return Conversation.findOne({ _id: id, participants: user._id });
  }
  return Conversation.findOne({ participants: user._id });
}

conversationRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const conversation = await findOwnConversation(req.user);
    if (!conversation) {
      res.json({ conversation: null });
      return;
    }
    const partnerId = conversation.participants.find((id) => !id.equals(req.user._id));
    const partner = partnerId ? await User.findById(partnerId) : null;
    res.json({ conversation: publicConversation(conversation, partner) });
  })
);

conversationRouter.get(
  '/:id/messages',
  asyncHandler(async (req, res) => {
    const conversation = await findOwnConversation(req.user, req.params.id);
    if (!conversation) throw new HttpError(404, 'Chat not found.');

    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 50) : 30;
    const query = { conversationId: conversation._id };

    if (req.query.before) {
      const before = new Date(String(req.query.before));
      if (Number.isNaN(before.getTime())) throw new HttpError(400, 'Invalid cursor.');
      query.createdAt = { $lt: before };
    }

    const docs = await Message.find(query).sort({ createdAt: -1 }).limit(limit + 1);
    const hasMore = docs.length > limit;
    const messages = docs.slice(0, limit).reverse().map(publicMessage);
    res.json({ messages, hasMore });
  })
);
