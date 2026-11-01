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

export function watchDelivery(authToken) {
  if (!authToken) return () => {};
  const received = Notifications.addNotificationReceivedListener(() => {
    api('/api/me/delivered', { token: authToken, method: 'POST', body: {} }).catch(() => {});
  });
  return () => received.remove();
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
  if (!authToken) return { registered: false, reason: 'auth' };
  if (!enabled) {
    await api('/api/me/push-token', { token: authToken, method: 'POST', body: { token: '' } });
    return { registered: false, reason: null };
  }
  const result = await registerForPush();
  if (!result.token) return { registered: false, reason: result.reason };
  await api('/api/me/push-token', { token: authToken, method: 'POST', body: { token: result.token } });
  return { registered: true, reason: null };
}

export async function registerForPush() {
  if (!Device.isDevice) return { token: null, reason: 'device' };

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
    if (status !== 'granted') return { token: null, reason: 'permission' };

    try {
      const device = await Notifications.getDevicePushTokenAsync();
      if (device?.data) return { token: String(device.data), reason: null };
    } catch {
      // This install has no Firebase Android config, so there is no device token.
    }

    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      const expoToken = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
      if (expoToken?.data) return { token: expoToken.data, reason: null };
    } catch {
      // Expo push also needs the Firebase Android file in the build.
    }

    return { token: null, reason: 'firebase' };
  } catch {
    return { token: null, reason: 'firebase' };
  }
}
