/**
 * БУКВЕННО-ЦИФРОВОЙ КОД И СЛОВАРЬ-ОПОРА 00–99.
 *
 * 🔴 ЗАЧЕМ. Отчёт NZT-48 (app_feedback bf1f53cc, 13.09.2026): «надо проработать
 * алфавит магический до 100, ввести словарь с подсказками и отдельный режим для
 * запоминания цифр». Жалоба по существу: игра называется «Мнемоника», просит
 * удержать восемь случайных чисел — и не даёт ни одного приёма. Приём вот он.
 *
 * КАК РАБОТАЕТ КОД. Каждой цифре отвечают согласные ЗВУКИ, гласные свободны.
 * Слово с двумя кодирующими согласными — это двузначное число: «нос» = н(2)+с(0) = 20.
 * Обратно: 20 → «нос», и вместо голой цифры человек держит образ.
 *
 * 🔴 ПОЧЕМУ СПИСОК СВОЙ, А НЕ ВЗЯТЫЙ ГОТОВЫМ. Замер 23.09.2026: поиском по
 * GitHub и npm («major system peg list 00-99 MIT CC0») набора данных под
 * свободной лицензией не нашлось — есть приложение gla23/Major-system-peg-list
 * для составления СВОЕГО списка и разрозненные таблицы на форумах без указания
 * прав. Подбор ста слов — авторская работа, и брать чужую подборку без лицензии
 * нельзя; по правилу кода свой список собирается за один заход. Для русского
 * готовых свободных таблиц не нашлось вовсе.
 *
 * ⚠️ КОД ЯЗЫКОЗАВИСИМ И ПОСЛОВНО НЕ ПЕРЕВОДИТСЯ. Он стоит на согласных звуках:
 * русское «нос» (20) по-английски «nose» — тоже 20 по счастливой случайности, а
 * «сыр» (04) уже «cheese» (60). Поэтому таблицы ДВЕ, собранные каждая на своём
 * языке. Для остальных пяти языков приложения таблицы нет — и режим обязан
 * честно сказать об этом, а не показать бессмыслицу (см. `hasPegTable`).
 */

export type PegLang = 'ru' | 'en';

/** Есть ли у языка своя таблица. Молча подменять чужой — врать человеку. */
export function hasPegTable(lang: string): lang is PegLang {
  return lang === 'ru' || lang === 'en';
}

/**
 * Правило кода словами — его показывает экран обучения. `why` не украшение:
 * код запоминается за один вечер ТОЛЬКО через такие зацепки, иначе это десять
 * произвольных пар, которые сами нуждаются в мнемонике.
 */
export type PegRuleRow = { digit: number; letters: string; why: string };

export const PEG_RULE: Record<PegLang, PegRuleRow[]> = {
  ru: [
    { digit: 0, letters: 'с з ц', why: 'ноль — «зеро», отсюда З, а С — её глухая пара' },
    { digit: 1, letters: 'т д', why: 'у печатной «т» один вертикальный штрих; Д — её звонкая пара' },
    { digit: 2, letters: 'н', why: 'у «н» две ножки' },
    { digit: 3, letters: 'м', why: 'у «м» три ножки' },
    { digit: 4, letters: 'р', why: '«четыРе» заканчивается на Р' },
    { digit: 5, letters: 'л', why: 'на Ладони пять пальцев; римская L — это 50' },
    { digit: 6, letters: 'ш ж ч щ', why: '«Шесть» начинается на Ш' },
    { digit: 7, letters: 'к г х', why: 'семёрка по форме — это «Г»' },
    { digit: 8, letters: 'в ф', why: '«Восемь» начинается на В; Ф — её глухая пара' },
    { digit: 9, letters: 'п б', why: 'девятка вверх ногами — это «б»; П — её глухая пара' },
  ],
  en: [
    { digit: 0, letters: 's z', why: 'Zero starts with Z; S is its voiced twin' },
    { digit: 1, letters: 't d', why: 'a printed “t” has one downstroke' },
    { digit: 2, letters: 'n', why: '“n” has two legs' },
    { digit: 3, letters: 'm', why: '“m” has three legs' },
    { digit: 4, letters: 'r', why: 'fouR ends in R' },
    { digit: 5, letters: 'l', why: 'the Roman L is 50; a hand shows five' },
    { digit: 6, letters: 'sh ch j', why: 'a script “j” mirrors a 6' },
    { digit: 7, letters: 'k q hard c', why: 'a K is built from two sevens' },
    { digit: 8, letters: 'f v', why: 'a script “f” has two loops, like an 8' },
    { digit: 9, letters: 'p b', why: 'a 9 mirrored is a “p”' },
  ],
};

