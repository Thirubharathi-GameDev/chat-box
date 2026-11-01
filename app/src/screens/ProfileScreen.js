import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { api, uploadProfilePhoto } from '../api';
import { useAuth } from '../auth/AuthContext';
import { Avatar } from '../components/Avatar';
import { Field, PrimaryButton } from '../components/Field';
import { Header } from '../components/Header';
import { LOCK_INTERVALS } from '../appLock';
import { useAppLock } from '../components/AppLock';
import { loadPushEnabled, savePushEnabled, syncAccountPush } from '../notifications';
import { font, themes, useColors, useTheme } from '../theme';
import { KeyboardScreen } from '../useKeyboardInset';

export function ProfileScreen({ navigation }) {
  const { token, user, applyUser } = useAuth();
  const appLock = useAppLock();
  const { id, setTheme } = useTheme();
  const colors = useColors();
  const [name, setName] = useState(user?.displayName || '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pushOn, setPushOn] = useState(true);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    if (!user?.id) return undefined;
    let cancel = false;
    loadPushEnabled(user.id).then((enabled) => {
      if (!cancel) setPushOn(enabled);
    });
    return () => {
      cancel = true;
    };
  }, [user?.id]);

  async function togglePush(next) {
    if (!user?.id) return;
    setPushBusy(true);
    setPushOn(next);
    try {
      await savePushEnabled(user.id, next);
      const result = await syncAccountPush({ authToken: token, enabled: next });
      if (next && !result.registered) {
        setPushOn(false);
        await savePushEnabled(user.id, false);
        Alert.alert('Notifications', 'Allow notifications for Kin to turn this on.');
      }
    } catch (err) {
      setPushOn(!next);
      await savePushEnabled(user.id, !next).catch(() => {});
      Alert.alert('Notifications', err.message);
    } finally {
      setPushBusy(false);
    }
  }

  async function changePhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photos', 'Allow photo access to set your picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    setUploading(true);
    try {
      const data = await uploadProfilePhoto(token, result.assets[0].uri);
      applyUser(data.user);
    } catch (err) {
      Alert.alert('Profile photo', err.message);
    } finally {
      setUploading(false);
    }
  }

  async function saveName() {
    setSaving(true);
    try {
      const data = await api('/api/me', { token, method: 'PATCH', body: { displayName: name } });
      applyUser(data.user);
      navigation.goBack();
    } catch (err) {
      Alert.alert('Name', err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardScreen style={{ backgroundColor: colors.background }}>
      <Header title="Profile" onBack={() => navigation.goBack()} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 28, paddingBottom: 36 }}>
        <View style={{ alignItems: 'center' }}>
          <Pressable onPress={changePhoto} disabled={uploading}>
            <Avatar name={user?.displayName} photoUrl={user?.photoUrl} size={120} />
            <View
              style={{
                position: 'absolute',
                right: 2,
                bottom: 2,
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: colors.teal,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 2,
                borderColor: colors.surface,
              }}
            >
              {uploading ? (
                <ActivityIndicator color={colors.onHeader} size="small" />
              ) : (
                <Ionicons name="camera" size={16} color={colors.onHeader} />
              )}
            </View>
          </Pressable>
          <Text style={{ color: colors.muted, fontFamily: font.medium, marginTop: 12, marginBottom: 22 }}>
            Tap the photo to change it
          </Text>
        </View>
        <Field label="Name" value={name} onChangeText={setName} placeholder="Your name" maxLength={40} />
        <Text style={{ color: colors.muted, fontFamily: font.medium, marginBottom: 22 }}>User ID · {user?.userId}</Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.surface,
            borderRadius: 20,
            paddingHorizontal: 16,
            paddingVertical: 14,
            marginBottom: 22,
          }}
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ color: colors.text, fontFamily: font.bold, fontSize: 16 }}>Push notifications</Text>
            <Text style={{ color: colors.muted, fontFamily: font.medium, marginTop: 4, lineHeight: 20 }}>
              When this is on, this phone receives new messages for {user?.userId}.
            </Text>
          </View>
          <Switch
            value={pushOn}
            onValueChange={togglePush}
            disabled={pushBusy}
            trackColor={{ false: colors.shell, true: colors.teal }}
            thumbColor={colors.surface}
          />
        </View>
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: 20,
            paddingHorizontal: 16,
            paddingVertical: 14,
            marginBottom: 22,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ color: colors.text, fontFamily: font.bold, fontSize: 16 }}>App lock</Text>
              <Text style={{ color: colors.muted, fontFamily: font.medium, marginTop: 4, lineHeight: 20 }}>
                A 4-digit PIN stays on this phone for this account. It is not saved on the server.
              </Text>
            </View>
            <Switch
              value={appLock.enabled}
              onValueChange={(next) => (next ? appLock.beginSetup() : appLock.beginDisable())}
              trackColor={{ false: colors.shell, true: colors.teal }}
              thumbColor={colors.surface}
            />
          </View>
          {appLock.enabled ? (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              {LOCK_INTERVALS.map((item) => {
                const selected = item.ms === appLock.intervalMs;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => appLock.chooseInterval(item.ms)}
                    style={{
                      flex: 1,
                      borderRadius: 14,
                      paddingVertical: 10,
                      alignItems: 'center',
                      backgroundColor: selected ? colors.header : colors.background,
                    }}
                  >
                    <Text style={{ color: selected ? colors.onHeader : colors.text, fontFamily: font.semibold, fontSize: 13 }}>
                      {item.label.replace(' minutes', ' min').replace('1 hour', '1 hr')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
        <Text style={{ color: colors.text, fontFamily: font.bold, fontSize: 22, marginBottom: 6 }}>Theme</Text>
        <Text style={{ color: colors.muted, fontFamily: font.medium, marginBottom: 14, lineHeight: 20 }}>
          The whole app follows the one you pick. It stays on this phone.
        </Text>
        {themes.map((theme) => {
          const selected = theme.id === id;
          return (
            <Pressable
              key={theme.id}
              onPress={() => setTheme(theme.id)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: colors.surface,
                borderRadius: 20,
                padding: 12,
                marginBottom: 10,
                transform: [{ scale: pressed ? 0.99 : 1 }],
                borderWidth: selected ? 1.5 : 0,
                borderColor: colors.teal,
              })}
            >
              <View style={{ width: 54, height: 40, borderRadius: 12, overflow: 'hidden', flexDirection: 'row' }}>
                <View style={{ flex: 1, backgroundColor: theme.colors.header }} />
                <View style={{ flex: 1, backgroundColor: theme.colors.outgoing }} />
                <View style={{ flex: 1, backgroundColor: theme.colors.green }} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: colors.text, fontFamily: font.bold, fontSize: 16 }}>{theme.name}</Text>
                <Text style={{ color: colors.muted, fontFamily: font.medium, marginTop: 2 }}>{theme.line}</Text>
              </View>
              {selected ? <Ionicons name="checkmark-circle" size={22} color={colors.teal} /> : null}
            </Pressable>
          );
        })}
        <Text style={{ color: colors.muted, fontFamily: font.medium, lineHeight: 20, marginTop: 8, marginBottom: 16 }}>
          Messages, photos, and voice notes are kept on this phone, so the chat still opens when you are offline.
        </Text>
        <PrimaryButton label="Save name" onPress={saveName} busy={saving} icon="check" />
      </ScrollView>
    </KeyboardScreen>
  );
}
