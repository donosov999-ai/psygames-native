/* psygames-games-module-i18n-gate · VER 1 · 19.08.2026 */
/**
 * СЛОВАРИ МОДУЛЕЙ ЗНАЮТ ВСЕ ДВЕНАДЦАТЬ ЯЗЫКОВ — И НИ ОДНОЙ МЁРТВОЙ СТРОКИ.
 *
 * 🔴 ЧТО ЛОМАЛОСЬ И ПОЧЕМУ ЭТОГО НЕ ВИДЕЛ НИ ОДИН ПРОГОН. Пять игр пришли из
 * лаборатории со СВОИМ словарём внутри модуля, и знал он ровно два языка, `ru`
 * и `en`. Названия, описания и справка этих игр давно переведены на двенадцать —
 * но они живут в общем словаре, а ТЕКСТ ВНУТРИ ПАРТИИ брался из модуля. Человек
 * с интерфейсом на японском открывал игру и посреди своего экрана читал «Undo»,
 * «South-west», «Track the targets».
 *
 * Почему молчали остальные гейты, все три сразу:
 *   · `i18n-coverage` сравнивает словарь приложения со словарём приложения.
 *     Ключа, которого там нет и не было, он не видит — покрытие 100%, зелено.
 *   · `ci-i18n-hardcode-guard` ищет зашитый мимо словаря текст, но ТОЛЬКО в
 *     `app/games/*`. Словари модулей лежат в `src/games/*` — вне его поля.
 *   · `tsc` типизировал `MemoryPalaceLocale = 'ru' | 'en'` без замечаний: тип
 *     был честным описанием дыры, а не ошибкой.
 * Поймать это можно было только глазами носителя одного из десяти языков.
 *
 * ⚠️ ПОЧЕМУ ГЕЙТ СМОТРИТ НА ЗНАЧЕНИЯ, А НЕ НА ИСХОДНИК. Дважды за день попадались
 * на том, что гейт держал зелёный цвет из-за СЛОВА В КОММЕНТАРИИ: русский текст
 * рядом с кодом читался как перевод, а имя ключа в шапке файла — как его вызов.
 * Поэтому:
 *   · полнота языков и ключей проверяется по РЕАЛЬНО ВОЗВРАЩЁННЫМ объектам
 *     (`getXStrings(locale)`), а не по разбору файла;
 *   · «ключ вызывается в коде» ищется в исходнике, С КОТОРОГО СРЕЗАНЫ
 *     КОММЕНТАРИИ, — и отдельная проба ниже доказывает, что срез работает.
 *
 * ⚠️ ЛОЖНОЕ СРАБАТЫВАНИЕ ХУЖЕ ОТСУТСТВИЯ ПРОВЕРКИ. Гейт, который краснеет на
 * верном переводе, перестают читать, и вместе с придуманной поломкой он
 * пропускает настоящую. Отсюда список SAME_AS_EN: совпадение с английским
 * разрешено ПОИМЁННО и С ПРИЧИНОЙ, а запись, переставшая быть нужной, роняет
 * прогон — чтобы список не протухал.
 */
import {
  MEMORY_PALACE_LOCALES,
  FIXED_PALACE_ROUTE,
  PALACE_ITEM_LIBRARY,
  getItemLabel,
  getLocusLabel,
  getMemoryPalaceStrings,
  getRecallDirectionLabel,
  RECALL_DIRECTIONS,
  type MemoryPalaceLocale,
} from '@/src/games/memory-palace/core';
import {
  RHYTHM_PITCH_LOCALES,
  getPitchDirectionLabel,
  getPitchLevelLabel,
  getRhythmPitchModeLabel,
  getRhythmPitchStrings,
  type RhythmPitchLocale,
} from '@/src/games/rhythm-pitch/core';
import {
  CARDINAL_DIRECTIONS,
  HOME_SECTORS,
  NAVIGATOR_LOCALES,
  NAVIGATOR_MODES,
  TURN_INSTRUCTIONS,
  getCardinalLabel,
  getHomeSectorLabel,
  getNavigatorModeLabel,
  getNavigatorStrings,
  getTurnLabel,
  type NavigatorLocale,
} from '@/src/games/navigator/core';
import {
  OBJECT_TRACKER_LOCALES,
  getObjectTrackerStrings,
  type ObjectTrackerLocale,
} from '@/src/games/object-tracker/core';
import {
  ONE_LINE_LOCALES,
  getOneLineStrings,
  type OneLineLocale,
} from '@/src/games/one-line/core';

declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync, readdirSync, existsSync } = require('fs');
const { join } = require('path');

const SRC = join(__dirname, '..');
const APP = join(__dirname, '../../app');
const read = (p: string): string => readFileSync(p, 'utf8') as string;

/**
 * Комментарии убираем ДО поиска. Строковые литералы, наоборот, СОХРАНЯЕМ: в них
 * попадаются осмысленные обращения, а вырезав их, мы бы отчитались о «мёртвом»
 * ключе, который на деле рисуется. Длину не сохраняем — номера строк здесь не
 * нужны, нужен сам факт вызова.
 */
function stripComments(s: string): string {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    const n = s[i + 1];
    if (c === '/' && n === '*') {
      const e = s.indexOf('*/', i + 2);
      out += ' ';
      i = e < 0 ? s.length : e + 2;
      continue;
    }
    if (c === '/' && n === '/') {
      const e = s.indexOf('\n', i);
      out += ' ';
      i = e < 0 ? s.length : e;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < s.length) {
        if (s[j] === '\\') { j += 2; continue; }
        if (s[j] === c) break;
        j++;
      }
      out += s.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Весь код игры: модуль целиком (кроме самого словаря) плюс экран-обёртка. */
function gameCode(id: string): string {
  const dir = join(SRC, 'games', id);
  let code = '';
  const walk = (d: string): void => {
    for (const entry of readdirSync(d, { withFileTypes: true }) as any[]) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(entry.name) && !p.endsWith(join('core', 'i18n.ts'))) {
        code += stripComments(read(p));
      }
    }
  };
  walk(dir);
  const wrapper = join(APP, 'games', `${id}.tsx`);
  if (existsSync(wrapper)) code += stripComments(read(wrapper));
  return code;
}

/**
 * Обращения к словарю в коде. Ловим два написания, оба живые в этих пяти играх:
 * `strings.key` / `navStrings.key` (переменная) и `getXStrings(locale).key`
 * (вызов на месте). Проба «гейт умеет видеть вызов» ниже держит эту регулярку
 * честной: если её сломать, красное появится сразу, а не через полгода.
 */
function usedKeys(code: string): Set<string> {
  const used = new Set<string>();
  for (const m of code.matchAll(/\b\w*[Ss]trings\.(\w+)\b/g)) used.add(m[1]);
  for (const m of code.matchAll(/Strings\([^)]*\)\.(\w+)/g)) used.add(m[1]);
  return used;
}

interface ModuleUnderTest {
  id: string;
  locales: readonly string[];
  strings: (locale: any) => Record<string, string>;
  /** Наборы подписей, которые словарь отдаёт не полем, а функцией. */
  labels: { name: string; values: readonly string[]; get: (locale: any, v: any) => string }[];
}

const MODULES: ModuleUnderTest[] = [
  {
    id: 'memory-palace',
    locales: MEMORY_PALACE_LOCALES,
    strings: (l: MemoryPalaceLocale) => getMemoryPalaceStrings(l) as any,
    labels: [
      { name: 'recallDirection', values: RECALL_DIRECTIONS, get: getRecallDirectionLabel },
    ],
  },
  {
    id: 'rhythm-pitch',
    locales: RHYTHM_PITCH_LOCALES,
    strings: (l: RhythmPitchLocale) => getRhythmPitchStrings(l) as any,
    labels: [
      { name: 'mode', values: ['rhythm-echo', 'pitch-path'], get: getRhythmPitchModeLabel },
      { name: 'pitchLevel', values: ['low', 'mid', 'high'], get: getPitchLevelLabel },
      { name: 'pitchDirection', values: ['higher', 'lower'], get: getPitchDirectionLabel },
    ],
  },
  {
    id: 'navigator',
    locales: NAVIGATOR_LOCALES,
    strings: (l: NavigatorLocale) => getNavigatorStrings(l) as any,
    labels: [
      { name: 'mode', values: NAVIGATOR_MODES, get: getNavigatorModeLabel },
      { name: 'cardinal', values: CARDINAL_DIRECTIONS, get: getCardinalLabel },
      { name: 'turn', values: TURN_INSTRUCTIONS, get: getTurnLabel },
      { name: 'homeSector', values: HOME_SECTORS, get: getHomeSectorLabel },
    ],
  },
  {
    id: 'object-tracker',
    locales: OBJECT_TRACKER_LOCALES,
    strings: (l: ObjectTrackerLocale) => getObjectTrackerStrings(l) as any,
    labels: [],
  },
  {
    id: 'one-line',
    locales: ONE_LINE_LOCALES,
    strings: (l: OneLineLocale) => getOneLineStrings(l) as any,
    labels: [],
  },
];

