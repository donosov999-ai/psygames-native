/* psygames-assessment-metrics-gate · VER 1 · 27.08.2026 */
/**
 * МЕТРИКИ БАТАРЕИ ОЦЕНКИ: ЧИСЛО, УХОДЯЩЕЕ В z-СКОР, ОБЯЗАНО БЫТЬ ТЕМ ЧИСЛОМ.
 *
 * 🔴 ЧТО ЛОВИЛОСЬ РУКАМИ ДО ЭТОГО ГЕЙТА (аудит 22.08.2026, перепроверено по коду
 * 27.08.2026):
 *   · шапка assessment.ts обещала «~12 мин», сумма шагов давала 1160 с = 19,3 мин;
 *   · switch_cost_ms считался swMean − meanRt (среднее ПО ВСЕМ пробам) вместо
 *     swMean − repMean — занижение ровно в (1−p) раз, p = доля switch-проб;
 *   · норма BART «30±10» была снята с шара 1..128, а батарея запускает 1..32 —
 *     рациональный игрок (EV-оптимум 16) стабильно получал z = −1,4;
 *   · норма «Закономерностей» «4±1» сравнивалась с СЫРЫМИ попаданиями при числе
 *     проб, которое выбирает игрок: 12 из 15 (та же точность 80%) → z = +8;
 *   · шесть игр в пресете играли ЛИЧНЫЙ уровень игрока, и одна норма мерила
 *     принципиально разные условия (30% переключений против 75%, X-CPT против AX).
 *
 * ⚠️ ПОЧЕМУ ГЕЙТ СЧИТАЕТ САМ. Каждая из этих поломок жила рядом с правильным
 * комментарием; комментарий не выполняется. Здесь у проверок своя арифметика
 * (свой EV-перебор, свой пересчёт норм), а у пресетов сверяются ЭКСПОРТИРОВАННЫЕ
 * константы и функции — те же, которыми играет экран.
 *
 * Правило остановки «Спана цифр» (2 ошибки НА ОДНОЙ длине) держит отдельный гейт
 * digit-span-stop-rule.test.ts — здесь не дублируется.
 */
import { ASSESSMENT_PLAYLIST, DOMAINS, scoreSessions, sessionFitsStep } from '@/src/services/assessment';
import type { GameSession } from '@/src/services/api';
import { switchCostMs, levelParams as swParams } from '@/app/games/switching-task';
import { levelParams as posnerParams } from '@/app/games/posner';
import { levelParams as cptParams, presetDurationSec, MIN_TRIALS_FOR_LEVEL } from '@/app/games/cpt';
import { nFromModeParam } from '@/app/games/n-back';
import { MAX_BURST_BY_DIFF } from '@/app/games/bart';
import { buildKeymap } from '@/app/games/sdmt';


declare const __dirname: string;
declare function require(id: string): any;
// ─── 1. Шапка не врёт про длительность ────────────────────────────────────

describe('длительность батареи', () => {
  it('сумма est_duration_sec равна числу из шапки (980 с ≈ 16 мин), а не «~12 мин»', () => {
    const total = ASSESSMENT_PLAYLIST.reduce((s, x) => s + x.est_duration_sec, 0);
    // Поменял шаги — поменяй ШАПКУ assessment.ts (и карточку «Зарядки»), потом это число.
    // 27.08.2026 (bed1249e): 1160 → 980 — cpt '4min'→'2min' (спад бдительности
    // виден ко второй минуте), bart est 180→120 (десять шаров короче трёх минут).
    expect(`${total} c = ${(total / 60).toFixed(1)} мин`).toBe('980 c = 16.3 мин');
    expect(Math.round(total / 60)).toBe(16);
  });
});

// ─── 2. Цена переключения = switch − repeat ───────────────────────────────

describe('switch cost («Переключение»)', () => {
  /**
   * Числовой замер дефекта: swRts=[900,900], repRts=[700,700,700].
   * Канон: 900 − 700 = 200 мс. Старая формула: 900 − mean(все 5) = 900 − 780 =
   * 120 мс — занижение в (1−p) раз при p = 2/5. Мутация «вернуть swMean − meanRt»
   * делает этот тест красным (проверено прогоном 27.08.2026).
   */
  it('канонический пример: 900 против 700 → 200 мс, а не 120', () => {
    expect(switchCostMs([900, 900], [700, 700, 700])).toBe(200);
  });

  it('цена не зависит от ДОЛИ switch-проб (у старой формулы зависела)', () => {
    // Те же средние, другая доля p: канон обязан дать те же 200 мс.
    // Старая формула здесь дала бы 900 − 850 = 50 мс (p = 3/4).
    expect(switchCostMs([900, 900, 900], [700])).toBe(200);
  });

  it('пустое плечо — это «цены нет» (0), а не разность со случайным нулём', () => {
    expect(switchCostMs([], [700])).toBe(0);
    expect(switchCostMs([900], [])).toBe(0);
    expect(switchCostMs([], [])).toBe(0);
  });
});

