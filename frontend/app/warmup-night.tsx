/* psygames-warmup-night-launch · VER 1 · 07.10.2026 */
/**
 * ЗАПУСК «НОЧНОЙ» ЗАРЯДКИ («Не спится») ИЗ РАЗВИЛКИ «РЕЛАКСАЦИЯ».
 *
 * Решение Дениса 07.10.2026 (b271f702): дыхание, глаза, пауза и ночной набор переезжают с
 * Главной в развилку «Релаксация». Карточка развилки — адрес, а ночной набор — не игра, а
 * серия слота `night` (`buildNightPlaylist`). Этот экран и есть её адрес: длину берёт ту же,
 * что запомнил выбор зарядки (`psygames_warmup_duration_night`), и запускает `startNight` —
 * тот подменяет этот адрес первым шагом (`router.replace`), так что «назад» сюда не вернёт.
 */
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useWarmup } from '@/src/contexts/WarmupContext';

/** Длина, которую запоминает выбор зарядки для ночи; не число из трёх — 5 минут. */
export async function nightDuration(): Promise<5 | 10 | 15> {
  const v = Number(await AsyncStorage.getItem('psygames_warmup_duration_night').catch(() => null));
  return v === 10 || v === 15 ? v : 5;
}

export default function WarmupNightLaunch() {
  const { colors } = useTheme();
  const warmup = useWarmup();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void nightDuration().then((d) => warmup.startNight(d));
  }, [warmup]);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
