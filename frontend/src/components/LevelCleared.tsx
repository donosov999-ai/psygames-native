import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { sndWin } from '@/src/services/feedback';
import { tickLevelStreak, resetLevelStreak } from '@/src/services/eyeRestTracker';
import { saveLevelStars } from '@/src/services/levelStars';
import { getCleanRun, cleanRunBonus } from '@/src/services/cleanRun';
import { useProfile } from '@/src/contexts/ProfileContext';
import { useLanguage } from '@/src/contexts/LanguageContext';

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
const LEVELS_HINT_KEY = 'psygames_levels_hint_seen';   // глобальный флаг: подсказку «уровни по порядку» показать один раз на всё приложение

interface Props {
  level: number;            // текущий уровень (passed: N ✓ → N+1; !passed: N — ещё раз)
  stars?: number;           // 1–3 (только при passed)
  passed?: boolean;         // прошёл чисто? false → баннер «почти, ещё раз» + рестарт того же уровня
  gradient: string[];
  language: string;
  colors: any;
  autoMs?: number;          // авто-старт следующего (по умолчанию 2200мс)
  gameId?: string;          // для персиста звёзд по уровням (psygames_<gameId>_stars_<profileId>)
  onContinue: () => void;   // запустить следующий уровень (passed) / тот же уровень заново (!passed)
  onStop: () => void;       // выйти (config / домой)
}