/** Языки приложения — читаем из самого LanguageContext, а не переписываем сюда. */
const APP_LOCALES: string[] = (() => {
  const dict = read(join(SRC, 'contexts/LanguageContext.tsx'));
  const decl = /type Language =([^;]+);/.exec(dict)!;
  return [...decl[1].matchAll(/'([a-z]{2})'/g)].map((m) => m[1]).sort();
})();

/**
 * СТРОКА БЕЗ ЕДИНОЙ БУКВЫ СОВПАДАТЬ ОБЯЗАНА, И ЭТО НЕ НЕДОДЕЛКА.
 *
 * `placedItem` — это `'{locus}: {item}'`: две подстановки и двоеточие, ни одного
 * слова. Такая строка одинакова во всех двенадцати языках ПО УСТРОЙСТВУ, и
 * требовать от неё «отличия от английского» значит требовать выдумать различие
 * там, где различать нечего. Правило структурное, а не поимённое, потому что
 * поимённый список из одиннадцати одинаковых записей никто не читает — а вот
 * правило «нет букв — нечего переводить» проверяемо глазами за секунду.
 */
function hasNoWords(v: string): boolean {
  return v.replace(/\{\w+\}/g, '').replace(/[^\p{L}]/gu, '').length === 0;
}

/**
 * СОВПАДЕНИЕ С АНГЛИЙСКИМ РАЗРЕШЕНО ПОИМЁННО И С ПРИЧИНОЙ.
 *
 * Часть слов у языков и правда общая: «Pause» — немецкое слово, английский его
 * заимствовал; «Corrections» по-французски пишется так же; «Route» и «Start» —
 * обычные немецкие слова; «Volume» одинаково во французском, итальянском и
 * португальском. Проверка, которая краснеет на верном переводе, врёт, а гейт,
 * который врёт, перестают читать. Список ЗАКРЫТ: новая запись означает, что
 * перевод не доделали, а запись, переставшая совпадать, роняет прогон отдельной
 * пробой — чтобы список не протух.
 */
const SAME_AS_EN: Record<string, string> = {
  'one-line.de.pause': 'слово «Pause» немецкое, английский его заимствовал — здесь оно и есть немецкое',
  'one-line.fr.pause': 'французское «Pause» пишется ровно так же, как английское',
  'one-line.fr.corrections': 'французское «Corrections» совпадает с английским по написанию',
  'memory-palace.de.pause': 'слово «Pause» немецкое, английский его заимствовал — здесь оно и есть немецкое',
  'memory-palace.fr.pause': 'французское «Pause» пишется ровно так же, как английское',
  'memory-palace.de.routeTitle': '«die Route» — обычное немецкое слово, а не оставленная английская заглушка',
  'navigator.de.title': 'по-немецки игра и есть «Navigator»: слово немецкое, совпадение написания случайно',
  'navigator.de.startCell': '«der Start» — обычное немецкое слово для начала пути',
  'rhythm-pitch.fr.volume': 'французское «Volume» пишется так же; шаблон отличается только числом',
  'rhythm-pitch.it.volume': 'итальянское «Volume» пишется так же; шаблон отличается только числом',
  'rhythm-pitch.pt.volume': 'португальское «Volume» пишется так же; шаблон отличается только числом',
};

