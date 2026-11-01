import * as SecureStore from 'expo-secure-store';

export const LOCK_INTERVALS = [
  { id: '5', label: '5 minutes', ms: 5 * 60 * 1000 },
  { id: '30', label: '30 minutes', ms: 30 * 60 * 1000 },
  { id: '60', label: '1 hour', ms: 60 * 60 * 1000 },
];

export const MAX_PIN_ATTEMPTS = 5;

function key(userId) {
  return `chatbox.lock.${userId}`;
}

export async function loadLock(userId) {
  if (!userId) return null;
  try {
    const raw = await SecureStore.getItemAsync(key(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!/^\d{4}$/.test(parsed?.pin)) return null;
    const interval = LOCK_INTERVALS.find((item) => item.ms === parsed.intervalMs) || LOCK_INTERVALS[0];
    return {
      pin: parsed.pin,
      intervalMs: interval.ms,
      failures: Math.max(0, Number(parsed.failures) || 0),
      lastHiddenAt: Number(parsed.lastHiddenAt) || 0,
    };
  } catch {
    return null;
  }
}

export async function saveLock(userId, lock) {
  if (!userId || !lock) return;
  await SecureStore.setItemAsync(key(userId), JSON.stringify(lock));
}

export async function clearLock(userId) {
  if (!userId) return;
  await SecureStore.deleteItemAsync(key(userId)).catch(() => {});
}
