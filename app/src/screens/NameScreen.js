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

export function NameScreen() {
  const { saveName, logout } = useAuth();
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
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.inner}>
          <Text style={styles.kicker}>Almost there</Text>
          <Text style={styles.title}>What should we call you?</Text>
          <Text style={styles.help}>This name is what the other person sees in the chat. Nothing else is asked.</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={colors.muted}
            style={styles.input}
            maxLength={40}
            autoFocus
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={styles.button} onPress={submit} disabled={busy}>
            {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Continue</Text>}
          </Pressable>
          <Pressable onPress={logout} style={styles.logout}>
            <Text style={styles.logoutText}>Log out</Text>
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
  inner: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 36,
  },
  kicker: {
    color: colors.teal,
    fontWeight: '700',
    marginBottom: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
  },
  help: {
    color: colors.muted,
    marginTop: 8,
    marginBottom: 20,
    lineHeight: 20,
  },
  input: {
    backgroundColor: colors.composer,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 18,
    color: colors.text,
  },
  error: {
    color: colors.danger,
    marginTop: 10,
  },
  button: {
    marginTop: 18,
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
  logout: {
    marginTop: 18,
    alignItems: 'center',
  },
  logoutText: {
    color: colors.muted,
    fontWeight: '700',
  },
});
