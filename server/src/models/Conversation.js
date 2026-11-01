import mongoose from 'mongoose';

const lastMessageSchema = new mongoose.Schema(
  {
    text: { type: String, default: '' },
    type: { type: String, enum: ['text', 'image', 'voice'], required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, required: true },
  },
  { _id: false }
);

const conversationSchema = new mongoose.Schema(
  {
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
    pairKey: { type: String, required: true, unique: true },
    lastMessage: { type: lastMessageSchema, default: null },
  },
  { timestamps: true }
);

export const Conversation = mongoose.model('Conversation', conversationSchema);
