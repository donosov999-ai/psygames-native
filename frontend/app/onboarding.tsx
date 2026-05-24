/**
 * 5-slide onboarding for first-time users.
 * Sets psygames_onboarded=true on completion.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/src/contexts/ThemeContext';

const SLIDES = [
  {
    emoji: '🧠',
    gradient: ['#7c3aed', '#ec4899'],
    title: 'Добро пожаловать в PsyGames',
    body: '44 когнитивные игры — память, внимание, логика, контроль, счёт, скорость. Каждая измеряет конкретный психометрический биомаркер.',
  },
  {
    emoji: '⚡',
    gradient: ['#fbbf24', '#f59e0b'],
    title: 'Утренняя Зарядка',
    body: '5–15 минут утром. Программа подбирается под день недели. ВТ — внимание, СР — отдых, СБ — логика. Streak считается по дням.',
  },
  {
    emoji: '🎯',
    gradient: ['#7c3aed', '#ec4899'],
    title: 'Оцени свой профиль',
    body: '12 коротких тестов (≈12 минут) → radar chart твоих сильных и слабых сторон + персональные рекомендации игр. Повторяй раз в 3 месяца чтобы видеть прогресс.',
  },
  {
    emoji: '👤',
    gradient: ['#22c55e', '#0d9488'],
    title: '10 профилей под цель',
    body: 'FREE — попробовать бесплатно, без кода. 9 тематических (Шахматы, Дети, Скорочтение, NZT-48, Водители, 50+, Предприниматели, Студенты ЕГЭ, ODV999) — каждый со своим набором игр и плейлистом. Тематические открываются мастер-кодом в Settings.',
  },
  {
    emoji: '☁️',
    gradient: ['#3b82f6', '#1e40af'],
    title: 'Данные надёжны',
    body: 'Каждая сессия сохраняется и локально, и в облаке. Очистка кэша браузера = не страшно. История за месяцы и годы — твоя.',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [step, setStep] = useState(0);

  const slide = SLIDES[step];
  const isLast = step === SLIDES.length - 1;
  const containerW = Math.min(width - 32, 480);

  const finish = async () => {
    try { await AsyncStorage.setItem('psygames_onboarded', 'true'); } catch {}
    router.replace('/' as any);
  };

  const next = () => {
    if (isLast) finish();
    else setStep(s => s + 1);
  };

  const skip = () => finish();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { width: containerW }]}>
        <Text style={[styles.stepCounter, { color: colors.textSecondary }]}>
          {step + 1} / {SLIDES.length}
        </Text>
        {!isLast && (
          <TouchableOpacity onPress={skip}>
            <Text style={[styles.skipBtn, { color: colors.textSecondary }]}>Пропустить</Text>
          </TouchableOpacity>
        )}
      </View>

      <LinearGradient colors={slide.gradient as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}}
        style={[styles.slideCard, { width: containerW }]}>
        <Text style={styles.emoji}>{slide.emoji}</Text>
        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.body}>{slide.body}</Text>
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

      <TouchableOpacity style={[styles.nextBtn, { width: containerW }]} onPress={next}>
        <LinearGradient colors={slide.gradient as [string, string]} style={styles.nextBtnGrad}>
          <Text style={styles.nextBtnText}>{isLast ? 'НАЧАТЬ' : 'ДАЛЬШЕ'}</Text>
          <Ionicons name="arrow-forward" size={18} color="#FFF" />
        </LinearGradient>
      </TouchableOpacity>
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
  dotsRow: { flexDirection: 'row', gap: 6, marginVertical: 24 },
  dot: { height: 8, borderRadius: 4 },
  nextBtn: { borderRadius: 14, overflow: 'hidden', marginBottom: 16 },
  nextBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 18 },
  nextBtnText: { color: '#FFF', fontSize: 16, fontWeight: '900', letterSpacing: 2 },
});
