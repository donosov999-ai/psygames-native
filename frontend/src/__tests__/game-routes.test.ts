/**
 * Каждый route из реестра игр обязан вести на существующий экран.
 *
 * ЗАЧЕМ. Совет Синапса на экране питомца собирал адрес как `/games/${game.id}`.
 * У 26 игр из 61 id случайно совпадает с именем файла — на них всё работало, и
 * ошибку не было видно ни в типах, ни в тестах. У остальных 35 (schulte_table
 * лежит в /games/schulte) переход открывал «Unmatched Route · Page could not be
 * found». Поймал это тестировщик голосом, спустя релиз.
 *
 * Тип `route: string` такое не ловит по определению, поэтому проверяем файлами:
 * тест дешёвый, а класс ошибки — «ссылка ведёт в никуда» — самый обидный, потому
 * что выглядит как работающая кнопка.
 */
import { GAMES } from '../constants/games';

// Node-API берём через require с локальными объявлениями: @types/node в проекте
// нет (фронт собирается под RN/web), а тянуть его ради одного теста — лишняя
// зависимость. Под jest это обычный node, всё доступно в рантайме.
declare const __dirname: string;
declare function require(m: string): any;
const { existsSync, readdirSync, readFileSync } = require('fs');
const { join } = require('path');

const SCREENS_DIR = join(__dirname, '../../app/games');

describe('маршруты игр', () => {
  it('у каждой игры есть экран по её route', () => {
    const broken = GAMES.filter((g) => {
      const name = g.route.replace(/^\/games\//, '');
      return !existsSync(join(SCREENS_DIR, `${name}.tsx`));
    }).map((g) => `${g.id} → ${g.route}`);

    expect(broken).toEqual([]);
  });

  it('route начинается с /games/ — иначе router.push уедет мимо', () => {
    const odd = GAMES.filter((g) => !g.route.startsWith('/games/')).map((g) => g.id);
    expect(odd).toEqual([]);
  });

  /**
   * ОБРАТНАЯ СТОРОНА: экран есть, а в реестре его нет — и попасть в игру нельзя.
   *
   * Проверка выше смотрит только «запись → файл». Пока никто не смотрел «файл →
   * запись», судоку-самурай не значился в каталоге с версии 1.186.0 до 12.08.2026.
   * Совсем недоступен он не был — ссылка на него жила на экране настроек обычной
   * судоку, — но в каталоге среди шести десятков карточек его не было, то есть
   * находили его только те, кто уже открыл другую игру и долистал её настройки.
   *
   * Такую пропажу не видно ни в типах, ни в сборке, ни глазами: каталог выглядит
   * полным, потому что в нём и так шесть десятков карточек. Поэтому — списком.
   */
  /**
   * ПРИНЯТ ИЗ ЛАБОРАТОРИИ, В КАТАЛОГ ЕЩЁ НЕ ВПИСАН — поимённо и с причиной.
   *
   * ⚠️ ЗАЧЕМ ЭТОТ СПИСОК ВООБЩЕ ЕСТЬ. Новые игры приезжают из отдельной
   * лаборатории и принимаются по одной, параллельно несколькими заходами.
   * `src/constants/games.ts`, словарь и карта справки — три файла, общие на все
   * приёмки сразу: несколько заходов, правящих их одновременно, затирают друг
   * друга молча. Поэтому экран и его модуль едут отдельным коммитом, а точная
   * строка для `GAMES`, ключи словаря и место в профилях лежат в
   * `INTEGRATION.md` рядом с модулем — их вносит один заход-интегратор, разом.
   *
   * ЭТО НЕ ДЫРА В ГЕЙТЕ. Сирота без записи по-прежнему валит прогон; запись без
   * файла — тоже; запись, дожившая до появления игры в каталоге, — тоже
   * (проверка ниже). То есть список умеет только сокращаться.
   */
  const AWAITING_CATALOG: Record<string, string> = {
    'object-tracker': 'G5 «Трекер объектов» (multiple object tracking, 41 уровень). Экран и модуль приняты; строка для GAMES, ключи objectTracker/objectTrackerDesc/objectTrackerIntroDesc и место в профилях — в src/games/object-tracker/INTEGRATION.md',
    navigator: 'G6 «Навигатор» (мысленная карта маршрута, 33 уровня). Экран и модуль приняты; строка для GAMES, ключи navigator/navigatorDesc/navigatorIntroDesc, справка и место в профилях — в src/games/navigator/INTEGRATION.md',
  };

  it('каждый экран игры есть в реестре — иначе игра написана, но недоступна', () => {
    // Служебные экраны игрой не являются: у них нет карточки и не должно быть.
    const NOT_GAMES = new Set(['_layout']);

    const registered = new Set(GAMES.map((g) => g.route.replace(/^\/games\//, '')));
    const orphans = readdirSync(SCREENS_DIR)
      .filter((f: string) => f.endsWith('.tsx'))
      .map((f: string) => f.replace(/\.tsx$/, ''))
      .filter((name: string) => !NOT_GAMES.has(name) && !registered.has(name))
      .filter((name: string) => !AWAITING_CATALOG[name]);

    expect(orphans).toEqual([]);
  });

  /** Протухшее исключение — забытая уборка, а не исключение. */
  it('ожидание каталога не протухло: файл на месте, а в каталоге игры ещё нет', () => {
    const registered = new Set(GAMES.map((g) => g.route.replace(/^\/games\//, '')));
    const stale: string[] = [];
    for (const [name, why] of Object.entries(AWAITING_CATALOG)) {
      if (!existsSync(join(SCREENS_DIR, `${name}.tsx`))) stale.push(`${name}: экрана нет — убрать из списка`);
      if (registered.has(name)) stale.push(`${name}: игра уже в каталоге — убрать из списка`);
      // Причина без адреса, куда идти дальше, через неделю никому ничего не скажет.
      if (why.length < 40 || !why.includes('INTEGRATION.md')) stale.push(`${name}: причина не называет, где лежит запись для каталога`);
    }
    expect(stale).toEqual([]);
  });

  /**
   * Проверка выше сама по себе исходный баг НЕ поймала бы: поле route было
   * верным, врал вызывающий код. Ловим именно его — никто не имеет права
   * склеивать адрес игры из подстановки, единственный источник это g.route.
   */
  it('никто не собирает адрес игры шаблоном /games/${…}', () => {
    const roots = [join(__dirname, '../../app'), join(__dirname, '..')];
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === '__tests__') continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!/\.tsx?$/.test(e.name)) continue;
        readFileSync(p, 'utf8').split('\n').forEach((line: string, i: number) => {
          if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) return;
          if (/`\/games\/\$\{/.test(line)) offenders.push(`${p.split('/frontend/')[1]}:${i + 1}`);
        });
      }
    };
    roots.forEach(walk);

    expect(offenders).toEqual([]);
  });
});
