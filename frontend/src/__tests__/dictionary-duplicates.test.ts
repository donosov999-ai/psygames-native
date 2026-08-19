/**
 * ОДНО ДЕЙСТВИЕ — ОДНО СЛОВО. Дубли ключей словаря не разводятся заново.
 *
 * 🔴 ЧТО ЛОМАЛОСЬ. Одно и то же действие в приложении звалось двумя-тремя ключами:
 * «Проверить» жило как `check`, `validateBtn` и `btn_check` («Проверка»), «Сбросить»
 * — как `clear` и `clearBtn`, «сыграть ещё» — как `retry` («Ещё раз») и `playAgain`
 * («Играть снова»). Человек видел на соседних экранах РАЗНЫЕ подписи под одну кнопку,
 * а переводчик двенадцати языков — три строки вместо одной. 19.08.2026 схлопнули 24
 * ключа; этот гейт держит результат.
 *
 * ЧТО СЧИТАЕТСЯ ДУБЛЕМ. Совпадение текста в ru И en ОДНОВРЕМЕННО. Совпадение в одном
 * языке дублем не считается: `time` и `catVocab_time` оба «Время», но по-арабски это
 * الوقت (время на часах) и الزمن (время как тема слов) — разные слова, и сводить их
 * нельзя. Ровно поэтому проверка идёт по ДВУМ базовым языкам, а не по русскому.
 *
 * ⚠️ ПОЧЕМУ ГЕЙТ НЕ ТРЕБУЕТ НУЛЯ. Часть совпадений законна и остаётся НАВСЕГДА:
 * название лиги и стадия питомца обе «Искра», но это разные системы, и правка одной
 * не должна менять другую. Часть — долг: ключ живёт в файле, который правит другой
 * заход. Оба вида перечислены ПОИМЁННО ниже с причиной, и молчаливых исключений нет:
 * незаписанная группа роняет прогон, а запись, переставшая быть дублем, роняет его
 * тоже — чтобы список не протухал.
 *
 * ⚠️ ПАРСЕР ОБЯЗАН ПРИЗНАВАТЬСЯ, ЧТО НЕ ПОНЯЛ. Первая версия разбора съедала пять
 * ключей подряд после записи с комментарием в хвосте — и молча показывала «дублей
 * меньше». Поэтому ниже сверяется число заголовков со числом разобранных записей:
 * гейт, который недосчитал, обязан покраснеть, а не похвалить.
 */
declare const __dirname: string;
declare function require(id: string): any;

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8') as string;

const LOCALES = ['de', 'es', 'pt', 'fr', 'it', 'zh', 'ja', 'ko', 'hi', 'ar'];

interface Entry { name: string; ru: string | null; en: string | null }

/**
 * Разбор базового словаря ПОСТРОЧНО: запись начинается со строки `  имя: {`, тело
 * копится до баланса фигурных скобок. Регуляркой «от заголовка до `},` в конце
 * строки» пользоваться нельзя — на записи с хвостовым комментарием она перепрыгивает
 * через следующие ключи.
 */
function baseEntries(): Entry[] {
  const lines = read('src/contexts/LanguageContext.tsx').split('\n');
  const out: Entry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const head = /^ {2}([a-zA-Z_][a-zA-Z0-9_]*):\s*\{/.exec(lines[i]);
    if (!head) continue;
    let chunk = lines[i];
    let depth = (chunk.match(/\{/g) || []).length - (chunk.match(/\}/g) || []).length;
    let j = i;
    while (depth > 0 && j + 1 < lines.length) {
      j++;
      chunk += '\n' + lines[j];
      depth += (lines[j].match(/\{/g) || []).length - (lines[j].match(/\}/g) || []).length;
    }
    const grab = (lang: string) => {
      const re = new RegExp('(?:^|[,{\\s])' + lang + ":\\s*(['\"`])((?:\\\\.|(?!\\1)[\\s\\S])*?)\\1");
      const m = re.exec(chunk);
      return m ? m[2] : null;
    };
    out.push({ name: head[1], ru: grab('ru'), en: grab('en') });
  }
  return out;
}

/** Группы «один текст в ru И en» → отсортированные имена ключей. */
function duplicateGroups(): string[] {
  const byText = new Map<string, string[]>();
  for (const e of baseEntries()) {
    if (e.ru === null || e.en === null) continue;
    const k = e.ru + '' + e.en;
    if (!byText.has(k)) byText.set(k, []);
    byText.get(k)!.push(e.name);
  }
  return [...byText.values()]
    .filter((v) => v.length > 1)
    .map((v) => v.slice().sort().join(' + '))
    .sort();
}

