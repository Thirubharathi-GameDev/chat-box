import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch {
  // Remote notifications are not available inside Expo Go.
}

export async function registerForPush() {
  if (!Device.isDevice) return null;

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('messages', {
        name: 'Messages',
        importance: Notifications.AndroidImportance.HIGH,
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
