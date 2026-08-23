/* psygames-series-in-warmup-gate · VER 1 · 23.08.2026 */
/**
 * ВСЁ, ЧТО ИДЁТ СЕРИЕЙ, ЖИВЁТ В «ЗАРЯДКЕ» — И НИГДЕ БОЛЬШЕ.
 *
 * Решение Дениса 23.08.2026. «Оценка» и FIN BRAIN — не игры, а прогоны набора
 * игр на том же движке плейлистов, что и зарядка. Отдельные карточки на главной
 * давали два входа в один движок; вход остался один.
 *
 * ⚠️ ЧТО ИМЕННО СТЕРЕЖЁТСЯ. Набор каждой серии и её пускатель — ЗНАЧЕНИЯ из
 * `services/warmupEntries`, и проверяются они значениями. Чтением исходника
 * проверяется РОВНО ОДНО, что иначе не проверить: главная больше не запускает
 * серии сама. Проба ниже доказывает, что этот срез вообще что-то видит.
 */
declare const __dirname: string;
declare function require(id: string): any;

import { launchPlanFor, SERIES_KEYS, PLAYLIST_SERIES, BLOCK_SERIES, seriesKind, seriesPlaylist, seriesStarter, seriesProfileFlag, seriesRoute, seriesBlockCount, seriesGameId } from '@/src/services/warmupEntries';
import { GAMES } from '@/src/constants/games';
import { buildAssessmentPlaylist, buildFinancialBatteryPlaylist } from '@/src/services/warmup';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8') as string;

