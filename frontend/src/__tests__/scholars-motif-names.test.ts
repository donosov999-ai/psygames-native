/**
 * 🔴 У КАЖДОГО УЗОРА ЕСТЬ ЧЕЛОВЕЧЕСКОЕ ИМЯ НА ВСЕХ ЯЗЫКАХ.
 *
 * 📍 ПОВОД — ДЕФЕКТ, ДОЕХАВШИЙ ДО ВЫПУСКА. В 2.41.0 пулов для отработки было
 * 19, а имён я завёл 18: удушающий мат уже имел ключ от лестницы, и я его
 * пропустил. На экране первая строка списка показывала СЫРОЙ КЛЮЧ
 * `scholarsMotif_smotheredMate`. Нашлось только глазами на настоящей
 * iOS-сборке — ни одна проба этого не ловила.
 *
 * ⚠️ Проверяются ОБА конца: и что у пула есть ключ, и что ключ переведён. Одно
 * без другого этот дефект пропустит: ключ у `smotheredMate` был бы, а перевода
 * под этим именем — нет.
 */
import { MOTIF_KEY, NAMED_MOTIFS } from '@/src/games/scholars-mate/core/deck';

declare const __dirname: string;
declare function require(m: string): any;
const fs = require('fs');
const path = require('path');
const КОРЕНЬ = path.join(__dirname, '../..');

/** Русский текст ключа из базового словаря — читаем файлом, как соседние гейты. */
const базовый: string = fs.readFileSync(path.join(КОРЕНЬ, 'src/contexts/LanguageContext.tsx'), 'utf8');
function естьВБазовом(ключ: string): { ru?: string } | null {
  const re = new RegExp(`^\\s*${ключ}:\\s*\\{ ru: '((?:[^'\\\\]|\\\\.)*)'`, 'm');
  const m = re.exec(базовый);
  return m ? { ru: m[1] } : null;
}

describe('«Детский мат»: имена узоров', () => {
  it('есть что проверять: пулы и карта имён не пусты', () => {
    expect(NAMED_MOTIFS.length).toBeGreaterThanOrEqual(15);
    expect(Object.keys(MOTIF_KEY).length).toBeGreaterThanOrEqual(20);
  });

  it('🔴 у каждого пула отработки есть ключ имени', () => {
    const без = NAMED_MOTIFS.filter((имя) => !MOTIF_KEY[имя]);
    expect(без).toEqual([]);
  });

  it('🔴 у каждого узора лестницы тоже есть ключ', () => {
    for (const м of ['scholar', 'queenKnight', 'bishopF7', 'queenAlone', 'fool', 'knightOpening', 'smothered']) {
      expect(`${м}: ${Boolean(MOTIF_KEY[м])}`).toBe(`${м}: true`);
    }
  });

  it('🔴 каждый ключ имени переведён, а не остаётся ключом', () => {
    const без: string[] = [];
    for (const [узор, ключ] of Object.entries(MOTIF_KEY)) {
      if (!естьВБазовом(ключ)) без.push(`${узор} → ${ключ}`);
    }
    expect(без).toEqual([]);
  });

  it('🔴 имена не совпадают между собой — иначе два узора неразличимы', () => {
    const русские = NAMED_MOTIFS
      .map((имя) => естьВБазовом(MOTIF_KEY[имя]!)?.ru)
      .filter(Boolean);
    expect(new Set(русские).size).toBe(русские.length);
  });
});
