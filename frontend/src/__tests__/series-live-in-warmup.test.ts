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

import { SERIES_KEYS, PLAYLIST_SERIES, BLOCK_SERIES, seriesKind, seriesPlaylist, seriesStarter, seriesProfileFlag, seriesRoute, seriesBlockCount } from '@/src/services/warmupEntries';
import { buildAssessmentPlaylist, buildFinancialBatteryPlaylist } from '@/src/services/warmup';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8') as string;

describe('серии как значения', () => {
  it('серий четыре: две плейлистом и две блоками', () => {
    expect([...SERIES_KEYS]).toEqual(['assessment', 'financial', 'schulte-blocks', 'proofreading-blocks']);
    expect([...PLAYLIST_SERIES]).toEqual(['assessment', 'financial']);
    expect([...BLOCK_SERIES]).toEqual(['schulte-blocks', 'proofreading-blocks']);
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
    expect(SERIES_KEYS.map(seriesBlockCount)).toEqual([null, null, 3, 3]);
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
    expect(SERIES_KEYS.map(seriesStarter)).toEqual(['startAssessment', 'startFinancialBattery', null, null]);
    expect(SERIES_KEYS.map(seriesProfileFlag)).toEqual(['assessment_enabled', 'financial_brain_day_enabled', null, null]);
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
    expect(picker).toContain('seriesStarter(picked)');
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
