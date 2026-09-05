/* psygames-scholars-mate-game · VER 1 · 05.09.2026 */
/**
 * «Детский мат» — доска, секундомер и колода позиций.
 *
 * 🔴 ЗДЕСЬ МЕРЯЕТСЯ ВРЕМЯ, А НЕ ПРАВИЛЬНОСТЬ. Просьба Дениса 05.09.2026: «чисто
 * на скорость делать заученные этюды». Узор один и тот же на всех уровнях; на
 * него не думают, его УЗНАЮТ. Поэтому главная цифра подхода — медиана времени
 * верного ответа, а не доля решённых: доля у знающего человека всё равно почти
 * единица, и по ней роста не видно.
 *
 * ⚠️ ДОСКА БЕРЁТ ФИГУРЫ У «ШАХМАТ ВСЛЕПУЮ». Набор SVG (`CHESS_PIECE_SVG`) уже
 * нарисован и уже проверен глазами Дениса: «найди нормальную доску и нормальные
 * фигуры». Второй набор рядом означал бы, что в двух играх фигуры разные.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { Chess } from 'chess.js';

import { CHESS_PIECE_SVG } from '@/src/games/chess-blind/core/pieces';
import { a11yDecor } from '@/src/services/a11y';
import { buildDeck, levelParams } from './core/deck';
import { check, movesFrom, shownFen, sideToMove, threatAnswer } from './core/check';
import { scholarsArmed, медианаМс, размерКлетки, ширинаДоски } from './core/run';
import type { ScholarsAttempt, ScholarsResult } from './core/types';

const БУКВЫ = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

/** Расстановка из FEN в массив 64 клеток, индекс 0 = a8. */
function расставить(fen: string): (string | null)[] {
  const доска = new Array<string | null>(64).fill(null);
  const ряды = fen.split(' ')[0]!.split('/');
  ряды.forEach((ряд, r) => {
    let c = 0;
    for (const знак of ряд) {
      if (знак >= '1' && знак <= '8') { c += Number(знак); continue; }
      const белая = знак === знак.toUpperCase();
      доска[r * 8 + c] = (белая ? 'W' : 'B') + знак.toUpperCase();
      c++;
    }
  });
  return доска;
}

const имяКлетки = (i: number) => `${БУКВЫ[i % 8]}${8 - Math.floor(i / 8)}`;

export interface ScholarsMateGameProps {
  level: number;
  seed?: number;
  size: number;
  theme: { surface: string; text: string; textSecondary: string; border: string; primary: string; success: string; danger: string };
  now: () => number;
  onComplete: (r: ScholarsResult) => void;
  onProgress?: (armed: boolean) => void;
  labels: {
    mate: string; defend: string; threat: string; sacrifice: string;
    yes: string; no: string; best: string; timeUp: string; sec: string;
  };
}

