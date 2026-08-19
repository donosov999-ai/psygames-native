/* psygames-game-versions-registry · VER 1 · 20.08.2026 */
/**
 * РЕЕСТР РЕДАКЦИЙ НЕ ИМЕЕТ ПРАВА РАСХОДИТЬСЯ СО ШТАМПАМИ.
 *
 * 🔴 ЗАЧЕМ. Редакция экрана уходит в репорт тестировщика. Если реестр отстанет
 * от штампов, репорт начнёт врать про редакцию — а это хуже, чем не иметь
 * редакции вовсе: по вранью чинят не то. Файл генерируется, поэтому проверка
 * простая и жёсткая: собрать заново и сверить с закоммиченным.
 *
 * ⚠️ Гейт НЕ переписывает рабочий файл: сборка идёт во временный, сверка —
 * строкой. Тест, меняющий репозиторий, однажды затрёт чужую правку.
 */
import { GAME_VERSIONS, gameVersionOf, gameVersionLabel } from '@/src/constants/gameVersions';

declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync, readdirSync, unlinkSync, existsSync } = require('fs');
const { join } = require('path');
const { execFileSync } = require('child_process');

const ROOT = join(__dirname, '../..');
const GENERATED = join(ROOT, 'src/constants/gameVersions.ts');
const SCREENS: string[] = readdirSync(join(ROOT, 'app/games')).filter((f: string) => f.endsWith('.tsx'));

describe('реестр редакций экранов', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(SCREENS.length).toBeGreaterThan(50);
    expect(Object.keys(GAME_VERSIONS).length).toBeGreaterThan(50);
  });

  it('🔴 собранный заново реестр совпадает с закоммиченным', () => {
    const tmp = join(ROOT, `.game-versions-check-${process.pid}.ts`);
    try {
      execFileSync(process.execPath, [join(ROOT, 'scripts/gen-game-versions.mjs')], {
        env: { ...process.env, GAME_VERSIONS_OUT: tmp }, stdio: 'pipe',
      });
      const fresh = readFileSync(tmp, 'utf8') as string;
      const committed = readFileSync(GENERATED, 'utf8') as string;
      expect(`реестр свеж: ${fresh === committed}`).toBe('реестр свеж: true');
    } finally {
      if (existsSync(tmp)) unlinkSync(tmp);
    }
  });

  it('🔴 у каждого экрана упражнения есть редакция', () => {
    const missing = SCREENS
      .map((f) => f.replace(/\.tsx$/, ''))
      .filter((id) => !GAME_VERSIONS[id])
      .map((id) => `${id}: экран есть, редакции нет`);
    expect(missing).toEqual([]);
  });

  it('в реестре нет записей про исчезнувшие экраны', () => {
    const ghosts = Object.keys(GAME_VERSIONS).filter((id) => !SCREENS.includes(`${id}.tsx`));
    expect(ghosts).toEqual([]);
  });

  /** Подпись уходит в репорт, поэтому проверяем ровно то, что там окажется. */
  it('подпись для репорта читается человеком, а неизвестный экран не выдумывается', () => {
    const known = Object.keys(GAME_VERSIONS)[0];
    expect(gameVersionLabel(known)).toMatch(/^VER \d+ · \d{2}\.\d{2}\.\d{4}$/);
    expect(gameVersionLabel('нет-такого-экрана')).toBeNull();
    expect(gameVersionLabel(null)).toBeNull();
    expect(gameVersionOf(undefined)).toBeNull();
  });

  /** Редакция обязана быть настоящим номером, а не нулём и не строкой. */
  it('номера редакций — целые от единицы', () => {
    const bad = Object.entries(GAME_VERSIONS)
      .filter(([, v]) => !Number.isInteger(v.ver) || v.ver < 1)
      .map(([id, v]) => `${id}: VER ${v.ver}`);
    expect(bad).toEqual([]);
  });
});
