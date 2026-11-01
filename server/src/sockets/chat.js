import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { User } from '../models/User.js';
import { HttpError } from '../errors.js';
import { createChatMessage } from '../services/messages.js';
import { sendPush } from '../services/push.js';
import { markDelivered, markRead } from '../services/receipts.js';
import { previewText, publicMessage } from '../services/serialize.js';

const connections = new Map();
const viewing = new Map();
let io;

function cleanReaction(value) {
  const emoji = String(value || '').trim();
  if (!emoji || emoji.length > 16 || /[a-z0-9]/i.test(emoji)) return '';
  return emoji;
}

function userRoom(id) {
  return `user:${id.toString()}`;
}

function convRoom(id) {
  return `conv:${id.toString()}`;
}

function addOnline(userId, socketId) {
  const key = String(userId);
  if (!connections.has(key)) connections.set(key, new Set());
  connections.get(key).add(socketId);
}

function removeOnline(userId, socketId) {
  const key = String(userId);
  const sockets = connections.get(key);
  if (!sockets) return;
  sockets.delete(socketId);
  if (sockets.size === 0) connections.delete(key);
}

export function isUserOnline(userId) {
  return connections.has(String(userId));
}

function socketsFor(userId) {
  const ids = connections.get(String(userId));
  if (!ids || !io) return [];
  const list = [];
  for (const id of ids) {
    const socket = io.sockets.sockets.get(id);
    if (socket) list.push(socket);
  }
  return list;
}

export function isUserPresent(userId) {
  return socketsFor(userId).some((socket) => socket.data.foreground);
}

function setForeground(socket, active) {
  const userId = socket.data.userId;
  const was = isUserPresent(userId);
  socket.data.foreground = Boolean(active);
  if (!active) viewing.delete(userId);
  const now = isUserPresent(userId);
  if (was === now) return;
  if (!now && socket.data.partnerId) {
    io.to(userRoom(socket.data.partnerId)).emit('typing', {
      conversationId: socket.data.conversationId,
      active: false,
    });
  }
  broadcastPresence(userId, now).catch((err) => {
    if (!/client was closed/i.test(err.message || '')) console.warn('Presence failed.', err.message);
  });
}

function isViewing(userId, conversationId) {
  return viewing.get(String(userId)) === String(conversationId);
}

export function getIo() {
  if (!io) throw new Error('Socket.io is not ready.');
  return io;
}

function rememberPair(userId, partnerId, conversationId) {
  const server = getIo();
  for (const socket of server.sockets.sockets.values()) {
    if (socket.data.userId !== String(userId)) continue;
    socket.data.partnerId = String(partnerId);
    socket.data.conversationId = String(conversationId);
  }
}

export function emitPairJoined({ ownerId, redeemerId, conversationId, ownerPayload, redeemerPayload }) {
  const server = getIo();
  const room = convRoom(conversationId);
  server.to(userRoom(ownerId)).socketsJoin(room);
  server.to(userRoom(redeemerId)).socketsJoin(room);
  rememberPair(ownerId, redeemerId, conversationId);
  rememberPair(redeemerId, ownerId, conversationId);
  server.to(userRoom(ownerId)).emit('pair:joined', { conversation: ownerPayload });
  server.to(userRoom(redeemerId)).emit('pair:joined', { conversation: redeemerPayload });
}

export function emitProfileUpdate(user) {
  if (!io || !user.partnerId) return;
  io.to(userRoom(user.partnerId)).emit('profile:updated', {
    userId: user._id.toString(),
    displayName: user.displayName || '',
    photoUrl: user.photoUrl || '',
  });
}

async function broadcastPresence(userId, online) {
  const user = await User.findById(userId).select('partnerId lastSeenAt');
  if (!user?.partnerId) return;
  let lastSeenAt = user.lastSeenAt;
  if (!online) {
    lastSeenAt = new Date();
    await User.updateOne({ _id: userId }, { $set: { lastSeenAt } });
  }
  io.to(userRoom(user.partnerId)).emit('presence', {
    userId: String(userId),
    online,
    lastSeenAt: lastSeenAt ? new Date(lastSeenAt).toISOString() : null,
  });
}

async function publishReceipts(readerId, conversationId, status) {
  const messageIds = status === 'read'
    ? await markRead(conversationId, readerId)
    : await markDelivered(conversationId, readerId);
  if (!messageIds.length) return;
  const user = await User.findById(readerId).select('partnerId');
  if (!user?.partnerId) return;
  io.to(userRoom(user.partnerId)).emit('message:status', {
    conversationId: String(conversationId),
    status,
    messageIds,
  });
}

