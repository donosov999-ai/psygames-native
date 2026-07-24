/**
 * WhatsNewModal — «Что нового» после обновления (запрос Дениса 23.07).
 * Показывается на главной один раз при росте версии (сравнение с
 * psygames_last_seen_version); полная история — экран /whats-new.
 */
import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { WHATS_NEW } from '@/src/constants/whatsNew';
import { currentVersion, getSeenVersion, isNewer, setSeenVersion } from '@/src/services/appUpdates';

export default function WhatsNewModal() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      const seen = await getSeenVersion();
      const cur = currentVersion();
      if (!seen) { await setSeenVersion(cur); return; }   // первая установка — не показываем
      if (isNewer(cur, seen)) setVisible(true);
    })();
  }, []);

  const close = async () => {
    setVisible(false);
    await setSeenVersion(currentVersion());
  };

  if (!visible) return null;
  const cur = currentVersion();
  // Все записи новее «уже виденной» (обычно одна — текущая)
  const entry = WHATS_NEW.find((e) => e.version === cur) || WHATS_NEW[0];
  const items = language === 'ru' ? entry.ru : entry.en;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.title, { color: colors.text }]}>
            🎁 {t('whatsNewTitle')} v{entry.version}
          </Text>
          <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
            {items.map((it, i) => (
              <View key={i} style={styles.row}>
                <Text style={[styles.dot, { color: colors.primary }]}>•</Text>
                <Text style={[styles.item, { color: colors.text }]}>{it}</Text>
              </View>
            ))}
          </ScrollView>
          <TouchableOpacity onPress={close} style={[styles.btn, { backgroundColor: colors.primary }]}>
            <Text style={styles.btnText}>{t('setGotIt')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { borderRadius: 18, padding: 20, width: '100%', maxWidth: 440, gap: 12 },
  title: { fontSize: 17, fontWeight: '800', textAlign: 'center' },
  row: { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'flex-start' },
  dot: { fontSize: 14, fontWeight: '900', lineHeight: 19 },
  item: { fontSize: 13.5, lineHeight: 19, flex: 1 },
  btn: { borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 14.5, fontWeight: '800' },
});
