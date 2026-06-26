import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { sndWin } from '@/src/services/feedback';
import { tickLevelStreak, resetLevelStreak } from '@/src/services/eyeRestTracker';

/**
 * LevelCleared — короткий баннер между уровнями для АВТО-ПОТОКА (по выбору Дениса):
 * прошёл уровень чисто → «Уровень N ✓ ⭐⭐⭐» (~2с) → следующий стартует САМ (onContinue).
 * Кнопки «Дальше сразу» (мгновенно) и «Остановиться» (выход) дают контроль.
 * Полноэкранный GameResult остаётся для НЕ-пройденных попыток (переиграть/выйти).
 *
 * ГЛАЗ-РАЗРЯДКА (формат C): каждые 10 уровней ПОДРЯД (eyeRestTracker) баннер
 * заменяется на 20-сек передышку для глаз — отдых от азарта, потом авто-старт следующего.
 */

const EYE_REST_SEC = 20;

interface Props {
  level: number;            // пройденный уровень (баннер: N ✓ → N+1)
  stars?: number;           // 1–3
  gradient: string[];
  language: string;
  colors: any;
  autoMs?: number;          // авто-старт следующего (по умолчанию 2200мс)
  onContinue: () => void;   // запустить следующий уровень
  onStop: () => void;       // выйти (config / домой)
}

export default function LevelCleared({ level, stars = 3, gradient, language, colors, autoMs = 2200, onContinue, onStop }: Props) {
  const ru = language === 'ru';
  const firedRef = useRef(false);
  // вычисляем ОДНАЖДЫ при маунте: пора ли передышка для глаз (10-й уровень подряд)
  const restRef = useRef<boolean | null>(null);
  if (restRef.current === null) restRef.current = tickLevelStreak();
  const isRest = restRef.current;
  const [restLeft, setRestLeft] = useState(EYE_REST_SEC);

  const go = () => { if (firedRef.current) return; firedRef.current = true; onContinue(); };
  const stop = () => { firedRef.current = true; resetLevelStreak(); onStop(); };

  useEffect(() => {
    sndWin();
    if (isRest) {
      // передышка для глаз: обратный отсчёт, по нулю — авто-старт следующего
      const iv = setInterval(() => {
        setRestLeft((s) => {
          if (s <= 1) { clearInterval(iv); go(); return 0; }
          return s - 1;
        });
      }, 1000);
      return () => clearInterval(iv);
    }
    const t = setTimeout(go, autoMs);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── передышка для глаз (каждый 10-й уровень подряд) ───
  if (isRest) {
    return (
      <View style={[styles.full, { backgroundColor: colors.background }]}>
        <LinearGradient colors={['#43cea2', '#185a9d']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
          <Ionicons name="eye-outline" size={56} color="#FFFFFF" />
          <Text style={styles.title}>{ru ? 'Передышка для глаз' : 'Eye break'}</Text>
          <Text style={styles.restHint}>
            {ru ? 'Посмотри вдаль, поморгай. Дай глазам отдохнуть от азарта — играешь 10-й уровень подряд.'
                : 'Look into the distance, blink. Let your eyes rest — you’ve played 10 levels in a row.'}
          </Text>
          <Text style={styles.restTimer}>{restLeft}</Text>
        </LinearGradient>
        <View style={styles.btns}>
          <TouchableOpacity style={[styles.btn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
            onPress={go} activeOpacity={0.85}>
            <Ionicons name="play-skip-forward" size={20} color={colors.text} />
            <Text style={[styles.btnText, { color: colors.text }]}>{ru ? 'Пропустить' : 'Skip'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── обычный баннер уровня ───
  return (
    <View style={[styles.full, { backgroundColor: colors.background }]}>
      <LinearGradient colors={gradient as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <Text style={styles.emoji}>🎉</Text>
        <Text style={styles.title}>{ru ? `Уровень ${level} пройден!` : `Level ${level} done!`}</Text>
        <View style={styles.stars}>
          {[1, 2, 3].map((i) => (
            <Ionicons key={i} name={i <= stars ? 'star' : 'star-outline'} size={36} color={i <= stars ? '#FFD93B' : 'rgba(255,255,255,0.5)'} />
          ))}
        </View>
        <Text style={styles.next}>{ru ? `Уровень ${level + 1} запускается…` : `Starting level ${level + 1}…`}</Text>
      </LinearGradient>
      <View style={styles.btns}>
        <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={go} activeOpacity={0.85}>
          <Ionicons name="play" size={20} color="#FFFFFF" />
          <Text style={styles.btnText}>{ru ? 'Дальше сразу' : 'Next now'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
          onPress={stop} activeOpacity={0.85}>
          <Ionicons name="stop" size={20} color={colors.text} />
          <Text style={[styles.btnText, { color: colors.text }]}>{ru ? 'Остановиться' : 'Stop'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  full: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { width: '100%', borderRadius: 24, padding: 32, alignItems: 'center' },
  emoji: { fontSize: 56 },
  title: { fontSize: 26, fontWeight: '800', color: '#FFFFFF', marginTop: 12, marginBottom: 16, textAlign: 'center' },
  stars: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  next: { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  restHint: { fontSize: 15, fontWeight: '500', color: 'rgba(255,255,255,0.92)', textAlign: 'center', marginBottom: 12, lineHeight: 21 },
  restTimer: { fontSize: 52, fontWeight: '900', color: '#FFFFFF' },
  btns: { width: '100%', marginTop: 24 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 12, marginBottom: 8 },
  btnText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
});
