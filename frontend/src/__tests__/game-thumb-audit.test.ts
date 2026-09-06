/* psygames-game-thumb-audit · VER 1 · 21.08.2026 */
/**
 * ОБЛОЖКА КАРТОЧКИ ПОКАЗЫВАЕТ ИГРУ, А НЕ МЕНЮ.
 *
 * 🔴 ЧТО НАШЛОСЬ. 17 обложек из 48 — снимки экрана «About Game»: заголовок,
 * панель «How it works», кнопки Help и Start. Карточка рисует обложку фактурой
 * под своим названием, и текст чужого экрана просвечивает сквозь него. На
 * четырёх сверенных глазами снимках вдобавок ДВЕ стрелки «назад» подряд —
 * интерфейс, которого в приложении уже нет.
 *
 * ⚠️ ГЕЙТ ДЕРЖИТ ЗАГЛУШКУ, А НЕ ПОЧИНКУ. Пока обложки не пересняты с игрового
 * экрана, они приглушены до 0.1. Гейт следит за тремя вещами, и каждая — про
 * то, что список НЕ должен разойтись с картинками:
 *   · появилась новая обложка-меню → она обязана быть приглушена;
 *   · обложку пересняли (сменился отпечаток файла) → замер обязан быть пересчитан,
 *     иначе запись «это меню» переживёт замену и будет глушить хорошую картинку;
 *   · обложку удалили или добавили → запись обязана появиться/исчезнуть.
 *
 * Пересобрать замер: python3 ../scripts/gen_thumb_audit.py   ← из frontend/
 *                    (скрипт лежит в КОРНЕ репозитория, не во frontend/scripts)
 *
 * ⚠️ ПУТЬ ИСПРАВЛЕН 06.09.2026. Здесь стояло `scripts/gen_thumb_audit.py` — а
 * пробы запускаются из `frontend/`, где такого файла нет. Двое подряд прочитали
 * это как «скрипт отсутствует, подсказка ведёт в никуда» и пошли искать
 * несуществующую беду. Подсказка обязана быть копипастимой ОТТУДА, где стоит
 * человек, читающий ошибку.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync, readdirSync } = require('fs');
const { join } = require('path');
const { createHash } = require('crypto');

import { THUMB_AUDIT } from '@/src/constants/gameThumbAudit';
import { gameThumbOpacity } from '@/src/constants/gameThumbs';

const DIR = join(__dirname, '../../assets/images/gamethumbs');
const files = readdirSync(DIR).filter((f: string) => f.endsWith('.webp'));
const sha = (f: string) => createHash('sha256').update(readFileSync(join(DIR, f))).digest('hex').slice(0, 12);

describe('обложки карточек', () => {
  it('есть что проверять — иначе гейт зелен вслепую', () => {
    expect(files.length).toBeGreaterThanOrEqual(60);
    expect(Object.keys(THUMB_AUDIT).length).toBe(files.length);
  });

  it('🔴 замер не разошёлся с папкой: ни лишних записей, ни пропущенных обложек', () => {
    const onDisk = files.map((f: string) => f.slice(0, -5)).sort();
    expect(Object.keys(THUMB_AUDIT).sort()).toEqual(onDisk);
  });

  /**
   * Отпечаток — единственное, что связывает запись с КАРТИНКОЙ. Без него можно
   * переснять обложку с игрового экрана, а запись «это меню» останется, и новая
   * хорошая картинка будет глушиться до невидимости неизвестно почему.
   */
  it('🔴 обложку заменили — замер пересчитан (иначе запись врёт про картинку)', () => {
    const stale = files
      .filter((f: string) => THUMB_AUDIT[f.slice(0, -5)]?.sha !== sha(f))
      .map((f: string) => f.slice(0, -5));
    expect(`перемеряй: python3 ../scripts/gen_thumb_audit.py → ${stale.join(', ')}`)
      .toBe('перемеряй: python3 ../scripts/gen_thumb_audit.py → ');
  });

  it('🔴 обложка-меню обязана быть приглушена', () => {
    const loud = Object.entries(THUMB_AUDIT)
      .filter(([, a]) => a.about)
      .filter(([id]) => gameThumbOpacity(id) > 0.1)
      .map(([id]) => id);
    expect(loud).toEqual([]);
  });

  it('игровые обложки глушить незачем — фактура для того и нужна', () => {
    // Копия списка из gameThumbs.ts. proofreading убран оттуда 06.09.2026 вместе
    // с заменой снимка экрана на рисунок — здесь тоже, иначе список тихо разойдётся.
    const TEXT_HEAVY = new Set(['story_recall', 'reading_span', 'mnemonics', 'cloze']);
    const damped = Object.entries(THUMB_AUDIT)
      .filter(([id, a]) => !a.about && !TEXT_HEAVY.has(id) && gameThumbOpacity(id) < 0.22)
      .map(([id]) => id);
    expect(damped).toEqual([]);
  });

  /**
   * 🔴 ПОСЛЕ ПЕРЕСЪЁМКИ МЕНЮ НЕ ОСТАЛОСЬ — И ПРОВЕРЯТЬ НАДО ИМЕННО ЭТО.
   *
   * Прежние две проверки написаны, когда снимков меню было 17: одна требовала,
   * чтобы они существовали, вторая сравнивала их с игровыми. После пересъёмки
   * первая справедливо покраснела, а вторая позеленела ВХОЛОСТУЮ: `Math.min()`
   * пустого списка — это Infinity, и «у меню жёлтого втрое больше» стало
   * бессмысленно истинным. Проверка, которая не может покраснеть, не проверка.
   *
   * Теперь утверждение простое и проверяемое: ни одна обложка не снята с меню,
   * и ни одна к этому даже не близка — запас до порога не меньше трёхкратного.
   */
  const ABOUT_YELLOW = 0.25;   // порог из scripts/gen_thumb_audit.py

  it('🔴 ни одна обложка не снята с экрана «About»', () => {
    const menus = Object.entries(THUMB_AUDIT).filter(([, a]) => a.about).map(([id]) => id);
    expect(menus).toEqual([]);
  });

  it('🔴 и ни одна к этому не близка — запас до порога трёхкратный', () => {
    const worst = Object.entries(THUMB_AUDIT)
      .map(([id, a]) => [id, a.yellow] as const)
      .sort((x, y) => y[1] - x[1])[0];
    expect(`${worst[0]}: ${worst[1]} < ${ABOUT_YELLOW / 3}`)
      .toBe(`${worst[0]}: ${worst[1]} < ${ABOUT_YELLOW / 3}`);
    expect(worst[1]).toBeLessThan(ABOUT_YELLOW / 3);
  });

  /** Порог в самом замере не должен уползти так, чтобы ловить всё или ничего. */
  it('порог замера остался тем, под который считаны числа', () => {
    const gen = readFileSync(join(__dirname, '../../../scripts/gen_thumb_audit.py'), 'utf8') as string;
    expect(gen).toContain(`ABOUT_YELLOW = ${ABOUT_YELLOW}`);
  });

});
