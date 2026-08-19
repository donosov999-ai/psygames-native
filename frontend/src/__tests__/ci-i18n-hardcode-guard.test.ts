/**
 * СТРОКИ ИНТЕРФЕЙСА ИДУТ ЧЕРЕЗ СЛОВАРЬ, А НЕ ЧЕРЕЗ `language === 'ru' ? … : …`.
 *
 * 🔴 ЧТО ЛОМАЛОСЬ. В приложении 12 языков (LanguageContext: en/es/pt/hi/zh/de/
 * fr/it/ja/ko/ar/ru). Строка, выбранная тернарником прямо в экране игры, знает
 * ровно два из них: русскому — русское, ВСЕМ ОСТАЛЬНЫМ — английское. Немец,
 * японец, кореец получают английскую подпись посреди переведённого экрана. Это
 * тот же самый репорт «не все тексты переведены», который висел с июля: его
 * закрыли по словарям (i18n-coverage.test.ts довёл 10 локалей до нуля), но
 * тексты, ЗАШИТЫЕ МИМО СЛОВАРЯ, тем сличением не видны в принципе — их в
 * словаре нет и не было, сличать нечего.
 *
 * ПОЧЕМУ ОБЫЧНЫЙ ПРОГОН ЭТО ПРОПУСКАЕТ. i18n-coverage сравнивает словарь с
 * словарём: если ключа нет нигде — все словари «полны», покрытие 100%, тест
 * зелёный. tsc такой тернарник типизирует без замечаний. В jest вёрстки нет.
 * Экран выглядит переведённым — на русском и на английском, то есть у обоих,
 * кто смотрит. Поймать можно было только глазами носителя одного из десяти
 * остальных языков, а их у нас нет.
 *
 * ПОЧЕМУ ХРАПОВИК, А НЕ СТЕНА. Долг уже накоплен: 14 экранов, 106 мест. Одним
 * заходом это не переносится в словарь (там и подписи, и правила уровней, и
 * длинные вступления). Поэтому: файлы вне списка — строго ноль, файлы в списке
 * — не больше, чем записано сейчас. Число может только УМЕНЬШАТЬСЯ.
 *
 * ⚠️ ЛОЖНОЕ СРАБАТЫВАНИЕ ХУЖЕ ОТСУТСТВИЯ ПРОВЕРКИ. Гейт, который краснеет на
 * исправном коде, перестают читать — и вместе с придуманной поломкой он
 * пропускает настоящую. Отсюда три решения ниже: комментарии вырезаются ДО
 * поиска (иначе русский комментарий рядом с законным `isRu ? 'ru' : 'en'`
 * читается как нарушение — на этом ловились три файла); ловится не сам
 * тернарник по языку, а выбор ЧЕЛОВЕЧЕСКОГО ТЕКСТА им; долг сверяется по «стало
 * хуже», а не по «совпало число в число» — иначе правка, погасившая пару строк,
 * роняла бы сборку за то, что стало лучше.
 *
 * ЧТО ЗАКОННО И ПОЧЕМУ НЕ ЛОВИТСЯ. Тернарник по языку сам по себе не грех —
 * грех в том, что им ВЫБИРАЮТ ЧЕЛОВЕЧЕСКИЙ ТЕКСТ. Законны и пропускаются:
 *   language === 'en' ? 'es' : 'en'          — выбор языка-цели в языковой игре
 *   language === 'ru' ? 'cyrillic' : 'latin' — выбор алфавита
 *   lang === 'ru' ? /^[а-яё-]+$/i : /^[a-z-]+$/i — регулярка под алфавит
 *   ru={language === 'ru'}                   — передача флага в компонент
 *   { ru: 'Кошка пьёт молоко', en: '…' }     — МАТЕРИАЛ упражнения (reading-span),
 *                                              а не интерфейс: игра по замыслу
 *                                              работает на паре ru/en
 * Ловится ровно одно: выбор по языку, у которого хотя бы одна ветка — строка,
 * написанная для человека (кириллица либо связная английская фраза из двух слов).
 */
declare const __dirname: string;
declare function require(m: string): any;

const { readFileSync, readdirSync } = require('fs');
const { join } = require('path');

const DIR = join(__dirname, '../../app/games');
const FILES: string[] = readdirSync(DIR).filter((f: string) => f.endsWith('.tsx'));

/**
 * ДОЛГ на 19.08.2026: экран → сколько мест зашито мимо словаря и почему это ещё
 * не перенесено. Число — ПОТОЛОК: вырасти нельзя, уменьшить можно и нужно.
 */
