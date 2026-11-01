import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
    },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['text', 'image', 'voice'], required: true },
    text: { type: String, default: '' },
    mediaUrl: { type: String, default: '' },
    durationMs: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

messageSchema.index({ conversationId: 1, createdAt: -1 });

export const Message = mongoose.model('Message', messageSchema);
