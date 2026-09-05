/* psygames-game-scholars-mate · VER 1 · 05.09.2026 */
/**
 * «Детский мат» — заученные этюды на СКОРОСТЬ.
 *
 * ПРОСЬБА ДЕНИСА 05.09.2026: «хочу упражнение для шахматной доски (детский мат),
 * чтобы чисто на скорость делать заученные этюды», и отдельно — «детский мат с
 * жертвой».
 *
 * ЧТО ТРЕНИРУЕТ. Не расчёт вариантов, а УЗНАВАНИЕ УЗОРА. Chase & Simon (1973):
 * мастер держит в голове не фигуры, а знакомые куски позиции, и именно этим
 * отличается от новичка сильнее, чем глубиной перебора. Здесь узор один и тот
 * же — ферзь и слон на f7/f2, — и меряется, за сколько глаз его находит.
 *
 * ⚠️ ЭТО НЕ «ШАХМАТЫ ВСЛЕПУЮ». Там позицию держат в уме и ходят по одной фигуре
 * медленно; здесь позиция на виду и всё решает скорость. Разные навыки, разные
 * замеры, две отдельные игры — объединять их нельзя.
 *
 * ОТКУДА ПОЗИЦИИ. Два источника, оба готовы: свой генератор на python-chess
 * (718 матов, 378 «защитись», 756 «грозит ли») и база задач Lichess под CC0 —
 * из 6,1 млн задач отобраны настоящие детские маты из партий, 480 по лестнице
 * рейтинга и 434 с ЖЕРТВОЙ. Сборщик: `scripts/build-scholars-mate.mjs`.
 *
 * 🔴 ГЛАВНАЯ ЦИФРА ПОДХОДА — МЕДИАНА ВРЕМЕНИ, а не доля решённых. У человека,
 * который узор знает, доля почти всегда единица, и роста по ней не видно.
 * Растёт скорость: 6 секунд → 2 → 1,2. Она и уходит в сессию.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import GameShell from '@/src/components/GameShell';
import GameSetupBar, { SETUP_BAR_SPACE } from '@/src/components/GameSetupBar';
import GradientSurface from '@/src/components/GradientSurface';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import LevelCleared from '@/src/components/LevelCleared';
import GameResult from '@/src/components/GameResult';
import { HELP_CORNER_SPACE } from '@/src/components/GameHelpOverlay';
import { onGradientText } from '@/src/services/onGradientText';
import { goBackOrHome } from '@/src/utils/nav';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import { gameNow } from '@/src/services/gamePause';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { useScreenWidth } from '@/src/hooks/useScreenWidth';
import { useGameMode, shouldChainNextLevel } from '@/src/hooks/useGameMode';
import ScholarsMateGame from '@/src/games/scholars-mate/ScholarsMateGame';
import { LEVELS, counts, levelParams } from '@/src/games/scholars-mate/core/deck';
import type { ScholarsResult } from '@/src/games/scholars-mate/core/types';

const GRADIENT = ['#8e5b2f', '#2f2a24'];
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);

/**
 * Порог прохождения — три четверти позиций.
 *
 * ⚠️ Выше брать нельзя: время на позицию падает с уровнем, и на верхних
 * ступенях одна прозеванная позиция — это уже 1/8 подхода. Уровень должен
 * браться уверенным узнаванием, а не безошибочностью под секундомером.
 */
const PASS = 0.75;

type Phase = 'config' | 'playing' | 'cleared' | 'result';

