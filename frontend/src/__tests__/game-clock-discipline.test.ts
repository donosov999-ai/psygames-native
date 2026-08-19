/**
 * ИГРЫ МЕРЯЮТ ВРЕМЯ ПО ИГРОВЫМ ЧАСАМ, А НЕ ПО НАСТЕННЫМ.
 *
 * 🔴 ЗАЧЕМ ГЕЙТ, А НЕ «ПРОСТО ПОЧИНИЛИ». Ровно этот баг чинился дважды.
 * Первый заход (19.08 утром) написал механику паузы и не подключил её: каркас
 * рисовал затемнение «Пауза», а `setInterval` в 37 экранах считали от
 * `Date.now()` и тикали дальше. Снаружи всё выглядело починенным — репорт
 * тестировщицы «пока я писала отзыв, игра закончилась» оставался живым.
 *
 * Следующая игра, написанная по образцу соседней, вернёт `Date.now()` обратно и
 * снова молча. Поэтому здесь запрет на уровне исходников.
 *
 * ЧТО РАЗРЕШЕНО. Настенные часы законны там, где речь о КАЛЕНДАРЕ, а не о
 * длительности партии: вчерашняя дата для серии, срок следующего повторения в
 * словаре. Такие места помечаются в списке ниже поимённо — молчаливых
 * исключений быть не должно.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync, readdirSync } = require('fs');
const { join } = require('path');

const DIR = join(__dirname, '../../app/games');
const FILES: string[] = readdirSync(DIR).filter((f: string) => f.endsWith('.tsx'));

/**
 * Поимённые исключения: настенные часы здесь ПРАВИЛЬНЫ.
 *
 * ⚠️ ИСКЛЮЧЕНИЕ ДАЁТСЯ НА ШТУКУ, А НЕ НА ФАЙЛ. Первая редакция писала
 * `if (CALENDAR_OK[f]) return;` — и файл, попавший в список ради одной
 * календарной даты, получал амнистию ЦЕЛИКОМ: любой новый `Date.now()` в нём,
 * хоть замер длительности партии, проходил молча. Дырка ровно того размера,
 * ради которого гейт и писался.
 *
 * Теперь у исключения есть счёт (`count`) и форма: каждая прощённая строка
 * обязана выглядеть как работа с КАЛЕНДАРЁМ (дата, сутки, час), а не с
 * длительностью. Прибавится ещё один вызов — красное, даже в этих двух файлах.
 */
interface CalendarUse {
  why: string;
  /** Сколько вызовов прощаем. Ровно столько и обязано быть — ни больше, ни меньше. */
  count: number;
}
const CALENDAR_OK: Record<string, CalendarUse> = {
  'breathing.tsx': { why: 'вчерашняя календарная дата для подсчёта серии', count: 1 },
  'vocab-srs.tsx': { why: 'срок следующего повторения — расписание, а не длительность партии', count: 1 },
};

/**
 * Как выглядит работа с календарём: сборка даты, сутки, час. Замер партии так не
 * пишут — там вычитают отметку начала и делят на секунды.
 */
