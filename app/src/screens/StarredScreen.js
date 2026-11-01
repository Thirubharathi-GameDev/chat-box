import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { applyMarks, loadMarks, loadMessages } from '../cache';
import { Header } from '../components/Header';
import { listTime, previewLabel } from '../format';
import { useChat } from '../state/ChatContext';
import { font, useColors } from '../theme';

export function StarredScreen({ navigation }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { token, user } = useAuth();
  const { conversation } = useChat();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!conversation?.id || !user?.id) {
      setLoading(false);
      return undefined;
    }
    let cancel = false;
    Promise.all([
      loadMessages(user.id, conversation.id),
      loadMarks(user.id, conversation.id),
      api(`/api/conversation/${conversation.id}/starred`, { token }).catch(() => ({ messages: [] })),
    ]).then(([cached, marks, remote]) => {
      if (cancel) return;
      const hidden = new Set(marks.hidden);
      const map = new Map();
      applyMarks(cached, marks)
        .filter((message) => message.starred && message.id)
        .forEach((message) => map.set(message.id, message));
      (remote.messages || []).forEach((message) => {
        if (hidden.has(message.id) || marks.unstarred.includes(message.id)) return;
        map.set(message.id, { ...map.get(message.id), ...message, starred: true });
      });
      const list = [...map.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setItems(list);
      setLoading(false);
    });
    return () => {
      cancel = true;
    };
  }, [conversation?.id, token, user?.id]);

  return (
    <View style={styles.screen}>
      <Header title="Starred" onBack={() => navigation.goBack()} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.teal} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="star-outline" size={56} color={colors.teal} />
          <Text style={styles.empty}>No starred messages yet</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {items.map((message) => (
            <Pressable key={message.id} style={styles.row} onPress={() => navigation.navigate('Chat', { focusId: message.id })}>
              <Ionicons name="star" size={16} color={colors.teal} />
              <View style={styles.body}>
                <Text style={styles.text} numberOfLines={2}>
                  {previewLabel(message)}
                </Text>
                <Text style={styles.time}>{listTime(message.createdAt)}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    empty: {
      marginTop: 14,
      color: colors.muted,
      fontFamily: font.semibold,
      fontSize: 16,
    },
    list: {
      padding: 16,
      gap: 10,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      backgroundColor: colors.surface,
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    body: {
      flex: 1,
    },
    text: {
      color: colors.text,
      fontFamily: font.medium,
      fontSize: 15,
    },
    time: {
      marginTop: 4,
      color: colors.muted,
      fontFamily: font.medium,
      fontSize: 12,
    },
  });
}