export default function ScholarsMateScreen() {
  const { colors } = useTheme();
  const { language, t } = useLanguage();
  // ⚠️ Свой хук, а не голый useWindowDimensions: тот на первом кадре отдаёт 0,
  // и доска встала бы нулевого размера. Гейт ширины это ловит.
  const width = useScreenWidth();
  const lvl = usePersistentLevel('scholars_mate');
  const { isPreset, autostart, num, isCalm } = useGamePreset();
  useCalmHush(isCalm);
  const mode = useGameMode();

  const [phase, setPhase] = React.useState<Phase>('config');
  const [last, setLast] = React.useState<ScholarsResult | null>(null);
  const [clearedPassed, setClearedPassed] = React.useState(false);
  const [armed, setArmed] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);

  const level = num('level', lvl.level);
  const п = levelParams(level);

  /** Уровень, на котором ИГРАЛИ: `lvl.reach` поднимает потолок раньше, чем рисуется итог. */
  const [playedLevel, setPlayedLevel] = React.useState<number | null>(null);
  const shownLevel = playedLevel ?? level;

  useAutostartWhenReady(() => autostart && lvl.loaded, () => setPhase('playing'));

  const onComplete = React.useCallback(async (r: ScholarsResult) => {
    const passed = r.accuracy >= PASS;
    setLast(r);
    setPlayedLevel(level);
    if (!isPreset && passed && shouldChainNextLevel(mode)) lvl.reach(level + 1);
    else if (!isPreset && !passed) lvl.fail();

    if (isPreset) setPhase('result');
    else { setClearedPassed(passed); setPhase('cleared'); }

    try {
      await saveSession({
        passed,
        game_type: 'scholars_mate',
        score: r.solved,
        time_seconds: Math.round(r.attempts.reduce((s, a) => s + a.ms, 0) / 1000),
        difficulty: level <= 10 ? 'easy' : level <= 25 ? 'medium' : 'hard',
        mode: `${п.seconds}s`,
        errors: r.total - r.solved,
        details: {
          level,
          accuracy: r.accuracy,
          /** 🔴 Предмет этой игры. Всё остальное — обстановка вокруг него. */
          median_ms: r.medianMs,
          best_ms: r.bestMs,
          streak: r.streak,
          kinds: п.kinds.join('+'),
        },
      });
    } catch (err) { console.error(err); }
  }, [isPreset, mode, level, lvl, п.seconds, п.kinds]);

  /**
   * Звёзды по СКОРОСТИ, а не по доле решённых.
   *
   * ⚠️ Иначе три звезды получал бы любой, кто просто дорешал подход, и лестница
   * перестала бы что-либо значить: узор-то один. Пороги — доли отведённого на
   * позицию времени: уложился в треть — три звезды.
   */
  const stars = React.useMemo(() => {
    if (!last || !last.solved) return 1;
    const доля = last.medianMs / (п.seconds * 1000);
    return доля <= 0.33 ? 3 : доля <= 0.6 ? 2 : 1;
  }, [last, п.seconds]);

  const start = () => { setPlayedLevel(null); setArmed(false); setAttempt((n) => n + 1); setPhase('playing'); };

  if (phase === 'playing') {
    const сторона = Math.min(width - 32, 420);
    return (
      <GameShell title={t('scholarsMate')} onBack={() => setPhase('config')} confirmExit={armed}>
        <ScholarsMateGame
          key={attempt}
          level={level}
          seed={attempt + 1}
          size={сторона}
          now={gameNow}
          theme={{
            surface: colors.surface, text: colors.text, textSecondary: colors.textSecondary,
            border: colors.border, primary: GRADIENT[0]!, success: '#12a594', danger: '#e24b4a',
          }}
          onProgress={setArmed}
          onComplete={onComplete}
          labels={{
            mate: t('scholarsMateAsk'),
            defend: t('scholarsDefendAsk'),
            threat: t('scholarsThreatAsk'),
            sacrifice: t('scholarsSacrificeAsk'),
            yes: t('scholarsYes'),
            no: t('scholarsNo'),
            best: t('scholarsBest'),
            timeUp: t('timeIsUp'),
            sec: t('secShort'),
          }}
        />
      </GameShell>
    );
  }

  const c = counts();

  return (
    <SafeAreaView style={[стили.корень, { backgroundColor: colors.background }]}>
      <GradientSurface colors={GRADIENT as [string, string]} style={стили.шапка}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <Text style={[стили.заголовок, { color: ON_GRAD.color }]} numberOfLines={1}>{t('scholarsMate')}</Text>
        {/* Резерв под сквозной уголок (питомец + «Правила») — см. HELP_CORNER_SPACE. */}
        <View style={{ width: HELP_CORNER_SPACE }} />
      </GradientSurface>

      {phase === 'config' && (
        <ScrollView contentContainerStyle={стили.тело}>
          <LevelProgressMap bestLevel={lvl.best} gameId="scholars_mate" currentLevel={level}
            maxLevel={LEVELS} onPickLevel={lvl.pick} colors={colors} language={language} />

          <View style={[стили.карточка, { backgroundColor: colors.surface }]}>
            <Text style={[стили.уровень, { color: colors.text }]}>{t('level')} {level}</Text>
            <Text style={[стили.подсказка, { color: colors.textSecondary }]}>{t('scholarsMateDesc')}</Text>
            <View style={стили.строка}>
              <Ionicons name="timer-outline" size={18} color={colors.textSecondary} />
              <Text style={[стили.подсказка, { color: colors.text }]}>
                {п.seconds} {t('secShort')} · {п.count}
              </Text>
            </View>
            <Text style={[стили.мелко, { color: colors.textSecondary }]}>
              {c.mate + c.fromGames} · {c.defend} · {c.threat} · {c.sacrifice}
            </Text>
            {/* Источник называем по правилу лицензии CC0. */}
            <Text style={[стили.мелко, { color: colors.textSecondary }]}>Lichess puzzle DB · CC0</Text>
          </View>
        </ScrollView>
      )}

      {phase === 'config' && (
        <GameSetupBar label={t('start')} onStart={start} colors={GRADIENT as [string, string]} />
      )}

      {phase === 'cleared' && (
        <LevelCleared gameId="scholars_mate" level={shownLevel} stars={stars} passed={clearedPassed}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={start} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && last && (
        <GameResult score={last.solved} time={Math.round(last.medianMs) / 1000}
          errors={last.total - last.solved}
          onPlayAgain={start} onGoHome={() => goBackOrHome()}
          gradient={GRADIENT as [string, string]} />
      )}
    </SafeAreaView>
  );
}

const стили = StyleSheet.create({
  корень: { flex: 1 },
  шапка: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  заголовок: { fontSize: 20, fontWeight: '700', flexShrink: 1, minWidth: 0, marginHorizontal: 8 },
  тело: { padding: 16, gap: 14, paddingBottom: SETUP_BAR_SPACE },
  карточка: { padding: 16, borderRadius: 16, gap: 8 },
  уровень: { fontSize: 18, fontWeight: '700' },
  подсказка: { fontSize: 14 },
  мелко: { fontSize: 12 },
  строка: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
