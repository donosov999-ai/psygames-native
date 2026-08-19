/**
 * ВЫХОД ИЗ ЖИВОЙ ПАРТИИ НЕ ПРОИСХОДИТ МОЛЧА.
 *
 * 🔴 ЧТО ЛОМАЛОСЬ. Замер 19.08.2026: подтверждения выхода не было НИ В ОДНОЙ из
 * 64 игр — `Alert.alert` и `confirm(` по `app/games/*.tsx` не встречались ни
 * разу. Каркас `GameShell` звал `onBack` прямо из обработчика нажатия, и у 45
 * экранов это был голый `goBackOrHome()`. Человек разбирает маджонг двадцать
 * минут, промахивается пальцем по кнопке «назад» в шапке — пирамида исчезает
 * молча, без вопроса и без возможности вернуться. Слой сохранения
 * `services/resume` при этом уже существовал и лежал без дела: звала его ровно
 * одна игра из 64.
 *
 * ПОЧЕМУ ГЕЙТ, А НЕ «ПРОСТО ПОЧИНИЛИ». Дыра появилась не по невнимательности, а
 * потому что игры пишутся копированием соседней. Следующая игра, скопированная
 * с шаблона, снова возьмёт `onBack={() => goBackOrHome()}` — и снова молча.
 * Особенно опасен ПОЛОВИНЧАТЫЙ случай: игра завела слой сохранения, но не
 * спрашивает. Тогда доска уезжает в хранилище, экран схлопывается без единого
 * слова, и человек считает партию потерянной — то есть починка выглядит хуже
 * поломки.
 *
 * ⚠️ ЧТО ПРОВЕРЯЕТСЯ ПОВЕДЕНИЕМ, А НЕ ЧТЕНИЕМ. Логика решения «спросить или
 * выйти» вынесена из React в `createExitGuard` и здесь гоняется по-настоящему,
 * нажатие за нажатием. Рендерера компонентов в зависимостях проекта нет
 * (`testMatch` — только `*.test.ts`), поэтому всё, что живёт в разметке,
 * проверено глазами в браузере, а не тут.
 *
 * ⚠️ СВЕРКА ИСХОДНИКОВ НАМЕРЕННО НЕ ПРИВЯЗАНА К ИМЕНИ ФУНКЦИИ. Проверяется
 * СПОСОБНОСТЬ («игра дотягивается до слоя партии», «игра спрашивает перед
 * выходом»), и у каждой способности список равноправных признаков. Заменишь
 * механизм на лучший — допиши признак в список; тест про смысл, а не про то,
 * как называется вызов.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync, readdirSync, existsSync } = require('fs');
const { join } = require('path');
import { createExitGuard, ExitGuardDeps } from '@/src/hooks/useExitGuard';

const ROOT = join(__dirname, '../..');
const GAMES_DIR = join(ROOT, 'app/games');
const GAMES: string[] = readdirSync(GAMES_DIR).filter((f: string) => f.endsWith('.tsx')).sort();
const readGame = (f: string) => readFileSync(join(GAMES_DIR, f), 'utf8') as string;

/** Признаки того, что экран дотягивается до слоя незаконченной партии. */
const SAVES_MARKS = ['services/resume', 'saveResume'];
/** Признаки того, что экран спрашивает перед выходом. */
const ASKS_MARKS = ['confirmExit', 'useExitGuard'];

const saves = (src: string) => SAVES_MARKS.some((m) => src.includes(m));
const asks = (src: string) => ASKS_MARKS.some((m) => src.includes(m));

/**
 * ДЛИННЫЕ ИГРЫ — те, где партия дольше одного раунда и терять действительно
 * есть что. Правило отбора, по которому список и составлен:
 *
 *   ОДНА доска живёт всю партию (не пересоздаётся каждый раунд)
 *   И партия измеряется минутами, а не секундами
 *   И расклад случайный — по номеру уровня его не воспроизвести.
 *
 * Почему сюда НЕ попало остальное (и почему это не забывчивость):
 *   · башня Лондона, память-матрица, объём внимания — доска пересоздаётся
 *     каждый раунд, терять нечего дольше одного короткого раунда;
 *   · таблица Шульте, следовой тест, найди отличия, корректура, счётчик,
 *     пропуски — раунд с ЛИМИТОМ ВРЕМЕНИ: «продолжить» там значит выдать
 *     бесплатное время, и замер перестанет быть замером;
 *   · «показали → воспроизведи» (запоминание слов, пересказ, слепые шахматы) —
 *     пауза посреди показа ломает саму задачу;
 *   · реакционные батареи (струп, фланкер, go/no-go и прочие) — независимые
 *     пробы по секунде, партия целиком короче минуты;
 *   · словарь-повторение ведёт своё расписание в хранилище сам.
 */
