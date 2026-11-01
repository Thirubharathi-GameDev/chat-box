import { Conversation } from '../models/Conversation.js';
import { PairCode } from '../models/PairCode.js';
import { User } from '../models/User.js';
import { HttpError } from '../errors.js';
import { makeCode } from './codes.js';
import { pairKey } from './serialize.js';

const CODE_TTL_MS = 24 * 60 * 60 * 1000;

async function activeCode(userId) {
  return PairCode.findOne({
    ownerId: userId,
    usedBy: null,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });
}

function presentCode(doc) {
  return { code: doc.code, expiresAt: doc.expiresAt.toISOString() };
}

export async function issueCode(user, { refresh = false } = {}) {
  if (!user.displayName) {
    throw new HttpError(400, 'Add your name before connecting.');
  }
  if (user.partnerId) {
    throw new HttpError(400, 'You are already connected to someone.');
  }

  if (!refresh) {
    const existing = await activeCode(user._id);
    if (existing) return presentCode(existing);
  }

  await PairCode.deleteMany({ ownerId: user._id, usedBy: null });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const doc = await PairCode.create({
        code: makeCode(),
        ownerId: user._id,
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      });
      return presentCode(doc);
    } catch (err) {
      if (err?.code !== 11000) throw err;
      const existing = await activeCode(user._id);
      if (existing) return presentCode(existing);
    }
  }

  throw new HttpError(500, 'Could not create a code. Try again.');
}

async function releaseCode(codeId) {
  try {
    await PairCode.updateOne({ _id: codeId }, { $set: { usedBy: null } });
  } catch (err) {
    if (err?.code === 11000) {
      await PairCode.deleteOne({ _id: codeId });
      return;
    }
    throw err;
  }
}

export async function redeemCode(user, rawCode) {
  if (!user.displayName) {
    throw new HttpError(400, 'Add your name before connecting.');
  }
  if (user.partnerId) {
    throw new HttpError(400, 'You are already connected to someone.');
  }

  const code = String(rawCode || '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(code)) {
    throw new HttpError(400, 'Enter the 6-character code.');
  }

  const claimed = await PairCode.findOneAndUpdate(
    {
      code,
      usedBy: null,
      expiresAt: { $gt: new Date() },
      ownerId: { $ne: user._id },
    },
    { $set: { usedBy: user._id } },
    { new: true }
  );

  if (!claimed) {
    const own = await PairCode.findOne({ code, ownerId: user._id });
    if (own) {
      throw new HttpError(400, 'That is your own code. Ask the other person to enter it.');
    }
    throw new HttpError(400, 'That code is invalid or expired.');
  }

  const owner = await User.findById(claimed.ownerId);
  if (!owner?.displayName) {
    await releaseCode(claimed._id);
    throw new HttpError(400, 'That person has not finished setting up.');
  }
  if (owner.partnerId) {
    await releaseCode(claimed._id);
    throw new HttpError(400, 'That person is already connected to someone.');
  }

  let conversation;
  try {
    conversation = await Conversation.create({
      participants: [user._id, owner._id],
      pairKey: pairKey(user._id, owner._id),
    });
  } catch (err) {
    await releaseCode(claimed._id);
    if (err?.code === 11000) {
      throw new HttpError(400, 'You are already connected.');
    }
    throw err;
  }

  const meUpdated = await User.findOneAndUpdate(
    { _id: user._id, partnerId: null },
    { $set: { partnerId: owner._id } },
    { new: true }
  );
  if (!meUpdated) {
    await Conversation.deleteOne({ _id: conversation._id });
    await releaseCode(claimed._id);
    throw new HttpError(400, 'You are already connected to someone.');
  }

  const ownerUpdated = await User.findOneAndUpdate(
    { _id: owner._id, partnerId: null },
    { $set: { partnerId: user._id } },
    { new: true }
  );
  if (!ownerUpdated) {
    await User.updateOne({ _id: user._id }, { $set: { partnerId: null } });
    await Conversation.deleteOne({ _id: conversation._id });
    await releaseCode(claimed._id);
    throw new HttpError(400, 'That person is already connected to someone.');
  }

  return { conversation, me: meUpdated, owner: ownerUpdated };
}
