/* psygames-hub-empty · VER 1 · 09.09.2026 */
/**
 * 🔴 РАЗВИЛКА НЕ ИМЕЕТ ПРАВА БЫТЬ ТУПИКОМ.
 *
 * ЗАМЕР 09.09.2026 на собранной сборке (обход всех 17 развилок под тремя профилями):
 * экран развилки при пустом списке рисовал заголовок, подпись «Выбери упражнение» —
 * и НИЧЕГО под ней. Пустыми так открывались 6 развилок из 17 у профиля «Бесплатный»
 * и 4 из 17 у «Детей». Снаружи это ровно то, что Денис назвал «не запускается,
 * ошибка» — сперва по «Ментальной ротации», потом по «Судоку».
 *
 * ⚠️ ПОЧЕМУ ОТДЕЛЬНЫМ КОМПОНЕНТОМ, А НЕ ЧЕТЫРЬМЯ КОПИЯМИ. Развилок 17, а вёрсток
 * у них ЧЕТЫРЕ: общий `HubScreen` (13 штук) и три собственные — `sudoku-hub`,
 * `span`, `attention-conflict`. Гейт `hub-not-empty-in-every-profile` нашёл две
 * последние сам, уже после того как я «починил» первые две. Копия номер пять
 * появится вместе со следующей своей вёрсткой — поэтому состояние живёт в одном
 * месте, и гейт проверяет, что экран до него дотягивается.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';

/** @param accent цвет кнопки — первый цвет градиента своей развилки. */
export default function HubEmpty({ accent }: { accent: string }) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const router = useRouter();
  return (
    <View style={[styles.box, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Ionicons name="lock-closed-outline" size={32} color={colors.textSecondary} />
      <Text style={[styles.title, { color: colors.text }]}>{t('hubEmptyTitle')}</Text>
      <Text style={[styles.desc, { color: colors.textSecondary }]}>{t('hubEmptyDesc')}</Text>
      <TouchableOpacity
        accessibilityRole="button"
        style={[styles.btn, { backgroundColor: accent }]}
        onPress={() => router.replace('/games' as any)}
      >
        <Text style={styles.btnText}>{t('hubEmptyAction')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 16, padding: 20, alignItems: 'center', gap: 10, marginTop: 4 },
  title: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  desc: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  // 48 — тот же нижний предел цели нажатия, что держит гейт tap-target-audit.
  btn: { marginTop: 6, paddingHorizontal: 20, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
