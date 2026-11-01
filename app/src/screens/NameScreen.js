import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { Eyebrow, Field, PrimaryButton } from '../components/Field';
import { font, useColors } from '../theme';
import { KeyboardScreen } from '../useKeyboardInset';

export function NameScreen() {
  const { saveName, logout } = useAuth();
  const colors = useColors();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError('');
    try {
      await saveName(name);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardScreen style={{ backgroundColor: colors.header }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }}>
          <View style={{ paddingHorizontal: 28, paddingTop: 48, paddingBottom: 28 }}>
            <Eyebrow light>Almost there</Eyebrow>
            <Text style={{ color: colors.onHeader, fontFamily: font.bold, fontSize: 36, letterSpacing: -0.6 }}>
              What should we call you?
            </Text>
          </View>
          <View
            style={{
              backgroundColor: colors.background,
              borderTopLeftRadius: 32,
              borderTopRightRadius: 32,
              paddingHorizontal: 22,
              paddingTop: 26,
              paddingBottom: 32,
            }}
          >
            <Text style={{ color: colors.muted, fontFamily: font.medium, lineHeight: 22, marginBottom: 18 }}>
              This is the name the other person sees. You can change it later.
            </Text>
            <Field value={name} onChangeText={setName} placeholder="Your name" maxLength={40} autoFocus />
            {error ? <Text style={{ color: colors.danger, fontFamily: font.medium, marginBottom: 10 }}>{error}</Text> : null}
            <PrimaryButton label="Continue" onPress={submit} busy={busy} />
            <Pressable onPress={logout} style={{ marginTop: 18, alignItems: 'center' }}>
              <Text style={{ color: colors.muted, fontFamily: font.semibold }}>Log out</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardScreen>
  );
}
