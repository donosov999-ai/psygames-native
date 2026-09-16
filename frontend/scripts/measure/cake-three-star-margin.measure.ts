/* psygames-cake-three-star-margin-measure · VER 1 · 16.09.2026 */
/**
 * ЗАМЕР, А НЕ ТЕСТ: где на лестнице тортов тает запас трёх звёзд.
 *
 * ЗАЧЕМ. Перекалибровка под свободный выбор куска (`REF_PER_TYPE` 5,6 → 3,75)
 * снята по столам, где A* доходит до дна, — это НИЖНЯЯ часть лестницы. Гейт
 * `cake-sort-reference` после неё покраснел в одном месте: худшее отношение
 * «доказуемый минимум ÷ порог трёх звёзд» выросло с 0,66 до 0,957. То есть на
 * каком-то уровне идеальная игра укладывается в высшую оценку впритык, а
 * настоящий минимум (он НЕ МЕНЬШЕ границы) может и не уложиться вовсе.
 *
 * ВОПРОС, НА КОТОРЫЙ ОТВЕЧАЕМ: запас тает равномерно, или только там, где есть
 * очередь входящих кругов? От ответа зависит починка — общий множитель или
 * отдельный счёт для кругов из очереди.
 *
 * Запуск:
 *   npx jest --rootDir . scripts/measure/cake-three-star-margin.measure.ts \
 *     --testMatch "<rootDir>/scripts/measure/*.measure.ts"
 */
import { levelCfg, deal } from '@/src/games/cake-sort/core/level';
import { lowerBound, beamPath } from '@/src/games/cake-sort/core/solver';
import { referenceFor } from '@/src/games/cake-sort/core/stars';

describe('СМЁТ запаса трёх звёзд', () => {
  jest.setTimeout(900_000);

  it('по всей лестнице', () => {
    const строки: { L: number; types: number; queue: number; plates: number; граница: number; порог: number; доля: number }[] = [];
    for (let L = 1; L <= 120; L += 1) {
      const c = levelCfg(L);
      const граница = lowerBound(deal(L).board);
      const порог = referenceFor(c.types + c.queue, null) * 1.15;
      строки.push({ L, types: c.types, queue: c.queue, plates: c.plates, граница, порог, доля: граница / порог });
    }
    const худшие = [...строки].sort((a, b) => b.доля - a.доля).slice(0, 15);
    const сОчередью = строки.filter((s) => s.queue > 0);
    const безОчереди = строки.filter((s) => s.queue === 0);
    const макс = (a: typeof строки) => (a.length ? Math.max(...a.map((s) => s.доля)) : 0);
    const сред = (a: typeof строки) => (a.length ? a.reduce((x, s) => x + s.доля, 0) / a.length : 0);

    console.log([
      '',
      'ХУДШИЕ 15 УРОВНЕЙ (граница ÷ порог 3★):',
      ...худшие.map((s) => `  L${String(s.L).padStart(3)} · видов ${String(s.types).padStart(2)} · очередь ${String(s.queue).padStart(2)} · тарелок ${String(s.plates).padStart(2)} · граница ${String(s.граница).padStart(3)} · порог ${s.порог.toFixed(1).padStart(6)} · ${s.доля.toFixed(3)}`),
      '',
      `БЕЗ очереди: уровней ${безОчереди.length}, худшее ${макс(безОчереди).toFixed(3)}, среднее ${сред(безОчереди).toFixed(3)}`,
      `С очередью:  уровней ${сОчередью.length}, худшее ${макс(сОчередью).toFixed(3)}, среднее ${сред(сОчередью).toFixed(3)}`,
      '',
      'ПО ДЕСЯТКАМ (худшее в десятке):',
      ...Array.from({ length: 12 }, (_, k) => {
        const д = строки.filter((s) => s.L > k * 10 && s.L <= (k + 1) * 10);
        return `  L${k * 10 + 1}–${(k + 1) * 10}: ${макс(д).toFixed(3)} (очередь ${д.map((s) => s.queue).join(',')})`;
      }),
    ].join('\n'));
    expect(строки.length).toBe(120);
  });
});