/**
 * ОСОЗНАННО ОСТАВЛЕННЫЕ СОВПАДЕНИЯ — поимённо и с причиной.
 *
 * Причины бывают ровно двух родов, и они помечены явно:
 *   [СМЫСЛ] — тексты совпали случайно, ключи про РАЗНОЕ. Останется навсегда.
 *   [ДОЛГ]  — свести можно и нужно, но вызов сидит в файле, который сейчас правит
 *             другой заход; трогать чужой файл — гарантированный конфликт.
 *
 * Правило выбора выжившего, когда сводим: остаётся ключ, чьё ИМЯ описывает смысл, а
 * не экран-владелец. Поэтому `close` победил `a11yClose` (оба «Закрыть»), а пара
 * `back`/`a11yBack` осталась: победить обязан `back`, но его имя занято, и
 * переименование `a11yBack` — это 74 вызова, четырнадцать из них в занятых файлах.
 */
const ALLOWED: Record<string, string> = {
  'a11yBack + back':
    '[ДОЛГ] «Назад». Свести можно только переименованием a11yBack → back: 74 вызова, ~14 в занятых файлах (sudoku, mahjong, set-game, schulte и др.). Оставить a11yBack победителем нельзя — имя врёт про видимую подпись.',
  'a11yDigitStyle + digitStyle':
    '[ДОЛГ] «Стиль цифр». Оба вызова в app/games/sudoku.tsx — файл занят.',
  'anagramTheme_animals + catVocab_animals':
    '[СМЫСЛ] «Животные». Тема анаграмм и категория словаря — разные наборы слов; по-японски どうぶつ (кана, детям) против 動物 (кандзи). Правка темы не должна менять словарь.',
  'anagramTheme_food + goodsSet_food':
    '[СМЫСЛ] «Еда». Тема анаграмм и набор товаров в сортировке — разные сущности, живут по своим спискам.',
  'anagramTheme_nature + catVocab_nature':
    '[СМЫСЛ] «Природа». То же, что с «Животными»: тема против категории словаря.',
  'backward + directionBackward + unlockLabel_corsi_backward + unlockLabel_digit_span_backward':
    '[СМЫСЛ] «Обратный». По-японски у цифр 逆唱 (называть в обратном порядке), у Корси 逆方向 (обратное направление) — разные слова. unlockLabel_* — строки открытия режима по играм, они обязаны редактироваться поштучно.',
  'badge_morning_warmup + onbSlideWarmupTitle':
    '[СМЫСЛ] «Утренняя Зарядка». Название значка в настройках и заголовок слайда знакомства — разные поверхности, у слайда своё «Morgen-Warm-up» против «Morgen-Aufwärmen» значка.',
  'benefitChoiceRt1 + benefitPosner3':
    '[СМЫСЛ] «Скорость реакции». Польза хранится покадрово по играм: две игры могут развивать одно и то же, но правка карточки одной игры не должна менять карточку другой.',
  'benefitFl1 + benefitVs1': '[СМЫСЛ] «Селективное внимание». См. benefitChoiceRt1.',
  'benefitOs1 + benefitRs1': '[СМЫСЛ] «Рабочая память». См. benefitChoiceRt1.',
  'benefitSi1 + benefitTol3': '[СМЫСЛ] «Торможение импульса». См. benefitChoiceRt1.',
  'benefitSw2 + benefitWcst1': '[СМЫСЛ] «Когнитивная гибкость». См. benefitChoiceRt1.',
  'btn_got_it + setGotIt':
    '[ДОЛГ] «Понятно». Выжить обязан btn_got_it, но setGotIt зовут из app/games/set-game.tsx — файл занят, удалить нельзя.',
  'btn_hint + setHintBtn':
    '[ДОЛГ] «Подсказка». setHintBtn зовут из app/games/set-game.tsx — файл занят.',
  'catVocab_time + time':
    '[СМЫСЛ] «Время». Часы на игровом табло против темы словаря: по-арабски الوقت против الزمن.',
  'cosName_avatar_robot + petSkinRobot':
    '[СМЫСЛ] «Робот». Покупной аватар в магазине и шкура питомца — разные предметы разных систем.',
  'cosName_title_cyberbrain + levelTitle10':
    '[СМЫСЛ] «Кибермозг». Заработанное звание уровня против покупного титула в магазине.',
  'cosName_title_grandmaster + levelTitle6': '[СМЫСЛ] «Гроссмейстер». См. cosName_title_cyberbrain.',
  'cosName_title_legend + levelTitle9': '[СМЫСЛ] «Легенда». См. cosName_title_cyberbrain.',
  'digitsLabel + scriptDigits':
    '[ДОЛГ] «Цифры». Вызовы в app/games/sudoku.tsx и app/games/proofreading.tsx — оба файла заняты.',
  'frameSpark + leagueSpark + petStage1':
    '[СМЫСЛ] «Искра». Название лиги, название рамки-косметики и стадия питомца — три независимые системы.',
  'goalLabel + goalState':
    '[ДОЛГ] «Цель». Вызовы в app/games/goods-sort.tsx и app/games/tower-london.tsx — оба файла заняты.',
  'goodsLevel + level':
    '[ДОЛГ] «Уровень». goodsLevel зовут из app/games/goods-sort.tsx — файл занят.',
  'label_color + sudokuColorMode':
    '[ДОЛГ] «Цвет». Вызовы в app/games/set-game.tsx и app/games/sudoku.tsx — оба файла заняты.',
  'label_reminders + onbSlideRemindTitle':
    '[СМЫСЛ] «Напоминания». Строка настроек против заголовка слайда знакомства; по-корейски 알림 против 리마인더.',
  'ldWordBtn + lspanWord':
    '[СМЫСЛ] «Слово». В лексическом решении это ОТВЕТ «это слово» (по-китайски 是词), в объёме слуха — подпись поля (单词). Разные вещи.',
  'modeLevels + sudokuModeLevels':
    '[ДОЛГ] «Уровни». sudokuModeLevels зовут из app/games/sudoku.tsx — файл занят.',
};

