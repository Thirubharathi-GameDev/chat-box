import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'chatbox.theme';

export const font = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
};

const shared = {
  danger: '#C44747',
  onHeader: '#F7F4EE',
};

export const themes = [
  {
    id: 'grove',
    name: 'Grove',
    line: 'Deep green, quiet paper',
    colors: {
      ...shared,
      header: '#12362F',
      headerDeep: '#0C2823',
      teal: '#1F6F62',
      green: '#1E8A5B',
      outgoing: '#E3F6DE',
      incoming: '#FFFFFF',
      background: '#F3EFE8',
      composer: '#E8E1D6',
      shell: '#E4DCD0',
      surface: '#FFFcf8',
      text: '#14211C',
      muted: '#6A756F',
      line: '#E4DDD4',
      onAccent: '#F7F4EE',
      overlay: 'rgba(12, 24, 20, 0.46)',
      day: 'rgba(255, 252, 248, 0.92)',
      quote: 'rgba(18, 54, 47, 0.08)',
    },
  },
  {
    id: 'love',
    name: 'Love',
    line: 'Blush, rose, warm light',
    colors: {
      ...shared,
      header: '#7A3144',
      headerDeep: '#5C2232',
      teal: '#C4536A',
      green: '#D4526E',
      outgoing: '#FDE7ED',
      incoming: '#FFFFFF',
      background: '#FFF5F6',
      composer: '#F8E4E9',
      shell: '#F3D5DC',
      surface: '#FFFCFC',
      text: '#3B1C24',
      muted: '#8A6670',
      line: '#F0DDE2',
      onAccent: '#FFF8F8',
      overlay: 'rgba(62, 24, 34, 0.46)',
      day: 'rgba(255, 252, 252, 0.92)',
      quote: 'rgba(122, 49, 68, 0.08)',
    },
  },
  {
    id: 'calm',
    name: 'Calm',
    line: 'Mist, sage, still water',
    colors: {
      ...shared,
      header: '#3E5854',
      headerDeep: '#2C403D',
      teal: '#6E938C',
      green: '#5C8A80',
      outgoing: '#E7F3EF',
      incoming: '#FFFFFF',
      background: '#F4F7F6',
      composer: '#E4EEEC',
      shell: '#D9E6E2',
      surface: '#FBFDFC',
      text: '#1C2A28',
      muted: '#6D7C78',
      line: '#E1E8E6',
      onAccent: '#F7FBFA',
      overlay: 'rgba(24, 40, 38, 0.46)',
      day: 'rgba(251, 253, 252, 0.92)',
      quote: 'rgba(62, 88, 84, 0.08)',
    },
  },
  {
    id: 'night',
    name: 'Night',
    line: 'Ink and a brass light',
    colors: {
      ...shared,
      danger: '#E07A7A',
      header: '#141816',
      headerDeep: '#0C0F0E',
      teal: '#C6A46A',
      green: '#C6A46A',
      outgoing: '#24302A',
      incoming: '#1C2220',
      background: '#0E1110',
      composer: '#161A18',
      shell: '#232826',
      surface: '#1A1F1D',
      text: '#F3EFE6',
      muted: '#A39B90',
      line: '#2A302D',
      onAccent: '#1A1612',
      overlay: 'rgba(0, 0, 0, 0.62)',
      day: 'rgba(28, 34, 32, 0.94)',
      quote: 'rgba(198, 164, 106, 0.14)',
    },
  },
  {
    id: 'dune',
    name: 'Dune',
    line: 'Sand, clay, late sun',
    colors: {
      ...shared,
      header: '#6B4A32',
      headerDeep: '#4C3423',
      teal: '#A56B3C',
      green: '#C4844A',
      outgoing: '#F6E7D4',
      incoming: '#FFFCF8',
      background: '#F8F1E7',
      composer: '#EFE2D2',
      shell: '#E7D5C2',
      surface: '#FFFCF8',
      text: '#2C2118',
      muted: '#7C6A5A',
      line: '#EADCCB',
      onAccent: '#FFF8F1',
      overlay: 'rgba(44, 33, 24, 0.46)',
      day: 'rgba(255, 252, 248, 0.92)',
      quote: 'rgba(107, 74, 50, 0.08)',
    },
  },
];

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [id, setId] = useState('grove');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved && themes.some((theme) => theme.id === saved)) setId(saved);
      })
      .catch(() => {});
  }, []);

  const value = useMemo(() => {
    const theme = themes.find((item) => item.id === id) || themes[0];
    return {
      id: theme.id,
      theme,
      colors: theme.colors,
      setTheme(next) {
        setId(next);
        AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
      },
    };
  }, [id]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}

export function useColors() {
  return useTheme().colors;
}
