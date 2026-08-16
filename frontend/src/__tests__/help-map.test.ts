/**
 * СПРАВКА «КАК ИГРАТЬ» ОТКРЫВАЕТСЯ У КАЖДОЙ ИГРЫ.
 *
 * ЗАЧЕМ. GameHelpOverlay берёт текст так: HELP_MAP[route]. Маршрута нет в карте —
 * кнопка справки молча не показывает НИЧЕГО. Ошибки на экране при этом нет, и
 * заметить это можно только ткнув в каждую игру руками.
 *
 * ⚠️ КАК ЭТО ПРОИЗОШЛО. Карта помечена AUTO-GENERATED, а генератор жил по пути
 * /tmp/gen_helpmap.js — так и было написано в её шапке. /tmp вычистился, скрипт
 * пропал, каталог вырос, карта осталась: 51 маршрут против 63. Двенадцать игр
 * молчали, и нашлось это случайно — при сборке гайда для бота 14.08.2026.
 * Генератор теперь лежит в репозитории: frontend/scripts/gen-helpmap.mjs.
 *
 * ХРАПОВИК, А НЕ СТЕНА. Семи играм текста справки не написано вовсе — это не
 * поломка связи, а отсутствие контента, и одним заходом его не закрыть: нужен
 * перевод на 12 языков, он отдан i18n-codex-mac. Поэтому здесь известный долг,
 * который может только УМЕНЬШАТЬСЯ: перевели и завели ключи — опускаем число,
 * назад дороги нет. Тот же приём, что у японского долга в i18n-coverage.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync } = require('fs');
const { join } = require('path');

import { HELP_MAP } from '../constants/helpMap';

const SRC = join(__dirname, '..');
const games: string = readFileSync(join(SRC, 'constants/games.ts'), 'utf8');
const dict: string = readFileSync(join(SRC, 'contexts/LanguageContext.tsx'), 'utf8');

/** Маршруты каталога — источник истины о составе. */
const routes = [...new Set([...games.matchAll(/route:\s*'(\/games\/[a-z0-9-]+)'/g)].map((m) => m[1]))];

/**
 * Известный долг на 16.08.2026 — игры без написанного текста справки.
 * Менять ТОЛЬКО в меньшую сторону, по мере появления текстов.
 */
const NO_TEXT_YET = 7;

describe('карта справки', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(routes.length).toBeGreaterThan(55);
    expect(Object.keys(HELP_MAP).length).toBeGreaterThan(50);
  });

  it('в карте нет маршрутов, которых нет в каталоге', () => {
    const stale = Object.keys(HELP_MAP).filter((r) => !routes.includes(r));
    expect(stale).toEqual([]);
  });

  /** Долг только вниз: закрыли текст — опустили число, и обратно уже не поднять. */
  it('игр без справки не больше известного долга', () => {
    const without = routes.filter((r) => !HELP_MAP[r]);
    expect(`без справки ${without.length}: ${without.join(', ')}`)
      .toBe(`без справки ${Math.min(without.length, NO_TEXT_YET)}: ${without.join(', ')}`);
  });

  /**
   * Ключ, на который карта ссылается, обязан существовать в словаре. Иначе
   * справка откроется ПУСТОЙ — а это хуже отсутствующей кнопки: человек нажал,
   * получил пустоту и решил, что приложение сломано.
   */
  it('каждый ключ справки есть в словаре', () => {
    const keys = new Set([...dict.matchAll(/^ {2}([A-Za-z0-9_]+):\s*\{/gm)].map((m) => m[1]));
    const broken = Object.entries(HELP_MAP)
      .filter(([, e]) => !keys.has((e as any).introKey))
      .map(([r, e]) => `${r} → ${(e as any).introKey}`);
    expect(broken).toEqual([]);
  });

  /** Генератор обязан лежать в репозитории: предыдущий жил в /tmp и пропал. */
  it('генератор карты лежит в проекте, а не во временной папке', () => {
    const head = readFileSync(join(SRC, 'constants/helpMap.ts'), 'utf8').slice(0, 300);
    expect(head).toContain('scripts/gen-helpmap.mjs');
    expect(head).not.toContain('/tmp/');
  });
});
