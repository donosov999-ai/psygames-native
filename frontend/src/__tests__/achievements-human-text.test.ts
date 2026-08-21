/* psygames-achievements-human-text · VER 1 · 21.08.2026 */
/**
 * ЧЕЛОВЕК ЧИТАЕТ ЧЕЛОВЕЧЕСКИЙ ТЕКСТ, А НЕ ИМЯ ПОЛЯ ИЗ БАЗЫ.
 *
 * 🔴 ЧТО НАШЛОСЬ. Снимок экрана достижений 21.08.2026: у достижения «Тормоз
 * стальной» в описании стояло `flanker_effect < 30мс` — внутреннее имя метрики,
 * которым мы считаем результат внутри кода. И в русской строке, и в английской.
 * Тридцать достижений, у двадцати девяти текст человеческий, у одного — ключ.
 *
 * ⚠️ ПОЧЕМУ ЭТО НЕ МЕЛОЧЬ. Достижения — то немногое, что человек читает по
 * собственному желанию. Строка `flanker_effect` не говорит ему ничего и выдаёт,
 * что текст писали не для него. Игра при этом называется «Фланкер: стрелки», и
 * сказать то же самое по-русски можно без единого термина.
 *
 * ⚠️ ПОЧЕМУ ГЕЙТ ИЩЕТ СНЕЙК-КЕЙС. Отличить «человеческий текст» от «не очень»
 * машина не может. А вот слово_с_подчёркиванием в тексте для человека — почти
 * наверняка утёкший ключ: в живой речи так не пишут ни по-русски, ни
 * по-английски.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync } = require('fs');
const { join } = require('path');

const SRC = readFileSync(join(__dirname, '../services/achievements.ts'), 'utf8') as string;

interface Row { id: string; поля: Record<string, string> }

function rows(): Row[] {
  const out: Row[] = [];
  for (const m of SRC.matchAll(
    /\{\s*id:\s*'([a-z0-9_]+)'[^}]*?name_ru:\s*'([^']*)'[^}]*?name_en:\s*'([^']*)'[^}]*?desc_ru:\s*'([^']*)'[^}]*?desc_en:\s*'([^']*)'/g,
  )) {
    out.push({ id: m[1], поля: { name_ru: m[2], name_en: m[3], desc_ru: m[4], desc_en: m[5] } });
  }
  return out;
}

describe('текст достижений написан для человека', () => {
  it('есть что проверять — иначе гейт зелен вслепую', () => {
    expect(rows().length).toBeGreaterThanOrEqual(25);
  });

  it('🔴 ни в одном тексте нет утёкшего ключа со снейк-кейсом', () => {
    const плохие: string[] = [];
    for (const r of rows()) {
      for (const [поле, текст] of Object.entries(r.поля)) {
        const ключи = текст.match(/\b[a-z]+_[a-z_]+\b/g);
        if (ключи) плохие.push(`${r.id} · ${поле}: «${текст}» — ${ключи.join(', ')}`);
      }
    }
    expect(плохие).toEqual([]);
  });

  it('🔴 у каждого достижения текст есть на обоих языках', () => {
    const пустые: string[] = [];
    for (const r of rows()) {
      for (const [поле, текст] of Object.entries(r.поля)) {
        if (!текст.trim()) пустые.push(`${r.id} · ${поле}`);
      }
    }
    expect(пустые).toEqual([]);
  });

  /**
   * Карточка узкая по построению — две в ряд. Название в одну строку в неё не
   * влезает: «Memory grandmaster» обрезался в «Memory grand…».
   */
  it('🔴 название на карточке не режется одной строкой', () => {
    const экран = readFileSync(join(__dirname, '../../app/achievements.tsx'), 'utf8') as string;
    const код = экран.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    const m = код.match(/styles\.cardName[^>]*numberOfLines=\{(\d+)\}/);
    expect(`строк у названия: ${m?.[1] ?? 'не найдено'}`).toBe('строк у названия: 2');
  });
});
