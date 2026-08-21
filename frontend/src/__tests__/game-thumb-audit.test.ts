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
 * Пересобрать замер: python3 scripts/gen_thumb_audit.py
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
    expect(`перемеряй: python3 scripts/gen_thumb_audit.py → ${stale.join(', ')}`)
      .toBe('перемеряй: python3 scripts/gen_thumb_audit.py → ');
  });

  it('🔴 обложка-меню обязана быть приглушена', () => {
    const loud = Object.entries(THUMB_AUDIT)
      .filter(([, a]) => a.about)
      .filter(([id]) => gameThumbOpacity(id) > 0.1)
      .map(([id]) => id);
    expect(loud).toEqual([]);
  });

  it('игровые обложки глушить незачем — фактура для того и нужна', () => {
    const TEXT_HEAVY = new Set(['story_recall', 'reading_span', 'mnemonics', 'proofreading', 'cloze']);
    const damped = Object.entries(THUMB_AUDIT)
      .filter(([id, a]) => !a.about && !TEXT_HEAVY.has(id) && gameThumbOpacity(id) < 0.22)
      .map(([id]) => id);
    expect(damped).toEqual([]);
  });

  /** Порог не должен превратиться в «всё подряд» или «ничего». */
  it('замер разделяет обложки, а не метит всё одинаково', () => {
    const about = Object.values(THUMB_AUDIT).filter((a) => a.about).length;
    expect(about).toBeGreaterThan(0);
    expect(about).toBeLessThan(files.length / 2);
  });

  /** Разрыв между меню и игрой должен остаться очевидным, а не «на волосок». */
  it('🔴 порог стоит в разрыве: у меню жёлтого втрое больше, чем у игры', () => {
    const yes = Object.values(THUMB_AUDIT).filter((a) => a.about).map((a) => a.yellow);
    const no = Object.values(THUMB_AUDIT).filter((a) => !a.about && a.yellow > 0).map((a) => a.yellow);
    expect(Math.min(...yes)).toBeGreaterThan(Math.max(...no) * 3);
  });
});
