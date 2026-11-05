export function publicUser(user) {
  return {
    id: user._id.toString(),
    userId: user.userId,
    displayName: user.displayName || '',
    photoUrl: user.photoUrl || '',
    partnerNickname: user.partnerNickname || '',
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

export function publicMessage(message, viewerId = '') {
  const viewer = viewerId ? String(viewerId) : '';
  const reactions = Array.isArray(message.reactions)
    ? message.reactions
        .filter((item) => item?.emoji)
        .map((item) => ({ userId: String(item.userId), emoji: item.emoji }))
    : [];
  const starred = Boolean(viewer && Array.isArray(message.starredBy) && message.starredBy.some((id) => String(id) === viewer));
  const deleted = Boolean(message.deleted);
  return {
    id: message._id.toString(),
    conversationId: message.conversationId.toString(),
    senderId: message.senderId.toString(),
    clientId: message.clientId || '',
    type: message.type,
    text: deleted ? '' : message.text || '',
    mediaUrl: deleted ? '' : message.mediaUrl || '',
    durationMs: deleted ? 0 : message.durationMs || 0,
    waveform: deleted ? [] : Array.isArray(message.waveform) ? message.waveform : [],
    status: message.status || 'sent',
    replyTo: message.replyTo?.messageId
      ? {
          messageId: message.replyTo.messageId,
          senderId: message.replyTo.senderId || '',
          type: message.replyTo.type || 'text',
          text: message.replyTo.text || '',
          mediaUrl: message.replyTo.mediaUrl || '',
        }
      : null,
    reactions: deleted ? [] : reactions,
    starred,
    edited: Boolean(message.edited) && !deleted,
    deleted,
    removedForSender: Boolean(message.removedBySender),
    createdAt: message.createdAt.toISOString(),
  };
}

export function publicConversation(conversation, partner, { online = false, nickname = '', stats, unreadMessage = null, lastMessage = undefined } = {}) {
  if (!conversation) return null;
  const last = lastMessage === undefined ? conversation.lastMessage : lastMessage;
  return {
    id: conversation._id.toString(),
    partner: partner
      ? {
          id: partner._id.toString(),
          userId: partner.userId,
          displayName: partner.displayName || partner.userId,
          photoUrl: partner.photoUrl || '',
          nickname: nickname || '',
          online: Boolean(online),
          lastSeenAt: partner.lastSeenAt ? new Date(partner.lastSeenAt).toISOString() : null,
        }
      : {
          id: '',
          userId: 'unknown',
          displayName: 'Unknown',
          photoUrl: '',
          nickname: '',
          online: false,
          lastSeenAt: null,
        },
    lastMessage: last
      ? {
          type: last.type,
          text: last.deleted ? 'This message was deleted' : previewText(last),
          senderId: last.senderId.toString(),
          createdAt: new Date(last.createdAt).toISOString(),
          deleted: Boolean(last.deleted),
        }
      : null,
    stats: {
      total: stats?.total || 0,
      sent: stats?.sent || 0,
      received: stats?.received || 0,
      unread: stats?.unread || 0,
    },
    unreadMessage: unreadMessage
      ? {
          type: unreadMessage.type,
          text: unreadMessage.text || '',
          createdAt: unreadMessage.createdAt,
        }
      : null,
  };
}
