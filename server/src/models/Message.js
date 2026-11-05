import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
    },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    clientId: { type: String, default: '' },
    type: { type: String, enum: ['text', 'image', 'voice'], required: true },
    text: { type: String, default: '' },
    mediaUrl: { type: String, default: '' },
    durationMs: { type: Number, default: 0 },
    waveform: { type: [Number], default: [] },
    status: { type: String, enum: ['sent', 'delivered', 'read'], default: 'sent' },
    replyTo: {
      messageId: { type: String, default: '' },
      senderId: { type: String, default: '' },
      type: { type: String, default: '' },
      text: { type: String, default: '' },
      mediaUrl: { type: String, default: '' },
    },
    reactions: {
      type: [
        {
          userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
          emoji: { type: String, default: '' },
        },
      ],
      default: [],
    },
    starredBy: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },
    hiddenFor: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },
    edited: { type: Boolean, default: false },
    deleted: { type: Boolean, default: false },
    removedBySender: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index(
  { conversationId: 1, senderId: 1, clientId: 1 },
  { unique: true, partialFilterExpression: { clientId: { $type: 'string', $gt: '' } } }
);

export const Message = mongoose.model('Message', messageSchema);
