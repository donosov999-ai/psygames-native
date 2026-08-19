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

/** Поимённые исключения: настенные часы здесь ПРАВИЛЬНЫ. */
const CALENDAR_OK: Record<string, string> = {
  'breathing.tsx': 'вчерашняя календарная дата для подсчёта серии',
  'vocab-srs.tsx': 'срок следующего повторения — расписание, а не длительность партии',
};

describe('дисциплина игровых часов', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(FILES.length).toBeGreaterThan(50);
  });

  it('🔴 ни один экран не меряет время партии настенными часами', () => {
    const bad: string[] = [];
    for (const f of FILES) {
      const src = readFileSync(join(DIR, f), 'utf8') as string;
      src.split('\n').forEach((line, i) => {
        if (!line.includes('Date.now()')) return;
        if (line.trim().startsWith('*') || line.trim().startsWith('//')) return;   // комментарий
        if (CALENDAR_OK[f]) return;
        bad.push(`${f}:${i + 1} — ${line.trim().slice(0, 80)}`);
      });
    }
    expect(bad).toEqual([]);
  });

  /** Исключение без обоснования — это забытая правка, а не исключение. */
  it('каждое исключение существует и объяснено', () => {
    for (const [f, why] of Object.entries(CALENDAR_OK)) {
      expect(FILES).toContain(f);
      expect(why.length).toBeGreaterThan(20);
      const src = readFileSync(join(DIR, f), 'utf8') as string;
      expect(src.includes('Date.now()')).toBe(true);   // исключение перестало быть нужным — убрать его
    }
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
});
