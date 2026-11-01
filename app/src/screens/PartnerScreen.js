import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { Avatar } from '../components/Avatar';
import { Field, PrimaryButton } from '../components/Field';
import { Header } from '../components/Header';
import { partnerTitle } from '../format';
import { useChat } from '../state/ChatContext';
import { font, useColors } from '../theme';
import { KeyboardScreen } from '../useKeyboardInset';

export function PartnerScreen({ navigation }) {
  const { token, applyUser } = useAuth();
  const { conversation, setConversation } = useChat();
  const colors = useColors();
  const partner = conversation?.partner;
  const [nickname, setNickname] = useState(partner?.nickname || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setSaving(true);
    setError('');
    try {
      const data = await api('/api/me/nickname', { token, method: 'PATCH', body: { nickname } });
      applyUser(data.user);
      setConversation((current) =>
        current
          ? { ...current, partner: { ...current.partner, nickname: data.user.partnerNickname || '' } }
          : current
      );
      navigation.goBack();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardScreen style={{ backgroundColor: colors.background }}>
      <Header title="Contact" onBack={() => navigation.goBack()} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 28, paddingBottom: 36 }}>
        <View style={{ alignItems: 'center', marginBottom: 22 }}>
          <Avatar name={partnerTitle(partner)} photoUrl={partner?.photoUrl} size={120} online={Boolean(partner?.online)} />
          <Text style={{ color: colors.text, fontFamily: font.bold, fontSize: 28, marginTop: 16 }}>{partner?.displayName || 'Chat'}</Text>
          <Text style={{ color: colors.muted, fontFamily: font.medium, marginTop: 4 }}>User ID · {partner?.userId}</Text>
        </View>
        <Field label="Nickname" value={nickname} onChangeText={setNickname} placeholder="Name you want to see" maxLength={40} />
        <Text style={{ color: colors.muted, fontFamily: font.medium, lineHeight: 20, marginBottom: 16 }}>
          Only you see this name. Their profile stays the same on their phone.
        </Text>
        {error ? <Text style={{ color: colors.danger, fontFamily: font.medium, marginBottom: 10 }}>{error}</Text> : null}
        <PrimaryButton label="Save nickname" onPress={save} busy={saving} icon="check" />
      </ScrollView>
    </KeyboardScreen>
  );
}
