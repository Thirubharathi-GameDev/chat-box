import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'chatbox.recentReactions';
export const DEFAULT_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const LIMIT = 6;

export async function loadRecentReactions() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string' && item) : [];
    const merged = [];
    [...list, ...DEFAULT_REACTIONS].forEach((emoji) => {
      if (!merged.includes(emoji)) merged.push(emoji);
    });
    return merged.slice(0, LIMIT);
  } catch {
    return [...DEFAULT_REACTIONS];
  }
}

export async function rememberReaction(emoji) {
  const current = await loadRecentReactions();
  const next = [emoji, ...current.filter((item) => item !== emoji)].slice(0, LIMIT);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // The row still updates on this phone until the app closes.
  }
  return next;
}
