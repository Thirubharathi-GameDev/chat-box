import { Router } from 'express';
import mongoose from 'mongoose';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { User } from '../models/User.js';
import { asyncHandler, HttpError } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { publicConversation, publicMessage } from '../services/serialize.js';
import { isUserPresent } from '../sockets/chat.js';

export const conversationRouter = Router();

conversationRouter.use(requireAuth);

async function conversationCounts(conversationId, viewerId) {
  const base = { conversationId, hiddenFor: { $ne: viewerId } };
  const incoming = { ...base, senderId: { $ne: viewerId } };
  const unreadQuery = { ...incoming, status: { $ne: 'read' } };
  const [total, sent, received, unread, latestUnread] = await Promise.all([
    Message.countDocuments(base),
    Message.countDocuments({ ...base, senderId: viewerId }),
    Message.countDocuments(incoming),
    Message.countDocuments(unreadQuery),
    Message.findOne(unreadQuery).sort({ createdAt: -1 }),
  ]);
  return {
    stats: { total, sent, received, unread },
    unreadMessage: latestUnread
      ? {
          type: latestUnread.type,
          text: latestUnread.deleted
            ? 'This message was deleted'
            : latestUnread.type === 'text'
              ? latestUnread.text || ''
              : latestUnread.type === 'image'
                ? 'Photo'
                : 'Voice message',
          createdAt: latestUnread.createdAt.toISOString(),
        }
      : null,
  };
}

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
    const counts = await conversationCounts(conversation._id, req.user._id);
    const visibleLast = await Message.findOne({
      conversationId: conversation._id,
      hiddenFor: { $ne: req.user._id },
    }).sort({ createdAt: -1 });
    res.json({
      conversation: publicConversation(conversation, partner, {
        online: Boolean(partner && isUserPresent(partner._id)),
        nickname: req.user.partnerNickname || '',
        stats: counts.stats,
        unreadMessage: counts.unreadMessage,
        lastMessage: visibleLast,
      }),
    });
  })
);

conversationRouter.get(
  '/:id/messages',
  asyncHandler(async (req, res) => {
    const conversation = await findOwnConversation(req.user, req.params.id);
    if (!conversation) throw new HttpError(404, 'Chat not found.');

    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 50) : 30;
    const query = { conversationId: conversation._id, hiddenFor: { $ne: req.user._id } };

    if (req.query.before) {
      const before = new Date(String(req.query.before));
      if (Number.isNaN(before.getTime())) throw new HttpError(400, 'Invalid cursor.');
      query.createdAt = { $lt: before };
    }

    const docs = await Message.find(query).sort({ createdAt: -1 }).limit(limit + 1);
    const hasMore = docs.length > limit;
    const messages = docs.slice(0, limit).reverse().map((doc) => publicMessage(doc, req.user._id));
    res.json({ messages, hasMore });
  })
);

conversationRouter.get(
  '/:id/starred',
  asyncHandler(async (req, res) => {
    const conversation = await findOwnConversation(req.user, req.params.id);
    if (!conversation) throw new HttpError(404, 'Chat not found.');
    const docs = await Message.find({
      conversationId: conversation._id,
      starredBy: req.user._id,
      hiddenFor: { $ne: req.user._id },
    })
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ messages: docs.map((doc) => publicMessage(doc, req.user._id)) });
  })
);
