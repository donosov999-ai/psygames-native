/**
 * WelcomeModal — shown on the very first app launch.
 *
 * Two flows:
 *   1. «🎁 Начать с FREE» — sets profile = FREE, marks first-run done.
 *   2. «🔑 У меня есть код» — opens code-entry inline within the modal.
 *
 * After either flow, the modal dismisses and won't show again on this
 * device (psygames_first_run_done flag in AsyncStorage).
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useProfile } from '@/src/contexts/ProfileContext';
import { useTheme } from '@/src/contexts/ThemeContext';

export default function WelcomeModal() {
  const { isFirstRun, completeFirstRun, switchProfile, redeemCode } = useProfile();
  const { colors } = useTheme();
  const [view, setView] = useState<'choice' | 'code'>('choice');
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);

  const pickFree = async () => {
    await switchProfile('free');
    await completeFirstRun();
  };

  const tryCode = async () => {
    setCodeError(null);
    const id = await redeemCode(codeInput);
    if (id) {
      await completeFirstRun();
      setView('choice');
      setCodeInput('');
    } else {
      setCodeError('Неверный код. Проверь и попробуй ещё раз, или начни с FREE.');
    }
  };

  if (!isFirstRun) return null;

  return (
    <Modal visible animationType="slide" transparent={false}>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <LinearGradient
            colors={['#7c3aed', '#ec4899']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <Text style={styles.heroEmoji}>🧠</Text>
            <Text style={styles.heroTitle}>Добро пожаловать в PsyGames</Text>
            <Text style={styles.heroSub}>47 когнитивных тренажёров под цели</Text>
          </LinearGradient>

          {view === 'choice' && (
            <View style={styles.content}>
              <Text style={[styles.h2, { color: colors.text }]}>С чего начать?</Text>

              {/* FREE option */}
              <TouchableOpacity style={[styles.optionCard, { backgroundColor: colors.surface, borderColor: '#f59e0b' }]}
                onPress={pickFree} activeOpacity={0.85}>
                <View style={styles.optionHeader}>
                  <Text style={styles.optionEmoji}>🎁</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.optionTitle, { color: colors.text }]}>FREE (без подписки)</Text>
                    <Text style={[styles.optionSub, { color: colors.textSecondary }]}>9 базовых игр · по одной из каждой категории</Text>
                  </View>
                  <Ionicons name="arrow-forward" size={22} color={colors.text} />
                </View>
                <View style={styles.optionList}>
                  <Text style={[styles.optionListText, { color: colors.textSecondary }]}>
                    Шульте · Парные картинки · Мишени · Math Sprint · Поиск отличий · Считалка · Анаграммы · Ханой · N-back
                  </Text>
                </View>
              </TouchableOpacity>

              {/* CODE option */}
              <TouchableOpacity style={[styles.optionCard, { backgroundColor: colors.surface, borderColor: '#7c3aed' }]}
                onPress={() => setView('code')} activeOpacity={0.85}>
                <View style={styles.optionHeader}>
                  <Text style={styles.optionEmoji}>🔑</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.optionTitle, { color: colors.text }]}>У меня есть код доступа</Text>
                    <Text style={[styles.optionSub, { color: colors.textSecondary }]}>Разблокирует тематический профиль (9 специальных игр)</Text>
                  </View>
                  <Ionicons name="arrow-forward" size={22} color={colors.text} />
                </View>
                <View style={styles.optionList}>
                  <Text style={[styles.optionListText, { color: colors.textSecondary }]}>
                    ♟ Шахматист · 🧒 Дети · 📖 Скорочтение · 💊 NZT-48 · 🚗 Водители · 👴 50+ · 💼 Предприниматели · 🎓 ЕГЭ
                  </Text>
                </View>
              </TouchableOpacity>

              <Text style={[styles.footer, { color: colors.textSecondary }]}>
                Можно изменить позже в Settings → Профиль. Прогресс хранится локально на устройстве.
              </Text>
            </View>
          )}

          {view === 'code' && (
            <View style={styles.content}>
              <TouchableOpacity onPress={() => { setView('choice'); setCodeInput(''); setCodeError(null); }} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={20} color={colors.text} />
                <Text style={[styles.backBtnText, { color: colors.text }]}>назад</Text>
              </TouchableOpacity>

              <Text style={[styles.h2, { color: colors.text }]}>🔑 Введите код доступа</Text>
              <Text style={[styles.codeDesc, { color: colors.textSecondary }]}>
                Код выдаётся владельцем программы (твоим тренером / преподавателем / организацией). Регистр и пробелы не важны.
              </Text>

              <TextInput
                value={codeInput}
                onChangeText={(t) => { setCodeInput(t); setCodeError(null); }}
                autoCapitalize="characters"
                autoCorrect={false}
                autoFocus
                placeholder="например, CHESS-NZT-2026"
                placeholderTextColor={colors.textSecondary}
                style={[styles.codeInput, {
                  borderColor: codeError ? '#ef4444' : colors.border,
                  color: colors.text,
                  backgroundColor: colors.surface,
                }]}
                onSubmitEditing={tryCode}
              />
              {codeError && <Text style={styles.codeError}>{codeError}</Text>}

              <TouchableOpacity onPress={tryCode} style={styles.unlockBtn} activeOpacity={0.85}>
                <Ionicons name="lock-open" size={18} color="#FFF" />
                <Text style={styles.unlockBtnText}>Разблокировать</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={pickFree} style={styles.skipBtn}>
                <Text style={[styles.skipBtnText, { color: colors.textSecondary }]}>
                  Кода нет → начать с FREE
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1 },
  hero: { padding: 36, paddingTop: 60, alignItems: 'center', gap: 10 },
  heroEmoji: { fontSize: 56 },
  heroTitle: { fontSize: 22, fontWeight: '900', color: '#FFF', textAlign: 'center' },
  heroSub: { fontSize: 14, color: 'rgba(255,255,255,0.85)', textAlign: 'center' },
  content: { padding: 22, gap: 18 },
  h2: { fontSize: 20, fontWeight: '800' },

  optionCard: {
    borderRadius: 14,
    borderWidth: 2,
    padding: 16,
    gap: 12,
  },
  optionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  optionEmoji: { fontSize: 32 },
  optionTitle: { fontSize: 17, fontWeight: '700' },
  optionSub: { fontSize: 13, marginTop: 2 },
  optionList: { paddingLeft: 44 },
  optionListText: { fontSize: 12, lineHeight: 17 },

  footer: { fontSize: 12, textAlign: 'center', lineHeight: 17, marginTop: 8, paddingHorizontal: 12 },

  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  backBtnText: { fontSize: 14, fontWeight: '600' },
  codeDesc: { fontSize: 13, lineHeight: 18 },
  codeInput: {
    borderWidth: 2,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    fontFamily: 'monospace',
  },
  codeError: { color: '#ef4444', fontSize: 12 },
  unlockBtn: {
    backgroundColor: '#10b981',
    borderRadius: 10,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  unlockBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  skipBtn: { paddingVertical: 10, alignItems: 'center' },
  skipBtnText: { fontSize: 13, textDecorationLine: 'underline' },
});
