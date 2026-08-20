/**
 * НОЧЬ В КАРТОЧКЕ МАГАЗИНА — ОБЕЩАНА ВЕЗДЕ И НИГДЕ НЕ СОВРАНА.
 *
 * 🔴 ЗАЧЕМ. Тёмная тема и ночной набор «не спится» в приложении есть, а в карточке
 * Play их не было: единственное слово «ночная» относилось к ПЕРЕЧИСЛЕНИЮ наборов
 * зарядки («утренняя, дневная, вечерняя, ночная»), а не к оформлению. Довод лежал
 * в продукте и не доезжал до витрины.
 *
 * ⚠️ ГЛАВНАЯ ЛОВУШКА, РАДИ КОТОРОЙ ГЕЙТ УСТРОЕН ИМЕННО ТАК. Проверка «встречается
 * ли слово ночь» зелена на карточке, где про тему не сказано ни слова: слово стоит
 * в списке наборов зарядки, в разборе под текстом, в комментарии. Поэтому здесь:
 *   1) читается ТОЛЬКО блок полного описания (то, что уедет в Play), а не весь .md —
 *      разбор и заметки ниже текста ничего зеленить не могут;
 *   2) обещанием считается ОДНА СТРОКА, где рядом стоят и тема, и ночь. Строка
 *      перечисления наборов содержит «ночь» и НЕ содержит темы — она отвергается,
 *      и это проверяется на самих файлах, а не на выдуманном примере: декой живой.
 *
 * 🔴 ВТОРАЯ ПОЛОВИНА ГЕЙТА — ЧЕСТНОСТЬ. Обещать в магазине то, чего в коде нет, —
 * прямой путь к репорту «врёте». Каждое слово строки пришпилено к факту в коде:
 * дыхание 4-7-8 ⇔ `calm478` в NIGHT_STEPS, приглушённый экран ⇔ `dim: 1` плюс
 * `GRADIENT_NIGHT`, «без очков и стрика» ⇔ ночь вне `isTrainingSlot`. Уйдёт факт
 * из кода — гейт покраснеет на ТЕКСТЕ, который стал неправдой.
 *
 * ⚠️ АВТОПЕРЕКЛЮЧЕНИЯ ТЕМЫ ПО ВРЕМЕНИ СУТОК В КОДЕ НЕТ (сверено 20.08.2026), и
 * системную тему приложение тоже не читает. Пока это так, обещать «темнеет само к
 * ночи» нельзя — гейт стережёт и текст, и сам факт. Появится автопереключение —
 * проверка ниже упадёт и скажет, что запрет пора снимать: это не ошибка, а сигнал.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync, existsSync } = require('fs');
const { join } = require('path');

const ROOT = join(__dirname, '../../..');
const FRONT = join(__dirname, '../..');
const listing = (lang: string) => join(ROOT, 'store/google-play', `listing-${lang}.md`);
const readFront = (rel: string): string => readFileSync(join(FRONT, rel), 'utf8');

/** Лимит поля «Полное описание» в Play. */
const PLAY_DESC_LIMIT = 4000;

const LANGS = ['ru', 'en', 'de', 'es', 'fr', 'it', 'pt', 'hi', 'zh', 'ja', 'ko', 'ar'];

/**
 * Тема и ночь — ДВА РАЗНЫХ маркера, и обещанием считается их встреча в одной строке.
 * Порознь они ничего не значат: «ночь» есть в списке наборов зарядки у всех, а «тема»
 * без ночи — это ровно то «есть тёмная тема», которое есть у любого приложения.
 */
