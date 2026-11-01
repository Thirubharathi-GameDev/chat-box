import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { colors } from '../theme';

export function LoginScreen() {
  const { login, register } = useAuth();
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
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.hero}>
          <Text style={styles.brand}>Chatbox</Text>
          <Text style={styles.tagline}>A private chat with one person</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.heading}>{mode === 'register' ? 'Create account' : 'Welcome back'}</Text>
          <Text style={styles.label}>User ID</Text>
          <TextInput
            value={userId}
            onChangeText={setUserId}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="your_id"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="At least 6 characters"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={styles.button} onPress={submit} disabled={busy}>
            {busy ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.buttonText}>{mode === 'register' ? 'Create account' : 'Log in'}</Text>
            )}
          </Pressable>
          <Pressable
            onPress={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError('');
            }}
            style={styles.switchBtn}
          >
            <Text style={styles.switchText}>
              {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Log in'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.header,
  },
  flex: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  hero: {
    paddingHorizontal: 28,
    paddingBottom: 28,
  },
  brand: {
    color: colors.white,
    fontSize: 40,
    fontWeight: '800',
  },
  tagline: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 16,
    marginTop: 6,
  },
  card: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 32,
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  label: {
    color: colors.muted,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.composer,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
    marginBottom: 14,
  },
  error: {
    color: colors.danger,
    marginBottom: 10,
  },
  button: {
    backgroundColor: colors.green,
    borderRadius: 24,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 16,
  },
  switchBtn: {
    marginTop: 18,
    alignItems: 'center',
  },
  switchText: {
    color: colors.teal,
    fontWeight: '700',
  },
});
