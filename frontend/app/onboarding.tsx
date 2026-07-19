/**
 * Onboarding for first-time users.
 * Sets psygames_onboarded=true on completion.
 * v1.107.0: динамическое число игр (не хардкод), слайд «Вызов дня», запрос
 * уведомлений (натив), финал ведёт к действию — первая зарядка или вызов дня.
 */

import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useProfile } from '@/src/contexts/ProfileContext';
import { useWarmup } from '@/src/contexts/WarmupContext';
import { GAMES } from '@/src/constants/games';
import { getTodayChallenge, challengeToParams, setPendingChallenge } from '@/src/services/daily-challenge';
import { requestReminderPermission, applyReminders, saveReminderSettings, DEFAULT_REMINDERS } from '@/src/services/reminders';

// Играбельные игры = всё, кроме карточек-хабов (span_group, attention_conflict — внутри них скрытые подигры).
const GAME_COUNT = GAMES.filter((g) => !['span_group', 'attention_conflict'].includes(g.id)).length;

interface Slide {
  emoji: string;
  gradient: [string, string];
  title: { ru: string; en: string };
  body: { ru: string; en: string };
  kind?: 'notifications' | 'final';
}

const SLIDES: Slide[] = [
  {
    emoji: '🧠',
    gradient: ['#7c3aed', '#ec4899'],
    title: { ru: 'Добро пожаловать в PsyGames', en: 'Welcome to PsyGames' },
    body: {
      ru: `${GAME_COUNT} когнитивных игр — память, внимание, логика, контроль, счёт, скорость. Каждая измеряет конкретный психометрический биомаркер.`,
      en: `${GAME_COUNT} cognitive games — memory, attention, logic, control, math, speed. Each one measures a specific psychometric biomarker.`,
    },
  },
  {
    emoji: '⚡',
    gradient: ['#fbbf24', '#f59e0b'],
    title: { ru: 'Утренняя Зарядка', en: 'Morning Warm-up' },
    body: {
      // латиница «Streak» в русском тексте — опечатка; термин по всему приложению «стрик»
      ru: '5–15 минут утром. Программа подбирается под день недели. ВТ — внимание, СР — отдых, СБ — логика. Стрик считается по дням.',
      en: '5–15 minutes in the morning. The program adapts to the weekday. Tue — attention, Wed — rest, Sat — logic. Streak is counted by day.',
    },
  },
  {
    emoji: '🎲',
    gradient: ['#ef4444', '#f97316'],
    title: { ru: 'Ежедневный вызов', en: 'Daily challenge' },
    body: {
      ru: 'Каждый день — одна игра из ротации, одинаковая у всех игроков. Пройди раунд до конца — день засчитан, стрик 🔥 растёт. Пропустил день — стрик сгорает.',
      en: 'Every day — one game from the rotation, the same for all players. Finish a round — the day counts and your 🔥 streak grows. Miss a day — the streak resets.',
    },
  },
  {
    emoji: '🎯',
    gradient: ['#7c3aed', '#ec4899'],
    title: { ru: 'Оцени свой профиль', en: 'Assess your profile' },
    body: {
      ru: '12 коротких тестов (≈12 минут) → radar chart твоих сильных и слабых сторон + персональные рекомендации игр. Повторяй раз в 3 месяца чтобы видеть прогресс.',
      en: '12 short tests (≈12 minutes) → a radar chart of your strengths and weaknesses + personal game recommendations. Repeat every 3 months to track progress.',
    },
  },
  {
    emoji: '👤',
    gradient: ['#22c55e', '#0d9488'],
    title: { ru: 'Профили под цель', en: 'Goal-based profiles' },
    body: {
      ru: 'FREE — попробовать бесплатно, без кода. 11 тематических (Шахматы, Дети, Скорочтение, NZT-48, Водители, 50+, Предприниматели, Студенты ЕГЭ, Женщины, Полиглот, ODV999) — каждый со своим набором игр и плейлистом. Открываются мастер-кодом в Settings.',
      en: 'FREE — try it free, no code. 11 themed (Chess, Kids, Speed reading, NZT-48, Drivers, 50+, Entrepreneurs, Exam students, Women, Polyglot, ODV999) — each with its own set of games and playlist. Unlock with a master code in Settings.',
    },
  },
  {
    emoji: '☁️',
    gradient: ['#3b82f6', '#1e40af'],
    title: { ru: 'Данные надёжны', en: 'Your data is safe' },
    body: {
      ru: 'Каждая сессия сохраняется и локально, и в облаке. Очистка кэша браузера = не страшно. История за месяцы и годы — твоя.',
      en: 'Every session is saved both locally and in the cloud. Clearing your browser cache is no problem. Months and years of history are yours.',
    },
  },
  // Уведомления — только натив (на web/desktop expo-notifications = no-op)
  ...(Platform.OS !== 'web' ? [{
    emoji: '🔔',
    gradient: ['#8b5cf6', '#6366f1'] as [string, string],
    title: { ru: 'Напоминания', en: 'Reminders' },
    body: {
      ru: 'Одно мягкое напоминание утром в 9:00 — и тренировка не потеряется в делах. Время меняется в Settings, отключить можно там же.',
      en: 'One gentle reminder at 9:00 AM keeps your training on track. Change the time or turn it off anytime in Settings.',
    },
    kind: 'notifications' as const,
  }] : []),
  {
    emoji: '🚀',
    gradient: ['#ef4444', '#f97316'],
    title: { ru: 'Поехали!', en: 'Let’s go!' },
    body: {
      ru: 'Лучший способ понять PsyGames — сыграть прямо сейчас. Первый раунд займёт пару минут.',
      en: 'The best way to get PsyGames is to play right now. Your first round takes a couple of minutes.',
    },
    kind: 'final' as const,
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const { profile } = useProfile();
  const warmup = useWarmup();
  const { width } = useWindowDimensions();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  const slide = SLIDES[step];
  const isLast = step === SLIDES.length - 1;
  const containerW = Math.min(width - 32, 480);
  const todayChallenge = useMemo(() => getTodayChallenge(), []);
  const canWarmup = !!profile?.warmup_enabled;

  const markOnboarded = async () => {
    try { await AsyncStorage.setItem('psygames_onboarded', 'true'); } catch {}
  };

  const finish = async () => {
    await markOnboarded();
    router.replace('/' as any);
  };

  // Финальная CTA: профиль с зарядкой → первая зарядка; FREE (зарядка отключена) → вызов дня.
  const startAction = async () => {
    if (busy) return;
    setBusy(true);
    await markOnboarded();
    if (canWarmup) {
      router.replace('/' as any);
      warmup.startWarmup(5);
    } else {
      if (profile?.id) await setPendingChallenge(profile.id, todayChallenge.game.id);
      router.replace('/' as any);
      router.push({ pathname: todayChallenge.game.route, params: challengeToParams(todayChallenge) } as any);
    }
  };

  const enableReminders = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const granted = await requestReminderPermission();
      if (granted) {
        const s = { ...DEFAULT_REMINDERS, morning: true };
        await saveReminderSettings(s);
        await applyReminders(s, language);
      }
    } catch {}
    setBusy(false);
    setStep((s) => s + 1);
  };

  const next = () => {
    if (isLast) finish();
    else setStep((s) => s + 1);
  };

  const skip = () => finish();

  const isNotif = slide.kind === 'notifications';
  const isFinal = slide.kind === 'final';
  const mainLabel = isNotif
    ? (language === 'ru' ? 'ВКЛЮЧИТЬ НАПОМИНАНИЯ' : 'ENABLE REMINDERS')
    : isFinal
      ? (canWarmup
          ? (language === 'ru' ? 'НАЧАТЬ ПЕРВУЮ ЗАРЯДКУ' : 'START FIRST WARM-UP')
          : (language === 'ru' ? 'СЫГРАТЬ ВЫЗОВ ДНЯ' : 'PLAY TODAY’S CHALLENGE'))
      : (language === 'ru' ? 'ДАЛЬШЕ' : 'NEXT');
  const onMainPress = isNotif ? enableReminders : isFinal ? startAction : next;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { width: containerW }]}>
        <Text style={[styles.stepCounter, { color: colors.textSecondary }]}>
          {step + 1} / {SLIDES.length}
        </Text>
        {!isLast && (
          <TouchableOpacity onPress={skip}>
            <Text style={[styles.skipBtn, { color: colors.textSecondary }]}>{language === 'ru' ? 'Пропустить' : 'Skip'}</Text>
          </TouchableOpacity>
        )}
      </View>

      <LinearGradient colors={slide.gradient} start={{x:0,y:0}} end={{x:1,y:1}}
        style={[styles.slideCard, { width: containerW }]}>
        <Text style={styles.emoji}>{slide.emoji}</Text>
        <Text style={styles.title}>{language === 'ru' ? slide.title.ru : slide.title.en}</Text>
        <Text style={styles.body}>{language === 'ru' ? slide.body.ru : slide.body.en}</Text>
        {isFinal && (
          <Text style={styles.finalHint}>
            {canWarmup
              ? (language === 'ru' ? '⚡ 5 минут, программа на сегодня уже собрана' : '⚡ 5 minutes, today’s program is ready')
              : `🎲 ${language === 'ru' ? 'Сегодня' : 'Today'}: ${t(todayChallenge.game.nameKey)}`}
          </Text>
        )}
      </LinearGradient>

      {/* Dots */}
      <View style={styles.dotsRow}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[styles.dot, {
            backgroundColor: i === step ? '#fbbf24' : colors.border,
            width: i === step ? 24 : 8,
          }]} />
        ))}
      </View>

      <View style={{ width: containerW, marginBottom: 16 }}>
        <TouchableOpacity style={styles.nextBtn} onPress={onMainPress} disabled={busy}>
          <LinearGradient colors={slide.gradient} style={styles.nextBtnGrad}>
            <Text style={styles.nextBtnText}>{mainLabel}</Text>
            <Ionicons name={isFinal ? 'play' : 'arrow-forward'} size={18} color="#FFF" />
          </LinearGradient>
        </TouchableOpacity>
        {(isNotif || isFinal) && (
          <TouchableOpacity onPress={isNotif ? next : finish} disabled={busy} style={styles.secondaryBtn}>
            <Text style={[styles.secondaryText, { color: colors.textSecondary }]}>
              {isNotif ? (language === 'ru' ? 'Не сейчас' : 'Not now') : (language === 'ru' ? 'Просто осмотреться' : 'Just look around')}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12 },
  stepCounter: { fontSize: 13, fontWeight: '700' },
  skipBtn: { fontSize: 14, fontWeight: '600' },
  slideCard: { padding: 32, borderRadius: 24, alignItems: 'center', gap: 16, marginTop: 24 },
  emoji: { fontSize: 80 },
  title: { color: '#FFF', fontSize: 26, fontWeight: '900', textAlign: 'center', letterSpacing: 1 },
  body: { color: 'rgba(255,255,255,0.95)', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  finalHint: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  dotsRow: { flexDirection: 'row', gap: 6, marginVertical: 24 },
  dot: { height: 8, borderRadius: 4 },
  nextBtn: { borderRadius: 14, overflow: 'hidden' },
  nextBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 18 },
  nextBtnText: { color: '#FFF', fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  secondaryBtn: { alignItems: 'center', paddingVertical: 12 },
  secondaryText: { fontSize: 14, fontWeight: '600' },
});
