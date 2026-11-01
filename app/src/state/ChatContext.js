import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { getApiUrl } from '../config';
import { previewLabel } from '../format';
import { registerForPush } from '../notifications';

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

  const signedIn = Boolean(token && user?.displayName);

  useEffect(() => {
    if (!signedIn) {
      setConversation(null);
      setConversationReady(false);
      return undefined;
    }

    let cancel = false;
    setConversationReady(false);
    api('/api/conversation', { token })
      .then((data) => {
        if (!cancel) setConversation(data.conversation);
      })
      .catch(() => {
        if (!cancel) setConversation(null);
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

    const next = io(getApiUrl(), { auth: { token } });
    setSocket(next);

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onPair = ({ conversation: nextConversation }) => {
      setConversation(nextConversation);
    };
    const onMessage = ({ message }) => {
      setConversation((current) => {
        if (!current || current.id !== message.conversationId) return current;
        return { ...current, lastMessage: lastMessageFrom(message) };
      });
    };

    next.on('connect', onConnect);
    next.on('disconnect', onDisconnect);
    next.on('pair:joined', onPair);
    next.on('message:new', onMessage);

    return () => {
      next.off('connect', onConnect);
      next.off('disconnect', onDisconnect);
      next.off('pair:joined', onPair);
      next.off('message:new', onMessage);
      next.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [signedIn, token]);

  useEffect(() => {
    if (!signedIn) return undefined;
    let cancel = false;
    registerForPush()
      .then((pushToken) => {
        if (!pushToken || cancel) return null;
        return api('/api/me/push-token', { token, method: 'POST', body: { token: pushToken } });
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [signedIn, token]);

  const value = useMemo(
    () => ({
      socket,
      connected,
      conversation,
      setConversation,
      conversationReady,
    }),
    [socket, connected, conversation, conversationReady]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const value = useContext(ChatContext);
  if (!value) throw new Error('useChat must be used inside ChatProvider');
  return value;
}
