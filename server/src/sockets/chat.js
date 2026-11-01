import jwt from 'jsonwebtoken';
import { Conversation } from '../models/Conversation.js';
import { User } from '../models/User.js';
import { HttpError } from '../errors.js';
import { createChatMessage } from '../services/messages.js';
import { sendPush } from '../services/push.js';
import { previewText, publicMessage } from '../services/serialize.js';

const connections = new Map();
let io;

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

export function getIo() {
  if (!io) throw new Error('Socket.io is not ready.');
  return io;
}

export function emitPairJoined({ ownerId, redeemerId, conversationId, ownerPayload, redeemerPayload }) {
  const server = getIo();
  const room = convRoom(conversationId);
  server.to(userRoom(ownerId)).socketsJoin(room);
  server.to(userRoom(redeemerId)).socketsJoin(room);
  server.to(userRoom(ownerId)).emit('pair:joined', { conversation: ownerPayload });
  server.to(userRoom(redeemerId)).emit('pair:joined', { conversation: redeemerPayload });
}

async function notifyPartner(user, conversation, message) {
  const partnerId = conversation.participants.find((id) => !id.equals(user._id));
  if (!partnerId || isUserOnline(partnerId)) return;

  const partner = await User.findById(partnerId).select('pushToken');
  if (!partner?.pushToken) return;

  try {
    await sendPush(partner.pushToken, {
      title: user.displayName || user.userId,
      body: previewText(message),
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
      const user = await User.findById(payload.sub).select('_id');
      if (!user) {
        next(new Error('Unauthorized'));
        return;
      }
      const conversation = await Conversation.findOne({ participants: user._id }).select('_id');
      socket.data.userId = user._id.toString();
      socket.data.conversationId = conversation ? conversation._id.toString() : '';
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  server.on('connection', (socket) => {
    const userId = socket.data.userId;
    addOnline(userId, socket.id);
    socket.join(userRoom(userId));
    if (socket.data.conversationId) socket.join(convRoom(socket.data.conversationId));

    socket.on('disconnect', () => {
      removeOnline(userId, socket.id);
    });

    socket.on('message:send', async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        const user = await User.findById(userId);
        if (!user) {
          reply({ ok: false, error: 'Log in again.' });
          return;
        }
        const { message, conversation } = await createChatMessage(user, payload || {});
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