const LONG_GAMES: Record<string, string> = {
  'mahjong.tsx': 'одна пирамида на уровень, до 30 пар в пяти слоях — партия на 10-20 минут, порядок разбора не воспроизводится',
  'hanoi.tsx': 'одна башня на уровень, оптимум 2^n−1 ходов (до 4095 на 12 дисках), плюс лента отмены',
  'picture-pairs.tsx': 'одно поле на уровень, до 12 групп; человек держит в голове позиции карт — другой расклад стирает именно это',
  'sudoku.tsx': 'доска на 81 клетку и 12 вариантов правил; слой партии писался ради неё первой',
  'memory-palace.tsx': 'один маршрут на всю партию: 12 расстановок руками и 24 ответа вперёд и назад, это минуты; расклад предметов случайный и по номеру уровня не воспроизводится нарочно — повтор того же набора мерил бы узнавание вместо памяти',
  'sudoku-fractal.tsx': 'десять сеток 9×9 снизу вверх, партия на несколько часов; расклад случайный и по номеру уровня не воспроизводится',
};

/**
 * ДОЛГ: длинные игры, до которых заход 19.08.2026 не дотянулся, потому что
 * файлы в тот момент правили ПАРАЛЛЕЛЬНЫЕ заходы, и лезть в них значило
 * затереть чужую работу. Список закрыт — новые игры сюда не дописываются.
 *
 * ⚠️ `sudoku-samurai.tsx` — самый неприятный случай и ровно тот, ради которого
 * гейт вообще написан: слой партии там уже есть, а вопрос при выходе не задан.
 * Значит доска уезжает в хранилище молча. Как только файл освободится, ему
 * нужен `confirmExit` — и строчка отсюда уходит.
 */
const LOCKED_DEBT: Record<string, string> = {
  'goods-sort.tsx': 'длинная (склад на уровень), ни слоя партии, ни вопроса — файл занят параллельным заходом',
  'set-game.tsx': 'длинная (раскладка на партию), ни слоя партии, ни вопроса — файл занят параллельным заходом',
  'sudoku-samurai.tsx': 'пять сеток 9×9, партия на час: слой партии уже есть, а вопроса при выходе нет — файл занят параллельным заходом',
};

/** Заготовка: страж с подставными зависимостями и журналом того, что он позвал. */
function harness(armed = true) {
  const log: string[] = [];
  let isArmed = armed;
  const deps: ExitGuardDeps = {
    isArmed: () => isArmed,
    save: () => { log.push('save'); },
    exit: () => { log.push('exit'); },
    setAsking: (v: boolean) => { log.push(v ? 'ask' : 'hide'); },
  };
  const guard = createExitGuard(deps);
  return { guard, log, disarm: () => { isArmed = false; }, arm: () => { isArmed = true; } };
}

