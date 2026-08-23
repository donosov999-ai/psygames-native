/**
 * КОНТРАКТ ТОЧЕК ВХОДА В ИГРУ — единая таблица «что можно, что нельзя».
 *
 * Заведён после того, как один и тот же класс бага прилетел дважды за вечер:
 * поведение ОДНОГО режима протекало в ДРУГОЙ.
 *   • v1.184 — зарядка ↔ ручной переход: отложенный автопереход не знал, что человек
 *     уже нажал «Далее» сам, и проглатывал следующую игру.
 *   • v1.186 — зарядка ↔ вызов дня: вызов запускался флагом зарядки `wu=1`, а в зарядке
 *     уровни не растут намеренно, и прогресс молча пропадал.
 * Оба раза ловилось репортами живого человека. Дешевле держать контракт здесь.
 *
 *   ┌──────────────────┬──────────┬────────────┬─────────┬──────────────────────────┐
 *   │ точка входа      │ метка    │ автостарт  │ уровни  │ настройки раунда         │
 *   ├──────────────────┼──────────┼────────────┼─────────┼──────────────────────────┤
 *   │ шаг зарядки      │ wu=1     │ да         │ НЕТ     │ из шага плейлиста        │
 *   │ вызов дня        │ auto=1   │ да         │ да      │ diff из вызова           │
 *   │ первый выбор     │ auto=1   │ да         │ да      │ easy из онбординга       │
 *   │ свободный запуск │ —        │ нет        │ да      │ свои, с экрана настроек  │
 *   │ веб-демо         │ сборка   │ как выше   │ НЕТ     │ демо-раунд               │
 *   └──────────────────┴──────────┴────────────┴─────────┴──────────────────────────┘
 *
 * Отсюда два разных флага, и путать их нельзя:
 *   isPreset  = wu           → «это шаг плейлиста»: уровни и настройки НЕ трогаем
 *   autostart = wu || auto   → «стартуй сразу, минуя intro»
 *
 * Проверки ниже статические — по исходникам. Так они видят ВСЕ 60 экранов сразу,
 * а не те, до которых дошли руки.
 */
declare const __dirname: string;
declare function require(id: string): any;

import { stepToParams } from '@/src/services/warmup';
import { challengeToParams, getTodayChallenge } from '@/src/services/daily-challenge';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '..');
const GAMES_DIR = path.resolve(SRC, '../app/games');
const read = (p: string) => fs.readFileSync(p, 'utf-8') as string;
const screens = (): string[] => fs.readdirSync(GAMES_DIR).filter((f: string) => f.endsWith('.tsx'));

describe('точки входа: метки не путаются', () => {
  it('шаг зарядки помечен wu и НЕ помечен auto', () => {
    const p = stepToParams({ game_id: 'schulte_table', game_route: '/games/schulte', difficulty: 'easy', est_duration_sec: 60 });
    expect(p.wu).toBe('1');
    expect(p.auto).toBeUndefined();
  });

  it('вызов дня помечен auto и НЕ помечен wu', () => {
    const p = challengeToParams(getTodayChallenge());
    expect(p.auto).toBe('1');
    expect(p.wu).toBeUndefined();
  });

  it('свободный запуск не несёт ни одной метки — экраны сами показывают intro', () => {
    // Контракт «пустых» параметров: их формирует не код, а отсутствие параметров в URL.
    // Здесь фиксируем, что метки ставятся РОВНО в перечисленных местах, и больше нигде.
    //
    // 23.08.2026 в список добавлен `warmupEntries.ts` — «Зарядка» научилась
    // запускать СЕРИЮ БЛОКОВ (три таблицы Шульте, три режима корректурки). Она
    // ставит `auto: '1'`, но НЕ `wu: '1'`, и это принципиально: шаг зарядки
    // уровень не двигает, а серия блоков ведёт свой уровень по модели C — под
    // `wu` её прогресс встал бы намертво. Разбор — в шапке того модуля.
    const all = [
      ...walk(path.resolve(SRC, 'services')),
      ...walk(path.resolve(SRC, 'hooks')),
      ...walk(path.resolve(SRC, '../app')),
    ];
    const wuSetters = all.filter((f) => /\bwu:\s*'1'/.test(read(f)));
    const autoSetters = all.filter((f) => /\bauto:\s*'1'/.test(read(f)));
    expect(wuSetters.map(base)).toEqual(['warmup.ts']);
    expect(autoSetters.map(base)).toEqual(['daily-challenge.ts', 'warmupEntries.ts', 'onboarding.tsx']);
  });
});

describe('точки входа: экраны игр соблюдают разделение', () => {
  it('autostart считается как wu ИЛИ auto — иначе вызов дня снова упрётся в intro', () => {
    const hook = read(path.resolve(SRC, 'hooks/useGamePreset.ts'));
    expect(hook).toMatch(/autostart\s*=\s*isPreset\s*\|\|\s*params\?\.auto === '1'/);
  });

  it('ни один экран не решает про УРОВЕНЬ по autostart — это дело isPreset', () => {
    const bad = screens().filter((f) => /!autostart\s*&&/.test(read(path.join(GAMES_DIR, f))));
    expect(bad).toEqual([]);
  });

  it('ни один экран не автостартует по isPreset — это дело autostart', () => {
    const bad = screens().filter((f) => {
      const s = read(path.join(GAMES_DIR, f));
      return /if \(isPreset\)\s*start/.test(s) || /useAutostart\(isPreset/.test(s);
    });
    expect(bad).toEqual([]);
  });

  it('ни один экран не читает метки из URL мимо useGamePreset', () => {
    const bad = screens().filter((f) => /params\.(wu|auto)\b|['"]wu['"]\s*\]/.test(read(path.join(GAMES_DIR, f))));
    expect(bad).toEqual([]);
  });
});

describe('точки входа: веб-демо не пишет прогресс', () => {
  it('уровень в демо не растёт и не сохраняется', () => {
    const lvl = read(path.resolve(SRC, 'hooks/usePersistentLevel.ts'));
    // reach() и fail() обязаны выходить раньше записи
    expect(lvl).toMatch(/const reach[\s\S]{0,120}IS_WEB_DEMO/);
    expect(lvl).toMatch(/const fail[\s\S]{0,120}IS_WEB_DEMO/);
  });
});

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') out.push(...walk(p)); }
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
function base(p: string): string { return path.basename(p); }