/** Буква → цифра. Всё, чего здесь нет (гласные, ь, ъ, й, h, w, y), кода не несёт. */
const RU_MAP: Record<string, number> = {
  с: 0, з: 0, ц: 0,
  т: 1, д: 1,
  н: 2,
  м: 3,
  р: 4,
  л: 5,
  ш: 6, ж: 6, ч: 6, щ: 6,
  к: 7, г: 7, х: 7,
  в: 8, ф: 8,
  п: 9, б: 9,
};

const EN_MAP: Record<string, number> = {
  s: 0, z: 0,
  t: 1, d: 1,
  n: 2,
  m: 3,
  r: 4,
  l: 5,
  j: 6,
  k: 7, q: 7,
  f: 8, v: 8,
  p: 9, b: 9,
};

/** Двубуквенные сочетания разбираются ДО одиночных: «sh» — один звук, не с+h. */
const EN_DIGRAPHS: Array<[string, number]> = [
  ['sh', 6], ['ch', 6], ['ck', 7], ['ph', 8], ['th', 1],
];

/**
 * Разобрать слово в цифры по правилу кода.
 *
 * 🔴 ЭТО НЕ УКРАШЕНИЕ, А СТОРОЖ ДАННЫХ. Список из ста слов набран руками, и
 * опечатка в нём — это не «некрасиво», а неверный приём, который человек выучит
 * и будет им пользоваться. Проба гоняет этим разбором каждую из ста строк.
 *
 * ⚠️ Удвоенная согласная — ОДИН звук: «lasso» это 50, а не 500.
 */
export function decodePegWord(word: string, lang: PegLang): number[] {
  const letters = word.toLowerCase().replace(lang === 'ru' ? /[^а-яё]/g : /[^a-z]/g, '');
  const digits: number[] = [];
  let prev = '';
  for (let i = 0; i < letters.length; i += 1) {
    const ch = letters[i];
    if (lang === 'en') {
      const pair = letters.slice(i, i + 2);
      const digraph = EN_DIGRAPHS.find(([d]) => d === pair);
      if (digraph) {
        if (pair !== prev) digits.push(digraph[1]);
        prev = pair;
        i += 1;
        continue;
      }
      if (ch === 'c') {
        // Правило чтения, а не исключение: «c» перед e/i/y звучит как s, иначе как k.
        const next = letters[i + 1] ?? '';
        // ⚠️ ПУСТАЯ СТРОКА ВХОДИТ В ЛЮБУЮ: без проверки на непустоту «c» в конце
        // слова («vac») читалась как s, и опора 87 кодировала 80. Поймала проба.
        const value = next !== '' && 'eiy'.includes(next) ? 0 : 7;
        if (ch !== prev) digits.push(value);
        prev = ch;
        continue;
      }
    }
    const map = lang === 'ru' ? RU_MAP : EN_MAP;
    const value = map[ch];
    if (value === undefined) { prev = ''; continue; }
    if (ch !== prev) digits.push(value);
    prev = ch;
  }
  return digits;
}

/**
 * Сто опор. Индекс = число, слово кодирует ровно его — и ничего сверх:
 * в слове ИМЕННО ДВА кодирующих согласных, иначе образ тянул бы третью цифру.
 * Каждый образ — предмет, который можно увидеть: приём держится на картинке,
 * а не на понятии.
 */
