import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { io as ioClient } from 'socket.io-client';

process.env.JWT_SECRET = 'smoke-test-secret-value';
process.env.CLOUDINARY_CLOUD_NAME = 'demo';

const memory = await MongoMemoryServer.create();
process.env.MONGODB_URI = memory.getUri();

const { connectDb } = await import('../src/db.js');
const { createServer } = await import('../src/app.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

await connectDb();
const { server } = createServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

async function request(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

try {
  const ada = await request('/api/auth/register', {
    method: 'POST',
    body: { userId: 'ada', password: 'secret1' },
  });
  assert(ada.status === 201, `register ada failed: ${ada.status}`);

  const named = await request('/api/me', {
    method: 'PATCH',
    token: ada.data.token,
    body: { displayName: 'Ada' },
  });
  assert(named.data.user.displayName === 'Ada', 'name was not saved');

  const wrong = await request('/api/auth/login', {
    method: 'POST',
    body: { userId: 'ada', password: 'not-the-password' },
  });
  assert(wrong.status === 401, 'wrong password should fail');

  const ben = await request('/api/auth/register', {
    method: 'POST',
    body: { userId: 'ben', password: 'secret2' },
  });
  await request('/api/me', {
    method: 'PATCH',
    token: ben.data.token,
    body: { displayName: 'Ben' },
  });

  const duplicate = await request('/api/auth/register', {
    method: 'POST',
    body: { userId: 'Ada', password: 'secret1' },
  });
  assert(duplicate.status === 409, 'duplicate user id should be rejected');

  const code = await request('/api/pair/code', { method: 'POST', token: ada.data.token, body: {} });
  assert(code.status === 200 && code.data.code.length === 6, 'code was not issued');
  const same = await request('/api/pair/code', { method: 'POST', token: ada.data.token, body: {} });
  assert(same.data.code === code.data.code, 'active code should stay the same');

  const own = await request('/api/pair/redeem', {
    method: 'POST',
    token: ada.data.token,
    body: { code: code.data.code },
  });
  assert(own.status === 400, 'own code should be rejected');

  const paired = await request('/api/pair/redeem', {
    method: 'POST',
    token: ben.data.token,
    body: { code: ` ${code.data.code.toLowerCase()} ` },
  });
  assert(paired.status === 200, `redeem failed: ${paired.data.error || paired.status}`);
  assert(paired.data.conversation.partner.displayName === 'Ada', 'partner name mismatch');

  const blocked = await request('/api/pair/code', { method: 'POST', token: ada.data.token, body: {} });
  assert(blocked.status === 400, 'paired user should not get another code');

  const cy = await request('/api/auth/register', {
    method: 'POST',
    body: { userId: 'casey', password: 'secret3' },
  });
  assert(cy.status === 201, `register casey failed: ${cy.status} ${JSON.stringify(cy.data)}`);
  await request('/api/me', { method: 'PATCH', token: cy.data.token, body: { displayName: 'Casey' } });
  const stolen = await request('/api/pair/redeem', {
    method: 'POST',
    token: cy.data.token,
    body: { code: code.data.code },
  });
  assert(
    stolen.status === 400,
    'a third person should not join the pair'
  );

  const socketA = ioClient(base, { auth: { token: ada.data.token } });
  const socketB = ioClient(base, { auth: { token: ben.data.token } });
  await Promise.all([
    new Promise((resolve) => socketA.on('connect', resolve)),
    new Promise((resolve) => socketB.on('connect', resolve)),
  ]);

  const received = new Promise((resolve) => socketB.once('message:new', resolve));
  const ack = await new Promise((resolve) => {
    socketA.emit(
      'message:send',
      {
        conversationId: paired.data.conversation.id,
        clientId: 'c1',
        type: 'text',
        text: 'Hello 😊',
      },
      resolve
    );
  });
  assert(ack.ok, `send failed: ${ack.error}`);
  const event = await received;
  assert(event.message.text === 'Hello 😊', 'partner did not receive the text');
  assert(event.clientId === 'c1', 'client id was not echoed');

  const history = await request(`/api/conversation/${paired.data.conversation.id}/messages`, {
    token: ben.data.token,
  });
  assert(history.data.messages.length === 1, 'history missing');
  assert(history.data.hasMore === false, 'hasMore should be false');

  const outsider = await request(`/api/conversation/${paired.data.conversation.id}/messages`, {
    token: cy.data.token,
  });
  assert(outsider.status === 404, 'outsider should not read the chat');

  const foreign = await new Promise((resolve) => {
    socketA.emit(
      'message:send',
      {
        conversationId: paired.data.conversation.id,
        type: 'image',
        mediaUrl: 'https://example.com/pic.jpg',
      },
      resolve
    );
  });
  assert(foreign.ok === false, 'foreign media url should be rejected');

  socketA.disconnect();
  socketB.disconnect();
  console.log('smoke ok');
} finally {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await memory.stop();
}
