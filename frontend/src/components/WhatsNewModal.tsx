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
import { a11yModal } from '@/src/services/a11y';
import { getMyFixedReports, markShown, type FixedReport } from '@/src/services/feedbackLoop';

export default function WhatsNewModal() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const [visible, setVisible] = React.useState(false);
  // v1.165 — обратный контур: что починили ПО РЕПОРТАМ этого человека. Раньше он
  // писал в пустоту: правки по его словам уезжали в Play, а он об этом не узнавал.
  // Пустой список — обычное дело (нет репортов / нет сети), блок просто не рисуется.
  const [mine, setMine] = React.useState<FixedReport[]>([]);

  React.useEffect(() => {
    (async () => {
      const seen = await getSeenVersion();
      const cur = currentVersion();
      if (!seen) { await setSeenVersion(cur); return; }   // первая установка — не показываем
      if (isNewer(cur, seen)) {
        setVisible(true);
        setMine(await getMyFixedReports());
      }
    })();
  }, []);

  const close = async () => {
    setVisible(false);
    await markShown(mine.map((r) => r.id));
    await setSeenVersion(currentVersion());
  };

  if (!visible) return null;
  const cur = currentVersion();
  // Все записи новее «уже виденной» (обычно одна — текущая)
  const entry = WHATS_NEW.find((e) => e.version === cur) || WHATS_NEW[0];
  const items = language === 'ru' ? entry.ru : entry.en;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={close}>
      <View {...a11yModal} style={styles.backdrop}>
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

            {/* Личный блок: его собственные слова и что по ним сделали. Стоит ПОСЛЕ
                общего списка намеренно — сначала «что нового вообще», потом «а вот
                это лично по твоей просьбе», так вторая часть читается как ответ. */}
            {mine.length > 0 && (
              <View style={[styles.mineBox, { borderColor: colors.primary }]}>
                <Text style={[styles.mineTitle, { color: colors.primary }]}>
                  {'\u270D\uFE0F  '}{t('fixedByYourReport')}
                </Text>
                {mine.slice(0, 5).map((r) => (
                  <View key={r.id} style={styles.mineRow}>
                    <Text style={[styles.mineQuote, { color: colors.textSecondary }]} numberOfLines={3}>
                      «{r.message.trim()}»
                    </Text>
                    <Text style={[styles.mineFix, { color: colors.text }]}>
                      → {r.fix_note}
                    </Text>
                  </View>
                ))}
                {mine.length > 5 && (
                  <Text style={[styles.mineThanks, { color: colors.textSecondary }]}>
                    {t('andMoreFixed').replace('{n}', String(mine.length - 5))}
                  </Text>
                )}
                <Text style={[styles.mineThanks, { color: colors.textSecondary }]}>
                  {t('thanksForReports')}
                </Text>
              </View>
            )}
          </ScrollView>
          <TouchableOpacity
            accessibilityRole="button" onPress={close} style={[styles.btn, { backgroundColor: colors.primary }]}>
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
  mineBox: { marginTop: 14, borderTopWidth: 1, paddingTop: 12, gap: 10 },
  mineTitle: { fontSize: 13, fontWeight: '800' },
  mineRow: { gap: 2 },
  mineQuote: { fontSize: 12.5, lineHeight: 17, fontStyle: 'italic' },
  mineFix: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  mineThanks: { fontSize: 12, lineHeight: 16, marginTop: 2 },
});