const HARDCODE_DEBT: Record<string, { max: number; why: string }> = {
  'chess-blind.tsx': { max: 20, why: 'долг, чинится отдельно: названия 20 режимов слепой игры и подписи фигур — переносить пачкой вместе с ключами шахмат' },
  'listening-span.tsx': { max: 15, why: 'долг, чинится отдельно: экран настройки слухового охвата написан мимо словаря целиком' },
  'picture-pairs.tsx': { max: 13, why: 'долг, чинится отдельно: подписи режимов и правил на экране настройки' },
  'phoneme-pairs.tsx': { max: 12, why: 'долг, чинится отдельно: экран настройки минимальных пар написан мимо словаря целиком' },
  'pseudoword-echo.tsx': { max: 12, why: 'долг, чинится отдельно: экран настройки эха псевдослов написан мимо словаря целиком' },
  'mental-rotation.tsx': { max: 6, why: 'долг, чинится отдельно: описания осей вращения и единица времени' },
  'set-game.tsx': { max: 6, why: 'долг, чинится отдельно: разбор примера «что такое SET» — длинный методический текст' },
  'wcst.tsx': { max: 6, why: 'долг, чинится отдельно: подписи режимов и обратная связь по правилу сортировки' },
  'bart.tsx': { max: 4, why: 'долг, чинится отдельно: описание классического диагностического замера' },
  'sudoku-samurai.tsx': { max: 4, why: 'долг, чинится отдельно: тексты проигрыша и подсказок самурая' },
  'prl.tsx': { max: 3, why: 'долг, чинится отдельно: подписи режимов на экране настройки' },
  'cpt.tsx': { max: 2, why: 'долг, чинится отдельно: инструкция «жми на X» в двух вариантах режима' },
  'spatial-span.tsx': { max: 2, why: 'долг, чинится отдельно: описание того, как уровень растёт сам' },
  'phonemic-fluency.tsx': { max: 1, why: 'долг, чинится отдельно: поле difficulty в сохраняемой сессии («буква-А» / «letter-A») — не интерфейс, а запись в базу, чинится вместе со схемой статистики' },
};

/**
 * Комментарии убираем ДО поиска, иначе русский комментарий рядом с законным
 * `isRu ? 'ru' : 'en'` читается как нарушение. На этом ловились три файла.
 * Длину сохраняем — номера строк в отчёте должны совпадать с файлом.
 */
function stripComments(s: string): string {
  let out = '';
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i];
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      out += c;
      i++;
      while (i < n) {
        if (s[i] === '\\') { out += '  '; i += 2; continue; }
        if (s[i] === q) { out += q; i++; break; }
        out += s[i]; i++;
      }
      continue;
    }
    if (c === '/' && s[i + 1] === '/') { while (i < n && s[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '/' && s[i + 1] === '*') {
      while (i < n && !(s[i] === '*' && s[i + 1] === '/')) { out += s[i] === '\n' ? '\n' : ' '; i++; }
      out += '  '; i += 2; continue;
    }
    out += c; i++;
  }
  return out;
}

const CYRILLIC = /[\u0400-\u04FF]/;
/** Два латинских слова подряд — это фраза для человека, а не ключ и не код. */
const ENGLISH_PHRASE = /[A-Za-z]{2,}[ ,.!?]+[A-Za-z]{2,}/;
const STRING_LITERAL = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;

/** Булевы флаги, выведенные из языка: `const ru = language === 'ru'`. */
function languageFlags(src: string): string[] {
  const found = new Set<string>();
  const re = /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*lang(?:uage)?\s*===\s*['"](?:ru|en)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) found.add(m[1]);
  return [...found];
}

/** Места, где по языку выбирается текст для человека. */
function findHardcodedStrings(rawSource: string): string[] {
  const src = stripComments(rawSource);
  const conds = [
    "lang(?:uage)?\\s*===\\s*['\"](?:ru|en)['\"]",
    ...languageFlags(src).map((f) => `\\b${f}\\b`),
  ];
  const re = new RegExp(`(?:${conds.join('|')})\\s*\\)?\\s*\\?`, 'g');
  const hits: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    // Окно захватывает обе ветки тернарника вместе с переносами строк.
    const window = src.slice(m.index, m.index + 300);
    const literals = (window.match(STRING_LITERAL) ?? []).map((l) => l.slice(1, -1));
    if (!literals.some((l) => CYRILLIC.test(l) || ENGLISH_PHRASE.test(l))) continue;
    const line = src.slice(0, m.index).split('\n').length;
    hits.push(`${line}: ${window.replace(/\s+/g, ' ').slice(0, 90)}`);
  }
  return hits;
}