export default function ScholarsMateGame({
  level, seed = 1, size, theme, now, onComplete, onProgress, labels,
}: ScholarsMateGameProps) {
  const п = React.useMemo(() => levelParams(level), [level]);
  const колода = React.useMemo(() => buildDeck(level, seed), [level, seed]);

  const [шаг, setШаг] = React.useState(0);
  const [fen, setFen] = React.useState(() => shownFen(колода[0]!));
  const [выбрана, setВыбрана] = React.useState<string | null>(null);
  const [подсветка, setПодсветка] = React.useState<string[]>([]);
  const [вердикт, setВердикт] = React.useState<{ ok: boolean; best?: string } | null>(null);
  const [осталось, setОсталось] = React.useState(п.seconds);
  const попытки = React.useRef<ScholarsAttempt[]>([]);
  const началоRef = React.useRef(now());

  const задача = колода[шаг];

  /** Перейти к следующей позиции или закончить подход. */
  const дальше = React.useCallback(() => {
    setВердикт(null);
    setВыбрана(null);
    setПодсветка([]);
    const след = шаг + 1;
    if (след >= колода.length) {
      const верные = попытки.current.filter((a) => a.correct);
      let серия = 0; let лучшая = 0;
      for (const a of попытки.current) { серия = a.correct ? серия + 1 : 0; лучшая = Math.max(лучшая, серия); }
      const времена = верные.map((a) => a.ms);
      onComplete({
        attempts: попытки.current,
        solved: верные.length,
        total: попытки.current.length,
        medianMs: медианаМс(времена),
        bestMs: времена.length ? Math.min(...времена) : 0,
        streak: лучшая,
        accuracy: попытки.current.length ? верные.length / попытки.current.length : 0,
      });
      return;
    }
    setШаг(след);
    setFen(shownFen(колода[след]!));
    setОсталось(п.seconds);
    началоRef.current = now();
  }, [шаг, колода, onComplete, п.seconds, now]);

  /** Записать попытку и показать ответ на секунду. */
  const ответить = React.useCallback((answer: string, correct: boolean, best?: string, timeout = false) => {
    if (!задача || вердикт) return;
    попытки.current.push({ puzzle: задача, answer, correct, ms: now() - началоRef.current, timeout });
    onProgress?.(scholarsArmed(попытки.current));
    setВердикт({ ok: correct, best });
  }, [задача, вердикт, now, onProgress]);

  /**
   * Секундомер. ⚠️ Идёт по ИГРОВЫМ часам (`now` приходит извне): пока человек
   * пишет отзыв или читает правила, время стоять обязано — иначе замер скорости
   * меряет чтение справки.
   */
  React.useEffect(() => {
    if (вердикт) return;
    const t = setInterval(() => {
      const прошло = (now() - началоRef.current) / 1000;
      const ост = Math.max(0, п.seconds - прошло);
      setОсталось(ост);
      if (ост <= 0) ответить('', false, undefined, true);
    }, 100);
    return () => clearInterval(t);
  }, [вердикт, п.seconds, now, ответить]);

  /** Показ ответа, потом следующая позиция. */
  React.useEffect(() => {
    if (!вердикт) return;
    const t = setTimeout(дальше, вердикт.ok ? 550 : 1400);
    return () => clearTimeout(t);
  }, [вердикт, дальше]);

  if (!задача) return null;

  const тап = (имя: string) => {
    if (вердикт || задача.kind === 'threat') return;
    if (выбрана && подсветка.includes(имя)) {
      const uci = выбрана + имя;
      const v = check(задача, uci);
      if (v.fenAfter) setFen(v.fenAfter);
      ответить(uci, v.correct, v.best);
      return;
    }
    const ходы = movesFrom(fen, имя);
    if (!ходы.length) { setВыбрана(null); setПодсветка([]); return; }
    setВыбрана(имя);
    setПодсветка(ходы);
  };

  const ответДаНет = (да: boolean) => {
    if (вердикт) return;
    const истина = threatAnswer(задача);
    ответить(да ? 'yes' : 'no', да === истина, истина ? labels.yes : labels.no);
  };

  const клетка = размерКлетки(size);
  const сторона = ширинаДоски(size);
  const расстановка = расставить(fen);
  const снизуБелые = sideToMove(задача) === 'w';
  const порядок = снизуБелые
    ? Array.from({ length: 64 }, (_, i) => i)
    : Array.from({ length: 64 }, (_, i) => 63 - i);

  const вопрос = задача.kind === 'defend' ? labels.defend
    : задача.kind === 'threat' ? labels.threat
    : задача.kind === 'sacrifice' ? labels.sacrifice
    : labels.mate;

  return (
    <View style={стили.колонка}>
      <Text style={[стили.вопрос, { color: theme.text }]}>{вопрос}</Text>

      {/* Полоса времени — она и есть предмет упражнения, поэтому крупная. */}
      <View style={[стили.полоса, { backgroundColor: theme.border }]}>
        <View style={{
          height: '100%',
          width: `${Math.max(0, Math.min(100, (осталось / п.seconds) * 100))}%`,
          backgroundColor: осталось < п.seconds * 0.25 ? theme.danger : theme.primary,
          borderRadius: 4,
        }} />
      </View>
      <Text style={[стили.счёт, { color: theme.textSecondary }]}>
        {осталось.toFixed(1)} {labels.sec} · {шаг + 1}/{колода.length}
      </Text>

      <View style={[стили.доска, { width: сторона, height: сторона, borderColor: theme.border }]}>
        {порядок.map((i) => {
          const имя = имяКлетки(i);
          const тёмная = (Math.floor(i / 8) + (i % 8)) % 2 === 1;
          const фигура = расстановка[i];
          const цель = подсветка.includes(имя);
          return (
            <Pressable
              key={имя}
              accessibilityRole="button"
              accessibilityLabel={`${имя}${фигура ? `, ${фигура}` : ''}`}
              accessibilityState={{ selected: выбрана === имя }}
              onPress={() => тап(имя)}
              style={{
                width: клетка,
                height: клетка,
                backgroundColor: выбрана === имя ? '#f6d97a' : тёмная ? '#b0864f' : '#eddcbd',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {фигура ? (
                <SvgXml xml={CHESS_PIECE_SVG[фигура] ?? ''} width={клетка * 0.86} height={клетка * 0.86} />
              ) : null}
              {цель ? (
                <View
                  {...a11yDecor}
                  style={{
                    position: 'absolute',
                    width: фигура ? клетка * 0.9 : клетка * 0.3,
                    height: фигура ? клетка * 0.9 : клетка * 0.3,
                    borderRadius: клетка,
                    borderWidth: фигура ? 3 : 0,
                    borderColor: 'rgba(30,120,60,0.85)',
                    backgroundColor: фигура ? 'transparent' : 'rgba(30,120,60,0.45)',
                  }}
                />
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {задача.kind === 'threat' ? (
        <View style={стили.кнопки}>
          <Pressable accessibilityRole="button" accessibilityLabel={labels.yes} onPress={() => ответДаНет(true)}
            style={[стили.кнопка, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            <Text style={[стили.кнопкаТекст, { color: theme.text }]}>{labels.yes}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={labels.no} onPress={() => ответДаНет(false)}
            style={[стили.кнопка, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            <Text style={[стили.кнопкаТекст, { color: theme.text }]}>{labels.no}</Text>
          </Pressable>
        </View>
      ) : null}

      {вердикт ? (
        <Text style={[стили.вердикт, { color: вердикт.ok ? theme.success : theme.danger }]}>
          {вердикт.ok ? '✓' : `✕ ${вердикт.best ? `${labels.best} ${вердикт.best}` : ''}`}
        </Text>
      ) : (
        <Text style={[стили.вердикт, { color: 'transparent' }]}>·</Text>
      )}
    </View>
  );
}

const стили = StyleSheet.create({
  колонка: { alignItems: 'center', gap: 8, width: '100%' },
  вопрос: { fontSize: 15, fontWeight: '600', textAlign: 'center', paddingHorizontal: 12 },
  полоса: { height: 8, borderRadius: 4, width: '86%', overflow: 'hidden' },
  счёт: { fontSize: 13 },
  доска: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: 2, borderRadius: 6, overflow: 'hidden' },
  кнопки: { flexDirection: 'row', gap: 12 },
  // 48 — норма цели нажатия на поле; по ним стучат весь подход.
  кнопка: { minHeight: 48, minWidth: 110, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  кнопкаТекст: { fontSize: 16, fontWeight: '700' },
  вердикт: { fontSize: 17, fontWeight: '700', minHeight: 24 },
});

/** Проверка на месте: доска рисуется из FEN тем же разбором, что и chess.js. */
export function _расставитьДляПроб(fen: string) {
  const мой = расставить(fen);
  const их = new Chess(fen).board().flat().map((c) => (c ? (c.color === 'w' ? 'W' : 'B') + c.type.toUpperCase() : null));
  return { мой, их };
}
