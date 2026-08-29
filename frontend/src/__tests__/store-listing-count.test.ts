/* psygames-store-listing-count · VER 2 · 20.08.2026 */
/**
 * СКОЛЬКО УПРАЖНЕНИЙ ОБЕЩАНО В МАГАЗИНАХ — СЧИТАЕТСЯ ПО КАТАЛОГУ, А НЕ ПИШЕТСЯ РУКОЙ.
 *
 * ЗАЧЕМ. Карточки магазинов на пятнадцати файлах и двенадцати языках говорят человеку
 * «N упражнений». Каталог растёт, карточки — нет, и расхождение не видно НИКОМУ: код
 * собирается, тесты зелёные, приложение работает. Врёт только текст, который читают
 * перед установкой, и опровергнуть его человек может за минуту, пересчитав карточки.
 *
 * 🔴 ЧЕМУ РАВНО ЧЕСТНОЕ ЧИСЛО. В `GAMES` 72 записи, но три несут `hub: true`
 * (`span_group`, `sudoku_group`, `attention_conflict`) — это не упражнения, а развилки:
 * экраны `app/games/span.tsx`, `sudoku-hub.tsx`, `attention-conflict.tsx` состоят из
 * выбора режима и редиректа, своей партии не пишут, а их содержимое посчитано
 * ОТДЕЛЬНЫМИ записями (`digit_span`/`corsi`/`spatial_span`, три судоку,
 * `stroop`/`stroop_emotional`/`flanker`/`simon`). Засчитать ещё и развилку — посчитать
 * одно и то же дважды. Правило не выдумано здесь: ровно так считает онбординг
 * приложения, и это сверяется ниже — чтобы витрина и первый экран не разъехались.
 *
 * ⚠️ Скрытые из меню (`hideFromMenu`) СЧИТАЮТСЯ. Карточкой в каталоге они не видны, но
 * человек их получает: они запускаются зарядками и развилками. Обещать только видимые
 * значило бы занижать то, что куплено.
 *
 * 🔴 ПОЧЕМУ ПРЕДЫДУЩАЯ ВЕРСИЯ ГЕЙТА БЫЛА ЗЕЛЕНА ПРИ ЗАВЕДОМО НЕВЕРНЫХ ЧИСЛАХ — ТРИ
 * ДЫРЫ, КАЖДАЯ ЗАКРЫТА ЗДЕСЬ ОТДЕЛЬНО:
 *
 *   1. КОНСТАНТА ДОЛГА. В гейте жило `LISTING_BEHIND = 1`, и ожидаемым числом было
 *      «каталог минус один». То есть гейт не сверял витрину с каталогом, а РАЗРЕШАЛ ей
 *      отставать — ровно на ту величину, на которую она отставала. Никакой константы
 *      долга здесь больше нет и быть не может: ожидаемое число берётся из каталога.
 *
 *   2. МАРКЕРЫ, ПОДОГНАННЫЕ ПОД МЕСТА, ГДЕ ЧИСЛО СЛУЧАЙНО СОВПАДАЛО. Проверялись
 *      только числа, приклеенные ВПЛОТНУЮ к слову-маркеру, а маркеры были подобраны
 *      узко: `種類の脳トレ`, `種。`, `项练习`, `가지 훈련`, `अभ्यास`. Стоило вставить
 *      между числом и существительным одно слово — и число переставало проверяться.
 *      Так пять локалей годами носили «63»: `63種類を収録`, `63 项记忆…练习`,
 *      `63가지 두뇌 훈련`, `63 ब्रेन ट्रेनिंग अभ्यास` — каждое мимо своего маркера,
 *      при том что в соседней строке того же файла стояло проверявшееся «71».
 *      Здесь наоборот: маркеры ШИРОКИЕ (любое слово про упражнение/игру/тренировку на
 *      двенадцати языках), и проверяется КАЖДОЕ двух-трёхзначное число такой строки.
 *
 *   3. ЧИСЛА, КОТОРЫЕ НЕ ПРО УПРАЖНЕНИЯ, ГЛУШИЛИ ГЕЙТ. Первая версия ловила «12 языков»
 *      и «12 вариантов правил» и от этого сузила маркеры до подгонки (см. п.2). Правильный
 *      выход — не сужать поиск, а НАЗВАТЬ такие числа: `EXPLAINED` ниже. Список закрыт,
 *      каждое значение сверено с кодом, и в нём не может оказаться самого числа
 *      упражнений — иначе через него пролезло бы протухшее.
 *
 * ⚠️ КОММЕНТАРИИ СРЕЗАЮТСЯ ДО ПОИСКА. Верное число, написанное в `<!-- ... -->` рядом с
 * неверным в живом тексте, не должно ни зеленить проверку, ни изображать «маркеры на
 * месте». На этом в проекте попадались много раз: проверку держало СЛОВО В КОММЕНТАРИИ.
 *
 * ⚠️ ЧИТАЕТСЯ ТОЛЬКО ПРОДАЮЩИЙ ТЕКСТ — то, что уедет в магазин: ```-блоки и `код`-вставки
 * (в этих файлах поля карточки лежат именно так, «готовые к копированию»), а для CSV —
 * значения колонок. Разбор и заметки под текстом читают свои, а не покупатели, и числа
 * там живут своей жизнью (лимиты полей, размеры списков тегов Google, даты).
 *
 * ЧТО ЛОМАЛИ, ЧТОБЫ УБЕДИТЬСЯ, ЧТО КРАСНЕЕТ (и что из этого встроено навсегда):
 *   · число в одной карточке разошлось с каталогом на ±1 — встроено, `staleFor`;
 *   · число протухло в ОДНОМ файле из пятнадцати — встроено, по каждому файлу отдельно;
 *   · каталог вырос, а карточки не тронули — встроено, синтетический каталог `+1`;
 *   · верное число спрятано в комментарии рядом с неверным в тексте — встроено;
 *   · текст переписали так, что маркеры перестали совпадать — встроено (счёт совпадений);
 *   · описание вышло за 4000 символов Play — проверяется ниже.
 */
