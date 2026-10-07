/**
 * WhatsNewModal — «Что нового» после обновления (запрос Дениса 23.07).
 * Общий корень показывает ВСЕ версии после последней просмотренной, включая
 * пропущенные обновления. Сохраняем просмотр только по кнопке «Понятно».
 */
import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { type WhatsNewEntry } from '@/src/constants/whatsNew';
import { currentVersion, getSeenVersion, setSeenVersion } from '@/src/services/appUpdates';
import { unreadReleaseNotes } from '@/src/services/releaseNotes';
import { a11yModal } from '@/src/services/a11y';
import { getMyFixedReports, markShown, type FixedReport } from '@/src/services/feedbackLoop';

export default function WhatsNewModal() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const [visible, setVisible] = React.useState(false);
  // Форма отзыва из нативной игры открывается вторым WebView на /feedback с тем же
  // хранилищем (задача e780e5b0): окно версий там всплывало бы поверх формы. Адрес —
  // из window, а не из роутера: окно монтируется в корне и в пробах без роутера.
  const onFeedbackPage = typeof window !== 'undefined' && window.location?.pathname === '/feedback';
  const [entries, setEntries] = React.useState<WhatsNewEntry[]>([]);
  // v1.165 — обратный контур: что починили ПО РЕПОРТАМ этого человека. Раньше он
  // писал в пустоту: правки по его словам уезжали в Play, а он об этом не узнавал.
  // Пустой список — обычное дело (нет репортов / нет сети), блок просто не рисуется.
  const [mine, setMine] = React.useState<FixedReport[]>([]);

  React.useEffect(() => {
    let active = true;
    (async () => {
      const seen = await getSeenVersion();
      const cur = currentVersion();
      if (!seen) { if (active) await setSeenVersion(cur); return; }
      const unread = unreadReleaseNotes(cur, seen);
      if (active && unread.length) {
        setEntries(unread);
        setVisible(true);
        // Network is optional and must not delay the update notice or its acknowledgement.
        void getMyFixedReports().then((reports) => { if (active) setMine(reports); }).catch(() => {});
      }
    })().catch(() => {});
    return () => { active = false; };
  }, []);

  const close = async () => {
    setVisible(false);
    await setSeenVersion(currentVersion());
    void markShown(mine.map((r) => r.id)).catch(() => {});
  };

  if (!visible || onFeedbackPage) return null;
  const cur = currentVersion();

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => setVisible(false)}>
      <View {...a11yModal} style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.title, { color: colors.text }]}>
            🎁 {t('whatsNewTitle')} v{cur}
          </Text>
          <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
            {entries.map((entry) => (
              <View key={entry.version} testID={`release-notes-${entry.version}`} style={styles.release}>
                <Text accessibilityRole="header" style={[styles.version, { color: colors.primary }]}>
                  v{entry.version} · {entry.date}
                </Text>
                {(language === 'ru' ? entry.ru : entry.en).map((it, i) => (
                  <View key={i} style={styles.row}>
                <Text style={[styles.dot, { color: colors.primary }]}>•</Text>
                <Text style={[styles.item, { color: colors.text }]}>{it}</Text>
                  </View>
                ))}
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
                {/* \u0411\u043B\u0430\u0433\u043E\u0434\u0430\u0440\u043D\u043E\u0441\u0442\u044C \u2014 \u0441\u0440\u0430\u0437\u0443 \u043F\u043E\u0434 \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043A\u043E\u043C, \u0434\u043E \u0446\u0438\u0442\u0430\u0442. \u0412\u043D\u0438\u0437\u0443 \u0431\u043B\u043E\u043A\u0430 \u043E\u043D\u0430
                    \u0443\u0435\u0437\u0436\u0430\u043B\u0430 \u0437\u0430 \u043A\u0440\u0430\u0439 \u044D\u043A\u0440\u0430\u043D\u0430, \u0438 \u0447\u0435\u043B\u043E\u0432\u0435\u043A \u0435\u0451 \u043D\u0435 \u0432\u0438\u0434\u0435\u043B (\u0441\u043A\u0440\u0438\u043D \u043E\u0442 \u0412\u0430\u043B\u0438). */}
                <Text style={[styles.mineIntro, { color: colors.textSecondary }]}>
                  {t('thanksForReports')}
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
              </View>
            )}
          </ScrollView>
          <TouchableOpacity
            testID="whats-new-close" accessibilityRole="button" onPress={close} style={[styles.btn, { backgroundColor: colors.primary }]}>
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
  release: { marginBottom: 14 },
  version: { fontSize: 14, fontWeight: '800', marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'flex-start' },
  dot: { fontSize: 14, fontWeight: '900', lineHeight: 19 },
  item: { fontSize: 13.5, lineHeight: 19, flex: 1 },
  btn: { minHeight: 48, justifyContent: 'center', borderRadius: 16, paddingVertical: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 14.5, fontWeight: '800' },
  mineBox: { marginTop: 14, borderTopWidth: 1, paddingTop: 12, gap: 10 },
  mineTitle: { fontSize: 13, fontWeight: '800' },
  mineRow: { gap: 2 },
  mineQuote: { fontSize: 12.5, lineHeight: 17, fontStyle: 'italic' },
  mineFix: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  mineThanks: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  mineIntro: { fontSize: 12.5, lineHeight: 17, marginTop: 4, marginBottom: 8 },
});
