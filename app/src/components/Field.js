import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { font, useColors } from '../theme';

export function Field({ label, revealable = false, secureTextEntry, ...inputProps }) {
  const colors = useColors();
  const [hidden, setHidden] = useState(true);
  const secure = revealable ? hidden : secureTextEntry;
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? (
        <Text
          style={{
            color: colors.muted,
            fontFamily: font.semibold,
            fontSize: 12,
            letterSpacing: 0.6,
            marginBottom: 8,
            textTransform: 'uppercase',
          }}
        >
          {label}
        </Text>
      ) : null}
      <View style={{ backgroundColor: colors.shell, borderRadius: 22, padding: 5 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.surface,
            borderRadius: 17,
          }}
        >
          <TextInput
            placeholderTextColor={colors.muted}
            secureTextEntry={secure}
            {...inputProps}
            style={{
              flex: 1,
              paddingHorizontal: 16,
              paddingVertical: 14,
              paddingRight: revealable ? 8 : 16,
              fontSize: 16,
              color: colors.text,
              fontFamily: font.medium,
            }}
          />
          {revealable ? (
            <Pressable
              onPress={() => setHidden((value) => !value)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
              style={{ paddingRight: 14, paddingLeft: 4 }}
            >
              <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={22} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export function PrimaryButton({ label, onPress, busy, icon = 'arrow-forward' }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => ({
        backgroundColor: colors.green,
        borderRadius: 999,
        minHeight: 56,
        paddingLeft: 22,
        paddingRight: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        transform: [{ scale: pressed ? 0.98 : 1 }],
        opacity: pressed ? 0.94 : 1,
      })}
    >
      <Text style={{ color: colors.onAccent, fontFamily: font.bold, fontSize: 16 }}>{busy ? 'Please wait' : label}</Text>
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: 'rgba(255,255,255,0.16)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {busy ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <Text style={{ color: colors.onAccent, fontSize: 18 }}>{icon === 'arrow-forward' ? '↗' : '✓'}</Text>
        )}
      </View>
    </Pressable>
  );
}

export function Eyebrow({ children, light = false }) {
  const colors = useColors();
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: light ? 'rgba(247,244,238,0.16)' : colors.shell,
        marginBottom: 12,
      }}
    >
      <Text
        style={{
          color: light ? colors.onHeader : colors.teal,
          fontFamily: font.semibold,
          fontSize: 10,
          letterSpacing: 1.8,
          textTransform: 'uppercase',
        }}
      >
        {children}
      </Text>
    </View>
  );
}