declare const __dirname: string;
declare function require(id: string): any;

const fs = require('fs');
const path = require('path');

import { PUBLIC_GAME_COUNT } from '@/src/constants/profiles';
import { GAMES, isHubGame } from '../constants/games';
import { PROFILES, isSwitchable } from '../constants/profiles';
import { levelConfig } from '@/src/services/sudoku-core';
import { LANGUAGES } from '../contexts/LanguageContext';

const ROOT = path.join(__dirname, '../../..');
const FRONT = path.join(__dirname, '../..');

/**
 * ЕДИНСТВЕННЫЙ ИСТОЧНИК ЧИСЛА. Каталог минус развилки — то же правило, что в онбординге.
 * Считается из ЖИВОГО каталога (импорт), а не из подсчёта скобок в тексте `games.ts`:
 * текстовый счётчик не отличает упражнение от развилки и именно поэтому давал 72.
 */
/** Одно число на приложение и на витрину: считает `profiles.ts`, остальные берут. */
const EXERCISES = PUBLIC_GAME_COUNT;

/** Файлы витрины. Список закрыт: новый язык, не внесённый сюда, ловится проверкой ниже. */
const SHOPS: { file: string; play: boolean }[] = [
  ...['ru', 'en', 'de', 'es', 'fr', 'it', 'pt', 'hi', 'zh', 'ja', 'ko', 'ar'].map((l) => ({
    file: `store/google-play/listing-${l}.md`,
    play: true,
  })),
  { file: 'store/windows/listing-en.md', play: false },
  { file: 'store/windows/listing-ru.md', play: false },
  { file: 'store/windows/store-listing.csv', play: false },
  { file: 'store/appstore/listing.md', play: false },
];

/** Лимит поля «Полное описание» в Play. */
const PLAY_DESC_LIMIT = 4000;

/**
 * Слова про упражнение / игру / тренировку на всех двенадцати языках. Берутся ВСЕ разом
 * для любого файла: маркер чужого языка лишним не будет, а вот забытый в своём — дыра.
 * Корни, а не словоформы: «69 упражнений», «69 упражнения», «69 Übungen» одинаково видны.
 */
