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
   * запись», судоку-самурай пролежал невидимым с версии 1.186.0 до 12.08.2026:
   * 539 строк рабочего кода, девять уровней, проверка единственности решения,
   * переводы на двенадцать языков — и ни одной ссылки в каталоге. Открыть игру
   * можно было, только набрав адрес руками, чего не делает никто.
   *
   * Такую пропажу не видно ни в типах, ни в сборке, ни глазами: каталог выглядит
   * полным, потому что в нём и так шесть десятков карточек. Поэтому — списком.
   */
  it('каждый экран игры есть в реестре — иначе игра написана, но недоступна', () => {
    // Служебные экраны игрой не являются: у них нет карточки и не должно быть.
    const NOT_GAMES = new Set(['_layout']);

    const registered = new Set(GAMES.map((g) => g.route.replace(/^\/games\//, '')));
    const orphans = readdirSync(SCREENS_DIR)
      .filter((f: string) => f.endsWith('.tsx'))
      .map((f: string) => f.replace(/\.tsx$/, ''))
      .filter((name: string) => !NOT_GAMES.has(name) && !registered.has(name));

    expect(orphans).toEqual([]);
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