/**
 * Храповик: столько групп-исключений записано сейчас. Свели ещё одну — ОПУСТИ число.
 * Расти ему нельзя: новая пара обязана либо схлопнуться, либо получить строку выше
 * с причиной, и тогда число двигают осознанно, а не задним числом.
 */
const KNOWN_GROUPS = 27;

describe('дубли ключей словаря', () => {
  it('разбор словаря не теряет записи', () => {
    const heads = (read('src/contexts/LanguageContext.tsx').match(/^ {2}[a-zA-Z_][a-zA-Z0-9_]*:\s*\{/gm) ?? []).length;
    // Если разобрано меньше, чем заголовков, — часть словаря не проверена, и «дублей нет» врёт.
    expect(`заголовков ${heads}, разобрано ${baseEntries().length}`).toBe(`заголовков ${heads}, разобрано ${heads}`);
  });

  it('у каждой записи прочитаны и ru, и en', () => {
    const broken = baseEntries().filter((e) => e.ru === null || e.en === null).map((e) => e.name);
    expect(`без ru/en: ${broken.length} → ${broken.slice(0, 5).join(', ')}`).toBe('без ru/en: 0 → ');
  });

  it('новых дублей нет — каждое совпадение ru+en записано поимённо', () => {
    const unlisted = duplicateGroups().filter((g) => !(g in ALLOWED));
    expect(`не записано: ${unlisted.length} → ${unlisted.join(' | ')}`).toBe('не записано: 0 → ');
  });

  it('список исключений не протух — каждая запись всё ещё дубль', () => {
    const live = new Set(duplicateGroups());
    const stale = Object.keys(ALLOWED).filter((g) => !live.has(g));
    // Свели пару, а строку не убрали — список превращается в декорацию, и в нём
    // перестают искать смысл. Убирай строку вместе с дублем.
    expect(`протухло: ${stale.length} → ${stale.join(' | ')}`).toBe('протухло: 0 → ');
  });

  it(`число исключений только уменьшается (сейчас ${KNOWN_GROUPS})`, () => {
    expect(duplicateGroups().length).toBeLessThanOrEqual(KNOWN_GROUPS);
  });

  it('храповик записан честно — свели группу, опусти число', () => {
    const now = duplicateGroups().length;
    expect(`групп ${now}, в тесте ${KNOWN_GROUPS}`).toBe(`групп ${now}, в тесте ${now}`);
  });
});

/** Все .tsx/.ts под app/ и src/, кроме тестов и node_modules. */
function sources(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__' && e.name !== 'node_modules') sources(full, acc);
      continue;
    }
    if (/\.tsx?$/.test(e.name)) acc.push(full);
  }
  return acc;
}