describe('словари модулей знают все двенадцать языков', () => {
  it('в списке языков приложения ровно двенадцать — иначе сверять не с чем', () => {
    expect(APP_LOCALES.length).toBe(12);
  });

  for (const mod of MODULES) {
    describe(mod.id, () => {
      it('🔴 языки модуля и языки приложения — один список', () => {
        expect([...mod.locales].sort()).toEqual(APP_LOCALES);
      });

      it('🔴 ни один язык не потерян: словарь отдаёт объект на каждый', () => {
        const missing: string[] = [];
        for (const locale of APP_LOCALES) {
          const s = mod.strings(locale);
          if (!s || typeof s !== 'object') missing.push(locale);
        }
        expect(missing).toEqual([]);
      });

      it('🔴 в каждом языке те же ключи, что в русском', () => {
        const ruKeys = Object.keys(mod.strings('ru')).sort();
        expect(ruKeys.length).toBeGreaterThan(15);
        const holes: string[] = [];
        for (const locale of mod.locales) {
          const keys = Object.keys(mod.strings(locale)).sort();
          for (const k of ruKeys) if (!keys.includes(k)) holes.push(`${locale}: нет ключа ${k}`);
          for (const k of keys) if (!ruKeys.includes(k)) holes.push(`${locale}: лишний ключ ${k}`);
        }
        expect(holes).toEqual([]);
      });

      it('🔴 ни одна строка не пустая', () => {
        const empty: string[] = [];
        for (const locale of mod.locales) {
          const s = mod.strings(locale);
          for (const [k, v] of Object.entries(s)) {
            if (typeof v !== 'string' || v.trim().length === 0) empty.push(`${locale}.${k}`);
          }
          for (const set of mod.labels) {
            for (const v of set.values) {
              const label = set.get(locale, v);
              if (!label || String(label).trim().length === 0) empty.push(`${locale}.${set.name}.${v}`);
            }
          }
        }
        expect(empty).toEqual([]);
      });

      it('🔴 ни одна строка не осталась английской копией', () => {
        const en = mod.strings('en');
        const stub: string[] = [];
        for (const locale of mod.locales) {
          if (locale === 'en') continue;
          const s = mod.strings(locale);
          for (const [k, v] of Object.entries(s)) {
            if (hasNoWords(String(v))) continue;   // «{locus}: {item}» переводить нечем
            if (v === en[k] && !SAME_AS_EN[`${mod.id}.${locale}.${k}`]) {
              stub.push(`${mod.id}.${locale}.${k}: «${v}» — как по-английски`);
            }
          }
          for (const set of mod.labels) {
            for (const val of set.values) {
              const mine = set.get(locale, val);
              const theirs = set.get('en', val);
              if (mine === theirs && !SAME_AS_EN[`${mod.id}.${locale}.${set.name}.${val}`]) {
                stub.push(`${mod.id}.${locale}.${set.name}.${val}: «${mine}» — как по-английски`);
              }
            }
          }
        }
        expect(stub).toEqual([]);
      });

      /**
       * У локали со своей письменностью перевод обязан быть написан СВОИМИ
       * знаками. Строка латиницей в корейском словаре — недоделанный перевод, и
       * сличением с английским его не отличить от сделанного: «Tap» и «Tap с
       * точкой» — разные строки, обе нечитаемые корейцу.
       */
      it('🔴 у локалей со своей письменностью текст написан своими знаками', () => {
        const SCRIPTS: Record<string, RegExp> = {
          ru: /[Ѐ-ӿ]/, zh: /[一-鿿]/, ja: /[぀-ヿ一-鿿]/,
          ko: /[가-힯]/, ar: /[؀-ۿ]/, hi: /[ऀ-ॿ]/,
        };
        const bad: string[] = [];
        for (const [locale, re] of Object.entries(SCRIPTS)) {
          const s = mod.strings(locale);
          for (const [k, v] of Object.entries(s)) {
            // Шаблоны из одних подстановок и клавиш («{size}×{size}», «Tab/Enter»)
            // своих букв не содержат и содержать не обязаны.
            const bare = String(v).replace(/\{\w+\}/g, '').replace(/[^\p{L}]/gu, '');
            if (bare.length > 2 && !re.test(String(v))) bad.push(`${mod.id}.${locale}.${k}: «${v}»`);
          }
          for (const set of mod.labels) {
            for (const val of set.values) {
              const label = String(set.get(locale, val));
              const bare = label.replace(/[^\p{L}]/gu, '');
              if (bare.length > 1 && !re.test(label)) bad.push(`${mod.id}.${locale}.${set.name}.${val}: «${label}»`);
            }
          }
        }
        expect(bad).toEqual([]);
      });

      /**
       * 🔴 МЁРТВЫЙ КЛЮЧ — КРАСНОЕ. Строка, переведённая на двенадцать языков и не
       * выведенная ни разу, — не запас, а ложное «переведено»: ровно так уже
       * случилось с бейджем отсчёта в SET. Ищем в исходнике БЕЗ КОММЕНТАРИЕВ,
       * иначе имя ключа в шапке файла засчиталось бы за вызов.
       */
      it('🔴 каждый ключ словаря вызывается в коде игры', () => {
        const code = gameCode(mod.id);
        const used = usedKeys(code);
        const dead = Object.keys(mod.strings('ru')).filter((k) => !used.has(k));
        expect(dead).toEqual([]);
      });
    });
  }

  /**
   * ⚠️ САМОПРОВЕРКА ГЕЙТА. Проба выше стоит ровно столько, сколько стоит её
   * умение УВИДЕТЬ вызов. Сломай регулярку — и «мёртвых ключей нет» станет
   * «ключей вообще не нашлось», то есть зелёным по недоразумению. Поэтому здесь
   * прямо сверяется: вызовы находятся, комментарии не находятся.
   */
  describe('гейт умеет отличать вызов от упоминания в комментарии', () => {
    it('видит обращение к словарю в коде', () => {
      expect([...usedKeys('const x = strings.rulesBody;')]).toContain('rulesBody');
      expect([...usedKeys('<Text>{navStrings.catalogDesc}</Text>')]).toContain('catalogDesc');
      expect([...usedKeys('getOneLineStrings(locale).progress')]).toContain('progress');
    });

    it('🔴 НЕ видит того же слова в комментарии', () => {
      const commented = stripComments('/* строка strings.rulesBody живёт тут */\n// strings.progress\n');
      expect([...usedKeys(commented)]).toEqual([]);
    });

    it('на каждом модуле проба и правда что-то нашла, а не молчит вхолостую', () => {
      for (const mod of MODULES) {
        const found = usedKeys(gameCode(mod.id)).size;
        expect(`${mod.id}: ${found > 10}`).toBe(`${mod.id}: true`);
      }
    });
  });

  it('исключения «слово и правда общее» существуют и объяснены', () => {
    const stale: string[] = [];
    for (const [key, why] of Object.entries(SAME_AS_EN)) {
      const [id, locale, ...rest] = key.split('.');
      const mod = MODULES.find((m) => m.id === id);
      if (!mod) { stale.push(`${key}: нет такого модуля`); continue; }
      let mine: string | undefined;
      let theirs: string | undefined;
      if (rest.length === 1) {
        mine = mod.strings(locale)[rest[0]];
        theirs = mod.strings('en')[rest[0]];
      } else {
        const set = mod.labels.find((l) => l.name === rest[0]);
        if (set) { mine = set.get(locale, rest[1]); theirs = set.get('en', rest[1]); }
      }
      // Исключение перестало быть нужным — его убирают, а не оставляют висеть.
      if (mine !== theirs) stale.push(`${key}: уже НЕ совпадает с английским, запись пора убрать`);
      if (why.length < 25) stale.push(`${key}: причина не написана`);
    }
    expect(stale).toEqual([]);
  });
});

