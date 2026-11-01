import { Router } from 'express';
import { asyncHandler } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { issueCode, redeemCode } from '../services/pairing.js';
import { publicConversation } from '../services/serialize.js';
import { emitPairJoined, isUserPresent } from '../sockets/chat.js';

export const pairRouter = Router();

pairRouter.use(requireAuth);

pairRouter.post(
  '/code',
  asyncHandler(async (req, res) => {
    const issued = await issueCode(req.user, { refresh: Boolean(req.body?.refresh) });
    res.json(issued);
  })
);

pairRouter.post(
  '/redeem',
  asyncHandler(async (req, res) => {
    const { conversation, me, owner } = await redeemCode(req.user, req.body?.code);
    const forOwner = publicConversation(conversation, me, {
      online: isUserPresent(me._id),
      nickname: owner.partnerNickname || '',
    });
    const forMe = publicConversation(conversation, owner, {
      online: isUserPresent(owner._id),
      nickname: me.partnerNickname || '',
    });
    emitPairJoined({
      ownerId: owner._id,
      redeemerId: me._id,
      conversationId: conversation._id,
      ownerPayload: forOwner,
      redeemerPayload: forMe,
    });
    res.json({ conversation: forMe });
  })
);
