/* psygames-attention-condition-recorded · VER 1 · 09.09.2026 */
/**
 * 🔴 ПОКАЗАТЕЛЬ БЕЗ УСЛОВИЯ, ПРИ КОТОРОМ ОН СНЯТ, — НЕ ПОКАЗАТЕЛЬ.
 *
 * ЧТО СЛУЧИЛОСЬ 09.09.2026. Решением Дениса («играет один человек — мы меряем
 * прогресс человека») зарядка и оценка пошли с ЛИЧНОГО уровня во всей игре, и
 * коммит 8f0bfc47 снял фикс-ступень тира у семи экранов. Среди них три пробы
 * этого раздела, и ровно они кормят батарею показателями с ЖЁСТКИМИ нормами
 * (`assessment.ts`):
 *
 *   flanker         → flanker_effect_ms, норма 70±30
 *   cpt             → rt_variability,    норма 0,20±0,08
 *   switching_task  → switch_cost_ms,    норма 150±80
 *
 * Решение верное: прогресс человека и меряется сравнением с собой. Но у нормы
 * задача ДРУГАЯ — сравнить человека с популяцией, и ей нужно одинаковое условие.
 * Замер по origin/main, что теперь едет вместе с личным уровнем:
 *
 *   фланкер:        зазор цель↔фланги 28 px (L1) → 4 px (L15), окно 3000 → 1000
 *   cpt:            ISI 1500 → 500, режим X → AX, доля похожих букв 0 → 0,5
 *   переключение:   окно 3400 → 1400 мс
 *
 * ⚠️ У ФЛАНКЕРА ЭТО БЬЁТ СИЛЬНЕЕ ВСЕГО, И ВЫБОР ОСИ — МОЙ. Зазор цель↔фланги не
 * «одна из ручек», это САМА ручка эффекта Эриксена: ближе фланги — больше
 * интерференция. Я взял её осью сложности именно потому, что она канонная.
 *
 * 🔴 ЧЕГО ЭТОТ ГЕЙТ НЕ ДЕЛАЕТ — и это надо сказать прямо. Он НЕ решает, можно ли
 * сравнивать с нормой при разъезжающемся условии: это политика z-скора, она
 * живёт в общем `assessment.ts` и решается не здесь. Гейт держит МИНИМУМ, без
 * которого любое будущее решение невозможно: чтобы условие было ЗАПИСАНО В
 * ПАРТИЮ и его можно было восстановить задним числом.
 *
 * 📌 Почему не «восстановим через levelParams(level)». Технически да — `level` в
 * партии есть. Но это привязывает разбор старых партий к СЕГОДНЯШНЕМУ коду:
 * поменяется формула уровня, и накопленное молча станет нечитаемым. Тот же довод
 * уже записан в `ant.tsx` рядом с долями.
 *
 * ⚠️ СПИСОК ПАРАМЕТРОВ ЗДЕСЬ НЕ ПИШЕТСЯ РУКАМИ. Гейт САМ прогоняет `levelParams`
 * по всем уровням, смотрит, какие поля меняются, и требует ровно их. Список,
 * переписанный сюда, разошёлся бы с кодом молча — ровно та беда, которую этот
 * файл и стережёт.
 */
import { levelParams as flankerParams, levelCondition as flankerCond } from '@/app/games/flanker';
import { levelParams as cptParams, levelCondition as cptCond } from '@/app/games/cpt';
import { levelParams as swParams, levelCondition as swCond } from '@/app/games/switching-task';
import { levelParams as wcstParams, levelCondition as wcstCond } from '@/app/games/wcst';
import { levelParams as choiceParams, levelCondition as choiceCond } from '@/app/games/choice-rt';
import { levelParams as stroopParams, levelCondition as stroopCond } from '@/app/games/stroop';
import { levelParams as tgParams, levelCondition as tgCond } from '@/app/games/targets';
import { levelParams as seParams, levelCondition as seCond } from '@/app/games/stroop-emotional';
import { levelParams as simonParams, levelCondition as simonCond } from '@/app/games/simon';
import { levelParams as antParams, levelCondition as antCond } from '@/app/games/ant';
import { levelParams as gngParams, levelCondition as gngCond } from '@/app/games/go-no-go';
import { levelParams as inhParams, levelCondition as inhCond } from '@/app/games/inhibition';
import { levelParams as posnerParams, levelCondition as posnerCond } from '@/app/games/posner';
import { levelParams as prlParams, levelCondition as prlCond } from '@/app/games/prl';
import { levelParams as iowaParams, levelCondition as iowaCond } from '@/app/games/iowa';
import { levelParams as bartParams, levelCondition as bartCond } from '@/app/games/bart';
import { levelParams as proofParams, levelCondition as proofCond } from '@/app/games/proofreading';
import { levelParams as ssParams, levelCondition as ssCond } from '@/src/games/stop-signal/core';

