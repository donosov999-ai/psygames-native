/**
 * Onboarding for first-time users.
 * Sets psygames_onboarded=true on completion.
 * v1.107.0: динамическое число игр (не хардкод), слайд «Вызов дня», запрос
 * уведомлений (натив), финал ведёт к действию — первая зарядка или вызов дня.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Redirect } from 'expo-router';
import { isWebDemo } from '@/src/services/buildTarget';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { isRTLLang } from '@/src/services/rtl';
import { useProfile } from '@/src/contexts/ProfileContext';
import { useWarmup } from '@/src/contexts/WarmupContext';
import { PUBLIC_GAME_COUNT } from '@/src/constants/profiles';
import { getTodayChallenge, challengeToParams, setPendingChallenge } from '@/src/services/daily-challenge';
import { requestReminderPermission, applyReminders, saveReminderSettings, DEFAULT_REMINDERS } from '@/src/services/reminders';
import { gameThumb } from '@/src/constants/gameThumbs';
import { a11yDecor } from '@/src/services/a11y';
import { getOnboardingGames, hasPickedOnboarding, markOnboardingPicked } from '@/src/services/onboarding';

// Играбельные игры = всё, кроме карточек-хабов (внутри них скрытые подигры).
// Список хабов выводится из каталога: раньше он был выписан здесь поимённо и при
// появлении третьего хаба обещал бы на одно упражнение больше, чем есть.
/**
 * ⚠️ ЧИСЛО БЕРЁТСЯ ИЗ ОДНОГО ИСТОЧНИКА, А НЕ СЧИТАЕТСЯ ЗАНОВО. Правило жило в трёх
 * местах разом — здесь, в профилях и в гейте витрины, — и 22.08.2026 разошлось:
 * профили перестали считать песочницу, а экран и гейт продолжали. Покупатель
 * увидел бы одно число в магазине и другое при запуске.
 */
const GAME_COUNT = PUBLIC_GAME_COUNT;

interface Slide {
  emoji: string;
  gradient: [string, string];
  titleKey: string;   // ключи словаря LanguageContext (onbSlide*Title/Body) — рендер через t()
  bodyKey: string;    // {n} в onbSlideWelcomeBody подставляется .replace() при рендере
  kind?: 'notifications' | 'final';
}

const SLIDES: Slide[] = [
  { emoji: '🧠', gradient: ['#7c3aed', '#ec4899'], titleKey: 'onbSlideWelcomeTitle', bodyKey: 'onbSlideWelcomeBody' },
  { emoji: '⚡', gradient: ['#fbbf24', '#f59e0b'], titleKey: 'onbSlideWarmupTitle', bodyKey: 'onbSlideWarmupBody' },
  { emoji: '🎲', gradient: ['#ef4444', '#f97316'], titleKey: 'onbSlideChallengeTitle', bodyKey: 'onbSlideChallengeBody' },
  { emoji: '🎯', gradient: ['#7c3aed', '#ec4899'], titleKey: 'onbSlideAssessTitle', bodyKey: 'onbSlideAssessBody' },
  { emoji: '👤', gradient: ['#22c55e', '#0d9488'], titleKey: 'onbSlideProfilesTitle', bodyKey: 'onbSlideProfilesBody' },
  { emoji: '☁️', gradient: ['#3b82f6', '#1e40af'], titleKey: 'onbSlideDataTitle', bodyKey: 'onbSlideDataBody' },
  // Уведомления — только натив (на web/desktop expo-notifications = no-op)
  ...(Platform.OS !== 'web' ? [{
    emoji: '🔔',
    gradient: ['#8b5cf6', '#6366f1'] as [string, string],
    titleKey: 'onbSlideRemindTitle',
    bodyKey: 'onbSlideRemindBody',
    kind: 'notifications' as const,
  }] : []),
  { emoji: '🚀', gradient: ['#ef4444', '#f97316'], titleKey: 'onbSlideGoTitle', bodyKey: 'onbSlideGoBody', kind: 'final' as const },
];

