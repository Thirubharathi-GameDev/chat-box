import { useEffect, useRef, useState } from 'react';
import { Dimensions, Keyboard, Platform, View } from 'react-native';

function reportedHeight(event) {
  const frame = event?.endCoordinates || {};
  const fromEvent = Math.round(frame.height || 0);
  const screenHeight = Dimensions.get('screen').height;
  const fromScreen = typeof frame.screenY === 'number' ? Math.max(0, Math.round(screenHeight - frame.screenY)) : 0;
  const metrics = typeof Keyboard.metrics === 'function' ? Keyboard.metrics() : null;
  const fromMetrics = Math.round(metrics?.height || 0);
  return Math.max(fromEvent, fromScreen, fromMetrics);
}

export function KeyboardScreen({ children, style, footerInset = 0 }) {
  const restHeight = useRef(0);
  const layoutHeight = useRef(0);
  const keyboardHeight = useRef(0);
  const open = useRef(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [inset, setInset] = useState(0);
  const applyRef = useRef(() => {});

  applyRef.current = () => {
    const height = keyboardHeight.current;
    if (!open.current || height < 12) {
      setInset(0);
      return;
    }
    const shrunk = Math.max(0, restHeight.current - layoutHeight.current);
    // Edge-to-edge Android keeps the window height. A small layout change is
    // not the keyboard, so the composer still needs the full keyboard inset.
    const resized = shrunk > height * 0.6 ? shrunk : 0;
    const remaining = Math.max(0, height - resized);
    setInset(remaining < 24 ? 0 : remaining);
  };

  useEffect(() => {
    const onShow = (event) => {
      const height = reportedHeight(event);
      if (height < 12) return;
      keyboardHeight.current = height;
      open.current = true;
      setKeyboardOpen(true);
      applyRef.current();
      setTimeout(() => applyRef.current(), 60);
      setTimeout(() => applyRef.current(), 240);
    };
    const onHide = () => {
      open.current = false;
      keyboardHeight.current = 0;
      setKeyboardOpen(false);
      setInset(0);
    };

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const subscriptions = [
      Keyboard.addListener(showEvent, onShow),
      Keyboard.addListener(hideEvent, onHide),
    ];
    if (Platform.OS === 'ios') {
      subscriptions.push(Keyboard.addListener('keyboardWillChangeFrame', onShow));
    }

    return () => {
      subscriptions.forEach((subscription) => subscription.remove());
    };
  }, []);

  return (
    <View
      collapsable={false}
      onLayout={(event) => {
        const height = Math.round(event.nativeEvent.layout.height);
        if (height < 1) return;
        layoutHeight.current = height;
        if (!open.current && height > restHeight.current) restHeight.current = height;
        if (open.current) applyRef.current();
      }}
      style={[{ flex: 1 }, style, { paddingBottom: keyboardOpen ? inset : footerInset }]}
    >
      {children}
    </View>
  );
}
