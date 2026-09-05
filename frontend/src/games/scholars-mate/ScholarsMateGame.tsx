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
import { buildDeck, buildNamedDeck, levelParams } from './core/deck';
import { check, movesFrom, shownFen, sideToMove, threatAnswer, дополнитьХод } from './core/check';
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
  /**
   * 🔴 РЕЖИМ ПОТОКА — просьба Дениса 05.09.2026: «надо добавить режим поток,
   * 10 минут, без перерыва». Позиции идут подряд, пока не кончится время;
   * колода кончиться не может — она добирается новыми наборами.
   */
  flowMs?: number;
  /**
   * Имя узора по его коду. Функция, а не строка: узор МЕНЯЕТСЯ от позиции к
   * позиции, и статическая подпись врала бы на каждой второй.
   */
  motifName?: (motif: string) => string;
  /** Играть только одним видом заданий — так устроен режим «Мат с жертвой». */
  onlyKind?: 'mate' | 'defend' | 'threat' | 'fromGames' | 'sacrifice';
  /** Отрабатывать один именованный узор (выпадающий список на экране настройки). */
  namedMotif?: string;
  labels: {
    mate: string; defend: string; threat: string; sacrifice: string;
    yes: string; no: string; best: string; timeUp: string; sec: string;

  };
}

