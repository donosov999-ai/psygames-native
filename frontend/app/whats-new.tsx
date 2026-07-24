/**
 * /whats-new — история версий + кнопка «Проверить обновления»
 * (запрос Дениса 23.07: «после обновления список что нового + история версий»).
 */
import React from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { goBackOrHome } from '@/src/utils/nav';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { isRTLLang } from '@/src/services/rtl';
import { WHATS_NEW } from '@/src/constants/whatsNew';
import { checkForUpdate, currentVersion, updateUrl } from '@/src/services/appUpdates';

export default function WhatsNewScreen() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const [checking, setChecking] = React.useState(false);

  const doCheck = async () => {
    setChecking(true);
    const info = await checkForUpdate();
    setChecking(false);
    if (!info) { Alert.alert(t('updCheckFailed')); return; }
    if (info.hasUpdate) {
      Alert.alert(
        `${t('updAvailable')} v${info.latest}`,
        t('updAvailableBody'),
        [
          { text: t('updLater'), style: 'cancel' },
          { text: t('updDownload'), onPress: () => Linking.openURL(updateUrl()).catch(() => {}) },
        ],
      );
    } else {
      Alert.alert(`✓ ${t('updLatest')}`, `v${currentVersion()}`);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name={isRTLLang(language) ? 'arrow-forward' : 'arrow-back'} size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('versionHistory')}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={doCheck} disabled={checking}
          style={[styles.checkBtn, { backgroundColor: colors.primary, opacity: checking ? 0.6 : 1 }]}>
          <Ionicons name="refresh" size={17} color="#fff" />
          <Text style={styles.checkText}>
            {checking ? '…' : `${t('updCheckBtn')} · v${currentVersion()}`}
          </Text>
        </TouchableOpacity>

        {WHATS_NEW.map((e) => (
          <View key={e.version} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.cardHead}>
              <Text style={[styles.ver, { color: colors.text }]}>v{e.version}</Text>
              <Text style={[styles.date, { color: colors.textSecondary }]}>{e.date}</Text>
            </View>
            {(language === 'ru' ? e.ru : e.en).map((it, i) => (
              <View key={i} style={styles.row}>
                <Text style={[styles.dot, { color: colors.primary }]}>•</Text>
                <Text style={[styles.item, { color: colors.text }]}>{it}</Text>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  backBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '800' },
  scroll: { padding: 16, gap: 12, maxWidth: 560, alignSelf: 'center', width: '100%' },
  checkBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 13 },
  checkText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  ver: { fontSize: 15, fontWeight: '800' },
  date: { fontSize: 12 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  dot: { fontSize: 13, fontWeight: '900', lineHeight: 18 },
  item: { fontSize: 13, lineHeight: 18, flex: 1 },
});
