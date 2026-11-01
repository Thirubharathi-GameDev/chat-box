import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { Eyebrow, Field, PrimaryButton } from '../components/Field';
import { font, useColors } from '../theme';
import { KeyboardScreen } from '../useKeyboardInset';

export function LoginScreen() {
  const { login, register } = useAuth();
  const colors = useColors();
  const [mode, setMode] = useState('login');
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError('');
    setBusy(true);
    try {
      if (mode === 'register') await register(userId.trim(), password);
      else await login(userId.trim(), password);
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
          <View style={{ paddingHorizontal: 28, paddingBottom: 28, paddingTop: 36 }}>
            <Eyebrow light>One person</Eyebrow>
            <Text style={{ color: colors.onHeader, fontFamily: font.bold, fontSize: 44, letterSpacing: -1 }}>Kin</Text>
            <Text style={{ color: 'rgba(247,244,238,0.78)', fontFamily: font.medium, fontSize: 16, marginTop: 8, lineHeight: 22 }}>
              A private line for two. Nothing else joins the conversation.
            </Text>
          </View>
          <View
            style={{
              backgroundColor: colors.background,
              borderTopLeftRadius: 32,
              borderTopRightRadius: 32,
              paddingHorizontal: 22,
              paddingTop: 26,
              paddingBottom: 28,
            }}
          >
            <Text style={{ color: colors.text, fontFamily: font.bold, fontSize: 26, marginBottom: 18 }}>
              {mode === 'register' ? 'Create your place' : 'Welcome back'}
            </Text>
            <Field
              label="User ID"
              value={userId}
              onChangeText={setUserId}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="your_id"
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="At least 6 characters"
            />
            {error ? (
              <Text style={{ color: colors.danger, fontFamily: font.medium, marginBottom: 10 }}>{error}</Text>
            ) : null}
            <PrimaryButton label={mode === 'register' ? 'Create account' : 'Log in'} onPress={submit} busy={busy} />
            <Pressable
              onPress={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError('');
              }}
              style={{ marginTop: 18, alignItems: 'center', paddingVertical: 8 }}
            >
              <Text style={{ color: colors.teal, fontFamily: font.semibold }}>
                {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Log in'}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardScreen>
  );
}