// ─── 3. Норма BART соответствует запускаемому шару ────────────────────────

describe('норма BART', () => {
  const bartDomain = DOMAINS.find((d) => d.game_id === 'bart')!;
  const bartStep = ASSESSMENT_PLAYLIST.find((s) => s.game_id === 'bart')!;

  it('EV-оптимум шара 1..N — это N/2: перебор, а не запомненная цифра', () => {
    // burstAt равномерен на 1..N; шар переживает k накачек с P=(N−k)/N; EV(k)=k·(N−k)/N.
    const N = MAX_BURST_BY_DIFF.medium;
    let bestK = 0, bestEV = -1;
    for (let k = 0; k <= N; k++) {
      const ev = (k * (N - k)) / N;
      if (ev > bestEV) { bestEV = ev; bestK = k; }
    }
    expect(N).toBe(32);
    expect(bestK).toBe(N / 2);   // = 16
  });

  it('norm_mean = EV-оптимум диапазона батареи (16), а не литературные 30 c шара 1..128', () => {
    expect(bartDomain.norm_mean).toBe(MAX_BURST_BY_DIFF.medium / 2);
    expect(bartDomain.norm_std).toBe(5);   // CV старой нормы 10/30 ≈ 1/3 сохранён: 16/3 ≈ 5
  });

  it('рациональный игрок (качает ровно оптимум) получает z = 0, а не −1,4', () => {
    const optimal = MAX_BURST_BY_DIFF.medium / 2;
    const z = (optimal - bartDomain.norm_mean) / bartDomain.norm_std;
    expect(z).toBe(0);
  });

  it('шаг батареи передаёт игре число шаров и описывает mode так, как игра его запишет', () => {
    // bart.tsx: mode = `${шаров}b`; шары приезжают через settings.balloons → num('balloons').
    expect(bartStep.settings?.balloons).toBe(10);
    expect(bartStep.mode).toBe(`${bartStep.settings?.balloons}b`);
  });
});

// ─── 4. Мышление меряется долей, а не сырыми попаданиями ──────────────────

describe('норма «Закономерностей»', () => {
  const patternDomain = DOMAINS.find((d) => d.game_id === 'pattern')!;
  const patternStep = ASSESSMENT_PLAYLIST.find((s) => s.game_id === 'pattern')!;

  const patternSession = (hits: number, trials: number): GameSession => ({
    game_type: 'pattern',
    score: 0,
    time_seconds: 60,
    difficulty: patternStep.difficulty,
    mode: 'lvl8',
    details: { hits, trials, hit_rate: Number((hits / trials).toFixed(3)) },
  });

  it('метрика — hit_rate с нормой 0.8±0.2 (пересчёт старой «4 из 5»)', () => {
    expect(patternDomain.metric).toBe('hit_rate');
    expect(patternDomain.norm_mean).toBe(0.8);
    expect(patternDomain.norm_std).toBe(0.2);
  });

  /**
   * Инвариант, который был сломан: одинаковая ТОЧНОСТЬ обязана давать одинаковый
   * z-скор при любом числе проб. Раньше 4/5 → z=0, а 12/15 → z=+8 (clamp +3).
   */
  it('4 из 5 и 12 из 15 (одна точность 80%) дают ОДИН z = 0', () => {
    const z5 = scoreSessions([patternSession(4, 5)]).scores.find((s) => s.domain === 'reasoning')!;
    const z15 = scoreSessions([patternSession(12, 15)]).scores.find((s) => s.domain === 'reasoning')!;
    expect(z5.z_score).toBe(0);
    expect(z15.z_score).toBe(0);
  });

  it('идеальная партия 15/15 — это +1σ (=(1.0−0.8)/0.2), а не потолок клампа', () => {
    const r = scoreSessions([patternSession(15, 15)]).scores.find((s) => s.domain === 'reasoning')!;
    expect(r.z_score).toBe(1);
  });
});

// ─── 6. Легенда SDMT перемешивается на каждый запуск ──────────────────────