export const PEG_WORDS: Record<PegLang, string[]> = {
  ru: [
    'соус', 'сад', 'сани', 'сом', 'сыр', 'соль', 'сажа', 'сок', 'сова', 'зуб',
    'туз', 'дед', 'тень', 'дом', 'тир', 'тело', 'туча', 'утка', 'удав', 'дуб',
    'нос', 'нота', 'няня', 'аниме', 'нора', 'Нил', 'ниша', 'нога', 'нива', 'небо',
    'мясо', 'мёд', 'мина', 'мумия', 'море', 'мыло', 'мяч', 'мак', 'мойва', 'амёба',
    'роса', 'рот', 'рана', 'рама', 'Рур', 'орёл', 'ручей', 'рука', 'риф', 'рыба',
    'лиса', 'лёд', 'луна', 'лом', 'лира', 'лилия', 'лужа', 'лук', 'лава', 'лапа',
    'часы', 'щит', 'шина', 'чум', 'шар', 'шаль', 'чаша', 'щука', 'шов', 'шуба',
    'коса', 'кот', 'конь', 'ком', 'кора', 'кол', 'каша', 'гайка', 'кофе', 'губа',
    'ваза', 'вода', 'вино', 'вымя', 'вор', 'вилы', 'вошь', 'фига', 'фифа', 'выпь',
    'бусы', 'бита', 'пена', 'пума', 'перо', 'пила', 'печь', 'пух', 'пиво', 'папа',
  ],
  en: [
    'oasis', 'seed', 'sun', 'sumo', 'sari', 'seal', 'sash', 'sock', 'safe', 'soap',
    'dose', 'toad', 'tuna', 'dome', 'tire', 'tail', 'dish', 'duck', 'dove', 'tub',
    'nose', 'net', 'neon', 'enemy', 'nori', 'nail', 'nacho', 'neck', 'navy', 'nib',
    'moose', 'mud', 'moon', 'mummy', 'mare', 'mole', 'mesh', 'mako', 'movie', 'map',
    'rose', 'rat', 'rain', 'ram', 'aurora', 'rail', 'roach', 'rock', 'roof', 'rope',
    'lasso', 'lid', 'lion', 'lime', 'lyre', 'lily', 'leash', 'lock', 'leaf', 'lip',
    'chess', 'shed', 'chain', 'chime', 'chair', 'shell', 'cha-cha', 'chick', 'chief', 'ship',
    'kiss', 'kite', 'queen', 'cameo', 'car', 'coal', 'cash', 'cake', 'coffee', 'cap',
    'vase', 'food', 'fan', 'foam', 'fire', 'file', 'fish', 'vac', 'fife', 'fob',
    'bus', 'bat', 'bun', 'beam', 'bear', 'ball', 'beach', 'book', 'beef', 'pipe',
  ],
};

/** Опора для числа 0…99 или `null`, если язык без таблицы. */
export function pegFor(n: number, lang: string): string | null {
  if (!hasPegTable(lang)) return null;
  if (!Number.isInteger(n) || n < 0 || n > 99) return null;
  return PEG_WORDS[lang][n];
}

/**
 * Подсказка «почему это слово»: какие согласные дали цифры. Её показывает экран
 * запоминания — без разбора опора выглядит произвольной, и приём не передаётся.
 */
export function pegHint(n: number, lang: string): string | null {
  const word = pegFor(n, lang);
  if (!word || !hasPegTable(lang)) return null;
  const rows = PEG_RULE[lang];
  const digits = decodePegWord(word, lang);
  const parts = digits.map((d) => {
    const row = rows.find((r) => r.digit === d);
    return `${row ? row.letters.split(' ')[0] : '?'}=${d}`;
  });
  return `${word}: ${parts.join(' + ')}`;
}

/**
 * Подписи экрана для двух языков, у которых таблица есть.
 *
 * ⚠️ ПОЧЕМУ НЕ ЧЕРЕЗ ОБЩИЕ ПЕРЕВОДЫ. Режим живёт ровно там, где есть таблица, —
 * в русском и английском. Заводить ключи на двенадцать языков ради экрана,
 * который в десяти из них не показывается, значит просить чат текстов перевести
 * то, что никто не увидит. Появятся таблицы для других языков — придут и ключи.
 */
export const PEG_TEXT: Record<PegLang, {
  aid: string; show: string; hide: string; codeTitle: string; codeTail: string;
  mode: string; askWord: string; askNumber: string; right: string; wrong: string; left: string;
}> = {
  ru: {
    aid: 'Опора',
    show: 'Показывать',
    hide: 'Скрыть',
    codeTitle: 'Код: цифра → согласные',
    codeTail: 'Гласные свободны. Два согласных в слове — двузначное число: нос = н(2)+с(0) = 20.',
    mode: 'Опоры',
    askWord: 'Какое слово?',
    askNumber: 'Какое число?',
    right: 'Верно',
    wrong: 'Верный ответ:',
    left: 'Осталось',
  },
  en: {
    aid: 'Peg',
    show: 'Show',
    hide: 'Hide',
    codeTitle: 'Code: digit → consonants',
    codeTail: 'Vowels are free. Two consonants make a two-digit number: nose = n(2)+s(0) = 20.',
    mode: 'Pegs',
    askWord: 'Which word?',
    askNumber: 'Which number?',
    right: 'Right',
    wrong: 'The answer was:',
    left: 'Left',
  },
};
