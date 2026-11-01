import { Ionicons } from '@expo/vector-icons';
import {
  RecordingPresets,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../theme';
import { EmojiPanel } from './EmojiPanel';

export function Composer({ onSendText, onPickImage, onVoice, disabled }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [text, setText] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const activeRef = useRef(false);
  const cancelRef = useRef(false);
  const startedAt = useRef(0);

  async function sendText() {
    const value = text.trim();
    if (!value || disabled) return;
    setText('');
    setEmojiOpen(false);
    await onSendText(value);
  }

  async function beginRecording() {
    if (disabled || activeRef.current) return;
    const current = await getRecordingPermissionsAsync();
    if (!current.granted) {
      const asked = await requestRecordingPermissionsAsync();
      if (!asked.granted) {
        Alert.alert('Microphone', 'Allow microphone access to send voice messages.');
      }
      return;
    }

    cancelRef.current = false;
    activeRef.current = true;
    try {
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      });
      await recorder.prepareToRecordAsync();
      if (cancelRef.current) {
        activeRef.current = false;
        return;
      }
      recorder.record();
      startedAt.current = Date.now();
      setRecording(true);
    } catch {
      activeRef.current = false;
      setRecording(false);
      Alert.alert('Voice message', 'Could not start recording.');
    }
  }

  async function finishRecording() {
    if (!activeRef.current) {
      cancelRef.current = true;
      return;
    }
    const cancelled = cancelRef.current;
    cancelRef.current = false;
    activeRef.current = false;
    setRecording(false);
    try {
      if (recorder.isRecording) await recorder.stop();
    } catch {
      return;
    }
    const durationMs = Date.now() - startedAt.current;
    if (cancelled || durationMs < 700 || !recorder.uri) return;
    await onVoice(recorder.uri, durationMs);
  }

  function cancelRecording() {
    cancelRef.current = true;
    finishRecording();
  }

  return (
    <View>
      {emojiOpen ? <EmojiPanel onPick={(emoji) => setText((current) => `${current}${emoji}`)} /> : null}
      {recording ? (
        <View style={styles.recording}>
          <View style={styles.dot} />
          <Text style={styles.recordingText}>Recording… release to send</Text>
          <Pressable onPress={cancelRecording} hitSlop={8}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.bar}>
        <Pressable style={styles.icon} onPress={() => setEmojiOpen((open) => !open)} disabled={disabled}>
          <Ionicons name={emojiOpen ? 'keypad-outline' : 'happy-outline'} size={26} color={colors.muted} />
        </Pressable>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Message"
          placeholderTextColor={colors.muted}
          style={styles.input}
          multiline
          maxLength={4000}
          editable={!disabled}
        />
        <Pressable style={styles.icon} onPress={onPickImage} disabled={disabled}>
          <Ionicons name="image-outline" size={26} color={colors.muted} />
        </Pressable>
        {text.trim() ? (
          <Pressable style={styles.send} onPress={sendText} disabled={disabled}>
            <Ionicons name="send" size={18} color={colors.white} />
          </Pressable>
        ) : (
          <Pressable
            style={styles.send}
            onPressIn={beginRecording}
            onPressOut={finishRecording}
            disabled={disabled}
          >
            <Ionicons name="mic" size={20} color={colors.white} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingTop: 8,
    backgroundColor: colors.background,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    backgroundColor: colors.white,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 16,
    color: colors.text,
    marginHorizontal: 4,
  },
  icon: {
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  recording: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: colors.background,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.danger,
    marginRight: 8,
  },
  recordingText: {
    flex: 1,
    color: colors.danger,
    fontWeight: '600',
  },
  cancel: {
    color: colors.muted,
    fontWeight: '700',
  },
});
