import fs from 'fs';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

let firebaseReady = false;

function readCredentials() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }
  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (path && fs.existsSync(path)) {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
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

async function sendExpoPush(token, { title, body, data }) {
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
      data,
    }),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
}

export async function sendPush(token, { title, body, data }) {
  if (!token) return;
  if (token.startsWith('ExponentPushToken')) {
    await sendExpoPush(token, { title, body, data });
    return;
  }
  if (!firebaseReady) return;

  const stringData = {};
  for (const [key, value] of Object.entries(data || {})) {
    stringData[key] = String(value ?? '');
  }

  await getMessaging().send({
    token,
    notification: { title, body },
    data: stringData,
    android: { priority: 'high', notification: { channelId: 'messages', sound: 'default' } },
    apns: { payload: { aps: { sound: 'default' } } },
  });
}
