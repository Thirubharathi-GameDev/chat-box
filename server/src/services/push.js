import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let firebaseReady = false;

function readCredentials() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }
  const configured = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!configured) return null;
  const filePath = path.isAbsolute(configured) ? configured : path.resolve(serverRoot, configured);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return null;
}

export function initFirebase() {
  if (getApps().length) {
    firebaseReady = true;
    return;
  }
  try {
    const credentials = readCredentials();
    if (!credentials) {
      console.warn('Firebase is not configured. Push is off until a service account is set.');
      return;
    }
    initializeApp({ credential: cert(credentials) });
    firebaseReady = true;
  } catch (err) {
    console.warn('Firebase could not start.', err.message);
  }
}

async function sendExpoPush(token, { title, body, data, badge }) {
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: token,
      title,
      body,
      sound: 'default',
      badge,
      channelId: 'messages',
      priority: 'high',
      data,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.errors?.[0]?.message || 'Expo push was rejected.');
  }
  const ticket = Array.isArray(payload?.data) ? payload.data[0] : payload?.data;
  if (ticket?.status === 'error') {
    throw new Error(ticket.details?.error || ticket.message || 'Expo push was rejected.');
  }
}

export async function sendPush(token, { title, body, data, badge = 0 }) {
  if (!token) return;
  const count = Math.max(0, Number(badge) || 0);
  if (token.startsWith('ExponentPushToken')) {
    await sendExpoPush(token, { title, body, data, badge: count });
    return;
  }
  if (!firebaseReady) {
    throw new Error('Firebase is not configured on the server.');
  }

  const stringData = {};
  for (const [key, value] of Object.entries(data || {})) {
    stringData[key] = String(value ?? '');
  }

  await getMessaging().send({
    token,
    notification: { title, body },
    data: stringData,
    android: {
      priority: 'high',
      notification: { channelId: 'messages', sound: 'default', notificationCount: count },
    },
    apns: { payload: { aps: { sound: 'default', badge: count } } },
  });
}