const MARKERS = [
  'упражнени', 'тренаж', 'тренировк', 'игр',
  'exercise', 'game', 'trainer', 'training',
  'übung', 'spiel',
  'ejercicio', 'juego', 'entrenamiento',
  'exercice', 'jeu', 'entraînement',
  'esercizi', 'gioco', 'giochi', 'allenament',
  'exercício', 'jogo', 'treino', 'treinamento',
  'अभ्यास', 'खेल', 'ट्रेनिंग', 'प्रशिक्षण',
  // ⚠️ Счётные слова CJK берём БЕЗ уточнения: краткое описание ja говорит «69種。» —
  // не «種類», не «脳トレ». Ровно этот зазор гейт и проспал бы, а поймала проверка
  // «гейт видит каждое вхождение» ниже. Родовое «12種類の言語» теперь не мешает: 12
  // объяснено, а не выпилено сужением маркера.
  '练习', '游戏', '训练', '项', '种',
  '種', '脳トレ', 'ゲーム', 'トレーニング',
  '훈련', '게임', '가지',
  'تمرين', 'تمار', 'لعب', 'تدريب',
];

/**
 * ЧИСЛА, КОТОРЫЕ СТОЯТ РЯДОМ С УПРАЖНЕНИЯМИ, НО УПРАЖНЕНИЯ НЕ СЧИТАЮТ.
 * Список закрыт и каждое значение сверено с кодом отдельной проверкой ниже. Это
 * единственная законная лазейка гейта, поэтому она короткая и охраняемая.
 */
const EXPLAINED: Record<number, string> = {
  12: 'языки приложения / профили в выборе — по коду оба равны 12',
  15: 'варианты правил судоку: 12 одиночных + 3 комбо-пары пояса 81–92 (29.08.2026)',
  50: '«50+» — возрастной сегмент в блоке «для кого», а не счёт упражнений',
};

/** Двух- и трёхзначные: счёт упражнений заведомо в этом диапазоне, а «4 категории» — нет. */
const NUMBER = /(?<![0-9])([0-9]{2,3})(?![0-9])/g;

/**
 * ПРОДАЮЩИЙ ТЕКСТ ФАЙЛА — то, что уедет в магазин, без разбора и без комментариев.
 * Для .md: ```-блоки (поля карточки) плюс `код`-вставки (в App Store подзаголовок и
 * промо-текст лежат именно так). Для .csv: значения колонок без имени поля — иначе
 * `ProductFeatures12` подсунуло бы гейту «12» на ровном месте.
 */