const CALENDAR_SHAPE = /new Date\(|toISOString|getDate\(|setHours\(|86_?400_?000|3_?600_?000/;

/** Строки файла с настенными часами — без комментариев. */
function wallClockLines(src: string): { line: string; no: number }[] {
  return src.split('\n')
    .map((line, i) => ({ line, no: i + 1 }))
    .filter(({ line }) => line.includes('Date.now()')
      && !line.trim().startsWith('*') && !line.trim().startsWith('//'));
}

describe('дисциплина игровых часов', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(FILES.length).toBeGreaterThan(50);
  });

  it('🔴 ни один экран не меряет время партии настенными часами', () => {
    const bad: string[] = [];
    for (const f of FILES) {
      const src = readFileSync(join(DIR, f), 'utf8') as string;
      const uses = wallClockLines(src);
      const ok = CALENDAR_OK[f];
      if (!ok) {
        uses.forEach(({ line, no }) => bad.push(`${f}:${no} — ${line.trim().slice(0, 80)}`));
        continue;
      }
      // Прощаем ровно столько, сколько записано, и только календарные по форме.
      if (uses.length > ok.count) {
        bad.push(`${f}: вызовов ${uses.length}, прощено ${ok.count} — новый разбирать поимённо`);
      }
      uses.forEach(({ line, no }) => {
        if (!CALENDAR_SHAPE.test(line)) {
          bad.push(`${f}:${no} — прощено как календарь, но выглядит как замер: ${line.trim().slice(0, 70)}`);
        }
      });
    }
    expect(bad).toEqual([]);
  });

  /** Исключение без обоснования — это забытая правка, а не исключение. */
  it('каждое исключение существует и объяснено', () => {
    const stale: string[] = [];
    for (const [f, ok] of Object.entries(CALENDAR_OK)) {
      expect(FILES).toContain(f);
      expect(ok.why.length).toBeGreaterThan(20);
      const src = readFileSync(join(DIR, f), 'utf8') as string;
      const n = wallClockLines(src).length;
      // Меньше объявленного — исключение протухло: часы убрали, а амнистию забыли.
      if (n < ok.count) stale.push(`${f}: прощено ${ok.count}, а вызовов ${n} — убрать лишнее из списка`);
    }
    expect(stale).toEqual([]);
  });

  /** Кто меряет время — тот берёт часы из общего места, а не заводит свои. */
  it('экраны с отсчётом времени берут общие часы', () => {
    const bad: string[] = [];
    for (const f of FILES) {
      const src = readFileSync(join(DIR, f), 'utf8') as string;
      if (!src.includes('gameNow(')) continue;
      if (!src.includes("from '@/src/services/gamePause'")) bad.push(`${f}: зовёт gameNow, но не импортирует`);
    }
    expect(bad).toEqual([]);
  });

  /**
   * Два механизма часов сразу — вычитание паузы дважды и отсчёт быстрее
   * реального. Проверено на find-differences 19.08: там хук стоял первым.
   */
  it('никто не смешивает общие часы со своим хуком простоя', () => {
    const bad: string[] = [];
    for (const f of FILES) {
      const src = readFileSync(join(DIR, f), 'utf8') as string;
      if (src.includes('useHeldClock') && src.includes('gameNow(')) bad.push(`${f}: два механизма часов сразу`);
    }
    expect(bad).toEqual([]);
  });

  /**
   * ⏱ ВРЕМЯ КАК ПРЕДМЕТ ИГРЫ, А НЕ ФОН.
   *
   * У большинства экранов часы меряют ДЛИТЕЛЬНОСТЬ партии: сбились — обидно, но
   * играть можно. Есть игры, где время И ЕСТЬ задание. В «Ритме и высоте» ответ
   * сверяется с ожидаемым временем КАЖДОГО удара, а поправка задержки устройства
   * зажата в −250…+500 мс. Партию рисует модуль, и по умолчанию он берёт СВОИ
   * часы (`performance.now`). Стоит экрану считать по игровым, а модулю по своим —
   * и разница «ожидали / нажал» перестанет быть задержкой человека: она станет
   * разницей эпох двух таймеров, молча упрётся в границу и испортит счёт.
   *
   * Поэтому такому экрану мало не звать `Date.now` — он обязан ОТДАТЬ общие часы
   * своему модулю. Вторую половину (те же часы у синтезатора звука, который и
   * считает ожидаемое время сигнала) стережёт rhythm-pitch-integration.test.ts.
   */
  const CLOCK_IS_THE_GAME: Record<string, string> = {
    'rhythm-pitch.tsx': 'ответ сверяется с ожидаемым временем каждого удара, поправка задержки зажата в −250…+500 мс: разные часы у экрана и модуля молча упрутся в границу',
  };

  it('игра, где время и есть задание, отдаёт общие часы своему модулю', () => {
    const bad: string[] = [];
    for (const [f, why] of Object.entries(CLOCK_IS_THE_GAME)) {
      if (!FILES.includes(f)) { bad.push(`${f}: экрана нет — убрать из списка`); continue; }
      if (why.length < 40) bad.push(`${f}: причина не написана`);
      // Комментарии режем: объяснение в шапке экрана — не подключённые часы.
      const src = (readFileSync(join(DIR, f), 'utf8') as string).replace(/\/\*[\s\S]*?\*\//g, ' ');
      if (!/now=\{gameNow\}/.test(src)) bad.push(`${f}: модулю не отданы общие часы (now={gameNow}) — ритм поедет на паузе`);
    }
    expect(bad).toEqual([]);
  });
});