describe('серии как значения', () => {
  it('серий пять: две плейлистом и три блоками', () => {
    expect([...SERIES_KEYS]).toEqual(['assessment', 'financial', 'schulte-blocks', 'proofreading-blocks', 'chess-blocks']);
    expect([...PLAYLIST_SERIES]).toEqual(['assessment', 'financial']);
    expect([...BLOCK_SERIES]).toEqual(['schulte-blocks', 'proofreading-blocks', 'chess-blocks']);
  });

  /**
   * 🔴 ЭТА ПРОБА ЗАВЕДЕНА ПО СЛЕДАМ СОБСТВЕННОЙ ОШИБКИ. Экран выводил игру серии
   * из ключа обрезкой суффикса: `'schulte-blocks'` → `'schulte'`. В каталоге игра
   * зовётся `schulte_table`, и разрешение проверялось на несуществующий
   * идентификатор. На полном профиле `isGameAllowed` отвечает «да» всем подряд,
   * поэтому наружу это не вылезало — а на профиле с ограниченным набором карточка
   * серии пряталась бы при разрешённой игре. Сверяем с КАТАЛОГОМ, а не с догадкой.
   */
  it('каждая серия блоков названа идентификатором, который ЕСТЬ в каталоге игр', () => {
    const known = new Set(GAMES.map((g: { id: string }) => g.id));
    const bad = BLOCK_SERIES.map((k) => ({ k, id: seriesGameId(k) }))
      .filter(({ id }) => !id || !known.has(id))
      .map(({ k, id }) => `${k}→${id ?? 'null'}`);
    expect(`серий с несуществующей игрой: ${bad.length ? bad.join(', ') : 'нет'}`)
      .toBe('серий с несуществующей игрой: нет');
  });

  /**
   * 🔴 СЕРИЯ БЛОКОВ ОБЯЗАНА БЫТЬ В «ЗАРЯДКЕ» НАРАВНЕ С ПЛЕЙЛИСТОМ. В первой
   * редакции сюда попали только серии-плейлисты, а три таблицы Шульте и три
   * режима корректурки остались доступны лишь с экрана своей игры. Разделение
   * «плейлист против режима внутри игры» — внутреннее устройство, человеку оно
   * не видно и он его не просил: он просил, чтобы всё, что идёт серией, лежало
   * в одном месте.
   */
  it('у каждой серии блоков есть маршрут, у плейлистовой — нет', () => {
    const map = SERIES_KEYS.map((k) => `${k}:${seriesKind(k)}:${seriesRoute(k) ? 'маршрут' : 'без'}`);
    expect(map).toEqual([
      'assessment:playlist:без',
      'financial:playlist:без',
      'schulte-blocks:blocks:маршрут',
      'proofreading-blocks:blocks:маршрут',
      'chess-blocks:blocks:маршрут',
    ]);
  });

  /**
   * ⚠️ ИМЕННО `auto=1`, А НЕ `wu=1`. Шаг зарядки (`wu=1`) уровень не двигает — так
   * задумано. Но серия блоков ведёт СВОЙ уровень по модели C, и под `wu=1` её
   * прогресс встал бы намертво: человек играл бы серию, а поле не росло никогда.
   */
  it('серия блоков запускается автостартом, но НЕ как шаг зарядки', () => {
    for (const k of BLOCK_SERIES) {
      const r = seriesRoute(k)!;
      expect(`${k}: ${JSON.stringify(r.params)}`).toBe(`${k}: {"auto":"1","series":"1"}`);
    }
  });

  it('в серии блоков ровно три блока, у плейлистовой блоков нет', () => {
    expect(SERIES_KEYS.map(seriesBlockCount)).toEqual([null, null, 3, 3, 3]);
  });

  it('набор серии-плейлиста — тот же самый, что строит движок зарядки', () => {
    expect(seriesPlaylist('assessment')!.steps.map((s) => s.game_id))
      .toEqual(buildAssessmentPlaylist().steps.map((s) => s.game_id));
    expect(seriesPlaylist('financial')!.steps.map((s) => s.game_id))
      .toEqual(buildFinancialBatteryPlaylist().steps.map((s) => s.game_id));
  });

  it('ни одна серия-плейлист не пуста — иначе «Начать» уводило бы сразу на итог', () => {
    const sizes = PLAYLIST_SERIES.map((k) => `${k}:${seriesPlaylist(k)!.steps.length}`);
    expect(sizes.every((s) => !s.endsWith(':0'))).toBe(true);
  });

  it('у каждой серии свой пускатель и свой ключ профиля — не общий на двоих', () => {
    expect(SERIES_KEYS.map(seriesStarter)).toEqual(['startAssessment', 'startFinancialBattery', null, null, null]);
    expect(SERIES_KEYS.map(seriesProfileFlag)).toEqual(['assessment_enabled', 'financial_brain_day_enabled', null, null, null]);
  });

  it('финансовая батарея — это Iowa, BART и PRL, а не что попало', () => {
    expect(seriesPlaylist('financial')!.steps.map((s) => s.game_id).sort())
      .toEqual(['bart', 'iowa', 'prl']);
  });
});

