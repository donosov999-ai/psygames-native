import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Platform } from 'react-native';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { HELP_MAP } from '@/src/constants/helpMap';

/**
 * Глобальная кнопка-«?» справки для всех экранов игр (как «Помощь» в старом app).
 * Рендерится один раз через app/games/_layout.tsx; контент берётся из HELP_MAP
 * по текущему маршруту (имя + что тренирует + intro-описание «как играть»),
 * переиспользуя существующие переводы (7 языков).
 */
export default function GameHelpOverlay() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const insets = useSafeAreaInsets();
  const HELP_LABEL: Record<string, string> = { ru: 'Справка', en: 'Help', es: 'Ayuda', pt: 'Ajuda', hi: 'मदद', zh: '帮助', de: 'Hilfe' };
  const helpLabel = HELP_LABEL[language] || 'Help';
  const pathname = usePathname() || '';
  const [open, setOpen] = useState(false);

  const clean = pathname.replace(/\/+$/, '');          // убрать хвостовой слэш
  const gi = clean.indexOf('/games/');                 // устойчиво к baseUrl-префиксу (/app-test, /play)
  const key = gi >= 0 ? clean.slice(gi) : clean;
  const entry = HELP_MAP[key];
  if (!entry || !entry.introKey) return null;          // нет справки — нет кнопки

  return (
    <>
      <TouchableOpacity
        accessibilityLabel="help"
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
        style={[
          styles.fab,
          { top: insets.top + 12, backgroundColor: colors.primary || '#a855f7' },
        ]}
      >
        <Ionicons name="help-circle" size={20} color="#fff" />
        <Text style={styles.fabLabel}>{helpLabel}</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={styles.sheetHead}>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>{t(entry.nameKey)}</Text>
              <TouchableOpacity onPress={() => setOpen(false)} style={[styles.close, { backgroundColor: colors.surface }]}>
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={[styles.skillChip, { backgroundColor: (colors.primary || '#a855f7') + '22' }]}>
              <Ionicons name="fitness-outline" size={14} color={colors.primary || '#a855f7'} />
              <Text style={[styles.skillText, { color: colors.primary || '#a855f7' }]}>{t(entry.skillKey)}</Text>
            </View>

            <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
              <Text style={[styles.intro, { color: colors.text }]}>{t(entry.introKey)}</Text>
            </ScrollView>

            <TouchableOpacity onPress={() => setOpen(false)} style={[styles.okBtn, { backgroundColor: colors.primary || '#a855f7' }]}>
              <Text style={styles.okText}>{t('close') !== 'close' ? t('close') : 'OK'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    zIndex: 100,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
  },
  fabLabel: { color: '#fff', fontWeight: '700', fontSize: 13 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 18 },
  sheet: { width: '100%', maxWidth: 520, maxHeight: '82%', borderRadius: 20, borderWidth: 1, padding: 20 },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { flex: 1, fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  close: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  skillChip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginTop: 12 },
  skillText: { fontSize: 14, fontWeight: '700' },
  body: { marginTop: 14 },
  intro: { fontSize: 16.5, lineHeight: 25 },
  okBtn: { marginTop: 14, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  okText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
