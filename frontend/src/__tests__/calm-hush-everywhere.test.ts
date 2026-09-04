/**
 * ТИХИЙ ВЕЧЕР — ВО ВСЕХ ИГРАХ, А НЕ В ДВУХ.
 *
 * 🔴 ЗАЧЕМ. Вечерний и ночной шаг зарядки задуман как успокоение перед сном:
 * таймеры оттуда убрали после пяти репортов тестировщицы 18.08.2026. Звук
 * остался — писк на каждое действие делает ровно то же, что делал отсчёт.
 *
 * Правило `calm` до этого захода соблюдали ДВА экрана из 64, и причина не в
 * невнимательности: флаг читал каждый сам, а «каждый сам» на 64 экранах — это
 * гарантированный недосмотр. Поэтому глушение живёт в одном месте
 * (`services/feedback.soundOn`), включается одной строкой (`useCalmHush`) и
 * проверяется здесь по ВСЕМ играм разом.
 *
 * ⚠️ ЧТО ИМЕННО СТЕРЕЖЁМ — ДВЕ РАЗНЫЕ ВЕЩИ, и обе обязательны:
 *   1. ПОВЕДЕНИЕ слоя звука: поднятый флаг действительно затыкает звук и не
 *      перезаписывает тумблер человека. Это выполняется по-настоящему, вызовами.
 *   2. ПОДКЛЮЧЕНИЕ на каждом экране: строка есть и аргумент у неё живой
 *      (`isCalm` из useGamePreset), а не `false` для галочки.
 *
 * Одной первой мало: слой может работать, а не звать его никто — так и было.
 * Одной второй мало: строка может стоять во всех 64 файлах, а `soundOn()` о
 * флаге не спрашивать — и тогда весь обход бессмыслен.
 */
declare const __dirname: string;
declare function require(m: string): any;
const fs = require('fs');
const path = require('path');

import { setCalmHush, calmHushNow, soundOn, setSoundEnabled, getSoundEnabled } from '@/src/services/feedback';

const ROOT = path.join(__dirname, '../..');
const GAMES = path.join(ROOT, 'app/games');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const files: string[] = fs.readdirSync(GAMES).filter((f: string) => f.endsWith('.tsx')).sort();

/** Экран не играет — глушить нечего: это меню, отсюда уходят в саму игру. */
const NOT_A_GAME: Record<string, string> = {
  'attention-conflict.tsx': 'хаб: меню четырёх парадигм, звука на экране нет — ни своего, ни от карточки итога',
  'span.tsx': 'хаб: меню трёх модальностей охвата, звука на экране нет',
  'sudoku-hub.tsx': 'хаб: меню трёх досок судоку, звука на экране нет — ни своего, ни от карточки итога',
  // Шесть развилок 04.09.2026 — тот же случай: меню, а не игра. Звука на экране нет.
  'counting-hub.tsx': 'хаб: меню четырёх проб на счёт, звука на экране нет',
  'words-hub.tsx': 'хаб: меню шести проб на словарь, звука на экране нет',
  'hearing-hub.tsx': 'хаб: меню трёх проб на слух — звучат сами упражнения, не развилка',
  'search-hub.tsx': 'хаб: меню шести проб на зрительный поиск, звука на экране нет',
  'flexibility-hub.tsx': 'хаб: меню трёх проб на переключение, звука на экране нет',
  'risk-hub.tsx': 'хаб: меню трёх проб на решения под риском, звука на экране нет',
  'visual-memory-hub.tsx': 'хаб: меню трёх проб на зрительную память, звука на экране нет',
  'mnemonics-hub.tsx': 'хаб: меню четырёх мнемотехник, звука на экране нет',
  'languages-hub.tsx': 'хаб: зонтик над «Словами» и «Слухом», звука на экране нет',
  'towers-hub.tsx': 'хаб: меню двух проб на планирование, звука на экране нет',
  'routes-hub.tsx': 'хаб: меню двух головоломок на покрытие, звука на экране нет',
};

/**
 * ДОЛГ: файл правит соседний заход, строку туда не поставить без конфликта.
 * Список закрыт — новые сюда не дописываются. Файл освободился → строку ставят,
 * запись отсюда УБИРАЮТ, и проверка ниже следит, чтобы исключение не протухло.
 */
/**
 * ⚠️ ДОЛГ УМЕНЬШИЛСЯ 20.08.2026: анаграммы, маджонг и классическая судоку
 * глушение позвали. Все три стоят в вечерних наборах, то есть долг был не
 * теоретический — победный звук общей карточки играл человеку перед сном, а у
 * судоку вдобавок бежал секундомер. Что именно из этого где было — разобрано в
 * `evening-quiet-coverage.test.ts`, который следит за охватом наборов.
 *
 * Оставшиеся двое в вечерние наборы не входят: до них дойдёт очередь, но
 * человеку они сегодня не мешают.
 */