export default function LevelCleared({ level, stars = 3, passed = true, gradient, colors, autoMs = 2200, gameId, onContinue, onStop }: Props) {
  const { t } = useLanguage();   // язык берём из контекста; проп language остался в Props для совместимости вызовов из игр
  const { profile } = useProfile();
  const firedRef = useRef(false);
  // вычисляем ОДНАЖДЫ при маунте: пора ли передышка для глаз (10-й уровень подряд).
  // Считаем «уровни подряд» только за ЧИСТЫЕ прохождения — провал серию обнуляет.
  const restRef = useRef<boolean | null>(null);
  if (restRef.current === null) restRef.current = passed ? tickLevelStreak() : (resetLevelStreak(), false);
  const isRest = restRef.current;
  const [restLeft, setRestLeft] = useState(EYE_REST_SEC);
  const [cleanRun, setCleanRun] = useState(0);   // серия чистых раундов (🔥), тикается в saveSession
  const [showLevelsHint, setShowLevelsHint] = useState(false);   // одноразовая подпись «уровни по порядку» при первом чистом прохождении

  const go = () => { if (firedRef.current) return; firedRef.current = true; onContinue(); };
  const stop = () => { firedRef.current = true; resetLevelStreak(); onStop(); };

  useEffect(() => {
    if (passed) sndWin();
    if (passed && gameId && profile?.id) saveLevelStars(gameId, profile.id, level, stars);   // лучшие звёзды за уровень
    // Одноразовый хинт «уровни идут по порядку»: при ПЕРВОМ чистом прохождении любого уровня
    // показываем подпись и сразу ставим глобальный флаг (больше не покажем на всё приложение).
    if (passed) {
      AsyncStorage.getItem(LEVELS_HINT_KEY).then((seen) => {
        if (!seen) { setShowLevelsHint(true); AsyncStorage.setItem(LEVELS_HINT_KEY, '1'); }
      }).catch(() => {});
    }
    // Серия чистых: читаем с задержкой — тик идёт в saveSession, а игры ставят
    // setPhase('cleared') ДО await saveSession (module-кэш cleanRun сгладит гонку).
    let runTimer: ReturnType<typeof setTimeout> | null = null;
    if (passed && profile?.id && stars === 3) {
      const pid = profile.id;
      runTimer = setTimeout(async () => {
        try { const r = await getCleanRun(pid); if (r >= 2) setCleanRun(r); } catch {}
      }, 350);
    }
    if (isRest) {
      // передышка для глаз: interval только обновляет отображение, go() — отдельным
      // таймером (не внутри setState-updater → нет setState после unmount)
      const iv = setInterval(() => setRestLeft((s) => Math.max(0, s - 1)), 1000);
      const to = setTimeout(go, EYE_REST_SEC * 1000);
      return () => { clearInterval(iv); clearTimeout(to); if (runTimer) clearTimeout(runTimer); };
    }
    const t = setTimeout(go, autoMs);
    return () => { clearTimeout(t); if (runTimer) clearTimeout(runTimer); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── передышка для глаз (каждый 10-й уровень подряд) ───
  if (isRest) {
    return (
      <View style={[styles.full, { backgroundColor: colors.background }]}>
        <LinearGradient colors={['#43cea2', '#185a9d']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
          <Ionicons name="eye-outline" size={56} color="#FFFFFF" />
          <Text style={styles.title}>{t('eyeBreakTitle')}</Text>
          <Text style={styles.restHint}>
            {t('eyeBreakHint')}
          </Text>
          <Text style={styles.restTimer}>{restLeft}</Text>
        </LinearGradient>
        <View style={styles.btns}>
          <TouchableOpacity style={[styles.btn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
            onPress={go} activeOpacity={0.85}>
            <Ionicons name="play-skip-forward" size={20} color={colors.text} />
            <Text style={[styles.btnText, { color: colors.text }]} numberOfLines={1}>{t('skip')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── обычный баннер уровня ───
  // passed=false → «почти, ещё раз»: тот же уровень авто-рестарт (onContinue читает
  // lvl.level, который при провале не рос). Убирает «обрыв» — поток не кидает в тупик.
  return (
    <View style={[styles.full, { backgroundColor: colors.background }]}>
      <LinearGradient colors={gradient as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <Text style={styles.emoji}>{passed ? '🎉' : '💪'}</Text>
        <Text style={styles.title}>
          {t(passed ? 'levelDone' : 'levelAlmost').replace('{n}', String(level))}
        </Text>
        {passed && (
          <View style={styles.stars}>
            {[1, 2, 3].map((i) => (
              <Ionicons key={i} name={i <= stars ? 'star' : 'star-outline'} size={36} color={i <= stars ? '#FFD93B' : 'rgba(255,255,255,0.5)'} />
            ))}
          </View>
        )}
        {passed && cleanRun >= 2 && (
          <View style={styles.runBadge}>
            <Text style={styles.runText}>
              {t('cleanRunBadge').replace('{n}', String(cleanRun))}
              {cleanRunBonus(cleanRun) > 0 ? ` · +${cleanRunBonus(cleanRun)} ⭐` : ''}
            </Text>
          </View>
        )}
        <Text style={styles.next}>
          {passed
            ? t('levelStarting').replace('{n}', String(level + 1))
            : t('sameLevelRetry')}
        </Text>
        {passed && showLevelsHint && (
          <Text style={styles.levelsHint}>
            {t('levelsInOrderHint')}
          </Text>
        )}
      </LinearGradient>
      <View style={styles.btns}>
        <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={go} activeOpacity={0.85}>
          <Ionicons name={passed ? 'play' : 'refresh'} size={20} color="#FFFFFF" />
          <Text style={styles.btnText} numberOfLines={1}>{passed ? t('nextNow') : t('retry')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
          onPress={stop} activeOpacity={0.85}>
          <Ionicons name="stop" size={20} color={colors.text} />
          <Text style={[styles.btnText, { color: colors.text }]} numberOfLines={1}>{t('stop')}</Text>
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
  runBadge: { backgroundColor: 'rgba(0,0,0,0.25)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, marginBottom: 12 },
  runText: { color: '#FFD93B', fontSize: 14, fontWeight: '800' },
  next: { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  levelsHint: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.75)', textAlign: 'center', marginTop: 10, lineHeight: 18 },   // одноразовая подпись про порядок уровней
  restHint: { fontSize: 15, fontWeight: '500', color: 'rgba(255,255,255,0.92)', textAlign: 'center', marginBottom: 12, lineHeight: 21 },
  restTimer: { fontSize: 52, fontWeight: '900', color: '#FFFFFF' },
  btns: { width: '100%', marginTop: 24 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 12, marginBottom: 8 },
  btnText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF', flexShrink: 1 },   // крупный шрифт: усечь, не выдавить за кнопку
});
