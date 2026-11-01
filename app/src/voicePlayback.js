import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

const native = requireOptionalNativeModule('VoiceRoute');

async function applyExpoMode(earpiece) {
  await setAudioModeAsync({
    allowsRecording: Platform.OS === 'ios' && earpiece,
    playsInSilentMode: true,
    interruptionMode: 'doNotMix',
    shouldPlayInBackground: false,
    shouldRouteThroughEarpiece: earpiece,
  });
}

function createNativeController({ uri, onUpdate }) {
  const subscription = native.addListener('status', (status) => {
    onUpdate({
      position: Number(status?.position) || 0,
      duration: Number(status?.duration) || 0,
      didFinish: Boolean(status?.didFinish),
    });
  });
  return {
    play(earpiece, position = 0) {
      return native.play(uri, Boolean(earpiece), Number(position) || 0);
    },
    seek(position) {
      native.seek(Number(position) || 0);
    },
    resume() {
      native.resume();
    },
    setEarpiece(earpiece) {
      return native.setEarpiece(Boolean(earpiece));
    },
    pause() {
      native.pause();
    },
    stop() {
      subscription.remove();
      native.stop();
    },
  };
}

function createExpoController({ uri, onUpdate }) {
  let player = null;
  let ticket = 0;
  let earpieceOn = false;
  let pausedAt = 0;

  function attach(next, id) {
    next.addListener('playbackStatusUpdate', (status) => {
      if (id !== ticket) return;
      onUpdate({
        position: status.currentTime || 0,
        duration: status.duration || 0,
        didFinish: Boolean(status.didJustFinish),
      });
    });
  }

  async function start(earpiece, position) {
    ticket += 1;
    const id = ticket;
    await applyExpoMode(earpiece);
    player?.remove();
    player = createAudioPlayer(uri);
    attach(player, id);
    if (position > 0.05) await player.seekTo(position);
    player.play();
  }

  return {
    play(earpiece, position = 0) {
      earpieceOn = Boolean(earpiece);
      pausedAt = Number(position) || 0;
      return start(earpieceOn, pausedAt);
    },
    async seek(position) {
      pausedAt = Number(position) || 0;
      if (player) await player.seekTo(pausedAt);
    },
    resume() {
      if (player && !player.playing) {
        player.play();
        return undefined;
      }
      return start(earpieceOn, pausedAt);
    },
    async setEarpiece(earpiece) {
      earpieceOn = Boolean(earpiece);
      const position = player?.currentTime || pausedAt;
      if (!player?.playing) {
        await applyExpoMode(earpieceOn);
        return;
      }
      await start(earpieceOn, position);
    },
    pause() {
      pausedAt = player?.currentTime || pausedAt;
      player?.pause();
    },
    stop() {
      ticket += 1;
      player?.remove();
      player = null;
    },
  };
}

export function createVoiceController(options) {
  if (native) return createNativeController(options);
  return createExpoController(options);
}