function shippingCopy(file: string, src: string): string {
  if (file.endsWith('.csv')) {
    return src
      .split('\n')
      .map((l) => l.replace(/^[A-Za-z][A-Za-z0-9]*,(Text|Type),/, ''))
      .join('\n');
  }
  const noComments = src.replace(/<!--[\s\S]*?-->/g, '');
  const out: string[] = [];
  const fence = /```[a-z]*\n([\s\S]*?)\n```/g;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(noComments)) !== null) out.push(m[1]);
  const rest = noComments.replace(fence, '');
  const inline = /`([^`\n]+)`/g;
  while ((m = inline.exec(rest)) !== null) out.push(m[1]);
  return out.join('\n');
}

/** Строка, приведённая к виду для поиска: бренд убран (в «PsyGames» сидит маркер `game`). */
function probe(line: string): string {
  return line.toLowerCase().replace(/psygames/g, '');
}

/** Все проверяемые числа файла: каждое двух-трёхзначное со строки, где помянуто упражнение. */
function numbersIn(file: string, src: string): number[] {
  const found: number[] = [];
  for (const line of shippingCopy(file, src).split('\n')) {
    const p = probe(line);
    if (!MARKERS.some((w) => p.includes(w))) continue;
    for (const hit of p.matchAll(NUMBER)) found.push(Number(hit[1]));
  }
  return found;
}

/** Претензии к файлу: что за число и чем оно должно было быть. Пусто = витрина не врёт. */
function staleFor(file: string, src: string, expected: number): string[] {
  return numbersIn(file, src)
    .filter((n) => n !== expected && EXPLAINED[n] === undefined)
    .map((n) => `${file}: ${n} вместо ${expected}`);
}

const read = (file: string): string => fs.readFileSync(path.join(ROOT, file), 'utf8');

/**
 * Сколько раз число стоит в продающем тексте — считаем НАПРЯМУЮ, мимо маркеров.
 * Это вторая, независимая линейка: если она разойдётся со счётом через маркеры,
 * значит какое-то обещание покупателю гейт не проверяет вовсе.
 */
function occurrencesInCopy(file: string, src: string, n: number): number {
  const re = new RegExp(`(?<![0-9])${n}(?![0-9])`, 'g');
  return (shippingCopy(file, src).match(re) || []).length;
}

/** Все вхождения верного числа заменены на соседнее — так протухает одна локаль. */
function spoil(src: string, n: number): string {
  return src.replace(new RegExp(`(?<![0-9])${n}(?![0-9])`, 'g'), String(n + 1));
}

/** Полное описание Play = самый длинный ```-блок карточки. */
function playDescription(md: string): string {
  const blocks: string[] = [];
  const re = /```[a-z]*\n([\s\S]*?)\n```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) blocks.push(m[1]);
  return blocks.length ? blocks.reduce((a, b) => (b.length > a.length ? b : a)) : '';
}

describe('карточки магазинов: есть что проверять', () => {
  it('все файлы витрины на месте и ни один не забыт в списке', () => {
    for (const s of SHOPS) {
      expect(`${s.file}: ${fs.existsSync(path.join(ROOT, s.file))}`).toBe(`${s.file}: true`);
    }
    // Завели тринадцатый язык, а в гейт не внесли — гейт про это скажет сам.
    const onDisk: string[] = fs
      .readdirSync(path.join(ROOT, 'store/google-play'))
      .filter((f: string) => f.startsWith('listing-') && f.endsWith('.md'))
      .map((f: string) => `store/google-play/${f}`)
      .sort();
    expect(onDisk).toEqual(SHOPS.filter((s) => s.play).map((s) => s.file).sort());
  });

  it('каталог отличает упражнение от развилки', () => {
    expect(GAMES.length).toBeGreaterThan(50);
    const hubs = GAMES.filter((g) => isHubGame(g.id)).length;
    // Пропадёт признак `hub` из модели — гейт станет считать развилки упражнениями молча.
    expect(`развилок в каталоге: ${hubs > 0}`).toBe('развилок в каталоге: true');
    // ⚠️ И песочница: игру, которую сами держим сырой, витрина обещать не должна.
    const sandbox = GAMES.filter((g) => (g as any).sandbox).length;
    expect(`в песочнице: ${sandbox > 0}`).toBe('в песочнице: true');
    expect(EXERCISES).toBe(GAMES.length - hubs - sandbox);
    expect(EXERCISES).toBeGreaterThanOrEqual(10);   // диапазон, в котором ищутся числа
    expect(EXERCISES).toBeLessThanOrEqual(999);
  });

  /**
   * Витрина и первый экран приложения обязаны считать ОДНО И ТО ЖЕ. Онбординг уже
   * считает правильно (`GAMES.filter((g) => !isHubGame(g.id))`) — если там правило
   * перепишут, покупатель получит одно число в магазине и другое при запуске.
   */
  /**
   * 🔴 РАНЬШЕ ЗДЕСЬ СВЕРЯЛИ ФОРМУЛУ, А НАДО — ИСТОЧНИК. Правило счёта стояло в трёх
   * файлах одинаковым текстом, и проверка «формула совпадает» это одобряла. 22.08.2026
   * профили перестали считать песочницу, а экран и витрина продолжили: три копии
   * разошлись, и проверка формулы была бессильна по устройству. Теперь требуется,
   * чтобы экран НЕ считал сам, а брал общее число.
   */
  it('🔴 экран не считает упражнения сам, а берёт общее число', () => {
    const onboarding: string = fs.readFileSync(path.join(FRONT, 'app/onboarding.tsx'), 'utf8');
    expect(onboarding).toContain('PUBLIC_GAME_COUNT');
    expect(onboarding.replace(/\s+/g, ' ')).not.toContain('GAMES.filter((g) => !isHubGame(g.id)).length');
  });

  it('в каждом файле витрины нашлось что проверять', () => {
    const blind: string[] = [];
    for (const s of SHOPS) {
      const n = numbersIn(s.file, read(s.file)).length;
      if (n === 0) blind.push(`${s.file}: маркеры не совпали ни разу — текст переписали, гейт ослеп`);
    }
    expect(blind).toEqual([]);
    const total = SHOPS.reduce((a, s) => a + numbersIn(s.file, read(s.file)).length, 0);
    expect(`проверяемых чисел: ${total >= 40}`).toBe('проверяемых чисел: true');
  });
});

