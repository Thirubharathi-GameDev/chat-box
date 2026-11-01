import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';

const KEY = 'chatbox.speaker';
let preference = true;
let override = null;
const listeners = new Set();

function effective() {
  return override === null ? preference : override;
}

function publish() {
  listeners.forEach((listener) => listener());
}

export function speakerPreference() {
  return preference;
}

export function speakerOn() {
  return effective();
}

export function setRouteOverride(on) {
  const next = Boolean(on);
  if (override === next) return effective();
  override = next;
  publish();
  return effective();
}

export function clearRouteOverride() {
  if (override === null) return preference;
  override = null;
  publish();
  return preference;
}

export function toggleSpeaker() {
  preference = !effective();
  override = null;
  SecureStore.setItemAsync(KEY, preference ? 'speaker' : 'ear').catch(() => {});
  publish();
  return preference;
}

export async function loadSpeakerPreference() {
  try {
    const value = await SecureStore.getItemAsync(KEY);
    preference = value !== 'ear';
    publish();
  } catch {
    preference = true;
  }
}

export function useSpeaker() {
  const [on, setOn] = useState(effective());
  useEffect(() => {
    const listener = () => setOn(effective());
    listeners.add(listener);
    setOn(effective());
    return () => listeners.delete(listener);
  }, []);
  return on;
}
