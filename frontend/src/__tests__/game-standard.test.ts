/**
 * ЕДИНЫЙ СТАНДАРТ ИГРОВОЙ МЕХАНИКИ. Каждое упражнение устроено одинаково.
 *
 * ЗАЧЕМ. Денис дословно: «нам важно сделать единый формат работы с каждым
 * упражнением, будь то дыхание, парные картинки или Шульте — уровни, свободный
 * режим, тропинка прогресса, боссы, геймификация» и «единый стандарт для всех,
 * шаблонизируем игровую механику».
 *
 * До этого формат разъезжался молча: игра могла завести свой экран итога, свою
 * плашку, свой счётчик — и тихо выпасть из общей бухгалтерии. Так и случилось с
 * маджонгом, сортировкой и парными картинками: у них не писались звёзды, не
 * считалась серия, не тикала глаз-разрядка, и правило режима приходилось
 * прописывать руками — именно они вылетали в вечерней зарядке.
 *
 * ТРИ ОБЯЗАТЕЛЬНЫХ ЧАСТИ (это и есть шаблон):
 *   1. ПРОГРЕСС — usePersistentLevel: число, которое растёт и переживает сессию.
 *      Это либо ступень сложности, либо счётчик прохождений — снаружи одинаково.
 *   2. ТРОПИНКА — LevelProgressMap на экране настроек: человек видит путь.
 *   3. ИТОГ — LevelCleared: единственное место, где пишутся звёзды по уровням,
 *      тикает серия чистых и наступает глаз-разрядка. Свой экран поздравления
 *      означает выпадение из всего этого.
 *
 * ⚠️ ЧЕГО ГЕЙТ НЕ ТРЕБУЕТ. Боссов — они уместны там, где есть правило, которое
 * можно резко сломать; в дыхании ломать нечего. И присутствия в зарядке: она
 * короткий ежедневный набор, а не весь каталог.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync, readdirSync, existsSync } = require('fs');
const { join } = require('path');

const GAMES_DIR = join(__dirname, '../../app/games');
const CATALOG = join(__dirname, '../constants/games.ts');

/**
 * Карточки-хабы: они не упражнения, а развилки на настоящие игры. Прогресса у них
 * нет и быть не должно — он у тех трёх-четырёх, куда хаб уводит.
 */
const HUBS = new Set(['span.tsx', 'attention-conflict.tsx']);

/** Экраны игр из каталога — берём маршруты, а не всё подряд в папке. */
function catalogScreens(): string[] {
  const src: string = readFileSync(CATALOG, 'utf8');
  const out = new Set<string>();
  const re = /route:\s*'\/games\/([a-z0-9-]+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const f = `${m[1]}.tsx`;
    if (!HUBS.has(f) && existsSync(join(GAMES_DIR, f))) out.add(f);
  }
  return [...out].sort();
}

const read = (f: string): string => readFileSync(join(GAMES_DIR, f), 'utf8');

describe('единый стандарт игровой механики', () => {
  const screens = catalogScreens();

  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(screens.length).toBeGreaterThan(55);
  });

  it('у каждой игры есть прогресс, который переживает сессию', () => {
    // Судоку хранит уровень СВОИМ ключом `psygames_sudoku_level_<профиль>` — она
    // старше хука. Формат тот же, стандарту соответствует по сути, поэтому
    // принимаем оба способа: хук или собственный ключ уровня.
    const without = screens.filter((f) => {
      const src = read(f);
      return !/usePersistentLevel\s*\(/.test(src) && !/_level_\$\{/.test(src);
    });
    expect(without).toEqual([]);
  });

  it('каждая игра показывает тропинку на экране настроек', () => {
    const without = screens.filter((f) => !/<LevelProgressMap/.test(read(f)));
    expect(without).toEqual([]);
  });

  it('каждая игра заканчивает раунд ОБЩИМ экраном — иначе звёзды и серия не пишутся', () => {
    const without = screens.filter((f) => !/<LevelCleared/.test(read(f)));
    expect(without).toEqual([]);
  });

  /**
   * ХРАПОВИК, А НЕ ЗАПРЕТ — И ЭТО ЧЕСТНЕЕ, ЧЕМ ПРОМОЛЧАТЬ.
   *
   * getMaxLevelFromSessions восстанавливает достигнутое из `details.level`, когда
   * локальный ключ прогресса потерян: переустановка, сброс профиля, новое
   * устройство. Игра, которая его не пишет, при этом обнуляется — прогресс жил
   * только в памяти телефона.
   *
   * Сейчас таких игр 21. Чинить их одним махом — отдельная работа с проверкой
   * каждой; выкинуть проверку — спрятать настоящую дыру. Поэтому фиксируем число:
   * оно может уменьшаться, но не расти. Новая игра обязана писать level сразу.
   */
  const NO_SESSION_BACKUP_MAX = 21;

  it('число игр без записи уровня в сессию не растёт', () => {
    const without = screens.filter((f) => !/level:\s*(doneLevel|doneRun|done|lvl\.level|levelRef\.current|level)\b/.test(read(f)));
    expect(`без резерва в сессии: ${without.length} (потолок ${NO_SESSION_BACKUP_MAX})`)
      .toBe(`без резерва в сессии: ${Math.min(without.length, NO_SESSION_BACKUP_MAX)} (потолок ${NO_SESSION_BACKUP_MAX})`);
  });

  it('хабы стандарту не подчиняются — им нечего показывать', () => {
    for (const f of HUBS) {
      if (!existsSync(join(GAMES_DIR, f))) continue;
      expect(/usePersistentLevel\s*\(/.test(read(f))).toBe(false);
    }
  });
});
