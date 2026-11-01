import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';

try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
} catch {
  // Remote notifications are not available inside Expo Go.
}

export async function setAppBadge(count) {
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, Number(count) || 0));
  } catch {
    // Some launchers and Expo Go cannot draw a count on the icon.
  }
}

function pushKey(userId) {
  return `chatbox.push.${userId}`;
}

export async function loadPushEnabled(userId) {
  if (!userId) return false;
  try {
    const value = await AsyncStorage.getItem(pushKey(userId));
    if (value == null) return true;
    return value === 'on';
  } catch {
    return true;
  }
}

export async function savePushEnabled(userId, enabled) {
  if (!userId) return;
  await AsyncStorage.setItem(pushKey(userId), enabled ? 'on' : 'off');
}

export async function syncAccountPush({ authToken, enabled }) {
  if (!authToken) return { registered: false };
  if (!enabled) {
    await api('/api/me/push-token', { token: authToken, method: 'POST', body: { token: '' } });
    return { registered: false };
  }
  const pushToken = await registerForPush();
  if (!pushToken) return { registered: false };
  await api('/api/me/push-token', { token: authToken, method: 'POST', body: { token: pushToken } });
  return { registered: true };
}

export async function registerForPush() {
  if (!Device.isDevice) return null;

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('messages', {
        name: 'Messages',
        importance: Notifications.AndroidImportance.HIGH,
        showBadge: true,
        sound: 'default',
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const asked = await Notifications.requestPermissionsAsync();
      status = asked.status;
    }
    if (status !== 'granted') return null;

    try {
      const device = await Notifications.getDevicePushTokenAsync();
      if (device?.data) return String(device.data);
    } catch {
      // Expo Go cannot mint a Firebase device token.
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const expoToken = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return expoToken?.data || null;
  } catch {
    return null;
  }
}
