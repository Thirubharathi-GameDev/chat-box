import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    displayName: { type: String, default: '' },
    photoUrl: { type: String, default: '' },
    partnerNickname: { type: String, default: '' },
    partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    pushToken: { type: String, default: '' },
    lastSeenAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const User = mongoose.model('User', userSchema);
