/**
 * НОЛЬ ОТ СИСТЕМЫ НЕ ДОЛЖЕН УЕЗЖАТЬ В ВЁРСТКУ.
 *
 * 🔴 ЗАЧЕМ. В веб-сборке (Android у нас WebView — значит и телефон)
 * `useWindowDimensions()` на ПЕРВОМ кадре отдаёт 0 и обновляется только по
 * событию `resize`, которого при обычной загрузке экрана не бывает. Ноль
 * запекается в размеры навсегда — до поворота экрана.
 *
 * За один день 19.08.2026 ловушка сработала дважды:
 *   · тропинка уровней схлопнулась в полоску 24 px на 62 экранах из 64;
 *   · дорожка заставки между уровнями — со 280 px до 105.
 *
 * Второй раз — в НОВОМ файле, написанном через час после починки первого. Значит
 * дело не во внимательности, и запрет нужен машинный.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync, readdirSync, existsSync } = require('fs');
const { join } = require('path');
import { FALLBACK_SCREEN_W } from '@/src/hooks/useScreenWidth';

const ROOT = join(__dirname, '../..');

/** Все .tsx/.ts под app/ и src/, кроме тестов. */
function sources(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') sources(full, acc); continue; }
    if (/\.tsx?$/.test(e.name)) acc.push(full);
  }
  return acc;
}
const FILES = [...sources(join(ROOT, 'app')), ...sources(join(ROOT, 'src'))];

/**
 * Кому голый `useWindowDimensions()` разрешён — поимённо и с причиной.
 * Молчаливых исключений быть не должно: каждое здесь означает, что человек
 * посмотрел и решил, а не забыл.
 */
const RAW_OK: Record<string, string> = {
  'useScreenWidth.ts': 'сам хук-обёртка, он и есть защита',
};

/**
 * ДОЛГ: экраны, взявшие ширину напрямую ДО появления хука.
 *
 * Они не схлопываются — проверка первого кадра (`scripts/first-paint-audit.mjs`)
 * 19.08.2026 показала все 64 экрана чистыми. Держатся они на нижних
 * ограничителях вида `Math.max(14, ...)`, то есть случайно, а не по замыслу.
 *
 * Список закрыт: новые файлы сюда не дописываются, они обязаны брать хук. Когда
 * экран переводят на хук — строчку отсюда УБИРАЮТ, и отдельная проверка ниже
 * следит, чтобы протухшие исключения не копились.
 */
const DEBT: string[] = [
  'app/games/breathing.tsx',
  'app/games/chess-blind.tsx',
  'app/games/corsi.tsx',
  'app/games/counter.tsx',
  'app/games/cpt.tsx',
  'app/games/eye-gym.tsx',
  'app/games/find-differences.tsx',
  'app/games/goods-sort.tsx',
  'app/games/hanoi.tsx',
  'app/games/mahjong.tsx',
  'app/games/memory-matrix.tsx',
  'app/games/mnemonics.tsx',
  'app/games/n-back.tsx',
  'app/games/picture-pairs.tsx',
  'app/games/proofreading.tsx',
  'app/games/quick-count.tsx',
  'app/games/schulte.tsx',
  'app/games/sdmt.tsx',
  'app/games/spatial-span.tsx',
  'app/games/sudoku-fractal.tsx',
  'app/games/sudoku.tsx',
  'app/games/switching-task.tsx',
  'app/games/targets.tsx',
  'app/games/trail-making.tsx',
  'app/games/visual-search.tsx',
  'app/games/word-pairs.tsx',
  'app/index.tsx',
  'app/onboarding.tsx',
  'app/pet.tsx',
  'app/settings.tsx',
  'app/warmup-picker.tsx',
  'src/components/GameCard.tsx',
  'src/components/OrientationGuard.tsx',
  'src/components/pet/WalkingPet.tsx'
];

describe('ширина экрана', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(FILES.length).toBeGreaterThan(80);
    expect(existsSync(join(ROOT, 'src/hooks/useScreenWidth.ts'))).toBe(true);
  });

  it('запасная ширина — правдоподобный телефон, а не ноль и не заглушка', () => {
    expect(FALLBACK_SCREEN_W).toBeGreaterThanOrEqual(320);
    expect(FALLBACK_SCREEN_W).toBeLessThanOrEqual(430);
  });

  /**
   * Ловим не сам вызов, а вызов БЕЗ защиты: если рядом в файле есть проверка
   * `width > 0` или своя подстановка, автор про ноль подумал.
   */
  it('🔴 никто не берёт ширину окна без защиты от нуля', () => {
    const bad: string[] = [];
    for (const f of FILES) {
      const name = f.split('/').pop() as string;
      if (RAW_OK[name]) continue;
      const rel = f.replace(ROOT + '/', '');
      if (DEBT.includes(rel)) continue;                 // старый долг, перечислен выше
      const src = readFileSync(f, 'utf8') as string;
      if (!/useWindowDimensions\(\)/.test(src)) continue;
      const guarded = /width\s*>\s*0/.test(src) || /useScreenWidth/.test(src);
      if (!guarded) bad.push(`${rel}: useWindowDimensions() без защиты от нуля`);
    }
    expect(bad).toEqual([]);
  });

  /** Протухшее исключение — это забытая уборка, а не исключение. */
  it('долг не протух: каждый файл в списке существует и всё ещё берёт ширину напрямую', () => {
    const stale: string[] = [];
    for (const rel of DEBT) {
      const full = join(ROOT, rel);
      if (!existsSync(full)) { stale.push(`${rel}: файла нет — убрать из списка`); continue; }
      const src = readFileSync(full, 'utf8') as string;
      if (!/useWindowDimensions\(\)/.test(src) || /useScreenWidth/.test(src)) {
        stale.push(`${rel}: уже переведён на хук — убрать из списка`);
      }
    }
    expect(stale).toEqual([]);
  });

  it('долг не растёт', () => {
    expect(DEBT.length).toBeLessThanOrEqual(34);
  });

  it('каждое исключение существует и объяснено', () => {
    for (const [name, why] of Object.entries(RAW_OK)) {
      expect(why.length).toBeGreaterThan(15);
      expect(FILES.some((f: string) => f.endsWith('/' + name))).toBe(true);
    }
  });
});
