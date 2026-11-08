import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { io } from 'socket.io-client';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { getApiUrl } from '../config';
import { previewLabel } from '../format';
import { loadPushEnabled, setAppBadge, syncAccountPush, watchDelivery } from '../notifications';
import { loadConversation, loadDraft, saveConversation, saveDraft } from '../cache';
import { loadSpeakerPreference } from '../speaker';

const ChatContext = createContext(null);

function lastMessageFrom(message) {
  return {
    type: message.type,
    text: previewLabel(message),
    senderId: message.senderId,
    createdAt: message.createdAt,
  };
}

export function ChatProvider({ children }) {
  const { token, user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [conversation, setConversation] = useState(null);
  const [conversationReady, setConversationReady] = useState(false);
  const [partnerActivity, setPartnerActivity] = useState('');
  const [draft, setDraftState] = useState({ text: '', reply: null });
  const draftLoaded = useRef(false);

  const signedIn = Boolean(token && user?.displayName);
  const conversationRef = useRef(null);
  conversationRef.current = conversation;

  useEffect(() => {
    if (!signedIn) {
      setConversation(null);
      setConversationReady(false);
      return undefined;
    }

    let cancel = false;
    setConversationReady(false);
    loadConversation(user.id).then((cached) => {
      if (!cancel && cached) {
        setConversation(cached);
        setConversationReady(true);
      }
    });
    api('/api/conversation', { token })
      .then((data) => {
        if (cancel) return;
        setConversation(data.conversation);
        if (data.conversation) saveConversation(user.id, data.conversation);
      })
      .catch(() => {
        if (cancel) return;
        loadConversation(user.id).then((cached) => {
          if (!cancel && cached) setConversation(cached);
        });
      })
      .finally(() => {
        if (!cancel) setConversationReady(true);
      });

    return () => {
      cancel = true;
    };
  }, [signedIn, token, user?.id]);

  useEffect(() => {
    if (!signedIn) {
      setSocket(null);
      setConnected(false);
      return undefined;
    }

    const next = io(getApiUrl(), {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
      timeout: 12000,
    });
    setSocket(next);
    const liveOnline = { current: null };

    const onConnect = () => {
      setConnected(true);
      next.emit('app:foreground', { active: AppState.currentState === 'active' });
    };

    function newerSeen(a, b) {
      if (!a) return b || null;
      if (!b) return a;
      return new Date(a) >= new Date(b) ? a : b;
    }
    const onAppState = (state) => {
      if (next.connected) next.emit('app:foreground', { active: state === 'active' });
    };
    const appState = AppState.addEventListener('change', onAppState);
    const onDisconnect = () => setConnected(false);
    const onPair = ({ conversation: nextConversation }) => {
      setConversation(nextConversation);
      if (user?.id && nextConversation) saveConversation(user.id, nextConversation);
    };
    const refreshConversation = () => {
      api('/api/conversation', { token })
        .then((data) => {
          setConversation((current) => {
            if (!data.conversation) return null;
            const remote = data.conversation;
            if (!current) {
              return {
                ...remote,
                partner: {
                  ...remote.partner,
                  online: liveOnline.current === null ? remote.partner.online : liveOnline.current,
                },
              };
            }
            return {
              ...remote,
              partner: {
                ...remote.partner,
                online: liveOnline.current === null ? Boolean(remote.partner.online) : liveOnline.current,
                lastSeenAt: newerSeen(current.partner?.lastSeenAt, remote.partner.lastSeenAt),
              },
            };
          });
          if (user?.id && data.conversation) saveConversation(user.id, data.conversation);
        })
        .catch(() => {});
    };
    const onMessage = ({ message }) => {
      setConversation((current) => {
        if (!current || current.id !== message.conversationId) return current;
        return { ...current, lastMessage: lastMessageFrom(message) };
      });
      refreshConversation();
    };
    const onPresence = (payload) => {
      liveOnline.current = Boolean(payload.online);
      setConversation((current) => {
        if (!current || current.partner?.id !== payload.userId) return current;
        return {
          ...current,
          partner: {
            ...current.partner,
            online: liveOnline.current,
            lastSeenAt: payload.online
              ? current.partner.lastSeenAt
              : payload.lastSeenAt || current.partner.lastSeenAt || null,
          },
        };
      });
    };
    const onProfile = (payload) => {
      setConversation((current) => {
        if (!current || current.partner?.id !== payload.userId) return current;
        return {
          ...current,
          partner: {
            ...current.partner,
            displayName: payload.displayName || current.partner.displayName,
            photoUrl: payload.photoUrl || '',
          },
        };
      });
    };
    let typingTimer;
    const onTyping = (payload) => {
      if (conversationRef.current?.id !== payload.conversationId) return;
      const nextActivity = payload.active ? (payload.kind === 'recording' ? 'recording' : 'typing') : '';
      setPartnerActivity(nextActivity);
      clearTimeout(typingTimer);
      if (nextActivity) {
        liveOnline.current = true;
        setConversation((current) => {
          if (!current || current.partner?.online) return current;
          return {
            ...current,
            partner: { ...current.partner, online: true },
          };
        });
        typingTimer = setTimeout(() => setPartnerActivity(''), 6000);
      }
    };

    next.on('connect', onConnect);
    next.on('disconnect', onDisconnect);
    next.on('pair:joined', onPair);
    const onDeleted = () => refreshConversation();
    const onEdited = () => refreshConversation();
    next.on('message:new', onMessage);
    next.on('message:deleted', onDeleted);
    next.on('message:edited', onEdited);
    next.on('presence', onPresence);
    next.on('profile:updated', onProfile);
    next.on('typing', onTyping);

    return () => {
      clearTimeout(typingTimer);
      appState.remove();
      next.off('connect', onConnect);
      next.off('disconnect', onDisconnect);
      next.off('pair:joined', onPair);
      next.off('message:new', onMessage);
      next.off('message:deleted', onDeleted);
      next.off('message:edited', onEdited);
      next.off('presence', onPresence);
      next.off('profile:updated', onProfile);
      next.off('typing', onTyping);
      next.disconnect();
      setSocket(null);
      setConnected(false);
      setPartnerActivity('');
    };
  }, [signedIn, token]);

  useEffect(() => {
    if (!user?.id || !conversation?.id) {
      draftLoaded.current = false;
      setDraftState({ text: '', reply: null });
      return undefined;
    }
    let cancel = false;
    draftLoaded.current = false;
    loadDraft(user.id, conversation.id).then((saved) => {
      if (cancel || draftLoaded.current) return;
      draftLoaded.current = true;
      setDraftState(saved);
    });
    return () => {
      cancel = true;
    };
  }, [user?.id, conversation?.id]);

  const setDraft = useCallback((next) => {
    const text = typeof next?.text === 'string' ? next.text : '';
    const value = { text, reply: text.trim() ? next.reply || null : null };
    draftLoaded.current = true;
    setDraftState(value);
    const id = conversationRef.current?.id;
    if (user?.id && id) saveDraft(user.id, id, value);
  }, [user?.id]);

  useEffect(() => {
    loadSpeakerPreference();
  }, []);

  useEffect(() => {
    if (!signedIn) {
      setAppBadge(0);
      return;
    }
    setAppBadge(conversation?.stats?.unread || 0);
  }, [signedIn, conversation?.stats?.unread]);

  useEffect(() => {
    if (!signedIn || !token) return undefined;
    return watchDelivery(token);
  }, [signedIn, token]);

  useEffect(() => {
    if (!signedIn || !user?.id) return undefined;
    let cancel = false;
    loadPushEnabled(user.id)
      .then((enabled) => {
        if (cancel) return null;
        return syncAccountPush({ authToken: token, enabled });
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [signedIn, token, user?.id]);

  const refreshConversation = useCallback(() => {
    if (!token) return;
    api('/api/conversation', { token })
      .then((data) => {
        if (!data.conversation) {
          setConversation(null);
          return;
        }
        setConversation((current) => {
          const remote = data.conversation;
          const next = {
            ...remote,
            partner: {
              ...remote.partner,
              online: current?.partner?.online || remote.partner.online,
              lastSeenAt:
                current?.partner?.lastSeenAt && remote.partner.lastSeenAt
                  ? new Date(current.partner.lastSeenAt) >= new Date(remote.partner.lastSeenAt)
                    ? current.partner.lastSeenAt
                    : remote.partner.lastSeenAt
                  : current?.partner?.lastSeenAt || remote.partner.lastSeenAt,
            },
          };
          if (user?.id) saveConversation(user.id, next);
          return next;
        });
      })
      .catch(() => {});
  }, [token, user?.id]);

  const value = useMemo(
    () => ({
      socket,
      connected,
      conversation,
      setConversation,
      conversationReady,
      partnerActivity,
      draft,
      setDraft,
      refreshConversation,
    }),
    [socket, connected, conversation, conversationReady, partnerActivity, draft, setDraft, refreshConversation]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const value = useContext(ChatContext);
  if (!value) throw new Error('useChat must be used inside ChatProvider');
  return value;
}