const THEME: Record<string, RegExp> = {
  ru: /тёмн[а-яё]*\s+тем/i,    en: /dark\s+theme/i,        de: /dunkl[a-zäöü]*\s+design/i,
  es: /tema\s+oscuro/i,        fr: /th[eè]me\s+sombre/i,   it: /tema\s+scuro/i,
  pt: /tema\s+escuro/i,        hi: /डार्क\s*थीम/,          zh: /深色主题/,
  ja: /ダークテーマ/,           ko: /다크\s*테마/,           ar: /سمة\s+داكنة/,
};
const NIGHT: Record<string, RegExp> = {
  ru: /ночн|не спится/i,       en: /night|can'?t sleep/i,  de: /nacht|nächt/i,
  es: /noche|noctur|dormir/i,  fr: /nuit|sommeil/i,        it: /notte|nottur|sonno/i,
  pt: /noite|noturn|sono/i,    hi: /रात|नींद/,             zh: /夜|睡/,
  ja: /夜|眠/,                  ko: /밤|잠/,                 ar: /ليل|النوم/,
};

/** Полное описание = самый длинный ```-блок карточки. Всё остальное — разбор для своих. */
function description(md: string): string {
  const blocks: string[] = [];
  const re = /```\n([\s\S]*?)\n```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) blocks.push(m[1]);
  if (!blocks.length) return '';
  return blocks.reduce((a, b) => (b.length > a.length ? b : a));
}

/** Строки описания, где тема и ночь стоят рядом. Пусто = обещания нет. */
function promiseLines(md: string, lang: string): string[] {
  return description(md)
    .split('\n')
    .filter((l) => THEME[lang].test(l) && NIGHT[lang].test(l));
}

/** Строки-приманки: ночь есть, темы нет. Это перечисление наборов зарядки. */
function decoyLines(md: string, lang: string): string[] {
  return description(md)
    .split('\n')
    .filter((l) => NIGHT[lang].test(l) && !THEME[lang].test(l));
}

describe('карточка Play: ночная тема подана как довод', () => {
  it('есть что проверять — иначе гейт зелен вслепую', () => {
    expect(LANGS.length).toBe(12);
    for (const lang of LANGS) {
      expect(`${lang}: ${existsSync(listing(lang))}`).toBe(`${lang}: true`);
      expect(`${lang}: описание непусто`).toBe(
        `${lang}: ${description(readFileSync(listing(lang), 'utf8')).length > 1000 ? 'описание непусто' : 'ПУСТО'}`,
      );
    }
  });

  it('обещание про ночную тему есть во ВСЕХ двенадцати локалях', () => {
    const missing: string[] = [];
    for (const lang of LANGS) {
      const found = promiseLines(readFileSync(listing(lang), 'utf8'), lang);
      if (found.length !== 1) missing.push(`${lang}: строк-обещаний ${found.length}, нужна ровно 1`);
    }
    expect(missing).toEqual([]);
  });

  /**
   * ⚠️ ТА САМАЯ ПРОВЕРКА СМЫСЛА. Декой не выдуман: это живая строка перечисления
   * наборов зарядки из тех же файлов. Если гейт начнёт считать её обещанием — он
   * снова станет проверкой на слово, и вот здесь это будет видно.
   */
  it('строка перечисления наборов зарядки обещанием НЕ считается', () => {
    const wrong: string[] = [];
    for (const lang of LANGS) {
      const md: string = readFileSync(listing(lang), 'utf8');
      const decoys = decoyLines(md, lang);
      if (!decoys.length) { wrong.push(`${lang}: приманки не нашлось — проверка ничего не доказывает`); continue; }
      const asDoc = decoys.join('\n');
      // Тот же детектор, поданный ОДНИМИ приманками, обязан вернуть пусто.
      const fake = '```\n' + asDoc + '\n```';
      if (promiseLines(fake, lang).length !== 0) wrong.push(`${lang}: приманка зачлась за обещание — «${decoys[0].slice(0, 60)}»`);
    }
    expect(wrong).toEqual([]);
  });

  it('обещание в разборе под текстом не считается — читаем только поле описания', () => {
    const md = [
      '# Карточка',
      '```', 'PsyGames: тренировка мозга', '```',
      '```',
      'Тут длинное описание без ночи. '.repeat(60),
      '```',
      'Разбор: сюда мы записали, что тёмная тема и ночной набор — сильный довод.',
    ].join('\n');
    expect(promiseLines(md, 'ru')).toEqual([]);
  });

  it('описание влезает в лимит Play', () => {
    const over: string[] = [];
    for (const lang of LANGS) {
      const n = description(readFileSync(listing(lang), 'utf8')).length;
      if (n > PLAY_DESC_LIMIT) over.push(`${lang}: ${n} из ${PLAY_DESC_LIMIT}`);
    }
    expect(over).toEqual([]);
  });
});