describe('подписи доходят до экрана', () => {
  /**
   * 🔴 ЗАЧЕМ ИМЕННО ЭТО. Схлопывание ключей ломается ровно одним способом: ключ
   * удалили из словаря, а вызов оставили. Тогда t() возвращает САМО ИМЯ КЛЮЧА, и на
   * кнопке появляется «validateBtn». Ни tsc, ни i18n-coverage этого не видят: типов у
   * ключей нет, а сличение словарей смотрит словари, а не экраны.
   *
   * Свежая грабля из соседней правки: в SET бейдж отсчёта был написан, переведён на
   * 12 языков и покрыт гейтом — и не показывался ни разу. Гейт стерёг РАЗМЕТКУ.
   * Здесь проверяется другое: что подпись, которую экран просит, вообще существует.
   */
  const keys = new Set(baseEntries().map((e) => e.name));
  const FILES = [...sources(path.join(ROOT, 'app')), ...sources(path.join(ROOT, 'src'))];

  it('каждый t(\'ключ\') из кода есть в словаре', () => {
    const broken: string[] = [];
    for (const f of FILES) {
      const txt = fs.readFileSync(f, 'utf8') as string;
      const re = /\bt\(\s*'([a-zA-Z_][a-zA-Z0-9_]*)'\s*\)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(txt))) {
        if (!keys.has(m[1])) broken.push(`${path.relative(ROOT, f)} → ${m[1]}`);
      }
    }
    expect(`битых вызовов: ${broken.length} → ${broken.slice(0, 6).join(', ')}`).toBe('битых вызовов: 0 → ');
  });

  it('в переводах нет ключей, которых уже нет в базе', () => {
    // Обратная сторона i18n-coverage: он ловит НЕДОстачу в локали, а не остаток от
    // удалённого ключа. Осиротевшая строка тихо ждёт, когда имя переиспользуют.
    for (const loc of LOCALES) {
      const have = (read(`src/contexts/translations/${loc}.ts`).match(/^ {2}"([a-zA-Z_][a-zA-Z0-9_]*)":/gm) ?? [])
        .map((m: string) => m.trim().slice(1, -2));
      const orphan = have.filter((k: string) => !keys.has(k));
      expect(`${loc}: осиротевших ${orphan.length} → ${orphan.slice(0, 5).join(', ')}`).toBe(`${loc}: осиротевших 0 → `);
    }
  });
});

describe('«Остановиться» не врёт про исход', () => {
  /**
   * 🔴 РАЗНЫЕ ИСХОДЫ ПОД ОДНИМ СЛОВОМ. Кнопка звалась «Остановиться» у всех, но у 54
   * игр возвращала к настройкам игры, а у 8 — выбрасывала с экрана игры совсем.
   * Развели словами: уходишь с экрана — подпись «На главную» (stopKind="exit"),
   * остаёшься в игре — «Остановиться» (по умолчанию).
   *
   * Проверяется СМЫСЛ, а не наличие пропса: сверяется, что делает onStop.
   */
  const GAMES = sources(path.join(ROOT, 'app/games'));

  /** Уходит ли обработчик с экрана игры. */
  const leavesScreen = (body: string) =>
    /goBackOrHome|router\.(push|replace)\(\s*'\/'\s*\)/.test(body);

  /**
   * ДОЛГ: файл занят другим заходом, пропс не проставлен. Убрать строку, когда файл
   * освободится. Список закрыт — новые сюда не дописываются.
   */
  const DEBT = ['app/games/sudoku-fractal.tsx'];

  it('игра, у которой остановка уходит с экрана, подписана «На главную»', () => {
    const wrong: string[] = [];
    for (const f of GAMES) {
      const txt = fs.readFileSync(f, 'utf8') as string;
      const rel = path.relative(ROOT, f);
      let from = 0;
      for (;;) {
        const start = txt.indexOf('<LevelCleared', from);
        if (start < 0) break;
        const end = txt.indexOf('/>', start);
        if (end < 0) break;
        const el = txt.slice(start, end);
        from = end + 2;
        const exits = leavesScreen(el);
        const marked = /stopKind\s*=\s*"exit"/.test(el);
        if (exits !== marked && !DEBT.includes(rel)) {
          wrong.push(`${rel}: уходит=${exits}, помечено=${marked}`);
        }
      }
    }
    expect(`расходится: ${wrong.length} → ${wrong.join(' | ')}`).toBe('расходится: 0 → ');
  });

  it('список долга не протух — записанный файл всё ещё расходится', () => {
    for (const rel of DEBT) {
      const txt = read(rel);
      const start = txt.indexOf('<LevelCleared');
      const el = txt.slice(start, txt.indexOf('/>', start));
      // Долг погашен — строку из DEBT убирают, иначе она прикрывает будущую поломку.
      expect(`${rel}: уходит=${leavesScreen(el)}, помечено=${/stopKind\s*=\s*"exit"/.test(el)}`)
        .toBe(`${rel}: уходит=true, помечено=false`);
    }
  });
});