describe('вход в серию — только через зарядку', () => {
  const home = read('app/index.tsx');
  const picker = read('app/warmup-picker.tsx');

  it('главная больше не запускает серии сама', () => {
    const calls = ['startAssessment(', 'startFinancialBattery('].filter((c) => home.includes(c));
    expect(`запуски серий на главной: ${calls.length ? calls.join(', ') : 'нет'}`)
      .toBe('запуски серий на главной: нет');
  });

  it('главная не тянет за собой состояние серий', () => {
    const leftovers = ['getAssessmentStatus', 'getFinancialCooldown', 'finBrainMeta', 'assessmentMeta']
      .filter((c) => home.includes(c));
    expect(`остатки серий на главной: ${leftovers.length ? leftovers.join(', ') : 'нет'}`)
      .toBe('остатки серий на главной: нет');
  });

  it('экран зарядки берёт список серий из общего модуля, а не заводит свой', () => {
    expect(picker).toContain("from '@/src/services/warmupEntries'");
    expect(picker).toContain('SERIES_KEYS');
    // ⚠️ Раньше здесь требовалось `seriesStarter(picked)` — то есть чтобы экран САМ
    // разбирал вид серии. Именно так и появился баг: рядом стоял список `case` с
    // двумя ключами серий блоков из трёх, и третья уходила в `default`. Теперь план
    // запуска отдаёт реестр (`launchPlanFor`), а экран его исполняет.
    expect(picker).toContain('launchPlanFor');
    // И у экрана НЕТ своего перечня ключей серий блоков — перечислять их негде,
    // значит и разойтись с реестром нечему.
    for (const key of BLOCK_SERIES) expect(picker).not.toContain(`case '${key}'`);
  });

  /**
   * ⚠️ ПРОБА НА САМ СРЕЗ. Две проверки выше устроены как «строки НЕТ в файле» —
   * такая проверка зелена и когда файл не прочитан вовсе (пустая строка не
   * содержит ничего). Поэтому доказываем отдельно, что чтение работает и файл
   * непустой: иначе весь раздел был бы самообманом.
   */
  /**
   * 🔴 МАРШРУТ БЕСПОЛЕЗЕН, ЕСЛИ ЭКРАН ПАРАМЕТР НЕ ЧИТАЕТ. Ровно это и было у
   * корректурки: маршрут вёл бы в обычную партию, а не в серию, и «Зарядка»
   * молча запускала бы не то. У Шульте параметр был, у корректурки — нет.
   */
  it('оба экрана серии блоков читают параметр series', () => {
    const screens = {
      'schulte-blocks': read('app/games/schulte.tsx'),
      'proofreading-blocks': read('app/games/proofreading.tsx'),
      'chess-blocks': read('app/games/chess-blind.tsx'),
    } as Record<string, string>;
    const missing = Object.entries(screens)
      .filter(([, src]) => !/bool\('series'\)/.test(src) || !/beginSeries\(\)/.test(src))
      .map(([k]) => k);
    expect(`экраны без чтения параметра: ${missing.length ? missing.join(', ') : 'нет'}`)
      .toBe('экраны без чтения параметра: нет');
  });

  it('срез действительно читает файлы, а не пустоту', () => {
    expect(`главная ${home.length > 10000} · зарядка ${picker.includes('startEvening')}`)
      .toBe('главная true · зарядка true');
  });
});

describe('запуск серии: реестр решает, экран исполняет', () => {
  it('🔴 у КАЖДОЙ серии из реестра есть план запуска — ни одна не проваливается', () => {
    // Дыра, которую эта проверка закрывает: в `warmup-picker` стоял список `case`
    // с двумя ключами серий блоков из трёх, и `chess-blocks` уходил в `default` —
    // вместо серии запускалась обычная зарядка из пяти игр. Реестр при этом был
    // ПОЛОН, поэтому проверки реестра молчали: расходился с ним ЭКРАН.
    for (const key of SERIES_KEYS) {
      const plan = launchPlanFor(key);
      expect(plan).toBeTruthy();
      if (plan.kind === 'playlist') {
        expect(['startAssessment', 'startFinancialBattery']).toContain(plan.starter);
      } else {
        expect(plan.pathname.startsWith('/games/')).toBe(true);
        expect(plan.params.auto).toBe('1');
        expect(plan.params.series).toBe('1');   // именно серия, а не одиночный шаг зарядки
      }
    }
  });

  it('🔴 вид плана совпадает с видом серии — плейлист не уедет на маршрут и наоборот', () => {
    for (const key of SERIES_KEYS) {
      expect(launchPlanFor(key).kind).toBe(seriesKind(key) === 'playlist' ? 'playlist' : 'route');
    }
  });

  it('🔴 у серий блоков маршруты РАЗНЫЕ — иначе две серии ведут в одну игру', () => {
    const paths = BLOCK_SERIES.map((k) => {
      const p = launchPlanFor(k);
      return p.kind === 'route' ? p.pathname : '';
    });
    expect(new Set(paths).size).toBe(BLOCK_SERIES.length);
  });
});
