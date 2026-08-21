/* psygames-screen-language-fallback · VER 1 · 21.08.2026 */
/**
 * ЗАПАСНОЙ ЯЗЫК — АНГЛИЙСКИЙ, А НЕ РУССКИЙ. И ЭКРАНЫ ВЕРХНЕГО УРОВНЯ ТОЖЕ.
 *
 * 🔴 ЧТО НАШЛОСЬ 21.08.2026. Гейт против зашитых строк (`ci-i18n-hardcode-guard`)
 * работает исправно — но смотрит РОВНО в `app/games/`. Экраны верхнего уровня
 * (достижения, магазин, лиги, настройки, питомец) он не видит вовсе, и на экране
 * достижений все пять развилок стояли задом наперёд: `language === 'en' ? … : …`,
 * то есть русское показывалось ВСЕМ, кроме англичан. Немец, японец, кореец,
 * араб видели русский заголовок, русские названия достижений и русские описания.
 *
 * Это в точности та системная беда, о которой стоит помнить: гейт держит ровно
 * то, куда его направили, и ни сантиметром дальше.
 *
 * ⚠️ ЧТО ЗДЕСЬ НЕ ПРОВЕРЯЕТСЯ. Не «нет зашитых строк» — это дело соседнего
 * гейта, и у него свой учёт долга. Здесь одно: если развилка по языку ЕСТЬ, она
 * обязана спрашивать про `'ru'`, оставляя английский всем остальным. Разница
 * между двумя направлениями — это разница между «незнакомый язык» и «нечитаемый
 * алфавит».
 *
 * ⚠️ ВЫБОР ЯЗЫКА ОБУЧЕНИЯ — НЕ ПЕРЕВОД. `language === 'en' ? 'es' : 'en'` в
 * языковых упражнениях значит «англоязычному преподаём испанский, остальным
 * английский», и это осмысленно. Такие развилки видно по форме — обе ветки
 * двухбуквенные коды — и они разрешены. Без этого исключения гейт потребовал бы
 * ломать работающую механику: замер 21.08 — 16 таких мест из 20.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync, readdirSync } = require('fs');
const { join } = require('path');

const APP = join(__dirname, '../..', 'app');
const GAMES = join(APP, 'games');

/** Комментарии срезаем: в пояснениях соседей это условие встречается дословно. */
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

function screens(): Array<{ name: string; src: string }> {
  const out: Array<{ name: string; src: string }> = [];
  for (const f of readdirSync(APP).filter((x: string) => x.endsWith('.tsx'))) {
    out.push({ name: f, src: code(readFileSync(join(APP, f), 'utf8') as string) });
  }
  for (const f of readdirSync(GAMES).filter((x: string) => x.endsWith('.tsx'))) {
    out.push({ name: `games/${f}`, src: code(readFileSync(join(GAMES, f), 'utf8') as string) });
  }
  return out;
}

/** Развилка «выбор языка обучения»: обе ветки — двухбуквенные коды. */
const TARGET_LANG = /language === 'en'\s*\?\s*'[a-z]{2}'\s*:\s*'[a-z]{2}'/;

