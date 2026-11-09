import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, FlatList, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, uploadMedia } from '../api';
import { applyMarks, displayUri, loadMarks, loadMessages, localMediaUri, mergeWithLocal, persistMedia, saveMarks, saveMessages, warmMedia } from '../cache';
import { useAuth } from '../auth/AuthContext';
import { Avatar } from '../components/Avatar';
import { Composer } from '../components/Composer';
import { MessageActions } from '../components/MessageActions';
import { Header } from '../components/Header';
import { MessageBubble } from '../components/MessageBubble';
import { dayLabel, durationLabel, partnerTitle, presenceLabel, previewLabel } from '../format';
import { speakerOn, toggleSpeaker } from '../speaker';
import { useChat } from '../state/ChatContext';
import { font, useColors } from '../theme';
import { KeyboardScreen } from '../useKeyboardInset';
import { setAppBadge, setOpenConversation } from '../notifications';
import { createVoiceController } from '../voicePlayback';

function clientId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function localVoiceUri(message) {
  return localMediaUri(message);
}

function patchVoiceReply(message, all) {
  const reply = message?.replyTo;
  if (!reply || reply.type !== 'voice') return message;
  if (reply.text && reply.text !== 'Voice message') return message;
  const original = all.find((item) => item.id === reply.messageId);
  if (!original?.durationMs) return message;
  return { ...message, replyTo: { ...reply, text: durationLabel(original.durationMs) } };
}

const STATUS_RANK = { sent: 1, delivered: 2, read: 3 };

