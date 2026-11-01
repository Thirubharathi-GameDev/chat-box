import { useEffect, useRef, useState } from 'react';
import { Dimensions, Keyboard, Platform, View } from 'react-native';

function reportedHeight(event) {
  const frame = event?.endCoordinates || {};
  const height = Math.round(frame.height || 0);
  if (height > 0) return height;
  if (typeof frame.screenY !== 'number') return 0;
  return Math.max(0, Math.round(Dimensions.get('screen').height - frame.screenY));
}

export function KeyboardScreen({ children, style, footerInset = 0 }) {
  const restHeight = useRef(0);
  const layoutHeight = useRef(0);
  const keyboardHeight = useRef(0);
  const open = useRef(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [inset, setInset] = useState(0);
  const applyRef = useRef(() => {});

  applyRef.current = (allowLift) => {
    if (!open.current || keyboardHeight.current < 12) {
      setInset(0);
      return;
    }
    const shrunk = Math.max(0, restHeight.current - layoutHeight.current);
    const remaining = keyboardHeight.current - shrunk;
    if (remaining < 48) {
      setInset(0);
      return;
    }
    if (!allowLift) return;
    const limit = Math.round((restHeight.current || layoutHeight.current || 0) * 0.5);
    setInset(limit > 0 ? Math.min(Math.round(remaining), limit) : Math.round(remaining));
  };

  useEffect(() => {
    const onShow = (event) => {
      const height = reportedHeight(event);
      if (height < 12) return;
      keyboardHeight.current = height;
      open.current = true;
      setKeyboardOpen(true);
      setTimeout(() => applyRef.current(true), 80);
      setTimeout(() => applyRef.current(true), 260);
    };
    const onHide = () => {
      open.current = false;
      keyboardHeight.current = 0;
      setKeyboardOpen(false);
      setInset(0);
    };

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, onShow);
    const change = Platform.OS === 'ios' ? Keyboard.addListener('keyboardWillChangeFrame', onShow) : null;
    const hide = Keyboard.addListener(hideEvent, onHide);

    return () => {
      show.remove();
      change?.remove();
      hide.remove();
    };
  }, []);

  return (
    <View
      collapsable={false}
      onLayout={(event) => {
        const height = Math.round(event.nativeEvent.layout.height);
        if (height < 1) return;
        layoutHeight.current = height;
        if (height > restHeight.current) restHeight.current = height;
        if (open.current) applyRef.current(false);
      }}
      style={[{ flex: 1 }, style, { paddingBottom: keyboardOpen ? inset : footerInset }]}
    >
      {children}
    </View>
  );
}