const DEBT = ['sudoku-fractal.tsx', 'sudoku-fractal-deep.tsx', 'sudoku-samurai.tsx'];

describe('слой звука знает про тихий шаг', () => {
  afterEach(() => setCalmHush(false));

  it('поднятый флаг затыкает звук', async () => {
    await setSoundEnabled(true);
    expect(soundOn()).toBe(true);
    setCalmHush(true);
    expect(calmHushNow()).toBe(true);
    expect(soundOn()).toBe(false);
  });

  it('🔴 глушение НЕ перезаписывает тумблер человека', async () => {
    await setSoundEnabled(true);
    setCalmHush(true);
    // Человек включил звук — после вечера он обязан остаться включённым.
    expect(await getSoundEnabled()).toBe(true);
    setCalmHush(false);
    expect(soundOn()).toBe(true);
  });

  it('выключенный звук тихий шаг не «включает»', async () => {
    await setSoundEnabled(false);
    setCalmHush(true);
    expect(soundOn()).toBe(false);
    setCalmHush(false);
    expect(soundOn()).toBe(false);
    await setSoundEnabled(true);
  });
});

describe('тихий шаг подключён на каждом игровом экране', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(files.length).toBeGreaterThan(60);
    const covered = new Set([...Object.keys(NOT_A_GAME), ...DEBT]);
    expect([...covered].filter((f) => !files.includes(f))).toEqual([]);
  });

  it('🔴 каждая игра зовёт useCalmHush', () => {
    const without: string[] = [];
    for (const f of files) {
      if (NOT_A_GAME[f] || DEBT.includes(f)) continue;
      if (!read(`app/games/${f}`).includes('useCalmHush(')) without.push(f);
    }
    expect(`без глушения: ${without.length} → ${without.join(', ')}`).toBe('без глушения: 0 → ');
  });

  /**
   * ⚠️ САМОЕ ВАЖНОЕ ЗДЕСЬ. Строка `useCalmHush(false)` прошла бы проверку выше и
   * не глушила НИЧЕГО — молча, как молчал бейдж отсчёта в SET. Поэтому сверяем
   * аргумент: он обязан быть тем самым флагом шага, взятым из useGamePreset.
   */
  it('🔴 аргумент живой: isCalm приходит из useGamePreset, а не подставлен', () => {
    const dead: string[] = [];
    for (const f of files) {
      if (NOT_A_GAME[f] || DEBT.includes(f)) continue;
      const src = read(`app/games/${f}`);
      if (!/useCalmHush\(isCalm\)/.test(src)) { dead.push(`${f}: аргумент не isCalm`); continue; }
      if (!/const \{[^}]*\bisCalm\b[^}]*\} = useGamePreset\(\)/.test(src)) {
        dead.push(`${f}: isCalm не из useGamePreset()`);
      }
    }
    expect(dead).toEqual([]);
  });

  /** Хук — на верхнем уровне компонента; из условия или из вложенной функции React его не примет. */
  it('строка стоит среди хуков компонента, а не внутри ветки', () => {
    const bad: string[] = [];
    for (const f of files) {
      if (NOT_A_GAME[f] || DEBT.includes(f)) continue;
      for (const line of read(`app/games/${f}`).split('\n')) {
        if (!line.includes('useCalmHush(')) continue;
        if (line.startsWith('import ')) continue;
        if (!/^ {2}useCalmHush\(/.test(line)) bad.push(`${f}: «${line.trim()}» не на верхнем уровне`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('хаб остаётся хабом: появился игровой каркас — нужна и тишина', () => {
    for (const [f, why] of Object.entries(NOT_A_GAME)) {
      expect(why.length).toBeGreaterThan(30);
      expect(`${f}: свой каркас партии — ${read(`app/games/${f}`).includes('<GameShell')}`)
        .toBe(`${f}: свой каркас партии — false`);
    }
  });

  it('долг не протух: записанный файл всё ещё без глушения', () => {
    const stale: string[] = [];
    for (const f of DEBT) {
      if (read(`app/games/${f}`).includes('useCalmHush(')) stale.push(`${f}: строка появилась — убрать из DEBT`);
    }
    expect(stale).toEqual([]);
  });

  it('долг не растёт', () => {
    expect(DEBT.length).toBeLessThanOrEqual(5);
  });
});