export default function ScholarsMateGame({
  level, seed = 1, size, theme, now, onComplete, onProgress, labels, flowMs, motifName, onlyKind, namedMotif,
}: ScholarsMateGameProps) {
  const п = React.useMemo(() => levelParams(level), [level]);
  /**
   * В потоке колода набирается длинной: несколько наборов подряд, без повторов
   * между ними. Десять минут при секунде-двух на позицию — это сотни позиций.
   */
  const колода = React.useMemo(() => {
    if (namedMotif) {
      // Отработка одного узора: в потоке — длинный набор, иначе обычный подход.
      return buildNamedDeck(namedMotif, level, seed, flowMs ? 200 : undefined);
    }
    if (!flowMs) return buildDeck(level, seed, onlyKind);
    const наборов = Math.max(4, Math.ceil(flowMs / 1000 / 3 / levelParams(level).count));
    const всё: ScholarsAttempt['puzzle'][] = [];
    const видели = new Set<string>();
    for (let n = 0; n < наборов; n++) {
      for (const p of buildDeck(level, seed + n * 101, onlyKind)) {
        const ключ = `${p.fen}|${p.pre ?? ''}`;
        if (видели.has(ключ)) continue;
        видели.add(ключ);
        всё.push(p);
      }
    }
    return всё;
  }, [level, seed, flowMs, onlyKind, namedMotif]);
  const началоПотока = React.useRef(0);

  const [шаг, setШаг] = React.useState(0);
  const [fen, setFen] = React.useState(() => shownFen(колода[0]!));
  const [выбрана, setВыбрана] = React.useState<string | null>(null);
  const [подсветка, setПодсветка] = React.useState<string[]>([]);
  const [вердикт, setВердикт] = React.useState<{ ok: boolean; best?: string } | null>(null);
  const [осталось, setОсталось] = React.useState(п.seconds);
  /**
   * Сколько осталось до конца потока, «м:сс».
   *
   * ⚠️ СЧИТАЕТСЯ В ТИКЕ, А НЕ В РЕНДЕРЕ. Первая редакция брала `now()` и
   * `началоПотока.current` прямо при отрисовке — это чтение ref во время
   * рендера, на которое линтер ругается по делу: значение может разъехаться с
   * тем, что React уже нарисовал.
   */
  const [потокОсталось, setПотокОсталось] = React.useState('');
  /**
   * 🔴 МАТ С ЖЕРТВОЙ ДОИГРЫВАЕТСЯ ДО МАТА, А НЕ ОБРЫВАЕТСЯ ПОСЛЕ ЖЕРТВЫ.
   *
   * 📍 ЧТО БЫЛО. Верность решалась строкой `line[0] === uci`: человек отдавал
   * фигуру, видел «✓» и ехал дальше. Мат он не ставил НИ РАЗУ на всех 371
   * позиции — то есть упражнение, названное «мат с жертвой», заканчивалось до
   * мата. А жертва без мата — это просто отданная фигура.
   *
   * Теперь после верного хода играется ответ соперника, и спрашивается
   * следующий ход. Замер времени идёт на ВСЮ линию: предмет упражнения —
   * узнать связку целиком, а не её первый ход.
   */
  const [шагЛинии, setШагЛинии] = React.useState(0);
  /** Когда палец коснулся доски впервые на этой позиции. 0 — ещё не касался. */
  const первоеКасание = React.useRef(0);
  const попытки = React.useRef<ScholarsAttempt[]>([]);
  const началоRef = React.useRef(now());
  React.useEffect(() => { началоПотока.current = now(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  /**
   * 🔴 ПОДХОД ЗАКАНЧИВАЕТСЯ РОВНО ОДИН РАЗ.
   *
   * 📍 ЧТО БЫЛО. `дальше` на последней позиции звал `onComplete` и делал
   * `return`, но секундомер продолжал идти по старому `началоRef`: замер
   * 05.09.2026 — через 25 секунд после конца подхода `onComplete` был вызван
   * ПЯТЬ раз, а попыток записано 13 вместо 8. До человека это не доходило
   * только потому, что экран синхронно снимает модуль, — то есть беда жила
   * ровно до первого случая, когда снимет не сразу.
   */
  const кончено = React.useRef(false);
  /** Замок от второй попытки в ОДНОМ кадре: `вердикт` доезжает только к следующему. */
  const отвечаем = React.useRef(false);

  const задача = колода[шаг];

  /** Перейти к следующей позиции или закончить подход. */
  const дальше = React.useCallback(() => {
    отвечаем.current = false;
    первоеКасание.current = 0;
    setШагЛинии(0);
    setВердикт(null);
    setВыбрана(null);
    setПодсветка([]);
    const след = шаг + 1;
    const потокВышел = flowMs ? now() - началоПотока.current >= flowMs : false;
    if (след >= колода.length || потокВышел) {
      if (кончено.current) return;
      кончено.current = true;
      const верные = попытки.current.filter((a) => a.correct);
      let серия = 0; let лучшая = 0;
      for (const a of попытки.current) { серия = a.correct ? серия + 1 : 0; лучшая = Math.max(лучшая, серия); }
      const времена = верные.map((a) => a.msFirst);
      onComplete({
        attempts: попытки.current,
        solved: верные.length,
        total: попытки.current.length,
        medianMs: медианаМс(времена),
        medianFullMs: медианаМс(верные.map((a) => a.ms)),
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
  }, [шаг, колода, onComplete, п.seconds, now, flowMs]);

  /** Записать попытку и показать ответ на секунду. */
  /**
   * 🔴 ЗАМОК СТОИТ НА REF, А НЕ НА СОСТОЯНИИ.
   *
   * 📍 `if (вердикт) return` защищает только между КАДРАМИ: состояние доезжает
   * к следующей перерисовке, а внутри одного кадра его ещё нет. Замер: в кадре
   * без перерисовки набежало 1422 попытки на колоду из восьми позиций.
   */
  const ответить = React.useCallback((answer: string, correct: boolean, best?: string, timeout = false) => {
    if (!задача || отвечаем.current || кончено.current) return;
    отвечаем.current = true;
    const полное = now() - началоRef.current;
    попытки.current.push({
      puzzle: задача, answer, correct, timeout,
      ms: полное,
      // Не касался вовсе (прозевал по времени) — считаем полным временем.
      msFirst: первоеКасание.current ? первоеКасание.current - началоRef.current : полное,
    });
    onProgress?.(scholarsArmed(попытки.current));
    setВердикт({ ok: correct, best });
  }, [задача, now, onProgress]);

  /**
   * Секундомер. ⚠️ Идёт по ИГРОВЫМ часам (`now` приходит извне): пока человек
   * пишет отзыв или читает правила, время стоять обязано — иначе замер скорости
   * меряет чтение справки.
   */
  React.useEffect(() => {
    if (вердикт || кончено.current) return;
    const t = setInterval(() => {
      if (кончено.current) return;
      const прошло = (now() - началоRef.current) / 1000;
      const ост = Math.max(0, п.seconds - прошло);
      setОсталось(ост);
      if (flowMs) {
        const мс = Math.max(0, flowMs - (now() - началоПотока.current));
        const сек = Math.round(мс / 1000);
        setПотокОсталось(`${Math.floor(сек / 60)}:${String(сек % 60).padStart(2, '0')}`);
      }
      if (ост <= 0) ответить('', false, undefined, true);
    }, 100);
    return () => clearInterval(t);
  }, [вердикт, п.seconds, now, ответить, flowMs]);

  /**
   * Показ ответа, потом следующая позиция.
   *
   * 🔴 ЭФФЕКТ ЗАВИСИТ ТОЛЬКО ОТ ВЕРДИКТА, А `дальше` БЕРЁТСЯ ИЗ REF.
   *
   * 📍 ЧТО ЛОМАЛОСЬ. С `дальше` в зависимостях таймер перезаводился при каждой
   * смене его тождества, а оно менялось от любой перерисовки РОДИТЕЛЯ: экран
   * пересчитывал `levelParams(level)` каждый рендер, новый массив `kinds`
   * попадал в зависимости `onComplete`, тот менял `дальше`. Замер: 0
   * перерисовок — вердикт держится 550 мс, 1 — 650, 2 — 750, а при
   * перерисовке каждые 200 мс он не снимается ВООБЩЕ. Доска замирала, и
   * следующая позиция не приходила никогда.
   *
   * Мемоизация на экране это чинит, но чинит СНАРУЖИ: следующий, кто передаст
   * сюда стрелку прямо в разметке, вернёт беду. Поэтому модуль защищается сам.
   */
  const дальшеRef = React.useRef(дальше);
  React.useEffect(() => { дальшеRef.current = дальше; });
  React.useEffect(() => {
    if (!вердикт) return;
    const t = setTimeout(() => дальшеRef.current(), вердикт.ok ? 550 : 1400);
    return () => clearTimeout(t);
  }, [вердикт]);

  /**
   * 🔴 ДОСКА НЕ ПЕРЕВОРАЧИВАЕТСЯ ПОСРЕДИ ПОДХОДА.
   *
   * 📍 Замер по 2000 колод: ориентация менялась внутри подхода в 97% случаев —
   * 40% позиций идут за чёрных. В упражнении, которое целиком про узнавание
   * КАРТИНКИ, разворот доски между позициями добавляет к каждому замеру время
   * на переориентацию, и медиана этого не убирает: она убирает выбросы, а не
   * систематическую добавку.
   *
   * Ориентация берётся у ПЕРВОЙ позиции набора и держится весь подход. Узор
   * при этом остаётся узнаваемым: у чёрных он зеркальный по построению (f2
   * вместо f7), и человек видит его так же, как видел бы за доской.
   */
  const снизуБелые = React.useMemo(
    () => (колода[0] ? sideToMove(колода[0]) === 'w' : true),
    [колода],
  );

  if (!задача) return null;

  const тап = (имя: string) => {
    if (вердикт || задача.kind === 'threat') return;
    if (!первоеКасание.current) первоеКасание.current = now();
    if (выбрана && подсветка.includes(имя)) {
      const uci = дополнитьХод(fen, выбрана + имя);
      const линия = задача.line;
      /**
       * Позиция в два-три хода: ждём ход номер `шагЛинии * 2` из записи.
       * Верный — играем ответ соперника и остаёмся в той же позиции; неверный
       * или мат — закрываем попытку.
       */
      if (линия && линия.length > 1) {
        const ждём = линия[шагЛинии * 2];
        if (ждём !== uci) {
          setВыбрана(null); setПодсветка([]);
          ответить(uci, false, задача.san?.join(' '));
          return;
        }
        const g = new Chess(fen);
        try { g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci.length > 4 ? { promotion: uci[4] } : {}) }); } catch { /* невозможно: ход из записи */ }
        const ответСоперника = линия[шагЛинии * 2 + 1];
        if (ответСоперника) {
          try { g.move({ from: ответСоперника.slice(0, 2), to: ответСоперника.slice(2, 4) }); } catch { /* битая запись */ }
        }
        setFen(g.fen());
        setВыбрана(null);
        setПодсветка([]);
        if (g.isCheckmate() || !ответСоперника) {
          ответить(uci, true, задача.san?.join(' '));
        } else {
          setШагЛинии((n) => n + 1);
        }
        return;
      }
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
    if (!первоеКасание.current) первоеКасание.current = now();
    const истина = threatAnswer(задача);
    ответить(да ? 'yes' : 'no', да === истина, истина ? labels.yes : labels.no);
  };

  const ходовНет = задача.kind === 'threat';
  const клетка = размерКлетки(size);
  const сторона = ширинаДоски(size);
  const расстановка = расставить(fen);
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
      {/*
        🔴 УЗОР НАЗЫВАЕТСЯ. Замечание Дениса 05.09.2026: «по сути одна
        комбинация… я бы не сказал, что это разные». Половина беды была в том,
        что узоры и правда были одни; вторая — в том, что человек не видел их
        имени и не мог заметить, когда пришёл новый.
      */}
      {задача.motif && motifName ? (
        <Text style={[стили.узор, { color: theme.textSecondary }]}>{motifName(задача.motif)}</Text>
      ) : null}

      {/* Полоса времени — она и есть предмет упражнения, поэтому крупная. */}
      <View style={[стили.полоса, { backgroundColor: theme.border }]}>
        <View style={{
          height: '100%',
          width: `${Math.max(0, Math.min(100, (осталось / п.seconds) * 100))}%`,
          backgroundColor: осталось < п.seconds * 0.25 ? theme.danger : theme.primary,
          borderRadius: 4,
        }} />
      </View>
      {/*
        🔴 В ПОТОКЕ СЧЁТ ПОЗИЦИЙ БЕССМЫСЛЕН. Колода там набирается с запасом
        (195 позиций на десять минут), и «1/195» человеку ничего не говорит —
        он играет не набор, а время. Показываем, сколько осталось до конца.
      */}
      <Text style={[стили.счёт, { color: theme.textSecondary }]}>
        {осталось.toFixed(1)} {labels.sec} · {flowMs ? потокОсталось : `${шаг + 1}/${колода.length}`}
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
              /**
               * ⚠️ На вопросе «грозит ли мат» ходить нечем: ответ — «да»/«нет»
               * кнопками под доской. Клетки там НЕ кнопки: 64 мёртвые цели
               * нажатия сбивают и скринридер, и палец.
               */
              accessibilityRole={ходовНет ? 'image' : 'button'}
              accessibilityLabel={`${имя}${фигура ? `, ${фигура}` : ''}`}
              accessibilityState={ходовНет ? undefined : { selected: выбрана === имя }}
              disabled={ходовНет}
              onPress={ходовНет ? undefined : () => тап(имя)}
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
  узор: { fontSize: 12, textAlign: 'center' },
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