describe('легенда SDMT', () => {
  it('каждая раскладка — биекция символ↔цифра без повторов', () => {
    for (let i = 0; i < 20; i++) {
      const km = buildKeymap(9);
      expect(km).toHaveLength(9);
      expect(new Set(km.map((k) => k.sym)).size).toBe(9);
      expect(new Set(km.map((k) => k.digit)).size).toBe(9);
    }
  });

  it('раскладки МЕНЯЮТСЯ между запусками — легенду нельзя заучить', () => {
    // 20 сборок: вероятность одной и той же раскладки дважды подряд 1/9! ≈ 2.8e-6;
    // все 20 одинаковых — (1/9!)^19, событие за пределами жизни CI.
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) seen.add(JSON.stringify(buildKeymap(9)));
    expect(seen.size).toBeGreaterThan(1);
  });
});

// ─── 7. Пресет — фиксированная конфигурация, а не личный уровень ──────────

describe('зарядка и оценка идут с ЛИЧНОГО уровня (решение Дениса 09.09.2026)', () => {
  /**
   * До 09.09.2026 семь уровневых экранов в пресете подменяли уровень фикс-ступенью тира
   * (`PRESET_LEVEL_BY_DIFF[diff]`, паттерн flanker: easy 3 · medium 8 · hard 13). Решение
   * Дениса: «играет один человек — мы меряем прогресс человека», зарядка и оценка идут с
   * его личного уровня во ВСЕЙ игре. Следствие для батареи: шаг уровневой игры не может
   * предписывать difficulty — метка партии выводится из личного уровня, и с `medium` в шаге
   * партия человека на 3-м или 12-м уровне не опознавалась бы (`sessionFitsStep`).
   *
   * Мутации, на которых проба краснеет: вернуть карту тира в любой экран app/games (п. 1);
   * вернуть `difficulty: 'medium'` в шаг уровневой игры (п. 2, 3).
   */
  const fs = require('fs'); const path = require('path');
  const ЭКРАНЫ_DIR = path.join(__dirname, '..', '..', 'app', 'games');
  const УРОВНЕВЫЕ_ШАГИ = ['posner', 'cpt', 'flanker', 'switching_task', 'pattern', 'mental_rotation'];

  it('🔴 ни один экран не подменяет уровень фикс-ступенью тира в пресете', () => {
    const bad: string[] = [];
    for (const f of fs.readdirSync(ЭКРАНЫ_DIR).filter((x: string) => x.endsWith('.tsx'))) {
      const src: string = fs.readFileSync(path.join(ЭКРАНЫ_DIR, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      if (/PRESET_LEVEL_BY_DIFF/.test(src) || /isPreset\s*\?\s*\(?\{\s*easy:/.test(src)) bad.push(f);
    }
    expect(bad).toEqual([]);
  });

  it('🔴 шаги батареи уровневых игр не предписывают difficulty', () => {
    for (const game of УРОВНЕВЫЕ_ШАГИ) {
      const step = ASSESSMENT_PLAYLIST.find((s) => s.game_id === game)!;
      expect(`${game}: ${step.difficulty ?? 'нет'}`).toBe(`${game}: нет`);
    }
  });

  it('🔴 партия уровневой игры опознаётся шагом при ЛЮБОЙ метке difficulty (личный уровень 3 и 12)', () => {
    const примеры: [string, string][] = [['posner', 'lvl3'], ['posner', 'lvl12'], ['switching_task', 'mix·lvl12'], ['pattern', 'lvl3'], ['flanker', '15t']];
    for (const [game, mode] of примеры) {
      const step = ASSESSMENT_PLAYLIST.find((s) => s.game_id === game)!;
      for (const difficulty of ['easy', 'medium', 'hard']) {
        const session: GameSession = { game_type: game, score: 0, time_seconds: 60, difficulty, mode };
        expect(`${game} ${mode} ${difficulty}: ${sessionFitsStep(session, step)}`).toBe(`${game} ${mode} ${difficulty}: true`);
      }
    }
  });

  it('партия, записанная под метками пресета, опознаётся своим шагом батареи', () => {
    // Ровно те метки, которые пишут экраны в пресете после фикса.
    const saved: Record<string, GameSession> = {
      switching_task: { game_type: 'switching_task', score: 0, time_seconds: 60, difficulty: 'medium', mode: 'mix·lvl8' },
      posner: { game_type: 'posner', score: 0, time_seconds: 60, difficulty: 'medium', mode: 'lvl8' },
      cpt: { game_type: 'cpt', score: 0, time_seconds: 120, difficulty: 'medium', mode: '2min' },   // шаг батареи '2min' с 27.08 (bed1249e)
      n_back: { game_type: 'n_back', score: 0, time_seconds: 70, difficulty: 'medium', mode: '2-back' },
      mental_rotation: { game_type: 'mental_rotation', score: 0, time_seconds: 90, difficulty: 'medium', mode: 'lvl8-3D' },
      pattern: { game_type: 'pattern', score: 0, time_seconds: 90, difficulty: 'medium', mode: 'lvl8' },
      bart: { game_type: 'bart', score: 0, time_seconds: 120, difficulty: 'medium', mode: '10b' },
      digit_span: { game_type: 'digit_span', score: 0, time_seconds: 60, difficulty: 'medium', mode: 'forward' },
      sdmt: { game_type: 'sdmt', score: 0, time_seconds: 70, difficulty: 'medium', mode: '60s' },
    };
    for (const [game, session] of Object.entries(saved)) {
      const step = ASSESSMENT_PLAYLIST.find((s) => s.game_id === game)!;
      expect(`${game}: ${sessionFitsStep(session, step)}`).toBe(`${game}: true`);
    }
  });

  it('switching: medium-пресет даёт ~50% переключений (канон парадигмы)', () => {
    /*
     * ⚠️ БЫЛО 0.524, СТАЛО 0.5 — И ЭТО НЕ ПОДГОНКА. До 07.09.2026 доля смен
     * РОСЛА с уровнем (0.30 + 7·0.032 на medium=8), тем самым уменьшая величину,
     * ради которой проба существует: цену переключения. Раздел внимания заморозил
     * её на каноне парадигмы — `SWITCH_PROB = 0.5` на любом уровне, — а сложность
     * растит окном ответа. Пресет из-за этого не отменяется: окно по-прежнему
     * разъезжается 3400 → 1400 мс, а норма одна (разбор в switching-task.tsx).
     *
     * Число здесь ЛИТЕРАЛОМ, а не через `SWITCH_PROB`: проба, написанная через
     * ту же константу, что и код, не меряет ничего — она сравнивает константу
     * саму с собой и зеленеет на любом её значении.
     */
    const p = swParams(8 /* канонический пример: уровень 8 */);
    expect(p.switchProb).toBeCloseTo(0.5, 3);
    expect(p.windowMs).toBe(2385);
    expect(p.switchProb).toBeGreaterThanOrEqual(0.4);
    expect(p.switchProb).toBeLessThanOrEqual(0.6);
  });

  it('posner: medium-пресет — окно 1535 мс, SOA 115..481 мс (из levelParams экрана)', () => {
    const p = posnerParams(8 /* канонический пример: уровень 8 */);
    expect(p).toEqual({ trials: 30, windowMs: 1535, soaMinMs: 115, soaMaxMs: 481 });
  });

  it('cpt: mode «4min» шага честно разбирается в 240 с, мусор падает в длительность уровня', () => {
    expect(presetDurationSec('4min', 90)).toBe(240);
    expect(presetDurationSec('', 90)).toBe(90);
    expect(presetDurationSec('4мин', 90)).toBe(90);   // незнакомое слово ≠ тихий NaN
  });

  it('cpt: в 4 минуты medium-пресета (AX, ISI 980) проб влезает с запасом от порога зачёта', () => {
    const p = cptParams(8 /* канонический пример: уровень 8 */);
    expect(p.mode).toBe('AX');
    const fits = Math.floor((presetDurationSec('4min', p.durationSec) * 1000) / (p.isiMs * 2));
    expect(fits).toBeGreaterThanOrEqual(MIN_TRIALS_FOR_LEVEL * 2);   // ~122 против 24
  });

  it('n-back: «2-back» из mode-шага становится N=2 (раньше молча игралось N=1)', () => {
    expect(nFromModeParam('2-back')).toBe(2);
    expect(nFromModeParam('1-back')).toBe(1);
    expect(nFromModeParam('3-back')).toBe(3);
    expect(nFromModeParam('')).toBeNull();
    expect(nFromModeParam('15t-single')).toBeNull();
    // Шаг батареи действительно объявляет N режимом:
    const step = ASSESSMENT_PLAYLIST.find((s) => s.game_id === 'n_back')!;
    expect(nFromModeParam(step.mode ?? '')).toBe(2);
  });
});