/**
 * МАТЕРИАЛ УПРАЖНЕНИЯ «Дворца памяти» — ОТДЕЛЬНО ОТ ПОДПИСЕЙ ИНТЕРФЕЙСА.
 * Человек запоминает связку «Фонтан → Синяя книга» и проговаривает её себе;
 * английские `Fountain` и `Blue book` на японском экране ломают не вид, а сам
 * приём. Поэтому у мест и предметов свои три требования.
 */
describe('дворец памяти: места и предметы переведены и различимы', () => {
  it('🔴 у каждого места и предмета есть подпись на всех двенадцати', () => {
    const holes: string[] = [];
    for (const locale of MEMORY_PALACE_LOCALES) {
      for (const locus of FIXED_PALACE_ROUTE) {
        const label = getLocusLabel(locus, locale);
        if (!label || !label.trim()) holes.push(`${locus.id}/${locale}: нет подписи`);
        else if (locale !== 'en' && label === locus.label.en) holes.push(`${locus.id}/${locale}: осталось английским`);
      }
      for (const item of PALACE_ITEM_LIBRARY) {
        const label = getItemLabel(item, locale);
        if (!label || !label.trim()) holes.push(`${item.id}/${locale}: нет подписи`);
        else if (locale !== 'en' && label === item.label.en) holes.push(`${item.id}/${locale}: осталось английским`);
      }
    }
    expect(holes).toEqual([]);
  });

  /**
   * 🔴 ДВЕ ОДИНАКОВЫЕ ПОДПИСИ = ДВА ВЕРНЫХ ОТВЕТА. У вопроса «что лежало здесь»
   * обязан быть один ответ, поэтому подписи внутри своего языка попарно разные.
   * На переводе это ломается легче, чем на оригинале: «Голубая лодка» и «Синяя
   * книга» различает предмет, а «бирюзовая» и «мятная» в чужом языке запросто
   * схлопываются в одно слово.
   */
  it('🔴 подписи попарно разные внутри каждого языка', () => {
    const clashes: string[] = [];
    for (const locale of MEMORY_PALACE_LOCALES) {
      const seenLoci = new Map<string, string>();
      for (const locus of FIXED_PALACE_ROUTE) {
        const label = getLocusLabel(locus, locale);
        const already = seenLoci.get(label);
        if (already) clashes.push(`${locale}: места ${already} и ${locus.id} подписаны одинаково «${label}»`);
        seenLoci.set(label, locus.id);
      }
      const seenItems = new Map<string, string>();
      for (const item of PALACE_ITEM_LIBRARY) {
        const label = getItemLabel(item, locale);
        const already = seenItems.get(label);
        if (already) clashes.push(`${locale}: предметы ${already} и ${item.id} подписаны одинаково «${label}»`);
        seenItems.set(label, item.id);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('🔴 у локалей со своей письменностью подписи написаны своими знаками', () => {
    const SCRIPTS: Record<string, RegExp> = {
      ru: /[Ѐ-ӿ]/, zh: /[一-鿿]/, ja: /[぀-ヿ一-鿿]/,
      ko: /[가-힯]/, ar: /[؀-ۿ]/, hi: /[ऀ-ॿ]/,
    };
    const bad: string[] = [];
    for (const [locale, re] of Object.entries(SCRIPTS)) {
      for (const locus of FIXED_PALACE_ROUTE) {
        const label = getLocusLabel(locus, locale as MemoryPalaceLocale);
        if (!re.test(label)) bad.push(`${locale}.${locus.id}: «${label}»`);
      }
      for (const item of PALACE_ITEM_LIBRARY) {
        const label = getItemLabel(item, locale as MemoryPalaceLocale);
        if (!re.test(label)) bad.push(`${locale}.${item.id}: «${label}»`);
      }
    }
    expect(bad).toEqual([]);
  });
});

/**
 * 🔴 ЭКРАН-ОБЁРТКА ОБЯЗАН ОТДАТЬ МОДУЛЮ ЯЗЫК ЦЕЛИКОМ.
 *
 * Здесь стояло `language === 'ru' ? 'ru' : 'en'`, и весь перевод партии сводился
 * на нет ещё до словаря: японец, кореец и немец получали английский, потому что
 * их язык выбрасывали НА СТРОКУ РАНЬШЕ выбора текста. Полные словари при этом
 * лежали переведёнными — то есть проверка «словарь знает двенадцать» была бы
 * зелёной, а человек по-прежнему видел английский. Проверяем поэтому не словарь,
 * а ПУТЬ ЯЗЫКА ДО НЕГО.
 *
 * ⚠️ `ci-i18n-hardcode-guard` этот тернарник пропускает законно: по обеим веткам
 * там код языка, а не фраза для человека, — и правильно делает, иначе краснел бы
 * на языковых играх. Значит, ловить обязан кто-то другой; ловит вот этот гейт.
 */
describe('экраны игр отдают модулю все двенадцать языков, а не пару', () => {
  for (const mod of MODULES) {
    it(`🔴 ${mod.id}: язык не схлопывается до ru/en по дороге в модуль`, () => {
      const screen = stripComments(read(join(APP, 'games', `${mod.id}.tsx`)));
      const collapsed = /language\s*===\s*'ru'\s*\?\s*'ru'\s*:\s*'en'/.test(screen);
      expect(`${mod.id}: схлопывает язык — ${collapsed}`).toBe(`${mod.id}: схлопывает язык — false`);
      // И язык действительно доезжает: экран отдаёт модулю проп locale.
      expect(screen).toMatch(/locale=\{/);
    });
  }
});