function dayKey(iso) {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function ChatScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const colors = useColors();
  const { socket, connected, conversation, partnerActivity, draft, setDraft, refreshConversation, setConversation } = useChat();
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState(null);
  const [pausedId, setPausedId] = useState(null);
  const [voiceBusy, setVoiceBusy] = useState({});
  const [playProgress, setPlayProgress] = useState(0);
  const [viewer, setViewer] = useState(null);
  const [replying, setReplying] = useState(null);
  const replyingRef = useRef(null);
  replyingRef.current = replying;
  const loadingOlder = useRef(false);
  const allowOlder = useRef(false);
  const playbackRef = useRef(null);
  const typingOn = useRef(false);
  const typingTimer = useRef(null);
  const focused = useRef(false);
  const statusFloor = useRef(new Map());
  const messagesRef = useRef([]);
  const flushing = useRef(false);
  const sendingIds = useRef(new Set());
  const deliverRef = useRef(null);
  const flushRef = useRef(async () => {});
  const marksRef = useRef({ hidden: [], starred: [], unstarred: [] });
  const listRef = useRef(null);
  const [held, setHeld] = useState(null);
  const [editing, setEditing] = useState(null);
  const [highlightId, setHighlightId] = useState(null);
  const [stickyDate, setStickyDate] = useState('');
  const [showJump, setShowJump] = useState(false);
  const draftText = useRef(draft.text || '');
  const draftApplied = useRef(false);
  const seededFocus = useRef('');

  const conversationId = conversation?.id;
  messagesRef.current = messages;

  const keepStatus = useCallback((message) => {
    if (!message?.id) return message;
    const floor = statusFloor.current.get(message.id);
    if ((STATUS_RANK[floor] || 0) > (STATUS_RANK[message.status] || 0)) {
      return { ...message, status: floor };
    }
    if (message.status) statusFloor.current.set(message.id, message.status);
    return message;
  }, []);

  const upsert = useCallback((message, pendingId) => {
    const nextMessage = keepStatus(message);
    const dropClient = pendingId || nextMessage.clientId || '';
    setMessages((prev) => {
      const withoutPending = dropClient
        ? prev.filter((item) => !(item.clientId === dropClient && !item.id))
        : prev;
      const previous =
        (nextMessage.id && withoutPending.find((item) => item.id === nextMessage.id)) ||
        (nextMessage.clientId && withoutPending.find((item) => item.clientId === nextMessage.clientId)) ||
        null;
      const mergedBase = previous && (STATUS_RANK[previous.status] || 0) > (STATUS_RANK[nextMessage.status] || 0)
        ? { ...nextMessage, status: previous.status }
        : nextMessage;
      const merged = {
        ...mergedBase,
        clientId: mergedBase.clientId || previous?.clientId || dropClient || '',
        localPath: mergedBase.localPath || previous?.localPath || '',
        starred: previous ? Boolean(previous.starred) : Boolean(mergedBase.starred),
        reactions: mergedBase.reactions?.length ? mergedBase.reactions : previous?.reactions || mergedBase.reactions || [],
        pending: false,
        waiting: false,
        failed: false,
        local: null,
      };
      if (previous?.id) {
        return withoutPending.map((item) => (item.id === previous.id ? merged : item));
      }
      if (previous?.clientId) {
        return withoutPending.map((item) => (item.clientId === previous.clientId ? merged : item));
      }
      return [...withoutPending, merged];
    });
  }, [keepStatus]);

  useEffect(() => {
    if (!conversationId || !user?.id) return undefined;
    let cancel = false;
    allowOlder.current = false;
    setLoading(true);
    setShowJump(false);
    setStickyDate('');
    Promise.all([loadMessages(user.id, conversationId), loadMarks(user.id, conversationId)]).then(([cached, marks]) => {
      marksRef.current = marks;
      if (cancel || !cached.length) return;
      setMessages(applyMarks(cached, marks));
      setLoading(false);
    });
    api(`/api/conversation/${conversationId}/messages?limit=100`, { token })
      .then(async (data) => {
        if (cancel) return;
        const [cached, marks] = await Promise.all([
          loadMessages(user.id, conversationId),
          loadMarks(user.id, conversationId),
        ]);
        marksRef.current = marks;
        const merged = applyMarks(mergeWithLocal(cached, data.messages), marks);
        setMessages(merged);
        setHasMore(data.hasMore);
        await saveMessages(user.id, conversationId, merged);
        warmMedia(merged).then((withFiles) => {
          if (cancel) return;
          setMessages(withFiles);
          saveMessages(user.id, conversationId, withFiles);
        });
      })
      .catch(async (err) => {
        if (cancel) return;
        const cached = await loadMessages(user.id, conversationId);
        if (!cached.length) Alert.alert('Chat', err.message);
      })
      .finally(() => {
        if (!cancel) {
          setLoading(false);
          setTimeout(() => {
            allowOlder.current = true;
          }, 600);
        }
      });
    return () => {
      cancel = true;
    };
  }, [conversationId, token, user?.id]);

  useEffect(() => {
    const seed = route.params?.seedMessage;
    const focusId = route.params?.focusId || seed?.id;
    if (!seed?.id || !focusId || seededFocus.current === focusId) return;
    seededFocus.current = focusId;
    setMessages((prev) => {
      if (prev.some((item) => item.id === seed.id)) return prev;
      return [...prev, { ...seed, pending: false, waiting: false, failed: false }].sort(
        (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
      );
    });
  }, [route.params?.focusId, route.params?.seedMessage]);

  const pullLatest = useRef(async () => {});
  pullLatest.current = async () => {
    if (!conversationId || !token || !user?.id) return;
    try {
      const data = await api(`/api/conversation/${conversationId}/messages?limit=40`, { token });
      const [cached, marks] = await Promise.all([
        loadMessages(user.id, conversationId),
        loadMarks(user.id, conversationId),
      ]);
      marksRef.current = marks;
      const merged = applyMarks(mergeWithLocal(cached, data.messages), marks);
      setMessages(merged);
      setHasMore(Boolean(data.hasMore));
      await saveMessages(user.id, conversationId, merged);
      if (focused.current && socket?.connected) {
        socket.emit('chat:open', { conversationId });
      }
    } catch {
      // Keep whatever is already on screen.
    }
  };

  useEffect(() => {
    if (!socket) return undefined;
    const onMessage = ({ message, clientId: pendingId }) => {
      if (message.conversationId !== conversationId) return;
      upsert(message, pendingId);
      if (focused.current && message.senderId !== user.id && message.id) {
        socket.emit('message:read', { conversationId, messageId: message.id });
      }
    };
    const onStatus = ({ conversationId: id, status, messageIds }) => {
      if (id !== conversationId || !Array.isArray(messageIds)) return;
      messageIds.forEach((messageId) => {
        const floor = statusFloor.current.get(messageId);
        if ((STATUS_RANK[status] || 0) >= (STATUS_RANK[floor] || 0)) statusFloor.current.set(messageId, status);
      });
      const ids = new Set(messageIds);
      setMessages((prev) =>
        prev.map((item) => {
          if (!ids.has(item.id)) return item;
          if ((STATUS_RANK[item.status] || 0) > (STATUS_RANK[status] || 0)) return item;
          return { ...item, status };
        })
      );
    };
    const onReact = ({ conversationId: id, messageId, reactions }) => {
      if (id !== conversationId || !messageId) return;
      setMessages((prev) => prev.map((item) => (item.id === messageId ? { ...item, reactions: reactions || [] } : item)));
    };
    const onDeleted = ({ conversationId: id, messageId, userId: actorId }) => {
      if (id !== conversationId || !messageId) return;
      if (actorId === user.id) {
        setMessages((prev) => prev.filter((item) => item.id !== messageId));
        return;
      }
      setMessages((prev) =>
        prev.map((item) => (item.id === messageId ? { ...item, removedForSender: true } : item))
      );
    };
    socket.on('message:new', onMessage);
    socket.on('message:status', onStatus);
    const onEdited = ({ conversationId: id, messageId, text }) => {
      if (id !== conversationId || !messageId) return;
      setMessages((prev) => prev.map((item) => (item.id === messageId ? { ...item, text, edited: true } : item)));
    };
    socket.on('message:deleted', onDeleted);
    socket.on('message:edited', onEdited);
    socket.on('message:react', onReact);
    return () => {
      socket.off('message:new', onMessage);
      socket.off('message:status', onStatus);
      socket.off('message:react', onReact);
      socket.off('message:deleted', onDeleted);
      socket.off('message:edited', onEdited);
    };
  }, [socket, conversationId, upsert, user.id]);

  useFocusEffect(
    useCallback(() => {
      if (!conversationId) return undefined;
      focused.current = true;
      setOpenConversation(conversationId);
      setAppBadge(0);
      const open = () => {
        if (socket?.connected) socket.emit('chat:open', { conversationId });
      };
      open();
      pullLatest.current();
      const onConnect = () => {
        open();
        // After a drop, catch anything the live socket missed.
        pullLatest.current();
      };
      socket?.on('connect', onConnect);
      const appState = AppState.addEventListener('change', (state) => {
        if (state !== 'active') return;
        open();
        pullLatest.current();
      });
      let notify;
      try {
        notify = Notifications.addNotificationReceivedListener((notification) => {
          const data = notification?.request?.content?.data || {};
          if (data.conversationId && data.conversationId !== conversationId) return;
          pullLatest.current();
        });
      } catch {
        notify = null;
      }
      const syncTimer = setInterval(() => {
        if (!focused.current) return;
        pullLatest.current();
      }, 12000);
      return () => {
        focused.current = false;
        setOpenConversation('');
        clearInterval(syncTimer);
        socket?.off('connect', onConnect);
        appState.remove();
        notify?.remove();
        clearInterval(recordingPulse.current);
        if (socket?.connected) {
          socket.emit('typing', { conversationId, active: false, kind: 'recording' });
          socket.emit('chat:close', { conversationId });
        }
        refreshConversation();
      };
    }, [socket, conversationId, refreshConversation])
  );

  const recordingPulse = useRef(null);

  function emitActivity(active, kind) {
    if (!socket || !conversationId) return;
    socket.emit('typing', { conversationId, active, kind });
  }

  function setTyping(active) {
    if (!socket || !conversationId) return;
    if (active) {
      typingOn.current = true;
      emitActivity(true, 'typing');
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => {
        typingOn.current = false;
        emitActivity(false, 'typing');
      }, 1200);
      return;
    }
    clearTimeout(typingTimer.current);
    if (!typingOn.current) return;
    typingOn.current = false;
    emitActivity(false, 'typing');
  }

  function setRecording(active) {
    if (active) {
      stopPlayback();
      setPlayingId(null);
      setPausedId(null);
      setPlayProgress(0);
      playPosition.current = 0;
    }
    if (!socket || !conversationId) return;
    clearTimeout(typingTimer.current);
    clearInterval(recordingPulse.current);
    typingOn.current = false;
    emitActivity(Boolean(active), 'recording');
    if (!active) return;
    recordingPulse.current = setInterval(() => emitActivity(true, 'recording'), 2000);
  }

  useEffect(() => {
    return () => {
      playbackRef.current?.stop();
      playbackRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!socket) return undefined;
    const kick = () => flushRef.current();
    socket.on('connect', kick);
    return () => socket.off('connect', kick);
  }, [socket]);

  useEffect(() => {
    if (connected && !loading) flushRef.current();
  }, [connected, loading, conversationId]);

  useEffect(() => {
    if (!user?.id || !conversationId || !messages.length) return undefined;
    const timer = setTimeout(() => saveMessages(user.id, conversationId, messages), 400);
    return () => clearTimeout(timer);
  }, [messages, user?.id, conversationId]);

  const voiceJobs = useRef(new Set());
  const voiceMiss = useRef(new Set());
  const wasConnected = useRef(false);

  async function downloadVoice(message, manual = false) {
    const id = message?.id;
    if (!id || message.type !== 'voice' || !message.mediaUrl || localVoiceUri(message)) return;
    if (voiceJobs.current.has(id)) return;
    if (!manual && !connected) return;
    voiceMiss.current.delete(id);
    voiceJobs.current.add(id);
    setVoiceBusy((current) => ({ ...current, [id]: true }));
    try {
      const path = await persistMedia(message.mediaUrl, id, 'voice');
      if (!path) {
        voiceJobs.current.delete(id);
        voiceMiss.current.add(id);
        return;
      }
      setMessages((prev) => prev.map((item) => (item.id === id ? { ...item, localPath: path } : item)));
    } catch {
      voiceJobs.current.delete(id);
      voiceMiss.current.add(id);
    } finally {
      setVoiceBusy((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    }
  }

  useEffect(() => {
    if (connected && !wasConnected.current) voiceMiss.current.clear();
    wasConnected.current = connected;
    if (!connected) return undefined;
    messages.forEach((message) => {
      if (message.type !== 'voice' || !message.id || !message.mediaUrl || localVoiceUri(message)) return;
      if (voiceJobs.current.has(message.id) || voiceMiss.current.has(message.id)) return;
      downloadVoice(message);
    });
    return undefined;
  }, [connected, messages]);

  const feed = useMemo(() => {
    const items = [];
    let lastDay = '';
    messages.forEach((message) => {
      const key = dayKey(message.createdAt);
      if (key !== lastDay) {
        items.push({ kind: 'day', key: `day-${key}`, label: dayLabel(message.createdAt) });
        lastDay = key;
      }
      items.push({ kind: 'message', key: message.id || message.clientId, message });
    });
    return items.reverse();
  }, [messages]);

  async function loadOlder() {
    if (!allowOlder.current || !hasMore || loadingOlder.current || messages.length === 0) return;
    loadingOlder.current = true;
    try {
      const oldest = messages[0].createdAt;
      const data = await api(
        `/api/conversation/${conversationId}/messages?limit=50&before=${encodeURIComponent(oldest)}`,
        { token }
      );
      const older = applyMarks(
        data.messages.filter((item) => !messages.some((current) => current.id === item.id)),
        marksRef.current
      );
      const warmed = await warmMedia(older);
      setMessages((prev) => {
        const ids = new Set(prev.map((item) => item.id));
        return [...warmed.filter((item) => !ids.has(item.id)), ...prev];
      });
      setHasMore(data.hasMore);
    } catch {
      // Keep the messages already on screen.
    } finally {
      loadingOlder.current = false;
    }
  }

  const focusTries = useRef(0);
  const [focusTarget, setFocusTarget] = useState(null);

  function focusMessage(id) {
    if (!id) return;
    focusTries.current = 0;
    setFocusTarget({ id, n: Date.now() });
  }

  useEffect(() => {
    const focusId = focusTarget?.id || route.params?.focusId;
    if (!focusId) {
      focusTries.current = 0;
      return undefined;
    }
    if (loading) return undefined;
    const index = feed.findIndex((item) => item.kind === 'message' && item.message.id === focusId);
    if (index >= 0) {
      const id = focusId;
      setHighlightId(id);
      setTimeout(() => {
        listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
      }, 220);
      setTimeout(() => setHighlightId((current) => (current === id ? null : current)), 1800);
      setFocusTarget(null);
      if (route.params?.focusId || route.params?.seedMessage) {
        navigation.setParams({ focusId: undefined, seedMessage: undefined });
      }
      return undefined;
    }
    if (hasMore && focusTries.current < 8) {
      focusTries.current += 1;
      loadOlder();
      return undefined;
    }
    setFocusTarget(null);
    if (route.params?.focusId || route.params?.seedMessage) {
      navigation.setParams({ focusId: undefined, seedMessage: undefined });
    }
    return undefined;
  }, [focusTarget, route.params?.focusId, loading, feed, hasMore, navigation]);

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    const visible = viewableItems.filter((item) => item?.item?.kind === 'message');
    if (!visible.length) return;
    const top = visible[visible.length - 1]?.item?.message;
    if (!top?.createdAt) return;
    setStickyDate(dayLabel(top.createdAt));
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 12 }).current;

  function onChatScroll(event) {
    const offset = event.nativeEvent.contentOffset.y;
    setShowJump(offset > 140);
  }

  function jumpToLatest() {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    setShowJump(false);
  }

  function markFailed(pendingId, local) {
    setMessages((prev) =>
      prev.map((item) => (item.clientId === pendingId ? { ...item, pending: false, waiting: false, failed: true, local } : item))
    );
  }

  function markWaiting(pendingId, local) {
    setMessages((prev) =>
      prev.map((item) =>
        item.clientId === pendingId ? { ...item, pending: true, waiting: true, failed: false, local } : item
      )
    );
  }

  function isOffline(err) {
    if (!socket?.connected) return true;
    return /reach the server|network|failed to fetch|not connected|offline|timeout|internet/i.test(String(err?.message || ''));
  }

  async function emitMessage(payload) {
    if (!socket?.connected) throw new Error('Not connected.');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Not connected.')), 20000);
      socket.emit('message:send', payload, (ack) => {
        clearTimeout(timer);
        if (!ack?.ok) reject(new Error(ack?.error || 'Could not send.'));
        else resolve(ack.message);
      });
    });
  }

  function keepDraft(text, reply = replyingRef.current) {
    draftText.current = text || '';
    setDraft({ text: draftText.current, reply: draftText.current.trim() ? reply || null : null });
  }

  useEffect(() => {
    if (draftApplied.current) return;
    if (!draft.text && !draft.reply) return;
    draftApplied.current = true;
    draftText.current = draft.text || '';
    if (draft.reply) setReplying(draft.reply);
  }, [draft]);

  function startReply(message) {
    if (!message?.id) return;
    const next = {
      id: message.id,
      senderId: message.senderId,
      type: message.type,
      text: message.type === 'voice' ? durationLabel(message.durationMs) : message.type === 'text' ? message.text : previewLabel(message),
      mediaUrl: message.type === 'image' ? message.mediaUrl : '',
      author: message.senderId === user.id ? 'You' : partnerTitle(conversation?.partner),
    };
    setReplying(next);
    keepDraft(draftText.current, next);
  }

  async function sendPayload(local, pendingId = clientId(), { quiet = false } = {}) {
    if (sendingIds.current.has(pendingId)) return 'busy';
    sendingIds.current.add(pendingId);
    if (local.type === 'text') {
      local = { ...local, text: String(local.text || '') };
    }
    if (local.type === 'voice' && local.uri && !/^https?:/i.test(local.uri)) {
      const saved = await persistMedia(local.uri, pendingId, 'voice');
      if (saved) local = { ...local, uri: saved };
    }
    setReplying((current) => (current?.id === local.reply?.id ? null : current));
    const existing = messagesRef.current.find((item) => item.clientId === pendingId);
    const optimistic = {
      clientId: pendingId,
      senderId: user.id,
      conversationId,
      type: local.type,
      text: local.text || '',
      mediaUrl: local.uri || '',
      durationMs: local.durationMs || 0,
      waveform: local.waveform || existing?.waveform || [],
      replyTo: local.reply
        ? {
            messageId: local.reply.id,
            senderId: local.reply.senderId,
            type: local.reply.type,
            text: local.reply.text,
            mediaUrl: local.reply.mediaUrl || '',
          }
        : null,
      localPath: existing?.localPath || local.uri || '',
      createdAt: existing?.createdAt || new Date().toISOString(),
      pending: true,
      waiting: false,
      failed: false,
      local,
    };
    setMessages((prev) => [...prev.filter((item) => item.clientId !== pendingId), optimistic]);
    if ((local.type === 'image' || local.type === 'voice') && local.uri && !existing?.localPath) {
      persistMedia(local.uri, pendingId, local.type).then((path) => {
        if (!path) return;
        setMessages((prev) =>
          prev.map((item) =>
            item.clientId === pendingId ? { ...item, localPath: path, local: { ...item.local, uri: path } } : item
          )
        );
      });
    }
    try {
      let mediaUrl = local.mediaUrl || '';
      if ((local.type === 'image' || local.type === 'voice') && local.uri && !mediaUrl) {
        const uploaded = await uploadMedia(token, local.uri, local.type);
        mediaUrl = uploaded.url;
        local = { ...local, mediaUrl };
        setMessages((prev) =>
          prev.map((item) => (item.clientId === pendingId ? { ...item, local } : item))
        );
      }
      if (!socket?.connected) {
        markWaiting(pendingId, local);
        return 'offline';
      }
      let saved = await emitMessage({
        conversationId,
        clientId: pendingId,
        type: local.type,
        text: local.text,
        mediaUrl,
        durationMs: local.durationMs,
        waveform: local.waveform || [],
        replyTo: local.reply?.id || '',
      });
      if (local.uri && saved?.id) {
        const localPath = await persistMedia(local.uri, saved.id, local.type);
        if (localPath) saved = { ...saved, localPath };
      }
      upsert({ ...saved, clientId: pendingId }, pendingId);
      return 'sent';
    } catch (err) {
      if (isOffline(err)) {
        markWaiting(pendingId, local);
        setTimeout(() => flushRef.current(), 3000);
        return 'offline';
      }
      markFailed(pendingId, local);
      if (!quiet) Alert.alert('Message', err.message);
      return 'failed';
    } finally {
      sendingIds.current.delete(pendingId);
    }
  }

  deliverRef.current = sendPayload;
  flushRef.current = async () => {
    if (flushing.current || !socket?.connected) return;
    const queued = messagesRef.current
      .filter((item) => item.waiting && item.local && item.clientId && !sendingIds.current.has(item.clientId))
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    if (!queued.length) return;
    flushing.current = true;
    try {
      for (const item of queued) {
        if (!socket.connected) break;
        if (sendingIds.current.has(item.clientId)) continue;
        if (messagesRef.current.some((row) => row.clientId === item.clientId && row.id)) continue;
        const result = await deliverRef.current(item.local, item.clientId, { quiet: true });
        if (result === 'offline') break;
      }
    } finally {
      flushing.current = false;
    }
  };

  async function pickImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photos', 'Allow photo access to send pictures.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    await sendPayload({ type: 'image', uri: result.assets[0].uri, reply: replyingRef.current });
  }

  async function applySpeaker(on) {
    try {
      await playbackRef.current?.setEarpiece(!on);
    } catch {
      // The saved choice is used the next time a note starts.
    }
  }

  async function switchSpeaker() {
    const on = toggleSpeaker();
    try {
      await applySpeaker(on);
    } catch {
      // The next playback still uses the saved choice.
    }
  }

  const playPosition = useRef(0);
  const playDuration = useRef(0);

  function stopPlayback() {
    playbackRef.current?.stop();
    playbackRef.current = null;
  }

  function clearVoicePlace() {
    playPosition.current = 0;
    playDuration.current = 0;
    setPausedId(null);
    setPlayProgress(0);
  }

  async function startVoice(message, position) {
    const id = message.id || message.clientId;
    const uri = localVoiceUri(message);
    if (!uri) return;
    stopPlayback();
    const controller = createVoiceController({
      uri,
      onUpdate: (status) => {
        if (playbackRef.current !== controller) return;
        if (status.didFinish) {
          playPosition.current = 0;
          playDuration.current = 0;
          setPausedId(null);
          setPlayingId(null);
          setPlayProgress(0);
          controller.stop();
          if (playbackRef.current === controller) playbackRef.current = null;
          return;
        }
        playPosition.current = status.position || 0;
        const duration = status.duration || (message.durationMs || 0) / 1000;
        if (duration > 0) {
          playDuration.current = duration;
          setPlayProgress(Math.max(0, Math.min(1, status.position / duration)));
        }
      },
    });
    playbackRef.current = controller;
    const duration = (message.durationMs || 0) / 1000;
    playPosition.current = position;
    if (duration > 0) {
      playDuration.current = duration;
      setPlayProgress(Math.max(0, Math.min(1, position / duration)));
    }
    await controller.play(!speakerOn(), position);
    setPausedId(null);
    setPlayingId(id);
  }

  async function toggleVoice(message) {
    const id = message.id || message.clientId;
    if (playingId === id) {
      playbackRef.current?.pause();
      setPausedId(id);
      setPlayingId(null);
      return;
    }
    const resumeAt = pausedId === id ? playPosition.current : 0;
    if (pausedId === id && playbackRef.current?.resume) {
      try {
        await playbackRef.current.resume();
        setPausedId(null);
        setPlayingId(id);
        return;
      } catch {
        // The player was released, so start again from the saved spot.
      }
    }
    try {
      await startVoice(message, resumeAt);
    } catch {
      stopPlayback();
      clearVoicePlace();
      setPlayingId(null);
      Alert.alert('Voice message', 'Could not play that recording.');
    }
  }

  async function seekVoice(message, ratio) {
    const id = message.id || message.clientId;
    const known = (playingId === id || pausedId === id) && playDuration.current ? playDuration.current : 0;
    const duration = known || (message.durationMs || 0) / 1000;
    if (duration <= 0) return;
    const position = Math.min(Math.max(0, ratio * duration), Math.max(0, duration - 0.05));
    playPosition.current = position;
    setPlayProgress(position / duration);
    if ((playingId === id || pausedId === id) && playbackRef.current?.seek) {
      try {
        await playbackRef.current.seek(position);
        if (playingId !== id) {
          await playbackRef.current.resume();
          setPausedId(null);
          setPlayingId(id);
        }
        return;
      } catch {
        // Start the note at the chosen spot.
      }
    }
    try {
      await startVoice(message, position);
    } catch {
      stopPlayback();
      clearVoicePlace();
      setPlayingId(null);
      Alert.alert('Voice message', 'Could not play that recording.');
    }
  }

  async function rememberMarks(next) {
    marksRef.current = next;
    if (user?.id && conversationId) await saveMarks(user.id, conversationId, next);
  }

  function editHeld() {
    const message = held;
    setHeld(null);
    if (!message?.id || message.type !== 'text' || message.senderId !== user.id) return;
    setReplying(null);
    setEditing({ id: message.id, text: message.text || '' });
  }

  function submitEdit(messageId, text) {
    const original = messagesRef.current.find((item) => item.id === messageId);
    setEditing(null);
    setMessages((prev) => prev.map((item) => (item.id === messageId ? { ...item, text, edited: true } : item)));
    if (conversation?.lastMessage && original?.createdAt && conversation.lastMessage.createdAt === original.createdAt) {
      setConversation((current) => current ? { ...current, lastMessage: { ...current.lastMessage, text, type: 'text' } } : current);
    }
    if (!socket?.connected) {
      setMessages((prev) => prev.map((item) => (item.id === messageId ? { ...item, text: original?.text || '', edited: Boolean(original?.edited) } : item)));
      Alert.alert('Edit', 'Connect to the internet to edit a message.');
      return;
    }
    socket.emit('message:edit', { conversationId, messageId, text }, (ack) => {
      if (ack?.ok) {
        refreshConversation();
        return;
      }
      setMessages((prev) => prev.map((item) => (item.id === messageId ? { ...item, text: original?.text || '', edited: Boolean(original?.edited) } : item)));
      Alert.alert('Edit', ack?.error || 'Could not edit that message.');
    });
  }

  function copyHeld() {
    const message = held;
    setHeld(null);
    if (message?.text) Clipboard.setStringAsync(message.text);
  }

  function resendHeld() {
    const message = held;
    setHeld(null);
    if (!message || message.deleted) return;
    if (message.type === 'text') {
      if (!message.text?.trim()) return;
      sendPayload({ type: 'text', text: message.text });
      return;
    }
    if (message.type === 'image') {
      const uri = displayUri(message) || message.mediaUrl;
      if (!uri) return;
      const mediaUrl = /^https?:/i.test(message.mediaUrl || '') ? message.mediaUrl : '';
      sendPayload({ type: 'image', uri, mediaUrl });
      return;
    }
    if (message.type === 'voice') {
      const uri = localVoiceUri(message) || message.mediaUrl;
      if (!uri) return;
      const mediaUrl = /^https?:/i.test(message.mediaUrl || '') ? message.mediaUrl : '';
      sendPayload({
        type: 'voice',
        uri,
        mediaUrl,
        durationMs: message.durationMs || 0,
        waveform: message.waveform || [],
      });
    }
  }

  function starHeld() {
    const message = held;
    setHeld(null);
    if (!message?.id) return;
    const nextStar = !message.starred;
    const marks = {
      hidden: marksRef.current.hidden.filter((id) => id !== message.id),
      starred: marksRef.current.starred.filter((id) => id !== message.id),
      unstarred: marksRef.current.unstarred.filter((id) => id !== message.id),
    };
    if (nextStar) marks.starred.push(message.id);
    else marks.unstarred.push(message.id);
    rememberMarks(marks);
    setMessages((prev) => prev.map((item) => (item.id === message.id ? { ...item, starred: nextStar } : item)));
    socket?.emit('message:star', { conversationId, messageId: message.id, starred: nextStar });
  }

  function deleteHeld() {
    const message = held;
    setHeld(null);
    if (!message) return;
    Alert.alert('Delete for me', 'This removes the message from your chat. The other person still has it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (message.id) {
            const marks = {
              hidden: [...marksRef.current.hidden.filter((id) => id !== message.id), message.id],
              starred: marksRef.current.starred.filter((id) => id !== message.id),
              unstarred: marksRef.current.unstarred.filter((id) => id !== message.id),
            };
            rememberMarks(marks);
            socket?.emit('message:hide', { conversationId, messageId: message.id });
          }
          const nextMessages = messagesRef.current.filter((item) =>
              message.id ? item.id !== message.id : item.clientId !== message.clientId
            );
            setMessages(nextMessages);
            const last = [...nextMessages].reverse().find((item) => item.createdAt);
            setConversation((current) => {
              if (!current) return current;
              if (!last) return { ...current, lastMessage: null };
              return {
                ...current,
                lastMessage: {
                  type: last.deleted ? 'text' : last.type,
                  text: last.deleted ? 'This message was deleted' : previewLabel(last),
                  senderId: last.senderId,
                  createdAt: last.createdAt,
                  deleted: Boolean(last.deleted),
                },
              };
            });
            refreshConversation();
        },
      },
    ]);
  }

  function reactHeld(emoji) {
    const message = held;
    setHeld(null);
    if (!message?.id) return;
    setMessages((prev) =>
      prev.map((item) => {
        if (item.id !== message.id) return item;
        const rest = (item.reactions || []).filter((reaction) => reaction.userId !== user.id);
        const mine = (item.reactions || []).find((reaction) => reaction.userId === user.id);
        if (mine?.emoji === emoji) return { ...item, reactions: rest };
        return { ...item, reactions: [...rest, { userId: user.id, emoji }] };
      })
    );
    socket?.emit('message:react', { conversationId, messageId: message.id, emoji });
  }

  const styles = useMemo(() => makeChatStyles(colors), [colors]);

  if (!conversation) {
    return (
      <View style={styles.screen}>
        <Header title="Chat" onBack={() => navigation.goBack()} />
        <View style={styles.center}>
          <Text style={styles.muted}>Connect with someone to start chatting.</Text>
        </View>
      </View>
    );
  }

  const title = partnerTitle(conversation.partner);
  const quote = replying
    ? { author: replying.author, text: replying.text, type: replying.type }
    : null;

  const statusLine = connected
    ? presenceLabel({
        online: conversation.partner.online,
        activity: partnerActivity,
        lastSeenAt: conversation.partner.lastSeenAt,
      })
    : 'Connecting…';

  return (
    <KeyboardScreen style={styles.screen} footerInset={Math.max(insets.bottom, 8)}>
      <Header
        title={title}
        subtitle={statusLine || undefined}
        subtitleStyle={conversation.partner.online || partnerActivity ? styles.online : undefined}
        onBack={() => navigation.goBack()}
        onTitlePress={() => navigation.navigate('Partner')}
        leading={
          <Pressable onPress={() => navigation.navigate('Partner')} hitSlop={6}>
            <Avatar
              name={title}
              photoUrl={conversation.partner.photoUrl}
              size={36}
              online={Boolean(conversation.partner.online)}
            />
          </Pressable>
        }
      />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.teal} />
        </View>
      ) : (
        <View style={styles.chatPane}>
          <FlatList
            ref={listRef}
            style={styles.flex}
            inverted
            onScroll={onChatScroll}
            scrollEventThrottle={64}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            onScrollToIndexFailed={(info) => {
              setTimeout(() => {
                listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 });
              }, 120);
            }}
            data={feed}
            keyExtractor={(item) => item.key}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            onEndReached={loadOlder}
            onEndReachedThreshold={0.2}
            renderItem={({ item }) =>
              item.kind === 'day' ? (
                <View style={styles.dayWrap}>
                  <Text style={styles.day}>{item.label}</Text>
                </View>
              ) : (
                <MessageBubble
                  message={patchVoiceReply(item.message, messages)}
                  mine={item.message.senderId === user.id}
                  myId={user.id}
                  partnerName={title}
                  playing={playingId === (item.message.id || item.message.clientId)}
                  progress={
                    playingId === (item.message.id || item.message.clientId) ||
                    pausedId === (item.message.id || item.message.clientId)
                      ? playProgress
                      : 0
                  }
                  onToggleVoice={toggleVoice}
                  onSeekVoice={seekVoice}
                  onDownloadVoice={(message) => downloadVoice(message, true)}
                  voiceReady={item.message.type !== 'voice' || Boolean(localVoiceUri(item.message))}
                  voiceDownloading={Boolean(item.message.id && voiceBusy[item.message.id])}
                  onToggleSpeaker={switchSpeaker}
                  onOpenImage={setViewer}
                  onReply={startReply}
                  onJump={focusMessage}
                  onHold={setHeld}
                  highlight={highlightId === item.message.id}
                  onRetry={() => item.message.local && sendPayload(item.message.local, item.message.clientId)}
                />
              )
            }
          />
          {showJump && stickyDate ? (
            <View pointerEvents="none" style={styles.stickyDate}>
              <Text style={styles.day}>{stickyDate}</Text>
            </View>
          ) : null}
          {showJump ? (
            <Pressable style={styles.jump} onPress={jumpToLatest} hitSlop={8}>
              <Ionicons name="chevron-down" size={22} color={colors.header} />
            </Pressable>
          ) : null}
        </View>
      )}
      {!loading && messages.length === 0 ? <Text style={styles.hello}>Say hello.</Text> : null}
      <View>
        <Composer
          draft={draft.text}
          onDraft={(value) => keepDraft(value)}
          editing={editing}
          onCancelEdit={() => setEditing(null)}
          onSubmitEdit={submitEdit}
          reply={editing ? null : quote}
          onCancelReply={() => {
            setReplying(null);
            keepDraft(draftText.current, null);
          }}
          onSendText={(text) => sendPayload({ type: 'text', text, reply: replyingRef.current })}
          onPickImage={pickImage}
          onVoice={(uri, durationMs, waveform) =>
            sendPayload({ type: 'voice', uri, durationMs, waveform, reply: replyingRef.current })
          }
          onTyping={setTyping}
          onRecording={setRecording}
        />
      </View>
      <MessageActions
        message={held}
        myId={user.id}
        onClose={() => setHeld(null)}
        onReact={reactHeld}
        onCopy={copyHeld}
        onEdit={editHeld}
        onStar={starHeld}
        onResend={resendHeld}
        onDelete={deleteHeld}
      />
      <Modal visible={Boolean(viewer)} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable style={styles.viewer} onPress={() => setViewer(null)}>
          {viewer ? (
            <Image pointerEvents="none" source={{ uri: viewer }} style={styles.fullImage} resizeMode="contain" />
          ) : null}
        </Pressable>
      </Modal>
    </KeyboardScreen>
  );
}

function makeChatStyles(colors) {
  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  online: {
    color: '#B7F7C8',
  },
  flex: {
    flex: 1,
  },
  chatPane: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  muted: {
    color: colors.muted,
    textAlign: 'center',
    paddingHorizontal: 28,
  },
  list: {
    paddingVertical: 10,
  },
  dayWrap: {
    alignItems: 'center',
    marginVertical: 8,
  },
  day: {
    backgroundColor: colors.day,
    color: colors.muted,
    overflow: 'hidden',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 12,
    fontFamily: font.bold,
  },
  stickyDate: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    zIndex: 2,
  },
  jump: {
    position: 'absolute',
    right: 14,
    bottom: 12,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    zIndex: 2,
  },
  hello: {
    position: 'absolute',
    top: '46%',
    alignSelf: 'center',
    color: colors.muted,
    backgroundColor: colors.day,
    overflow: 'hidden',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  viewer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullImage: {
    width: '100%',
    height: '80%',
  },
  });
}