describe('карточки магазинов: обещанное число упражнений', () => {
  it('совпадает с каталогом во всех пятнадцати файлах', () => {
    const wrong: string[] = [];
    for (const s of SHOPS) wrong.push(...staleFor(s.file, read(s.file), EXERCISES));
    expect(wrong).toEqual([]);
  });

  it('названо в каждой из двенадцати локалей Play, а не только в паре', () => {
    const silent: string[] = [];
    for (const s of SHOPS.filter((x) => x.play)) {
      const hits = numbersIn(s.file, read(s.file)).filter((n) => n === EXERCISES).length;
      if (hits === 0) silent.push(`${s.file}: числа упражнений в продающем тексте нет вовсе`);
    }
    expect(silent).toEqual([]);
  });

  it('описание Play влезает в лимит', () => {
    const over: string[] = [];
    for (const s of SHOPS.filter((x) => x.play)) {
      const n = playDescription(read(s.file)).length;
      if (n > PLAY_DESC_LIMIT) over.push(`${s.file}: ${n} из ${PLAY_DESC_LIMIT}`);
    }
    expect(over).toEqual([]);
  });
});

/**
 * ГЕЙТ, КОТОРЫЙ ДОКАЗЫВАЕТ, ЧТО УМЕЕТ КРАСНЕТЬ.
 *
 * Проверки выше зелены и когда всё честно, и когда детектор сломан. Ниже тот же
 * детектор натравлен на ЗАВЕДОМО ИСПОРЧЕННЫЙ вход — и обязан ругаться. Порча делается
 * на ЖИВЫХ файлах, а не на выдуманном примере: выдуманный переживёт любую переделку
 * текста, живой — нет.
 */
