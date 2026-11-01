import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api } from '../api';
import { colors } from '../theme';

export function PairModal({ visible, token, onClose, onConnected }) {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [entry, setEntry] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!visible) return undefined;
    let cancel = false;
    setEntry('');
    setError('');
    setCopied(false);
    setLoading(true);
    api('/api/pair/code', { token, method: 'POST', body: {} })
      .then((data) => {
        if (cancel) return;
        setCode(data.code);
        setExpiresAt(data.expiresAt);
      })
      .catch((err) => {
        if (!cancel) setError(err.message);
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [visible, token]);

  async function refreshCode() {
    setError('');
    setLoading(true);
    try {
      const data = await api('/api/pair/code', { token, method: 'POST', body: { refresh: true } });
      setCode(data.code);
      setExpiresAt(data.expiresAt);
      setCopied(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function copyCode() {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    setCopied(true);
  }

  async function redeem() {
    const next = entry.replace(/\s+/g, '').toUpperCase();
    if (next.length !== 6) {
      setError('Enter the 6-character code.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = await api('/api/pair/redeem', { token, method: 'POST', body: { code: next } });
      onConnected(data.conversation);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const expiry = expiresAt
    ? `Expires ${new Date(expiresAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
    : '';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.dismiss} onPress={onClose} />
        <View style={styles.card}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Connect</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.muted} />
            </Pressable>
          </View>
          <Text style={styles.help}>Share your code, or enter the other person’s code. Each person can connect once.</Text>

          <Text style={styles.label}>Your code</Text>
          <View style={styles.codeBox}>
            {loading ? (
              <ActivityIndicator color={colors.teal} />
            ) : (
              <Text style={styles.code}>{code || '——'}</Text>
            )}
          </View>
          <View style={styles.codeActions}>
            <Pressable onPress={copyCode} disabled={!code} style={styles.linkBtn}>
              <Text style={styles.link}>{copied ? 'Copied' : 'Copy'}</Text>
            </Pressable>
            <Pressable onPress={refreshCode} disabled={loading} style={styles.linkBtn}>
              <Text style={styles.link}>New code</Text>
            </Pressable>
          </View>
          {expiry ? <Text style={styles.expiry}>{expiry}</Text> : null}

          <Text style={styles.label}>Their code</Text>
          <TextInput
            value={entry}
            onChangeText={(value) => {
              setEntry(value.toUpperCase());
              setError('');
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8}
            placeholder="ABC123"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={[styles.button, busy && styles.buttonDisabled]} onPress={redeem} disabled={busy}>
            {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Connect</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: 22,
  },
  dismiss: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 20,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  help: {
    color: colors.muted,
    marginTop: 8,
    marginBottom: 16,
    lineHeight: 20,
  },
  label: {
    color: colors.teal,
    fontWeight: '700',
    marginBottom: 8,
  },
  codeBox: {
    minHeight: 72,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3FAF8',
  },
  code: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 6,
    color: colors.header,
  },
  codeActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    marginTop: 8,
    marginBottom: 4,
  },
  linkBtn: {
    paddingVertical: 4,
  },
  link: {
    color: colors.teal,
    fontWeight: '700',
  },
  expiry: {
    color: colors.muted,
    fontSize: 12,
    marginBottom: 16,
  },
  input: {
    backgroundColor: colors.composer,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 18,
    letterSpacing: 3,
    color: colors.text,
    fontWeight: '700',
  },
  error: {
    color: colors.danger,
    marginTop: 8,
  },
  button: {
    marginTop: 16,
    backgroundColor: colors.green,
    borderRadius: 24,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 16,
  },
});