describe('страж выхода — поведение', () => {
  it('🔴 терять нечего → уходим МОЛЧА, без «вы уверены?»', () => {
    const h = harness(false);
    h.guard.requestExit();
    expect(h.log).toEqual(['exit']);
    expect(h.guard.asking).toBe(false);
  });

  it('🔴 есть что терять → не уходим, а спрашиваем', () => {
    const h = harness(true);
    h.guard.requestExit();
    expect(h.log).toContain('ask');
    expect(h.log).not.toContain('exit');
    expect(h.guard.asking).toBe(true);
  });

  it('партия ложится в хранилище УЖЕ на вопросе — телефон могут выключить, пока он висит', () => {
    const h = harness(true);
    h.guard.requestExit();
    expect(h.log.indexOf('save')).toBeGreaterThanOrEqual(0);
    expect(h.log.indexOf('save')).toBeLessThan(h.log.indexOf('ask'));
  });

  it('«продолжить игру» убирает вопрос и никуда не уводит', () => {
    const h = harness(true);
    h.guard.requestExit();
    h.guard.stay();
    expect(h.guard.asking).toBe(false);
    expect(h.log).not.toContain('exit');
  });

  it('🔴 «выйти» сперва сохраняет, и только потом уходит', () => {
    const h = harness(true);
    h.guard.requestExit();
    h.log.length = 0;
    h.guard.confirmExit();
    expect(h.log.indexOf('save')).toBeGreaterThanOrEqual(0);
    expect(h.log.indexOf('save')).toBeLessThan(h.log.indexOf('exit'));
  });

  it('двойное нажатие «выйти» уводит РОВНО ОДИН раз — иначе на вебе уносит на два экрана назад', () => {
    const h = harness(true);
    h.guard.requestExit();
    h.guard.confirmExit();
    h.guard.confirmExit();
    h.guard.requestExit();
    expect(h.log.filter((x) => x === 'exit')).toHaveLength(1);
  });

  it('🔴 экран снесли мимо кнопки «назад» → партия всё равно дописана', () => {
    // Ровно этот путь и есть частый: переход зарядки, убийство приложения системой.
    const h = harness(true);
    h.guard.teardown();
    expect(h.log).toEqual(['save']);
  });

  it('терять нечего → снос экрана ничего не пишет (мусорных партий в хранилище не копится)', () => {
    const h = harness(false);
    h.guard.teardown();
    expect(h.log).toEqual([]);
  });

  it('ушли по своей воле → снос экрана не пишет второй раз', () => {
    const h = harness(true);
    h.guard.confirmExit();
    h.log.length = 0;
    h.guard.teardown();
    expect(h.log).toEqual([]);
  });

  it('«есть что терять» читается В МОМЕНТ нажатия, а не при заходе на экран', () => {
    // Партия кончается, пока экран жив (собрал уровень) — вопрос после этого не нужен.
    const h = harness(true);
    h.disarm();
    h.guard.requestExit();
    expect(h.log).toEqual(['exit']);
  });

  it('игра без слоя сохранения работает так же — save необязателен', () => {
    const log: string[] = [];
    const guard = createExitGuard({
      isArmed: () => true,
      exit: () => { log.push('exit'); },
      setAsking: (v) => { log.push(v ? 'ask' : 'hide'); },
    });
    expect(() => { guard.requestExit(); guard.confirmExit(); }).not.toThrow();
    expect(log).toEqual(['ask', 'hide', 'exit']);
  });
});

