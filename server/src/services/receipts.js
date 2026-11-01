import { Message } from '../models/Message.js';

const unread = {
  $or: [{ status: { $in: ['sent', 'delivered'] } }, { status: { $exists: false } }],
};

async function idsFor(filter) {
  const docs = await Message.find(filter).select('_id');
  return docs.map((doc) => doc._id);
}

export async function markDelivered(conversationId, recipientId) {
  const ids = await idsFor({
    conversationId,
    senderId: { $ne: recipientId },
    $or: [{ status: 'sent' }, { status: { $exists: false } }],
  });
  if (!ids.length) return [];
  await Message.updateMany(
    { _id: { $in: ids }, $or: [{ status: 'sent' }, { status: { $exists: false } }] },
    { $set: { status: 'delivered' } }
  );
  return ids.map((id) => id.toString());
}

export async function markRead(conversationId, readerId, onlyIds) {
  const filter = {
    conversationId,
    senderId: { $ne: readerId },
    ...unread,
  };
  if (onlyIds?.length) filter._id = { $in: onlyIds };
  const ids = await idsFor(filter);
  if (!ids.length) return [];
  await Message.updateMany(
    { _id: { $in: ids }, ...unread },
    { $set: { status: 'read' } }
  );
  return ids.map((id) => id.toString());
}