describe('запасной язык экрана', () => {
  const all = screens();

  it('есть что проверять — иначе гейт зелен вслепую', () => {
    expect(all.length).toBeGreaterThan(70);
    expect(all.some((s) => s.name === 'achievements.tsx')).toBe(true);
    expect(all.some((s) => s.name.startsWith('games/'))).toBe(true);
  });

  it('🔴 экраны верхнего уровня входят в охват, а не только игры', () => {
    const top = all.filter((s) => !s.name.startsWith('games/')).map((s) => s.name);
    for (const must of ['achievements.tsx', 'shop.tsx', 'leagues.tsx', 'settings.tsx', 'index.tsx']) {
      expect(`${must} в охвате: ${top.includes(must)}`).toBe(`${must} в охвате: true`);
    }
  });

  it('🔴 нигде русское не подставляется всем, кроме англичан', () => {
    const wrong: string[] = [];
    for (const { name, src } of all) {
      for (const line of src.split('\n')) {
        if (!line.includes("language === 'en'")) continue;
        if (TARGET_LANG.test(line)) continue;          // выбор языка обучения — не перевод
        wrong.push(`${name}: ${line.trim().slice(0, 70)}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  /** Многострочная развилка — та же беда, просто её не видно построчно. */
  it('🔴 многострочная развилка тоже считается', () => {
    const wrong: string[] = [];
    for (const { name, src } of all) {
      if (/language === 'en'\s*\n\s*\?/.test(src)) wrong.push(name);
    }
    expect(wrong).toEqual([]);
  });
});

/**
 * ДОЛГ: экран верхнего уровня → сколько мест ещё говорят на двух языках и почему.
 * Число — ПОТОЛОК: вырасти нельзя, уменьшить можно и нужно.
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНЫЙ УЧЁТ. У игр такой же учёт довёл долг до НУЛЯ — там теперь
 * запрещено вообще всё зашитое. Экраны верхнего уровня в тот гейт не входили, и
 * их долг рос невидимо. Здесь он назван поимённо и не может вырасти молча.
 *
 * ⚠️ ОСТАВШИЕСЯ МЕСТА — НЕ ЛЕНЬ, А ДАННЫЕ. Текст лежит в справочниках с полями
 * `_ru`/`_en` (имена и описания 30 достижений, названия доменов замера, продающие
 * тексты 12 профилей, записи «что нового»). Их перевод — работа над данными на
 * десять языков, а не переезд строки в словарь, и решение о ней за владельцем.
 */
const TWO_LANG_DEBT: Record<string, { max: number; why: string }> = {
  'achievements.tsx': { max: 3, why: 'cat.label_*, a.name_*, a.desc_* — 30 достижений и разделы лежат в справочнике с полями _ru/_en' },
  'assessment-result.tsx': { max: 2, why: 'dom.label_* — названия доменов замера в справочнике с полями _ru/_en' },
  'settings.tsx': { max: 4, why: 'audience, sales_hook, long_description, session_minutes — продающие тексты 12 профилей' },
  'whats-new.tsx': { max: 1, why: 'e.ru/e.en — сами записи «что нового» пишутся на двух языках; перевод каждой версии на 12 языков это редакторское решение' },
  'pet.tsx': { max: 1, why: 'не строка: `const ru = …` для РУССКОЙ плюрализации (три формы), словарём не заменяется' },
};

describe('долг двуязычных строк на экранах верхнего уровня', () => {
  const top = screens().filter((s) => !s.name.startsWith('games/'));

  const twoLangCount = (src: string): number =>
    (src.match(/language === 'ru'/g) || []).length;

  it('🔴 долг не вырос: где было столько-то, столько и осталось', () => {
    const grown: string[] = [];
    for (const { name, src } of top) {
      const n = twoLangCount(src);
      const cap = TWO_LANG_DEBT[name]?.max ?? 0;
      if (n > cap) grown.push(`${name}: ${n} > потолка ${cap}`);
    }
    expect(grown).toEqual([]);
  });

  it('🔴 в учёте нет записей про экраны, где долг уже выплачен', () => {
    const stale: string[] = [];
    for (const [name, { max }] of Object.entries(TWO_LANG_DEBT)) {
      const scr = top.find((s) => s.name === name);
      if (!scr) { stale.push(`${name}: файла нет — запись убрать`); continue; }
      const n = twoLangCount(scr.src);
      if (n < max) stale.push(`${name}: осталось ${n}, потолок ${max} — опустить`);
    }
    expect(stale).toEqual([]);
  });

  it('у каждой записи долга есть причина, а не отметка', () => {
    for (const [name, { why }] of Object.entries(TWO_LANG_DEBT)) {
      expect(`${name}: ${why.length > 40}`).toBe(`${name}: true`);
    }
  });
});