describe('карточки магазинов: гейт ломается, когда должен', () => {
  it('каталог вырос или усох на единицу — краснеет каждый файл', () => {
    for (const delta of [1, -1]) {
      const missed: string[] = [];
      for (const s of SHOPS) {
        if (staleFor(s.file, read(s.file), EXERCISES + delta).length === 0) {
          missed.push(`${s.file}: расхождение на ${delta} прошло незамеченным`);
        }
      }
      expect(missed).toEqual([]);
    }
  });

  /**
   * 🔴 САМАЯ ЦЕННАЯ ПРОВЕРКА НАБОРА, и не тавтология: маркеры считают одно, а прямой
   * поиск по продающему тексту — другое. Разошлись — значит какое-то «N упражнений»
   * покупатель читает, а гейт не проверяет. Именно так и вскрылось, что японское
   * краткое описание говорит «69種。» мимо всех маркеров: число стояло на витрине и
   * не проверялось ничем.
   */
  it('гейт видит КАЖДОЕ вхождение числа в продающем тексте, а не часть', () => {
    const blind: string[] = [];
    for (const s of SHOPS) {
      const src = read(s.file);
      const byMarkers = numbersIn(s.file, src).filter((n) => n === EXERCISES).length;
      const inCopy = occurrencesInCopy(s.file, src, EXERCISES);
      if (byMarkers !== inCopy) {
        blind.push(`${s.file}: в тексте ${inCopy} обещаний, гейт проверяет ${byMarkers}`);
      }
    }
    expect(blind).toEqual([]);
  });

  it('число протухло в ОДНОМ файле из пятнадцати — виден именно он', () => {
    const missed: string[] = [];
    for (const s of SHOPS) {
      const cry = staleFor(s.file, spoil(read(s.file), EXERCISES), EXERCISES);
      if (cry.length === 0) missed.push(`${s.file}: протухшая локаль не поймана`);
      // Остальные файлы при этом обязаны молчать — иначе гейт не показывает виновного.
      for (const other of SHOPS) {
        if (other.file === s.file) continue;
        if (staleFor(other.file, read(other.file), EXERCISES).length !== 0) {
          missed.push(`${other.file}: шумит, хотя портили ${s.file}`);
        }
      }
    }
    expect(missed).toEqual([]);
  });

  it('верное число в комментарии не выгораживает неверное в тексте', () => {
    const missed: string[] = [];
    for (const s of SHOPS.filter((x) => !x.file.endsWith('.csv'))) {
      const spoiled =
        spoil(read(s.file), EXERCISES) +
        `\n<!--\n\`\`\`\nВсего ${EXERCISES} упражнений — сверено с каталогом\n\`\`\`\n-->\n`;
      if (staleFor(s.file, spoiled, EXERCISES).length === 0) {
        missed.push(`${s.file}: комментарий прикрыл ложь в тексте`);
      }
      // И наоборот: комментарий не должен изображать, будто в файле есть что проверять.
      const onlyComment = `# Пусто\n<!--\n\`\`\`\n${EXERCISES} упражнений\n\`\`\`\n-->\n`;
      if (numbersIn(s.file, onlyComment).length !== 0) {
        missed.push(`${s.file}: число из комментария зачлось за обещание`);
      }
    }
    expect(missed).toEqual([]);
  });

  it('разбор под текстом карточку не зеленит и не пачкает', () => {
    // Заметка для своих с любым числом — не продающий текст, гейту она безразлична.
    const note = '\n\nЗаметка: раньше в каталоге было 48 упражнений, потом 71.\n';
    for (const s of SHOPS.filter((x) => !x.file.endsWith('.csv'))) {
      expect(staleFor(s.file, read(s.file) + note, EXERCISES)).toEqual([]);
    }
    // ...но то же самое ВНУТРИ поля карточки — уже ложь покупателю.
    const inField = '\n\n```\nВнутри: 48 упражнений на память\n```\n';
    expect(staleFor(SHOPS[0].file, read(SHOPS[0].file) + inField, EXERCISES).length).toBeGreaterThan(0);
  });

  it('описание, вылезшее за лимит Play, ловится', () => {
    const md = read('store/google-play/listing-ru.md');
    const fat = md.replace(playDescription(md), playDescription(md) + 'ы'.repeat(PLAY_DESC_LIMIT));
    expect(playDescription(fat).length).toBeGreaterThan(PLAY_DESC_LIMIT);
  });
});

/**
 * ОБЪЯСНЁННЫЕ ЧИСЛА — ЕДИНСТВЕННАЯ ЛАЗЕЙКА ГЕЙТА, И ОНА ПРИШПИЛЕНА К КОДУ.
 * Пока «12» значит языки, профили и варианты правил — оно законно стоит рядом с
 * упражнениями. Разъедется хоть одно — здесь и узнаем, а не из отзыва в магазине.
 */