describe('страж выхода — сцепка с экранами', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(GAMES.length).toBeGreaterThan(50);
    expect(existsSync(join(ROOT, 'src/hooks/useExitGuard.ts'))).toBe(true);
    expect(existsSync(join(ROOT, 'src/components/GameShell.tsx'))).toBe(true);
  });

  /**
   * Половинчатая починка хуже поломки: доска уезжает в хранилище, экран
   * схлопывается молча, человек считает партию потерянной.
   */
  it('🔴 игра, которая сохраняет партию, обязана спрашивать перед выходом', () => {
    const bad: string[] = [];
    for (const f of GAMES) {
      if (LOCKED_DEBT[f]) continue;                 // перечислен поимённо выше
      const src = readGame(f);
      if (saves(src) && !asks(src)) bad.push(`${f}: кладёт партию в хранилище, но уходит молча`);
    }
    expect(bad).toEqual([]);
  });

  /** Вопрос «партия сохранится» без слоя сохранения — прямое враньё человеку. */
  it('🔴 игра, которая обещает сохранить партию, обязана уметь её сохранять', () => {
    const liars: string[] = [];
    for (const f of GAMES) {
      const src = readGame(f);
      if (/\bresumable\b/.test(src) && !saves(src)) liars.push(`${f}: обещает продолжение, слоя партии нет`);
    }
    expect(liars).toEqual([]);
  });

  it('🔴 каждая длинная игра действительно хранит незаконченную партию', () => {
    const bad: string[] = [];
    for (const f of Object.keys(LONG_GAMES)) {
      if (!GAMES.includes(f)) { bad.push(`${f}: файла нет — поправь список`); continue; }
      const src = readGame(f);
      if (!saves(src)) bad.push(`${f}: числится длинной, а партию не сохраняет`);
      if (!asks(src)) bad.push(`${f}: числится длинной, а выходит молча`);
    }
    expect(bad).toEqual([]);
  });

  /** Список длинных игр — решение, а не заметка: у каждой строчки есть причина. */
  it('каждая длинная игра объяснена, и объяснение не отписка', () => {
    for (const [f, why] of Object.entries(LONG_GAMES)) {
      expect(`${f}: ${why.length}`).toBe(`${f}: ${Math.max(why.length, 40)}`);
    }
    for (const [f, why] of Object.entries(LOCKED_DEBT)) {
      expect(GAMES).toContain(f);
      expect(why.length).toBeGreaterThan(30);
    }
  });

  /** Протухшее исключение — это забытая уборка, а не исключение. */
  it('долг не протух: файл из списка долга всё ещё уходит молча', () => {
    const stale: string[] = [];
    for (const f of Object.keys(LOCKED_DEBT)) {
      if (!GAMES.includes(f)) { stale.push(`${f}: файла нет — убрать из долга`); continue; }
      if (asks(readGame(f))) stale.push(`${f}: вопрос при выходе уже есть — перенести в LONG_GAMES`);
    }
    expect(stale).toEqual([]);
  });

  it('долг не растёт', () => {
    expect(Object.keys(LOCKED_DEBT).length).toBeLessThanOrEqual(4);
  });

  /**
   * ⚠️ Проверяется ЗАПАХ, а не имя функции: «кнопка назад в каркасе уводит с
   * экрана напрямую из обработчика нажатия». Любой механизм проверки — хоть
   * этот хук, хоть лучший — всё равно не будет выглядеть как `onPress={onBack}`.
   */
  it('🔴 кнопка «назад» в каркасе не уводит мимо проверки', () => {
    const shell = readFileSync(join(ROOT, 'src/components/GameShell.tsx'), 'utf8') as string;
    expect(shell).not.toMatch(/onPress=\{\s*(\(\s*\)\s*=>\s*)?onBack\s*(\(\s*\))?\s*\}/);
    expect(asks(shell)).toBe(true);
  });

  /**
   * Аппаратная «назад» должна вести себя как кнопка в шапке. У нас две сборки:
   * нативная (BackHandler) и Tauri-WebView, где Platform.OS === 'web' и
   * BackHandler из react-native-web — заглушка с console.error. Значит в хуке
   * обязаны быть оба пути.
   */
  it('🔴 аппаратная «назад» перехвачена в обеих сборках', () => {
    const hook = readFileSync(join(ROOT, 'src/hooks/useExitGuard.ts'), 'utf8') as string;
    expect(hook).toContain('hardwareBackPress');   // нативная сборка
    expect(hook).toContain('popstate');            // Tauri-WebView и браузер
    expect(hook).toContain("Platform.OS === 'web'");
  });
});

describe('вопрос о выходе переведён на все 12 языков', () => {
  const KEYS = ['exitConfirmTitle', 'exitConfirmSaved', 'exitConfirmLost', 'exitConfirmStay', 'exitConfirmLeave'];
  const LOCALES = ['es', 'pt', 'hi', 'zh', 'de', 'fr', 'it', 'ja', 'ko', 'ar'];

  it('ru и en — в базовом словаре', () => {
    const src = readFileSync(join(ROOT, 'src/contexts/LanguageContext.tsx'), 'utf8') as string;
    const miss = KEYS.filter((k) => !new RegExp(`\\n\\s*${k}:\\s*\\{[^}]*\\bru:`).test(src)
                                 || !new RegExp(`\\n\\s*${k}:\\s*\\{[^}]*\\ben:`).test(src));
    expect(miss).toEqual([]);
  });

  it.each(LOCALES)('в локали %s переведён весь вопрос', (loc) => {
    const src = readFileSync(join(ROOT, `src/contexts/translations/${loc}.ts`), 'utf8') as string;
    const miss = KEYS.filter((k) => !new RegExp(`"${k}"\\s*:\\s*"[^"]+"`).test(src));
    expect(`${loc}: ${miss.join(', ')}`).toBe(`${loc}: `);
  });
});