describe('строки интерфейса не зашиты мимо словаря', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(FILES.length).toBeGreaterThan(50);
  });

  /**
   * Самопроверка искалки. Без неё сломанная регулярка даёт ноль находок и
   * зелёный тест — то есть гейт молча перестаёт быть гейтом.
   */
  it('искалка ловит нарушение и не трогает законное', () => {
    const violations = [
      `<Text>{language === 'ru' ? 'Начать заново' : 'Restart'}</Text>`,
      `const ru = language === 'ru';\n<Text>{ru ? 'Слишком много ошибок' : 'Too many mistakes'}</Text>`,
      `const t2 = language === 'ru'\n  ? 'Длинная подпись кнопки'\n  : 'Long button caption';`,
      // латиница без кириллицы — новый экран могут написать сразу по-английски
      `<Text>{language === 'en' ? 'Tap the target' : someRuVar}</Text>`,
    ];
    for (const v of violations) expect(findHardcodedStrings(v).length).toBeGreaterThan(0);

    const legit = [
      `const tgt = language === 'en' ? 'es' : 'en';`,
      `const alphabet = language === 'ru' ? 'cyrillic' : 'latin';`,
      `const valid = lang === 'ru' ? /^[а-яё-]+$/i : /^[a-z-]+$/i;`,
      `<LevelRuleBadge lr={levelRules} ru={language === 'ru'} />`,
      `const isRu = language === 'ru'; // язык слова: русский банк или английский\nconst bank = isRu ? 'ru' : 'en';`,
      `<Text>{t('start')}</Text>`,
    ];
    for (const l of legit) expect(findHardcodedStrings(l)).toEqual([]);
  });

  it('🔴 ни один НОВЫЙ экран не выбирает текст тернарником по языку', () => {
    const bad: string[] = [];
    for (const f of FILES) {
      if (HARDCODE_DEBT[f]) continue;
      const hits = findHardcodedStrings(readFileSync(join(DIR, f), 'utf8') as string);
      if (hits.length) bad.push(`${f} (${hits.length}) — ${hits[0]}`);
    }
    // Текст ошибки должен сразу говорить, что делать: строку — в LanguageContext, в код — t('ключ').
    expect(bad).toEqual([]);
  });

  it('🔴 долг не растёт: в экранах из списка новых зашитых строк не прибавилось', () => {
    const grown: string[] = [];
    for (const [f, { max }] of Object.entries(HARDCODE_DEBT)) {
      if (!FILES.includes(f)) continue;   // отсутствие файла разбирает соседний тест
      const n = findHardcodedStrings(readFileSync(join(DIR, f), 'utf8') as string).length;
      if (n > max) grown.push(`${f}: было ${max}, стало ${n} — новую строку клади в словарь, а не рядом`);
    }
    expect(grown).toEqual([]);
  });

  /**
   * Исключение без файла или без нарушения — это забытая правка, а не исключение.
   *
   * Почему не требуем совпадения число-в-число. Над этими же экранами работают
   * параллельно, и правка, погасившая пару строк, роняла бы сборку за то, что
   * стало ЛУЧШЕ. Потолок и так не даёт долгу расти; здесь ловим другое — когда
   * исключение пережило свою причину. Красное: долг погашен целиком либо просел
   * настолько, что записанное число врёт (≥5 и ≥20% — тогда опусти его).
   */
  it('каждое исключение существует, объяснено и всё ещё нужно', () => {
    const stale: string[] = [];
    for (const [f, { max, why }] of Object.entries(HARDCODE_DEBT)) {
      if (!FILES.includes(f)) { stale.push(`${f}: файла нет — исключение убрать`); continue; }
      expect(why.length).toBeGreaterThan(20);
      const n = findHardcodedStrings(readFileSync(join(DIR, f), 'utf8') as string).length;
      const needLower = Math.max(5, Math.ceil(max * 0.2));
      if (n === 0) stale.push(`${f}: долг погашен — исключение убрать`);
      else if (max - n >= needLower) stale.push(`${f}: долг ${n}, в списке ${max} — опусти число, назад дороги нет`);
    }
    expect(stale).toEqual([]);
  });
});
