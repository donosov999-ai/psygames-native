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

import { SERIES_KEYS, seriesPlaylist, seriesStarter, seriesProfileFlag } from '@/src/services/warmupEntries';
import { buildAssessmentPlaylist, buildFinancialBatteryPlaylist } from '@/src/services/warmup';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8') as string;

describe('серии как значения', () => {
  it('серий ровно две, и это оценка и финансовая батарея', () => {
    expect([...SERIES_KEYS]).toEqual(['assessment', 'financial']);
  });

  it('набор серии — тот же самый, что строит движок зарядки', () => {
    expect(seriesPlaylist('assessment').steps.map((s) => s.game_id))
      .toEqual(buildAssessmentPlaylist().steps.map((s) => s.game_id));
    expect(seriesPlaylist('financial').steps.map((s) => s.game_id))
      .toEqual(buildFinancialBatteryPlaylist().steps.map((s) => s.game_id));
  });

  it('ни одна серия не пуста — иначе «Начать» уводило бы сразу на итог', () => {
    const sizes = SERIES_KEYS.map((k) => `${k}:${seriesPlaylist(k).steps.length}`);
    expect(sizes.every((s) => !s.endsWith(':0'))).toBe(true);
  });

  it('у каждой серии свой пускатель и свой ключ профиля — не общий на двоих', () => {
    expect(SERIES_KEYS.map(seriesStarter)).toEqual(['startAssessment', 'startFinancialBattery']);
    expect(SERIES_KEYS.map(seriesProfileFlag)).toEqual(['assessment_enabled', 'financial_brain_day_enabled']);
  });

  it('финансовая батарея — это Iowa, BART и PRL, а не что попало', () => {
    expect(seriesPlaylist('financial').steps.map((s) => s.game_id).sort())
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
  it('срез действительно читает файлы, а не пустоту', () => {
    expect(`главная ${home.length > 10000} · зарядка ${picker.includes('startEvening')}`)
      .toBe('главная true · зарядка true');
  });
});
