import Constants from 'expo-constants';

export function getApiUrl() {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  const hostUri = Constants.expoConfig?.hostUri || Constants.expoGoConfig?.debuggerHost || '';
  const host = hostUri.split(':')[0];
  if (host) return `http://${host}:4000`;
  return 'http://localhost:4000';
}
