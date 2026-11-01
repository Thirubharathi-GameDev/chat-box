import { Ionicons } from '@expo/vector-icons';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, Modal, Pressable, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { clearLock, loadLock, LOCK_INTERVALS, MAX_PIN_ATTEMPTS, saveLock } from '../appLock';
import { font, useColors } from '../theme';

const AppLockContext = createContext(null);

function PinDots({ length, colors }) {
  return (
    <View style={{ flexDirection: 'row', gap: 14, marginTop: 22, marginBottom: 8 }}>
      {Array.from({ length: 4 }, (_, index) => (
        <View
          key={index}
          style={{
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: index < length ? colors.header : 'transparent',
            borderWidth: 1.5,
            borderColor: colors.header,
          }}
        />
      ))}
    </View>
  );
}

function PinPad({ value, onChange, colors }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
  return (
    <View style={{ width: 280, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
      {keys.map((key) => {
        if (!key) return <View key="gap" style={{ width: 84, height: 72 }} />;
        return (
          <Pressable
            key={key}
            onPress={() => {
              if (key === 'del') onChange(value.slice(0, -1));
              else if (value.length < 4) onChange(`${value}${key}`);
            }}
            style={({ pressed }) => ({
              width: 84,
              height: 72,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.55 : 1,
            })}
          >
            {key === 'del' ? (
              <Ionicons name="backspace-outline" size={26} color={colors.text} />
            ) : (
              <Text style={{ color: colors.text, fontFamily: font.semibold, fontSize: 28 }}>{key}</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

export function AppLockProvider({ children }) {
  const { user, logout } = useAuth();
  const colors = useColors();
  const [lock, setLock] = useState(null);
  const [locked, setLocked] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [draft, setDraft] = useState('');
  const [entry, setEntry] = useState('');
  const [error, setError] = useState('');
  const lockRef = useRef(null);
  lockRef.current = lock;

  useEffect(() => {
    let cancel = false;
    setLocked(false);
    setSheet(null);
    setEntry('');
    setDraft('');
    setError('');
    if (!user?.id) {
      setLock(null);
      return undefined;
    }
    loadLock(user.id).then((saved) => {
      if (cancel) return;
      setLock(saved);
      if (saved?.lastHiddenAt && Date.now() - saved.lastHiddenAt >= saved.intervalMs) setLocked(true);
    });
    return () => {
      cancel = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return undefined;
    const sub = AppState.addEventListener('change', (state) => {
      const current = lockRef.current;
      if (!current?.pin) return;
      if (state === 'background') {
        const next = { ...current, lastHiddenAt: Date.now() };
        lockRef.current = next;
        setLock(next);
        saveLock(user.id, next).catch(() => {});
        return;
      }
      if (state === 'active' && current.lastHiddenAt && Date.now() - current.lastHiddenAt >= current.intervalMs) {
        setLocked(true);
      }
    });
    return () => sub.remove();
  }, [user?.id]);

  useEffect(() => {
    if (!locked && !sheet) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [locked, sheet]);

  async function wipeAndLogout() {
    if (user?.id) await clearLock(user.id);
    setLock(null);
    setLocked(false);
    setSheet(null);
    await logout();
  }

  async function finishSetup(intervalMs) {
    const next = { pin: draft, intervalMs, failures: 0, lastHiddenAt: Date.now() };
    await saveLock(user.id, next);
    setLock(next);
    setSheet(null);
    setDraft('');
    setEntry('');
    setError('');
  }

  async function submitEntry(value) {
    if (value.length < 4) return;
    if (sheet === 'create') {
      setDraft(value);
      setEntry('');
      setError('');
      setSheet('confirm');
      return;
    }
    if (sheet === 'confirm') {
      if (value !== draft) {
        setEntry('');
        setError('Those PINs do not match. Start again.');
        setDraft('');
        setSheet('create');
        return;
      }
      setEntry('');
      setError('');
      setSheet('frequency');
      return;
    }
    if (sheet === 'disable') {
      if (value !== lock?.pin) {
        const failures = (lock?.failures || 0) + 1;
        if (failures >= MAX_PIN_ATTEMPTS) {
          await wipeAndLogout();
          return;
        }
        const next = { ...lock, failures };
        setLock(next);
        await saveLock(user.id, next);
        setEntry('');
        setError(`${MAX_PIN_ATTEMPTS - failures} attempts left.`);
        return;
      }
      await clearLock(user.id);
      setLock(null);
      setSheet(null);
      setEntry('');
      setError('');
      return;
    }
    if (!locked || !lock) return;
    if (value !== lock.pin) {
      const failures = (lock.failures || 0) + 1;
      if (failures >= MAX_PIN_ATTEMPTS) {
        await wipeAndLogout();
        return;
      }
      const next = { ...lock, failures };
      setLock(next);
      await saveLock(user.id, next);
      setEntry('');
      setError(`${MAX_PIN_ATTEMPTS - failures} attempts left.`);
      return;
    }
    const next = { ...lock, failures: 0, lastHiddenAt: Date.now() };
    setLock(next);
    await saveLock(user.id, next);
    setLocked(false);
    setEntry('');
    setError('');
  }

  function changeEntry(value) {
    setEntry(value);
    if (value.length === 4) submitEntry(value);
  }

  const title = sheet === 'create'
    ? 'Choose a 4-digit PIN'
    : sheet === 'confirm'
      ? 'Enter the PIN again'
      : sheet === 'disable'
        ? 'Enter your PIN to turn off the lock'
        : 'Enter your PIN';

  const value = {
    enabled: Boolean(lock?.pin),
    intervalMs: lock?.intervalMs || LOCK_INTERVALS[0].ms,
    beginSetup() {
      setDraft('');
      setEntry('');
      setError('');
      setSheet('create');
    },
    beginDisable() {
      setEntry('');
      setError('');
      setSheet('disable');
    },
    async chooseInterval(intervalMs) {
      if (!user?.id || !lock?.pin) return;
      const next = { ...lock, intervalMs, lastHiddenAt: Date.now() };
      setLock(next);
      await saveLock(user.id, next);
    },
    cancelSetup() {
      setSheet(null);
      setDraft('');
      setEntry('');
      setError('');
    },
  };

  return (
    <AppLockContext.Provider value={value}>
      <View style={{ flex: 1 }}>
        {children}
        {locked ? (
          <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Ionicons name="lock-closed" size={28} color={colors.header} />
            <Text style={{ color: colors.text, fontFamily: font.bold, fontSize: 28, marginTop: 16 }}>{title}</Text>
            <Text style={{ color: colors.danger, fontFamily: font.medium, marginTop: 8, minHeight: 20 }}>{error}</Text>
            <PinDots length={entry.length} colors={colors} />
            <PinPad value={entry} onChange={changeEntry} colors={colors} />
          </View>
        ) : null}
      </View>
      <Modal visible={Boolean(sheet)} animationType="slide" onRequestClose={() => {}}>
        <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          {sheet === 'frequency' ? (
            <>
              <Text style={{ color: colors.text, fontFamily: font.bold, fontSize: 28, textAlign: 'center' }}>Lock after</Text>
              <Text style={{ color: colors.muted, fontFamily: font.medium, marginTop: 8, marginBottom: 22, textAlign: 'center', lineHeight: 20 }}>
                Kin asks for the PIN when you come back after this long.
              </Text>
              {LOCK_INTERVALS.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => finishSetup(item.ms)}
                  style={{ width: '100%', backgroundColor: colors.surface, borderRadius: 18, padding: 16, marginBottom: 10 }}
                >
                  <Text style={{ color: colors.text, fontFamily: font.bold, fontSize: 16 }}>{item.label}</Text>
                </Pressable>
              ))}
            </>
          ) : (
            <>
              <Text style={{ color: colors.text, fontFamily: font.bold, fontSize: 28, textAlign: 'center' }}>{title}</Text>
              <Text style={{ color: colors.danger, fontFamily: font.medium, marginTop: 8, minHeight: 20, textAlign: 'center' }}>{error}</Text>
              <PinDots length={entry.length} colors={colors} />
              <PinPad value={entry} onChange={changeEntry} colors={colors} />
              <Pressable onPress={value.cancelSetup} style={{ marginTop: 12, padding: 10 }}>
                <Text style={{ color: colors.muted, fontFamily: font.semibold }}>Cancel</Text>
              </Pressable>
            </>
          )}
        </View>
      </Modal>
    </AppLockContext.Provider>
  );
}

export function useAppLock() {
  const value = useContext(AppLockContext);
  if (!value) throw new Error('useAppLock must be used inside AppLockProvider');
  return value;
}
