import { Ionicons } from '@expo/vector-icons';
import {
  RecordingPresets,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { useMemo } from 'react';
import { Alert, Animated, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { durationLabel } from '../format';
import { font, useColors } from '../theme';
import { EmojiPanel } from './EmojiPanel';
import { downsampleLevels, normalizeMeter } from './Waveform';

export function Composer({ onSendText, onPickImage, onVoice, onTyping, onRecording, disabled, reply, onCancelReply, draft = '', onDraft, editing, onCancelEdit, onSubmitEdit }) {
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
    numberOfChannels: 1,
    bitRate: 32000,
    sampleRate: 22050,
    android: {
      ...RecordingPresets.HIGH_QUALITY.android,
      sampleRate: 22050,
      bitRate: 32000,
    },
    ios: {
      ...RecordingPresets.HIGH_QUALITY.ios,
      sampleRate: 22050,
      bitRate: 32000,
    },
    web: {
      mimeType: 'audio/webm',
      bitsPerSecond: 32000,
    },
  });
  const recorderState = useAudioRecorderState(recorder, 80);
  const [text, setText] = useState(draft);
  const inputRef = useRef(null);
  const keepFocus = useRef(false);
  const textRef = useRef(draft);
  const dirty = useRef(false);
  textRef.current = text;
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const activeRef = useRef(false);
  const cancelRef = useRef(false);
  const startedAt = useRef(0);
  const sessionRef = useRef(0);
  const samplesRef = useRef([]);
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState([]);
  const [armed, setArmed] = useState(false);
  const slide = useRef(new Animated.Value(0)).current;
  const armedRef = useRef(false);
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  useEffect(() => {
    if (dirty.current) return;
    if (draft && draft !== textRef.current) setText(draft);
  }, [draft]);

  useEffect(() => {
    if (!editing?.id) return;
    dirty.current = true;
    setText(editing.text || '');
  }, [editing?.id]);

  function updateText(value) {
    dirty.current = true;
    setText(value);
    if (!editing?.id) onDraft?.(value);
  }

  const recordingNotify = useRef(onRecording);
  recordingNotify.current = onRecording;
  useEffect(() => () => recordingNotify.current?.(false), []);

  useEffect(() => {
    if (!recording) return undefined;
    const timer = setInterval(() => setElapsed(Date.now() - startedAt.current), 200);
    return () => clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    if (!recording || !recorderState.isRecording) return;
    const level = normalizeMeter(recorderState.metering);
    samplesRef.current.push(level);
    setLevels(samplesRef.current.slice(-32));
  }, [recording, recorderState.durationMillis, recorderState.isRecording, recorderState.metering]);

  async function sendText() {
    const value = text.trim();
    if (!value || disabled) return;
    if (editing?.id) {
      dirty.current = true;
      setText(draft || '');
      onTyping?.(false);
      onSubmitEdit?.(editing.id, value);
      return;
    }
    dirty.current = true;
    setText('');
    onDraft?.('');
    setEmojiOpen(false);
    onTyping?.(false);
    await onSendText(value);
  }

  async function beginRecording() {
    if (disabled || activeRef.current) return;
    const current = await getRecordingPermissionsAsync();
    if (!current.granted) {
      keepFocus.current = false;
      const asked = await requestRecordingPermissionsAsync();
      if (!asked.granted) {
        Alert.alert('Microphone', 'Allow microphone access to send voice messages.');
      }
      return;
    }

    cancelRef.current = false;
    activeRef.current = true;
    const session = sessionRef.current + 1;
    sessionRef.current = session;
    try {
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      });
      await recorder.prepareToRecordAsync();
      if (sessionRef.current !== session || cancelRef.current) {
        activeRef.current = false;
        return;
      }
      samplesRef.current = [];
      setLevels([]);
      recorder.record();
      startedAt.current = Date.now();
      setRecording(true);
      onTyping?.(false);
      onRecording?.(true);
    } catch {
      activeRef.current = false;
      setRecording(false);
      onRecording?.(false);
      Alert.alert('Voice message', 'Could not start recording.');
    }
  }

  async function finishRecording() {
    if (!activeRef.current) {
      cancelRef.current = true;
      releaseKeyboard();
      return;
    }
    const cancelled = cancelRef.current;
    cancelRef.current = false;
    activeRef.current = false;
    sessionRef.current += 1;
    setRecording(false);
    onRecording?.(false);
    let uri = '';
    let durationMs = 0;
    let waveform = [];
    try {
      if (recorder.isRecording) await recorder.stop();
      durationMs = Date.now() - startedAt.current;
      waveform = downsampleLevels(samplesRef.current, 36).map((level) => Math.round(level * 100));
      uri = recorder.uri || '';
    } catch {
      uri = '';
    } finally {
      samplesRef.current = [];
      setLevels([]);
      releaseKeyboard();
    }
    if (cancelled || durationMs < 700 || !uri) return;
    await onVoice(uri, durationMs, waveform);
  }

  function holdKeyboard() {
    keepFocus.current = true;
    inputRef.current?.focus();
  }

  function releaseKeyboard() {
    inputRef.current?.focus();
    setTimeout(() => {
      keepFocus.current = false;
    }, 400);
  }

  const actions = useRef({});
  actions.current = { begin: beginRecording, finish: finishRecording, holdKeyboard, disabled };
  const micPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => {
        if (actions.current.disabled) return false;
        actions.current.holdKeyboard();
        return true;
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        slide.setValue(0);
        armedRef.current = false;
        setArmed(false);
        actions.current.begin();
      },
      onPanResponderMove: (_, gesture) => {
        const x = Math.max(-140, Math.min(0, gesture.dx));
        slide.setValue(x);
        const next = x <= -88;
        if (next === armedRef.current) return;
        armedRef.current = next;
        cancelRef.current = next;
        setArmed(next);
      },
      onPanResponderRelease: () => {
        actions.current.finish();
        slide.setValue(0);
        armedRef.current = false;
        setArmed(false);
      },
      onPanResponderTerminate: () => {
        if (!armedRef.current) cancelRef.current = false;
        actions.current.finish();
        slide.setValue(0);
        armedRef.current = false;
        setArmed(false);
      },
    })
  ).current;

  return (
    <ScrollView keyboardShouldPersistTaps="always" keyboardDismissMode="none" scrollEnabled={false} bounces={false} style={styles.wrap}>
      {emojiOpen ? <EmojiPanel onPick={(emoji) => updateText(`${textRef.current}${emoji}`)} /> : null}
      {editing?.id && !recording ? (
        <View style={styles.reply}>
          <View style={styles.replyBody}>
            <Text style={styles.replyName}>Edit message</Text>
            <Text style={styles.replyText} numberOfLines={1}>
              {editing.text}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              dirty.current = true;
              setText(draft || '');
              onCancelEdit?.();
            }}
            hitSlop={8}
          >
            <Ionicons name="close" size={20} color={colors.muted} />
          </Pressable>
        </View>
      ) : null}
      {reply && !recording && !editing?.id ? (
        <View style={styles.reply}>
          <View style={styles.replyBody}>
            <Text style={styles.replyName} numberOfLines={1}>
              {reply.author}
            </Text>
            <View style={styles.replyLine}>
              {reply.type === 'voice' ? <Ionicons name="mic" size={14} color={colors.muted} /> : null}
              <Text style={styles.replyText} numberOfLines={1}>
                {reply.text}
              </Text>
            </View>
          </View>
          <Pressable onPress={onCancelReply} hitSlop={8}>
            <Ionicons name="close" size={20} color={colors.muted} />
          </Pressable>
        </View>
      ) : null}
      <View style={styles.bar}>
        {recording ? null : (
          <Pressable style={styles.icon} onPress={() => setEmojiOpen((open) => !open)} disabled={disabled}>
            <Ionicons name={emojiOpen ? 'keypad-outline' : 'happy-outline'} size={26} color={colors.muted} />
          </Pressable>
        )}
        <View style={styles.field}>
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={(value) => {
              updateText(value);
              onTyping?.(Boolean(value.trim()));
            }}
            onBlur={() => {
              if (!keepFocus.current) return;
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
            placeholder="Message"
            placeholderTextColor={colors.muted}
            style={[styles.input, recording && styles.inputHidden]}
            multiline
            maxLength={4000}
            blurOnSubmit={false}
            editable={!disabled}
          />
          {recording ? (
            <View pointerEvents="none" style={styles.recordSlot}>
              <View style={styles.dot} />
              <Text style={styles.timer}>{durationLabel(elapsed)}</Text>
              <Text style={[styles.slideHint, armed && styles.slideHintArmed]} numberOfLines={1}>
                {armed ? 'Release to cancel' : '‹  Slide to cancel'}
              </Text>
            </View>
          ) : null}
        </View>
        {recording || editing?.id ? null : (
          <Pressable style={styles.icon} onPress={onPickImage} disabled={disabled}>
            <Ionicons name="image-outline" size={26} color={colors.muted} />
          </Pressable>
        )}
        {text.trim() && !recording ? (
          <Pressable style={styles.send} onPress={sendText} disabled={disabled}>
            <Ionicons name={editing?.id ? 'checkmark' : 'send'} size={18} color={colors.onAccent} />
          </Pressable>
        ) : editing?.id ? (
          <Pressable style={[styles.send, styles.sendIdle]} disabled>
            <Ionicons name="checkmark" size={18} color={colors.onAccent} />
          </Pressable>
        ) : (
          <Animated.View style={{ transform: [{ translateX: slide }] }} {...micPan.panHandlers}>
            <View style={styles.send}>
              <Ionicons name="mic" size={20} color={colors.onAccent} />
            </View>
          </Animated.View>
        )}
      </View>
    </ScrollView>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
  wrap: {
    flexGrow: 0,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingTop: 8,
    backgroundColor: colors.background,
  },
  field: {
    flex: 1,
    marginHorizontal: 4,
    justifyContent: 'flex-end',
  },
  input: {
    maxHeight: 120,
    backgroundColor: colors.surface,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 16,
    color: colors.text,
    fontFamily: font.medium,
  },
  inputHidden: {
    opacity: 0,
  },
  recordSlot: {
    ...StyleSheet.absoluteFillObject,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: 22,
    paddingHorizontal: 12,
  },
  icon: {
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIdle: {
    opacity: 0.45,
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
  reply: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderLeftWidth: 3,
    borderLeftColor: colors.header,
    borderRadius: 8,
  },
  replyBody: {
    flex: 1,
    marginRight: 8,
  },
  replyName: {
    color: colors.header,
    fontFamily: font.bold,
    fontSize: 13,
  },
  replyLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  replyText: {
    color: colors.muted,
    fontFamily: font.medium,
    fontSize: 13,
    flexShrink: 1,
  },
  timer: {
    color: colors.danger,
    fontFamily: font.bold,
    minWidth: 36,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.danger,
    marginRight: 8,
  },
  slideHint: {
    flex: 1,
    color: colors.muted,
    fontFamily: font.semibold,
    fontSize: 14,
  },
  slideHintArmed: {
    color: colors.danger,
  },
  });
}