const УРОВНИ = Array.from({ length: 15 }, (_, i) => i + 1);

/**
 * Пробы, чья мера прохода зависит от уровня, — потому и требуют записанного условия.
 *
 * Три первые кормят батарею показателями с ЖЁСТКИМИ нормами. Четвёртая, WCST,
 * нормы в батарее не имеет, и это НЕ повод её не стеречь: `rule_catch_mean`
 * человек видит в итогах партии и сравнивает со своим прошлым проходом, а раздел
 * с 09.09.2026 меряет прогресс человека. Число без условия сравнивать не с чем.
 */
/**
 * ⚠️ ТИП ЗАПИСАН ЯВНО. Восемнадцать `levelParams` возвращают восемнадцать РАЗНЫХ
 * форм, и без общего типа TypeScript складывает их в объединение, которое не
 * подставить в `меняющиеся(…)`. Оба поля читаются гейтом одинаково — как набор
 * «имя поля → значение», поэтому здесь они так и объявлены.
 */
type Батарейный = {
  имя: string;
  показатель: string;
  норма: string;
  параметры: (l: number) => Record<string, unknown>;
  условие: (l: number) => Record<string, unknown>;
};

const БАТАРЕЙНЫЕ: Батарейный[] = [
  { имя: 'flanker',        показатель: 'flanker_effect_ms', норма: '70±30',    параметры: flankerParams, условие: flankerCond },
  { имя: 'cpt',            показатель: 'rt_variability',    норма: '0,20±0,08', параметры: cptParams,     условие: cptCond },
  { имя: 'switching_task', показатель: 'switch_cost_ms',    норма: '150±80',   параметры: swParams,      условие: swCond },
  { имя: 'wcst',           показатель: 'rule_catch_mean',   норма: 'нет в батарее', параметры: wcstParams, условие: wcstCond },
  { имя: 'choice_rt',      показатель: 'mean_rt',          норма: 'нет в батарее', параметры: choiceParams, условие: choiceCond },
  { имя: 'stroop',         показатель: 'interference_ms',  норма: 'нет в батарее', параметры: stroopParams, условие: stroopCond },
  { имя: 'targets',        показатель: 'commission_errors', норма: 'нет в батарее', параметры: tgParams,     условие: tgCond },
  /**
   * 🔴 ОСТАЛЬНЫЕ ОДИННАДЦАТЬ ДОБАВЛЕНЫ 23.09.2026 — ГЕЙТ ВИДЕЛ СЕМЬ ЭКРАНОВ ИЗ
   * ВОСЕМНАДЦАТИ И БЫЛ ЗЕЛЁН, ПОТОМУ ЧТО ОСТАЛЬНЫХ НЕ ВИДЕЛ ВОВСЕ.
   *
   * Решение Дениса 23.09.2026 («прими своих детишек нормально») — вся развилка
   * «Конфликт внимания» одна зона: девять карточек, из них две с наборами
   * («Стоп и запрет» — inhibition/go-no-go/stop-signal, «Решения» — prl/iowa/bart).
   * Раз экран мой, его условие обязано ехать в партию так же, как у батарейных.
   *
   * ⚠️ У ЭТИХ ОДИННАДЦАТИ НОРМЫ В БАТАРЕЕ НЕТ — и это НЕ повод их не стеречь.
   * Раздел с 09.09.2026 меряет прогресс ЧЕЛОВЕКА: он сравнивает свой проход со
   * своим прежним, а два числа без условия сравнивать не с чем.
   */
  { имя: 'stroop_emotional', показатель: 'interference_threat_ms', норма: 'нет в батарее', параметры: seParams,     условие: seCond },
  { имя: 'simon',            показатель: 'simon_effect_ms',        норма: 'нет в батарее', параметры: simonParams,  условие: simonCond },
  { имя: 'ant',              показатель: 'executive_ms',           норма: 'нет в батарее', параметры: antParams,    условие: antCond },
  { имя: 'go_no_go',         показатель: 'falseAlarms',            норма: 'нет в батарее', параметры: gngParams,    условие: gngCond },
  { имя: 'inhibition',       показатель: 'inhibition_commission',  норма: 'нет в батарее', параметры: inhParams,    условие: inhCond },
  { имя: 'stop_signal',      показатель: 'ssrt_ms',                норма: 'нет в батарее', параметры: (l) => ({ ...ssParams(l) }), условие: (l) => ({ ...ssCond(l) }) },  // интерфейс ядра — разворачиваем в набор полей
  { имя: 'posner',           показатель: 'validity_effect_ms',     норма: '50±30',         параметры: posnerParams, условие: posnerCond },
  { имя: 'prl',              показатель: 'perseverative_errors',   норма: 'нет в батарее', параметры: prlParams,    условие: prlCond },
  { имя: 'iowa',             показатель: 'adv_share',              норма: 'нет в батарее', параметры: iowaParams,   условие: iowaCond },
  { имя: 'bart',             показатель: 'adj_avg_pumps',          норма: 'нет в батарее', параметры: bartParams,   условие: bartCond },
  { имя: 'proofreading',     показатель: 'proof_omission_pct',     норма: 'нет в батарее', параметры: proofParams,  условие: proofCond },
];

