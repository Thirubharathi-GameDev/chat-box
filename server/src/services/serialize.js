export function publicUser(user) {
  return {
    id: user._id.toString(),
    userId: user.userId,
    displayName: user.displayName || '',
    partnerId: user.partnerId ? user.partnerId.toString() : null,
  };
}

export function pairKey(a, b) {
  return [a.toString(), b.toString()].sort().join(':');
}

export function previewText(message) {
  if (message.type === 'image') return 'Photo';
  if (message.type === 'voice') return 'Voice message';
  return message.text || '';
}

export function publicMessage(message) {
  return {
    id: message._id.toString(),
    conversationId: message.conversationId.toString(),
    senderId: message.senderId.toString(),
    type: message.type,
    text: message.text || '',
    mediaUrl: message.mediaUrl || '',
    durationMs: message.durationMs || 0,
    createdAt: message.createdAt.toISOString(),
  };
}

export function publicConversation(conversation, partner) {
  if (!conversation) return null;
  const last = conversation.lastMessage;
  return {
    id: conversation._id.toString(),
    partner: partner
      ? {
          id: partner._id.toString(),
          userId: partner.userId,
          displayName: partner.displayName || partner.userId,
        }
      : {
          id: '',
          userId: 'unknown',
          displayName: 'Unknown',
        },
    lastMessage: last
      ? {
          type: last.type,
          text: previewText(last),
          senderId: last.senderId.toString(),
          createdAt: new Date(last.createdAt).toISOString(),
        }
      : null,
  };
}
