import mongoose from 'mongoose';

const pairCodeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
    usedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

pairCodeSchema.index(
  { ownerId: 1 },
  { unique: true, partialFilterExpression: { usedBy: null } }
);

export const PairCode = mongoose.model('PairCode', pairCodeSchema);
