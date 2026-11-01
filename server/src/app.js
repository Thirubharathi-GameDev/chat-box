import http from 'http';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import { HttpError } from './errors.js';
import { authRouter } from './routes/auth.js';
import { conversationRouter } from './routes/conversation.js';
import { meRouter } from './routes/me.js';
import { mediaRouter } from './routes/media.js';
import { pairRouter } from './routes/pair.js';
import { attachSocket } from './sockets/chat.js';

export function createServer() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/me', meRouter);
  app.use('/api/pair', pairRouter);
  app.use('/api/conversation', conversationRouter);
  app.use('/api/media', mediaRouter);

  app.use((err, _req, res, _next) => {
    const status = err instanceof HttpError ? err.status : 500;
    if (status >= 500) console.error(err);
    const message = status >= 500 && !(err instanceof HttpError) ? 'Server error.' : err.message;
    res.status(status || 500).json({ error: message || 'Server error.' });
  });

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });
  attachSocket(io);
  return { app, server, io };
}