export default function OnboardingScreen() {
  // Web-demo: экран недоступен — только демо-лендинг и игры. Гейт статичен (build-time флаг).
  if (isWebDemo()) return <Redirect href="/" />;
  const router = useRouter();
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const { profile } = useProfile();
  const params = useLocalSearchParams<{ tutorial?: string | string[] }>();
  const warmup = useWarmup();
  const { width } = useWindowDimensions();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const tutorialMode = Array.isArray(params.tutorial)
    ? params.tutorial.includes('1')
    : params.tutorial === '1';
  const [pickerReady, setPickerReady] = useState(tutorialMode);
  const pickerGames = useMemo(() => getOnboardingGames(), []);

  useEffect(() => {
    if (tutorialMode) { setPickerReady(true); return; }
    let active = true;
    hasPickedOnboarding(profile.id)
      .then((picked) => {
        if (!active) return;
        if (picked) router.replace('/' as any);
        else setPickerReady(true);
      })
      .catch(() => { if (active) setPickerReady(true); });
    return () => { active = false; };
  }, [profile.id, router, tutorialMode]);

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

  // Финальная CTA: профиль с зарядкой → первая зарядка; FREE → ГЛАВНАЯ (каталог игр).
  // v1.124.0: FREE больше НЕ кидается сразу в Вызов дня — репорт «неудачно для знакомства,
  // лучше сразу дать осмотреться». Вызов дня остаётся доступен карточкой на главной.
  const startAction = async () => {
    if (busy) return;
    setBusy(true);
    await markOnboarded();
    if (canWarmup) {
      router.replace('/' as any);
      warmup.startWarmup(5);
    } else {
      router.replace('/' as any);
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

  const chooseGame = async (game: (typeof pickerGames)[number]) => {
    if (busy) return;
    setBusy(true);
    try { await markOnboardingPicked(profile.id); } catch {}
    router.replace({
      pathname: game.route as any,
      params: { auto: '1', diff: 'easy' },
    } as any);
  };

  const skipPicker = async () => {
    if (busy) return;
    setBusy(true);
    try { await markOnboardingPicked(profile.id); } catch {}
    router.replace('/' as any);
  };

  const isNotif = slide.kind === 'notifications';
  const isFinal = slide.kind === 'final';
  const mainLabel = isNotif
    ? t('onbEnableReminders')
    : isFinal
      ? (canWarmup ? t('onbStartFirstWarmup') : t('onbPlayDailyChallenge'))
      : t('onbNext');
  const onMainPress = isNotif ? enableReminders : isFinal ? startAction : next;

  if (!tutorialMode) {
    if (!pickerReady) {
      return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center' }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={[styles.pickerContainer, { backgroundColor: colors.background }]}>
        <ScrollView
          contentContainerStyle={[styles.pickerScroll, { width: containerW }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.pickerHeading}>
            <Text style={styles.pickerEmoji}>🎮</Text>
            <Text style={[styles.pickerTitle, { color: colors.text }]}>{t('onbPickGameTitle')}</Text>
            <Text style={[styles.pickerBody, { color: colors.textSecondary }]}>{t('onbPickGameBody')}</Text>
          </View>

          <View style={styles.pickerCards}>
            {pickerGames.map((game) => {
              const thumb = gameThumb(game.id);
              return (
                <TouchableOpacity
                  key={game.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${t(game.nameKey)}. ${t(game.skillKey)}`}
                  activeOpacity={0.84}
                  disabled={busy}
                  onPress={() => chooseGame(game)}
                  style={styles.pickerCard}
                >
                  <LinearGradient colors={game.gradient as [string, string]} style={styles.pickerGradient}>
                    {thumb && <Image {...a11yDecor} source={thumb} resizeMode="cover" style={styles.pickerThumb} />}
                    <View style={styles.pickerShade} pointerEvents="none" />
                    <View style={styles.pickerIcon}>
                      <Ionicons name={game.icon as any} size={25} color="#fff" />
                    </View>
                    <View style={styles.pickerCopy}>
                      <Text style={styles.pickerGameName} numberOfLines={1}>{t(game.nameKey)}</Text>
                      <Text style={styles.pickerSkill} numberOfLines={1}>{t(game.skillKey)}</Text>
                      <Text style={styles.pickerDesc} numberOfLines={2}>{t(game.descKey)}</Text>
                    </View>
                    <Ionicons name={isRTLLang(language) ? 'chevron-back' : 'chevron-forward'} size={25} color="#fff" />
                  </LinearGradient>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.pickerHint, { color: colors.textSecondary }]}>{t('onbPickGameHint')}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('skip')}
            disabled={busy}
            onPress={skipPicker}
            style={[styles.pickerSkip, { borderColor: colors.border, backgroundColor: colors.surface }]}
          >
            <Text style={[styles.pickerSkipText, { color: colors.text }]}>{t('skip')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { width: containerW }]}>
        <Text style={[styles.stepCounter, { color: colors.textSecondary }]}>
          {step + 1} / {SLIDES.length}
        </Text>
        {!isLast && (
          <TouchableOpacity
            accessibilityRole="button" onPress={skip}>
            <Text style={[styles.skipBtn, { color: colors.textSecondary }]}>{t('skip')}</Text>
          </TouchableOpacity>
        )}
      </View>

      <LinearGradient colors={slide.gradient} start={{x:0,y:0}} end={{x:1,y:1}}
        style={[styles.slideCard, { width: containerW }]}>
        <Text style={styles.emoji}>{slide.emoji}</Text>
        <Text style={styles.title}>{t(slide.titleKey)}</Text>
        <Text style={styles.body}>{t(slide.bodyKey).replace('{n}', String(GAME_COUNT))}</Text>
        {isFinal && (
          <Text style={styles.finalHint}>
            {canWarmup
              ? t('onbWarmupReady')
              : `🎲 ${t('today')}: ${t(todayChallenge.game.nameKey)}`}
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
        <TouchableOpacity
          accessibilityRole="button" style={styles.nextBtn} onPress={onMainPress} disabled={busy}>
          <LinearGradient colors={slide.gradient} style={styles.nextBtnGrad}>
            <Text style={styles.nextBtnText}>{mainLabel}</Text>
            <Ionicons name={isFinal ? 'play' : (isRTLLang(language) ? 'arrow-back' : 'arrow-forward')} size={18} color="#FFF" />
          </LinearGradient>
        </TouchableOpacity>
        {(isNotif || isFinal) && (
          <TouchableOpacity
            accessibilityRole="button" onPress={isNotif ? next : finish} disabled={busy} style={styles.secondaryBtn}>
            <Text style={[styles.secondaryText, { color: colors.textSecondary }]}>
              {isNotif ? t('notNow') : t('justLookAround')}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  pickerContainer: { flex: 1, alignItems: 'center' },
  pickerScroll: { alignSelf: 'center', paddingTop: 24, paddingBottom: 32, gap: 18 },
  pickerHeading: { alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  pickerEmoji: { fontSize: 42 },
  pickerTitle: { fontSize: 27, lineHeight: 32, fontWeight: '900', textAlign: 'center' },
  pickerBody: { fontSize: 15, lineHeight: 21, textAlign: 'center', maxWidth: 390 },
  pickerCards: { gap: 11 },
  pickerCard: { height: 118, borderRadius: 19, overflow: 'hidden' },
  pickerGradient: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12, position: 'relative', overflow: 'hidden' },
  pickerThumb: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: '100%', height: '100%', opacity: 0.24 },
  pickerShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(10,16,36,0.24)' },
  pickerIcon: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.22)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  pickerCopy: { flex: 1, minWidth: 0, gap: 3 },
  pickerGameName: { color: '#fff', fontSize: 18, fontWeight: '900' },
  pickerSkill: { color: 'rgba(255,255,255,0.92)', fontSize: 12, fontWeight: '800' },
  pickerDesc: { color: 'rgba(255,255,255,0.86)', fontSize: 12, lineHeight: 16 },
  pickerHint: { fontSize: 12, lineHeight: 17, textAlign: 'center', paddingHorizontal: 20 },
  pickerSkip: { minHeight: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pickerSkipText: { fontSize: 15, fontWeight: '800' },
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
  nextBtn: { minHeight: 48, justifyContent: 'center', borderRadius: 16, overflow: 'hidden' },
  nextBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 18 },
  nextBtnText: { color: '#FFF', fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  secondaryBtn: { alignItems: 'center', paddingVertical: 12 },
  secondaryText: { fontSize: 14, fontWeight: '600' },
});
