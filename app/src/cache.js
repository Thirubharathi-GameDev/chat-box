import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

const LIMIT = 5000;

function messageKey(userId, conversationId) {
  return `chatbox.messages.${userId}.${conversationId}`;
}

function conversationKey(userId) {
  return `chatbox.conversation.${userId}`;
}

function userKey() {
  return 'chatbox.user';
}

function draftKey(userId, conversationId) {
  return `chatbox.draft.${userId}.${conversationId}`;
}

function marksKey(userId, conversationId) {
  return `chatbox.marks.${userId}.${conversationId}`;
}

function mediaDir() {
  const dir = new Directory(Paths.document, 'chat-media');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export function displayUri(message) {
  return message?.localPath || message?.mediaUrl || '';
}

export function localMediaUri(message) {
  const candidates = [message?.localPath, message?.local?.uri];
  return candidates.find((value) => value && !/^https?:/i.test(value)) || '';
}

export async function loadMessages(userId, conversationId) {
  try {
    const raw = await AsyncStorage.getItem(messageKey(userId, conversationId));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((message) => {
      if (!message.id && message.local && !message.failed) {
        return { ...message, waiting: true, pending: true, failed: false };
      }
      return message;
    });
  } catch {
    return [];
  }
}

function slimMessage(message) {
  return {
    id: message.id,
    clientId: message.clientId,
    conversationId: message.conversationId,
    senderId: message.senderId,
    type: message.type,
    text: message.text || '',
    mediaUrl: message.mediaUrl || '',
    localPath: message.localPath || '',
    durationMs: message.durationMs || 0,
    waveform: Array.isArray(message.waveform) ? message.waveform : [],
    status: message.status || 'sent',
    replyTo: message.replyTo || null,
    reactions: Array.isArray(message.reactions) ? message.reactions : [],
    starred: Boolean(message.starred),
    createdAt: message.createdAt,
    pending: Boolean(message.pending),
    waiting: Boolean(message.waiting),
    failed: Boolean(message.failed),
    edited: Boolean(message.edited),
    deleted: Boolean(message.deleted),
    removedForSender: Boolean(message.removedForSender),
    local: message.local || null,
  };
}

export async function saveMessages(userId, conversationId, messages) {
  try {
    const byKey = new Map();
    messages.forEach((message) => {
      const key = message.id || message.clientId;
      if (!key) return;
      byKey.set(key, slimMessage(message));
    });
    const slim = [...byKey.values()]
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .slice(-LIMIT);
    await AsyncStorage.setItem(messageKey(userId, conversationId), JSON.stringify(slim));
  } catch {
    // The chat still works from memory if the phone is out of space.
  }
}

export function mergeWithLocal(cached, incoming) {
  const byId = new Map();
  const byClient = new Map();
  const locals = new Map();

  function remember(message) {
    if (!message) return;
    if (message.id) byId.set(message.id, message);
    if (message.clientId) byClient.set(message.clientId, message);
    const key = message.id || message.clientId;
    if (key && message.localPath) locals.set(key, message.localPath);
  }

  (cached || []).forEach(remember);
  (incoming || []).forEach((message) => {
    const previous =
      (message.id && byId.get(message.id)) ||
      (message.clientId && byClient.get(message.clientId)) ||
      null;
    remember({
      ...previous,
      ...message,
      localPath: message.localPath || previous?.localPath || locals.get(message.id) || locals.get(message.clientId) || '',
      local: previous?.local || message.local || null,
      pending: false,
      waiting: false,
      failed: false,
    });
  });

  const unsent = (cached || []).filter(
    (message) => !message.id && message.local && (message.waiting || message.pending || message.failed)
  );
  unsent.forEach((message) => {
    if (message.clientId && byId.has(message.id)) return;
    if (message.clientId && byClient.has(message.clientId) && byClient.get(message.clientId)?.id) return;
    remember(message);
  });

  const merged = [...byId.values()];
  byClient.forEach((message, clientId) => {
    if (message.id) return;
    if (merged.some((item) => item.clientId === clientId)) return;
    merged.push(message);
  });

  return merged.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

export async function loadConversation(userId) {
  try {
    const raw = await AsyncStorage.getItem(conversationKey(userId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function loadCachedUser() {
  try {
    const raw = await AsyncStorage.getItem(userKey());
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveCachedUser(user) {
  try {
    if (!user) {
      await AsyncStorage.removeItem(userKey());
      return;
    }
    await AsyncStorage.setItem(userKey(), JSON.stringify(user));
  } catch {
    // The signed-in session still lives in memory.
  }
}

export async function loadDraft(userId, conversationId) {
  try {
    const raw = await AsyncStorage.getItem(draftKey(userId, conversationId));
    const parsed = raw ? JSON.parse(raw) : null;
    const text = typeof parsed?.text === 'string' ? parsed.text : '';
    const reply = parsed?.reply && typeof parsed.reply === 'object' ? parsed.reply : null;
    return { text, reply: text.trim() ? reply : null };
  } catch {
    return { text: '', reply: null };
  }
}

export async function saveDraft(userId, conversationId, draft) {
  try {
    const text = typeof draft?.text === 'string' ? draft.text : '';
    if (!text.trim()) {
      await AsyncStorage.removeItem(draftKey(userId, conversationId));
      return;
    }
    await AsyncStorage.setItem(
      draftKey(userId, conversationId),
      JSON.stringify({ text, reply: draft.reply || null })
    );
  } catch {
    // A missing draft only means the box starts empty next time.
  }
}

export async function saveConversation(userId, conversation) {
  try {
    await AsyncStorage.setItem(conversationKey(userId), JSON.stringify(conversation));
  } catch {
    // Ignore a full disk. The live conversation is still on screen.
  }
}

export async function persistMedia(sourceUri, id, type) {
  if (!sourceUri || !id) return '';
  if (type === 'image') return '';
  const ext = type === 'voice' ? 'm4a' : 'jpg';
  const dest = new File(mediaDir(), `${id}.${ext}`);
  if (dest.exists) return dest.uri;
  try {
    if (sourceUri.startsWith('http')) {
      const downloaded = await File.downloadFileAsync(sourceUri, dest);
      return downloaded.uri;
    }
    new File(sourceUri).copy(dest);
    return dest.uri;
  } catch {
    return '';
  }
}

function emptyMarks() {
  return { hidden: [], starred: [], unstarred: [] };
}

export async function loadMarks(userId, conversationId) {
  try {
    const raw = await AsyncStorage.getItem(marksKey(userId, conversationId));
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden : [],
      starred: Array.isArray(parsed.starred) ? parsed.starred : [],
      unstarred: Array.isArray(parsed.unstarred) ? parsed.unstarred : [],
    };
  } catch {
    return emptyMarks();
  }
}

export async function saveMarks(userId, conversationId, marks) {
  try {
    await AsyncStorage.setItem(marksKey(userId, conversationId), JSON.stringify(marks));
  } catch {
    // The chat still shows the change until the app closes.
  }
}

export function applyMarks(messages, marks) {
  const hidden = new Set(marks?.hidden || []);
  const starred = new Set(marks?.starred || []);
  const unstarred = new Set(marks?.unstarred || []);
  return messages
    .filter((message) => !message.id || !hidden.has(message.id))
    .map((message) => {
      if (!message.id) return { ...message, reactions: message.reactions || [] };
      let nextStar = Boolean(message.starred);
      if (starred.has(message.id)) nextStar = true;
      if (unstarred.has(message.id)) nextStar = false;
      return { ...message, starred: nextStar, reactions: Array.isArray(message.reactions) ? message.reactions : [] };
    });
}

export async function warmMedia(messages) {
  const next = [];
  for (const message of messages) {
    if (message.type !== 'voice' || message.localPath || !message.mediaUrl || !message.id) {
      next.push(message);
      continue;
    }
    const localPath = await persistMedia(message.mediaUrl, message.id, 'voice');
    next.push(localPath ? { ...message, localPath } : message);
  }
  return next;
}