describe('карточка Play: обещанное про ночь есть в коде', () => {
  const warmup = readFront('src/services/warmup.ts');
  const breathing = readFront('app/games/breathing.tsx');
  const theme = readFront('src/contexts/ThemeContext.tsx');
  const settings = readFront('app/settings.tsx');

  it('ночной набор существует и это дыхание 4-7-8', () => {
    expect(warmup).toMatch(/const NIGHT_STEPS/);
    expect(warmup).toMatch(/game_id: 'breathing'/);
    expect(warmup).toMatch(/tech: 'calm478'/);
    expect(warmup).toMatch(/buildNightPlaylist/);
  });

  it('«приглушённый экран» — не фигура речи: шаг несёт dim, игра берёт ночной градиент', () => {
    expect(warmup).toMatch(/dim: 1/);
    expect(breathing).toMatch(/GRADIENT_NIGHT/);
    expect(breathing).toMatch(/dim \? GRADIENT_NIGHT/);
  });

  it('«без очков и стрика» — ночь выведена из тренировочной механики', () => {
    expect(warmup).toMatch(/export function isTrainingSlot/);
    expect(warmup).toMatch(/return slot !== 'night'/);
  });

  it('тёмная тема есть и переключается человеком', () => {
    expect(theme).toMatch(/const darkTheme: ThemeColors/);
    expect(theme).toMatch(/const toggleTheme = \(\)/);
    expect(settings).toMatch(/onValueChange=\{toggleTheme\}/);
  });

  /**
   * Пока автопереключения нет — текст не должен его обещать. Проверяем ФАКТ в коде,
   * а не формулировку: реализуют — здесь и узнают, что карточку можно усилить.
   */
  it('автопереключения темы по времени/системе в коде НЕТ — значит и в тексте нет', () => {
    expect(theme).not.toMatch(/useColorScheme|Appearance\./);
    expect(theme).not.toMatch(/getHours|slotForHour|currentSlot/);

    const AUTO: Record<string, RegExp> = {
      ru: /сам\w*\s+(темне|переключ)|по времени суток|по расписанию|системн\w*\s+тем/i,
      en: /auto(matic|-)?\w*\s+(dark|switch)|switches? (itself|automatically)|follows? (the )?system/i,
      de: /automatisch\w*\s+(dunkel|umschalt)|folgt dem system/i,
      es: /autom[aá]tic\w*|sigue el sistema/i,
      fr: /automatique\w*|suit le syst[eè]me/i,
      it: /automatic\w*|segue il sistema/i,
      pt: /autom[aá]tic\w*|segue o sistema/i,
      hi: /अपने\s*आप|स्वचालित/,
      zh: /自动(切换|变暗)|跟随系统/,
      ja: /自動(で|的に)?(切り替|暗く)|システムに合わせ/,
      ko: /자동으로|시스템에 맞춰/,
      ar: /تلقائ/,
    };
    const lied: string[] = [];
    for (const lang of LANGS) {
      const line = promiseLines(readFileSync(listing(lang), 'utf8'), lang)[0] ?? '';
      if (AUTO[lang].test(line)) lied.push(`${lang}: «${line.slice(0, 70)}»`);
    }
    expect(lied).toEqual([]);
  });
});