/**
 * ВЕРХНЯЯ ОЦЕНКА ПОИСКОМ ЛУЧОМ — ДОКАЗАТЕЛЬСТВО ДОСТИЖИМОСТИ ПОСТРОЕНИЕМ.
 *
 * 📍 Почему не точный минимум. A* (`minMoves`) дважды упал по памяти (код 134)
 * даже при куче 8 ГБ и бюджете 150 000 узлов и потерял все данные: печать шла в
 * конце. А точный минимум для вопроса «достижимы ли три звезды» и не нужен:
 * достаточно ПРЕДЪЯВИТЬ партию не длиннее порога. Длина любой найденной партии —
 * честная ВЕРХНЯЯ граница минимума. Лёг путь под порог — три звезды достижимы,
 * это доказано самой партией.
 *
 * ⚠️ ЧТО ЭТО НЕ ДОКАЗЫВАЕТ: путь длиннее порога НЕ значит «три звезды
 * невозможны» — луч мог пройти мимо короткого решения. Такие уровни печатаются
 * отдельной пометкой «не доказано», а не «невозможно».
 *
 * Печать — после каждого уровня, в обход перехвата консоли: падение посреди
 * прогона больше не стирает всё снятое. Диапазон — переменными CAKE_FROM,
 * CAKE_TO, CAKE_STEP, CAKE_BEAM. ⚠️ Имена латиницей нарочно: zsh кириллическое
 * имя в приставке команды принимает за саму команду (код 127).
 */
/* Луч — общий с генератором и гейтом: `beamPath` в ядре решателя. */

describe('СМЁТ достижимости трёх звёзд лучом', () => {
  jest.setTimeout(3_600_000);
  const ОТ = Number(process.env.CAKE_FROM ?? 1);
  const ДО = Number(process.env.CAKE_TO ?? 120);
  const ШАГ = Number(process.env.CAKE_STEP ?? 1);
  const ШИРИНА = Number(process.env.CAKE_BEAM ?? 300);

  it(`L${ОТ}…L${ДО}`, () => {
    let доказано = 0; let нет = 0; let не_нашёл = 0;
    const СПИСОК = process.env.CAKE_LEVELS ? process.env.CAKE_LEVELS.split(',').map(Number) : null;
    const уровни: number[] = СПИСОК ?? Array.from({ length: Math.floor((ДО - ОТ) / ШАГ) + 1 }, (_, k) => ОТ + k * ШАГ);
    for (const L of уровни) {
      const c = levelCfg(L);
      const b = deal(L).board;
      const порог = referenceFor(c.types + c.queue, null) * 1.15;
      const т0 = Date.now();
      const путь = beamPath(b, ШИРИНА, 600);
      const мс = Date.now() - т0;
      let флаг: string;
      if (путь === null) { флаг = '— луч не дошёл'; не_нашёл += 1; }
      else if (путь <= порог) { флаг = '🟢 3★ ДОСТИЖИМЫ (партия предъявлена)'; доказано += 1; }
      else { флаг = '🟡 не доказано: путь длиннее порога'; нет += 1; }
      const нужноНаКруг = путь ? путь / ((c.types + c.queue) * 1.15) : NaN;
      process.stdout.write(`L${String(L).padStart(3)} · видов ${String(c.types).padStart(2)} · очередь ${String(c.queue).padStart(2)} · граница ${String(lowerBound(b)).padStart(3)} · путь ${String(путь ?? '—').padStart(3)} · порог ${порог.toFixed(1).padStart(6)} · путь÷порог ${путь ? (путь / порог).toFixed(3) : '  —  '} · нужно на круг ${Number.isNaN(нужноНаКруг) ? '—' : нужноНаКруг.toFixed(2)} · ${мс} мс · ${флаг}\n`);
    }
    process.stdout.write(`ИТОГ L${ОТ}…L${ДО}: доказано ${доказано} · не доказано ${нет} · луч не дошёл ${не_нашёл}\n`);
    expect(доказано + нет + не_нашёл).toBeGreaterThan(0);
  });
});