/** Поля `levelParams`, которые ДЕЙСТВИТЕЛЬНО меняются по лестнице. Снимается прогоном. */
function меняющиеся(параметры: (l: number) => Record<string, unknown>): string[] {
  const первый = параметры(1);
  // ⚠️ Сравнение по СОДЕРЖИМОМУ, а не по ссылке. У choice-rt поле `dirs` —
  // массив, и `!==` для него истинно ВСЕГДА: поле считалось бы «меняющимся»
  // даже на неподвижной лестнице, а сверка значений краснела бы на исправном
  // коде. Оба провала тихие, потому что оба выглядят как работа гейта.
  const тот_же = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  return Object.keys(первый).filter((k) =>
    УРОВНИ.some((L) => !тот_же(параметры(L)[k], первый[k])));
}

describe('условие, при котором снят показатель батареи, записывается в партию', () => {
  it('есть что проверять — иначе набор зелен вслепую', () => {
    // Восемнадцать — столько экранов в развилке «Конфликт внимания».
    expect(БАТАРЕЙНЫЕ.length).toBe(18);
    for (const б of БАТАРЕЙНЫЕ) {
      expect(`${б.имя}: меняющихся полей ${меняющиеся(б.параметры).length > 0}`).toBe(`${б.имя}: меняющихся полей true`);
    }
  });

  it.each(БАТАРЕЙНЫЕ)('$имя ($показатель, норма $норма): в условие попали ВСЕ меняющиеся параметры', (б) => {
    const надо = меняющиеся(б.параметры);
    const есть = Object.keys(б.условие(1));
    const забыты = надо.filter((k) => !есть.includes(k));
    expect(`${б.имя} забыто: ${забыты.join(', ') || '—'}`).toBe(`${б.имя} забыто: —`);
  });

  it.each(БАТАРЕЙНЫЕ)('$имя: условие отдаёт ТЕ ЖЕ значения, что и уровень, на каждом уровне', (б) => {
    const расхождения: string[] = [];
    for (const L of УРОВНИ) {
      const п = б.параметры(L) as Record<string, unknown>;
      const у = б.условие(L) as Record<string, unknown>;
      for (const k of Object.keys(у)) {
        if (k in п && JSON.stringify(п[k]) !== JSON.stringify(у[k])) расхождения.push(`${б.имя} L${L}.${k}: уровень ${String(п[k])} ≠ условие ${String(у[k])}`);
      }
    }
    expect(расхождения).toEqual([]);
  });

  /**
   * Условие, одинаковое на всех уровнях, ничего не сообщает: его можно не писать
   * вовсе. Проверяем, что записанное действительно РАЗЛИЧАЕТ уровни — иначе поле
   * заведено для галочки.
   */
  it.each(БАТАРЕЙНЫЕ)('$имя: записанное условие различает первый и пятнадцатый уровни', (б) => {
    expect(`${б.имя}: ${JSON.stringify(б.условие(1)) !== JSON.stringify(б.условие(15))}`)
      .toBe(`${б.имя}: true`);
  });
});