async function notifyPartner(user, conversation, message) {
  const partnerId = conversation.participants.find((id) => !id.equals(user._id));
  if (!partnerId || isUserOnline(partnerId)) return;

  const partner = await User.findById(partnerId).select('pushToken partnerNickname');
  if (!partner?.pushToken) return;

  const badge = await Message.countDocuments({
    conversationId: conversation._id,
    hiddenFor: { $ne: partnerId },
    senderId: { $ne: partnerId },
    status: { $ne: 'read' },
  });

  try {
    await sendPush(partner.pushToken, {
      title: partner.partnerNickname?.trim() || user.displayName || user.userId,
      body: previewText(message),
      badge,
      data: {
        conversationId: conversation._id.toString(),
        messageId: message._id.toString(),
        type: message.type,
      },
    });
  } catch (err) {
    console.warn('Push failed.', err.message);
  }
}

export function attachSocket(server) {
  io = server;

  server.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token || !process.env.JWT_SECRET) {
        next(new Error('Unauthorized'));
        return;
      }
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(payload.sub).select('_id partnerId');
      if (!user) {
        next(new Error('Unauthorized'));
        return;
      }
      const conversation = await Conversation.findOne({ participants: user._id }).select('_id');
      socket.data.userId = user._id.toString();
      socket.data.partnerId = user.partnerId ? user.partnerId.toString() : '';
      socket.data.conversationId = conversation ? conversation._id.toString() : '';
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  server.on('connection', (socket) => {
    const userId = socket.data.userId;
    const cameOnline = !isUserOnline(userId);
    addOnline(userId, socket.id);
    socket.join(userRoom(userId));
    if (socket.data.conversationId) socket.join(convRoom(socket.data.conversationId));

    if (cameOnline && socket.data.conversationId) {
      publishReceipts(userId, socket.data.conversationId, 'delivered').catch((err) => {
        console.warn('Delivery receipt failed.', err.message);
      });
    }

    socket.on('disconnect', () => {
      removeOnline(userId, socket.id);
      if (viewing.get(userId) && !isUserOnline(userId)) viewing.delete(userId);
      if (!isUserOnline(userId)) {
        if (socket.data.partnerId) {
          io.to(userRoom(socket.data.partnerId)).emit('typing', {
            conversationId: socket.data.conversationId,
            active: false,
          });
        }
        broadcastPresence(userId, false).catch((err) => {
          if (!/client was closed/i.test(err.message || '')) console.warn('Presence failed.', err.message);
        });
      }
    });

    socket.on('app:foreground', ({ active } = {}) => {
      setForeground(socket, Boolean(active));
    });

    socket.on('chat:open', async ({ conversationId } = {}) => {
      if (!conversationId || conversationId !== socket.data.conversationId) return;
      setForeground(socket, true);
      viewing.set(userId, String(conversationId));
      try {
        await publishReceipts(userId, conversationId, 'read');
      } catch (err) {
        console.warn('Read receipt failed.', err.message);
      }
    });

    socket.on('chat:close', ({ conversationId } = {}) => {
      if (viewing.get(userId) === String(conversationId)) viewing.delete(userId);
    });

    socket.on('message:read', async ({ conversationId, messageId } = {}) => {
      if (!conversationId || conversationId !== socket.data.conversationId || !socket.data.foreground) return;
      viewing.set(userId, String(conversationId));
      try {
        const ids = await markRead(conversationId, userId, messageId ? [messageId] : undefined);
        if (!ids.length || !socket.data.partnerId) return;
        io.to(userRoom(socket.data.partnerId)).emit('message:status', {
          conversationId: String(conversationId),
          status: 'read',
          messageIds: ids,
        });
      } catch (err) {
        console.warn('Read receipt failed.', err.message);
      }
    });

    socket.on('typing', ({ conversationId, active, kind } = {}) => {
      if (!socket.data.partnerId || conversationId !== socket.data.conversationId) return;
      io.to(userRoom(socket.data.partnerId)).emit('typing', {
        conversationId,
        active: Boolean(active),
        kind: kind === 'recording' ? 'recording' : 'typing',
      });
    });

    socket.on('message:react', async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        const emoji = cleanReaction(payload?.emoji);
        const messageId = payload?.messageId;
        if (!emoji || !mongoose.isValidObjectId(messageId)) {
          reply({ ok: false, error: 'Pick a reaction.' });
          return;
        }
        if (payload?.conversationId !== socket.data.conversationId) {
          reply({ ok: false, error: 'Open the chat first.' });
          return;
        }
        const message = await Message.findOne({ _id: messageId, conversationId: socket.data.conversationId });
        if (!message) {
          reply({ ok: false, error: 'Message not found.' });
          return;
        }
        const mine = message.reactions.find((item) => String(item.userId) === userId);
        if (mine?.emoji === emoji) {
          message.reactions = message.reactions.filter((item) => String(item.userId) !== userId);
        } else if (mine) {
          mine.emoji = emoji;
        } else {
          message.reactions.push({ userId, emoji });
        }
        await message.save();
        const reactions = message.reactions.map((item) => ({ userId: String(item.userId), emoji: item.emoji }));
        io.to(convRoom(socket.data.conversationId)).emit('message:react', {
          conversationId: String(socket.data.conversationId),
          messageId: String(message._id),
          reactions,
        });
        reply({ ok: true, reactions });
      } catch (err) {
        reply({ ok: false, error: 'Could not react.' });
        console.warn('React failed.', err.message);
      }
    });

    socket.on('message:star', async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        const messageId = payload?.messageId;
        if (!mongoose.isValidObjectId(messageId) || payload?.conversationId !== socket.data.conversationId) {
          reply({ ok: false, error: 'Message not found.' });
          return;
        }
        const starred = Boolean(payload?.starred);
        await Message.updateOne(
          { _id: messageId, conversationId: socket.data.conversationId },
          starred ? { $addToSet: { starredBy: userId } } : { $pull: { starredBy: userId } }
        );
        reply({ ok: true, starred });
      } catch (err) {
        reply({ ok: false, error: 'Could not star that message.' });
        console.warn('Star failed.', err.message);
      }
    });

    const EDIT_WINDOW_MS = 15 * 60 * 1000;

    socket.on('message:edit', async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        const messageId = payload?.messageId;
        const text = String(payload?.text || '').trim();
        if (!mongoose.isValidObjectId(messageId) || payload?.conversationId !== socket.data.conversationId) {
          reply({ ok: false, error: 'Message not found.' });
          return;
        }
        if (!text || text.length > 4000) {
          reply({ ok: false, error: 'Write a message to save the edit.' });
          return;
        }
        const message = await Message.findOne({ _id: messageId, conversationId: socket.data.conversationId });
        if (!message || String(message.senderId) !== String(userId) || message.type !== 'text' || message.deleted) {
          reply({ ok: false, error: 'You can only edit your own text.' });
          return;
        }
        if (Date.now() - new Date(message.createdAt).getTime() > EDIT_WINDOW_MS) {
          reply({ ok: false, error: 'This message can no longer be edited.' });
          return;
        }
        message.text = text;
        message.edited = true;
        await message.save();
        const conversation = await Conversation.findById(socket.data.conversationId);
        if (conversation?.lastMessage && new Date(conversation.lastMessage.createdAt).getTime() === new Date(message.createdAt).getTime()) {
          conversation.lastMessage.text = text;
          await conversation.save();
        }
        io.to(convRoom(socket.data.conversationId)).emit('message:edited', {
          conversationId: String(socket.data.conversationId),
          messageId: String(message._id),
          text,
        });
        reply({ ok: true, text });
      } catch (err) {
        reply({ ok: false, error: 'Could not edit that message.' });
        console.warn('Edit failed.', err.message);
      }
    });

    socket.on('message:hide', async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        const messageId = payload?.messageId;
        if (!mongoose.isValidObjectId(messageId) || payload?.conversationId !== socket.data.conversationId) {
          reply({ ok: false, error: 'Message not found.' });
          return;
        }
        const message = await Message.findOne({ _id: messageId, conversationId: socket.data.conversationId });
        if (!message) {
          reply({ ok: false, error: 'Message not found.' });
          return;
        }
        const mine = String(message.senderId) === String(userId);
        await Message.updateOne(
          { _id: messageId, conversationId: socket.data.conversationId },
          {
            ...(mine ? { $set: { removedBySender: true } } : {}),
            $addToSet: { hiddenFor: userId },
          }
        );
        if (mine) {
          io.to(convRoom(socket.data.conversationId)).emit('message:deleted', {
            conversationId: String(socket.data.conversationId),
            messageId: String(messageId),
            userId: String(userId),
          });
        }
        reply({ ok: true });
      } catch (err) {
        reply({ ok: false, error: 'Could not delete that message.' });
        console.warn('Hide failed.', err.message);
      }
    });

    socket.on('message:send', async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        const user = await User.findById(userId);
        if (!user) {
          reply({ ok: false, error: 'Log in again.' });
          return;
        }
        const conversationId = payload?.conversationId;
        const partnerId = user.partnerId;
        const partnerHere = partnerId && isUserPresent(partnerId) && isViewing(partnerId, conversationId);
        let status = 'sent';
        if (partnerHere) status = 'read';
        else if (partnerId && isUserOnline(partnerId)) status = 'delivered';

        const { message, conversation } = await createChatMessage(user, payload || {}, { status });
        const body = publicMessage(message);
        server.to(convRoom(conversation._id)).emit('message:new', {
          message: body,
          clientId: typeof payload?.clientId === 'string' ? payload.clientId : '',
        });
        reply({ ok: true, message: body });
        await notifyPartner(user, conversation, message);
      } catch (err) {
        const message = err instanceof HttpError ? err.message : 'Could not send.';
        reply({ ok: false, error: message });
      }
    });
  });
}
