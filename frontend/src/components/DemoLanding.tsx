/**
 * DemoLanding — главный экран web-demo сборки (EXPO_PUBLIC_BUILD_TARGET=web-demo).
 *
 * Решение Дениса (07.2026): публичный /play/ на psy-games.pro = ТОЛЬКО ДЕМО —
 * сайт-лендинг направляет в приложение (готовим платность, снимаем стор-риск дубля).
 *
 * Вместо полного каталога: лого-вордмарк (logo6 бренд) + заголовок-инвайт +
 * карточка «игры дня» (getTodayChallenge) с кнопкой «Играть» + CTA «Скачать
 * приложение» → страница /download промо-сайта на языке пользователя.
 * Никакого каталога / профилей / шапки с магазином.
 *
 * ?embed=1 — минимальный хром: прячем шапку лендинга (лого-блок) для iframe-встройки.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { getTodayChallenge, challengeToParams } from '@/src/services/daily-challenge';
import { demoDownloadUrl, isEmbed } from '@/src/services/buildTarget';
import { LOGO_VARIANTS } from '@/src/constants/profileLogos';

export default function DemoLanding() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  const { embed } = useLocalSearchParams<{ embed?: string }>();
  const embedded = embed === '1' || isEmbed();
  const challenge = useMemo(() => getTodayChallenge(), []);

  const playToday = () => {
    // Тот же URL-preset механизм, что и полный вызов дня, но без pending-стрика
    // (в демо прогресс/стрики не персистятся).
    router.push({ pathname: challenge.game.route, params: challengeToParams(challenge) } as any);
  };

  const openDownload = () => {
    Linking.openURL(demoDownloadUrl(language)).catch(() => {});
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={[colors.primary + '26', 'transparent']}
        start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 240 }}
        pointerEvents="none"
      />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Шапка лендинга — при ?embed=1 скрыта (минимальный хром для iframe) */}
        {!embedded && (
          <View style={styles.logoWrap}>
            <View style={[styles.logoPlate, { backgroundColor: colors.surface + 'CC' }]}>
              {/* logo6 — «мозг + надпись», бренд-вариант вордмарка */}
              <Image source={LOGO_VARIANTS[6]} style={styles.logo} resizeMode="contain" />
            </View>
          </View>
        )}

        <Text style={[styles.title, { color: colors.text }]}>{t('demoTitle')}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('demoSubtitle')}</Text>

        {/* Карточка «игра дня» — ротация детерминирована по дате (getTodayChallenge) */}
        <LinearGradient
          colors={challenge.game.gradient as [string, string]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <View style={styles.cardTopRow}>
            <Ionicons name="flash" size={26} color="#FFF" />
            <View style={styles.cardChip}>
              <Text style={styles.cardChipText}>{t('dailyChallenge')}</Text>
            </View>
          </View>
          <Text style={styles.cardTitle}>{t(challenge.game.nameKey)}</Text>
          <Text style={styles.cardSub} numberOfLines={2}>
            {t(challenge.game.descKey)} · {t(challenge.difficulty)}
          </Text>
          <TouchableOpacity style={styles.playBtn} onPress={playToday} activeOpacity={0.85}>
            <Ionicons name="play" size={18} color="#FFF" />
            <Text style={styles.playBtnText}>{t('ctaStart')}</Text>
          </TouchableOpacity>
        </LinearGradient>

        {/* CTA: полная версия — в приложении */}
        <TouchableOpacity
          style={[styles.downloadBtn, { backgroundColor: colors.primary }]}
          onPress={openDownload}
          activeOpacity={0.85}
        >
          <Ionicons name="download-outline" size={20} color="#FFF" />
          <Text style={styles.downloadBtnText} numberOfLines={2}>{t('demoDownloadCta')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    padding: 20,
    paddingTop: 28,
    gap: 14,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  logoWrap: { alignItems: 'center' },
  logoPlate: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 7,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  logo: { height: 52, width: 230 },
  title: { fontSize: 24, fontWeight: '900', textAlign: 'center', lineHeight: 30 },
  subtitle: { fontSize: 14, fontWeight: '600', textAlign: 'center', lineHeight: 20 },
  card: { borderRadius: 18, padding: 18, gap: 8, marginTop: 6 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardChip: { backgroundColor: 'rgba(0,0,0,0.3)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  cardChipText: { color: '#FFF', fontWeight: '800', fontSize: 11, letterSpacing: 0.5 },
  cardTitle: { color: '#FFF', fontSize: 22, fontWeight: '900' },
  cardSub: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '600', lineHeight: 18 },
  playBtn: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 12,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 6,
  },
  playBtnText: { color: '#FFF', fontWeight: '900', fontSize: 15, letterSpacing: 1 },
  downloadBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  downloadBtnText: { color: '#FFF', fontWeight: '800', fontSize: 16, flexShrink: 1, textAlign: 'center' },
});