describe('карточки магазинов: числа не про упражнения — названы и сверены', () => {
  it('в списке объяснённых нет самого числа упражнений', () => {
    expect(
      EXPLAINED[EXERCISES] === undefined
        ? 'лазейки нет'
        : `${EXERCISES} объявлено объяснённым — через него пролезет любое протухшее число`,
    ).toBe('лазейки нет');
  });

  it('«12» — это языки, профили и варианты правил судоку', () => {
    expect(`языков: ${LANGUAGES.length}`).toBe('языков: 12');
    expect(`профилей в выборе: ${PROFILES.filter(isSwitchable).length}`).toBe('профилей в выборе: 12');

    /**
     * 🔴 СЧИТАЕМ ИГРАБЕЛЬНЫЕ ВАРИАНТЫ, А НЕ ЧЛЕНЫ ТИПА.
     *
     * Здесь читалось объявление `type Variant` из исходника. 26.08.2026 в тип
     * добавились «неравенства» — движок собран и проверен, но УРОВНЕЙ ему не дано
     * (замер: ступень 1–2 при любой плотности знаков, разбор в `sudoku-core.ts`).
     * Гейт покраснел на «13 вместо 12», хотя в карточке магазина «12» осталось
     * ПРАВДОЙ: человек по-прежнему играет двенадцать наборов правил.
     *
     * Тип — это то, что умеет движок; карточка обещает то, во что можно сыграть.
     * Сверять карточку с типом значит краснеть на каждой заготовке в работе.
     * Поэтому считаем варианты, до которых доходит `levelConfig` на реальной
     * лестнице уровней.
     */
    const playable = new Set<string>();
    for (let lv = 1; lv <= 200; lv++) {
      const v = String(levelConfig(lv).variant);
      if (v !== 'none') playable.add(v);
    }
    // 29.08.2026: комбо-пояс 81–92 добавил три играбельных пары (thermoknight/
    // sandparity/killerdiag) — карточки магазинов подняты с 12 до 15 тем же коммитом.
    expect(`вариантов правил судоку: ${playable.size}`).toBe('вариантов правил судоку: 15');
  });

  it('каждое объяснённое число объяснено словами, а не молча', () => {
    for (const [n, why] of Object.entries(EXPLAINED)) {
      expect(`${n}: ${why.length > 20}`).toBe(`${n}: true`);
    }
  });
});

/**
 * 🔴 ОДНО ЧИСЛО НА ПРИЛОЖЕНИЕ И ВИТРИНУ.
 *
 * 20.08.2026 их было три сразу: витрина обещала 71, профиль владельца и свитчер
 * говорили 72 (`GAMES.length`, вместе с тремя развилками), первый экран
 * приложения считал 69 — единственный правильный. Развилка не упражнение: её
 * содержимое уже посчитано отдельными записями, и считать её значит обещать
 * одно и то же дважды.
 *
 * Проверка ИСПОЛНЕНИЕМ: берём число из кода, а не из текста про него.
 */
describe('число упражнений одно на всё приложение', () => {
  /**
   * ⚠️ С 22.08.2026 ВЫЧИТАЕТСЯ ЕЩЁ И ПЕСОЧНИЦА. Денис прошёл восемь новых игр и
   * семь из них признал сырыми: «им пока место в песочнице». Обещать в магазине
   * и в описании профиля то, что сами держим недоделанным, нельзя — число обязано
   * падать честно, а не оставаться красивым.
   */
  it('🔴 публичное число не считает ни развилки, ни песочницу', () => {
    const { PUBLIC_GAME_COUNT, SANDBOX_GAME_COUNT } = require('@/src/constants/profiles');
    const { GAMES, isHubGame } = require('@/src/constants/games');
    const hubs = GAMES.filter((g: any) => isHubGame(g.id)).length;
    const sandbox = GAMES.filter((g: any) => g.sandbox).length;
    expect(`развилок: ${hubs > 0}`).toBe('развилок: true');       // иначе проверка слепа
    expect(`в песочнице: ${sandbox > 0}`).toBe('в песочнице: true');
    expect(SANDBOX_GAME_COUNT).toBe(sandbox);
    expect(PUBLIC_GAME_COUNT).toBe(GAMES.length - hubs - sandbox);
  });

  /** Развилка и песочница — разные вещи: развилку не считаем как меню, песочницу как сырое. */
  it('🔴 ни одна игра не помечена и развилкой, и песочницей сразу', () => {
    const { GAMES, isHubGame } = require('@/src/constants/games');
    const both = GAMES.filter((g: any) => g.sandbox && isHubGame(g.id)).map((g: any) => g.id);
    expect(both).toEqual([]);
  });
});
