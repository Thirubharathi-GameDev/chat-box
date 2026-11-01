import mongoose from 'mongoose';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { HttpError } from '../errors.js';

const MAX_TEXT = 4000;
const MAX_VOICE_MS = 5 * 60 * 1000;

export function assertMediaUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new HttpError(400, 'That file could not be used.');
  }
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const validHost = parsed.protocol === 'https:' && parsed.hostname === 'res.cloudinary.com';
  const validCloud = !cloud || parsed.pathname.includes(`/${cloud}/`);
  if (!validHost || !validCloud) {
    throw new HttpError(400, 'That file could not be used.');
  }
  return url;
}

export async function createChatMessage(user, payload) {
  const conversationId = payload?.conversationId;
  if (!conversationId || !mongoose.isValidObjectId(conversationId)) {
    throw new HttpError(404, 'Chat not found.');
  }

  const conversation = await Conversation.findById(conversationId);
  if (!conversation || !conversation.participants.some((id) => id.equals(user._id))) {
    throw new HttpError(404, 'Chat not found.');
  }

  const type = payload.type;
  let text = '';
  let mediaUrl = '';
  let durationMs = 0;

  if (type === 'text') {
    if (typeof payload.text !== 'string' || !payload.text.trim()) {
      throw new HttpError(400, 'Enter a message.');
    }
    text = payload.text.trim();
    if (text.length > MAX_TEXT) {
      throw new HttpError(400, 'Message is too long.');
    }
  } else if (type === 'image' || type === 'voice') {
    if (typeof payload.mediaUrl !== 'string' || !payload.mediaUrl) {
      throw new HttpError(400, 'Missing file.');
    }
    mediaUrl = assertMediaUrl(payload.mediaUrl);
    if (type === 'voice') {
      durationMs = Number(payload.durationMs) || 0;
      if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > MAX_VOICE_MS) {
        throw new HttpError(400, 'Voice message must be under 5 minutes.');
      }
    }
  } else {
    throw new HttpError(400, 'Unsupported message.');
  }

  const message = await Message.create({
    conversationId: conversation._id,
    senderId: user._id,
    type,
    text,
    mediaUrl,
    durationMs,
  });

  conversation.lastMessage = {
    text,
    type,
    senderId: user._id,
    createdAt: message.createdAt,
  };
  await conversation.save();

  return { message, conversation };
}
