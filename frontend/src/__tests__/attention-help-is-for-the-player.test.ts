/* attention-help-is-for-the-player · VER 1 · 16.09.2026 */
import { translateFor } from '@/src/contexts/LanguageContext';

declare const __dirname: string;
declare function require(m: string): any;

/**
 * 🔴 ЧТО СТЕРЕЖЁТ. Справка «Об игре» — единственный текст, который человек читает
 * ПЕРЕД партией, и читает её не исследователь. Замер 16.09.2026 по восемнадцати
 * экранам развилки «Конфликт внимания»: у четырёх справка была написана для
 * нейробиолога. Худшая — PRL, 697 знаков, начиналась словами «классический тест
 * функции орбитофронтальной коры (vmPFC)» и перечисляла имена переменных
 * (reversal_errors, win_stay_rate). У ANT — «cue (none/center/double/spatial)»,
 * у CPT — «CV-RT — сильный ADHD-маркер», у «Торможения» — «action restraint».
 *
 * И это не вкусовщина: ровно на PRL пришёл отчёт 7a5052dd — «Что значит скрытно
 * меняется? Как угадать???? Что за тупая игра». Человек не понял правило, потому
 * что в справке было про кору, а не про то, что делать.
 *
 * ⚠️ НАЗВАНИЕ МЕТОДИКИ И ССЫЛКА — МОЖНО И НУЖНО. Запрещены имена внутренних
 * полей и термины, которые ничего не говорят игроку. «Классический Wisconsin
 * Card Sort» в конце — хорошо; «биомаркеры: omission, commission» — нет.
 *
 * ⚠️ Список слов — ЛИТЕРАЛЫ, а не импорт из проверяемого места: порог, взятый
 * у проверяемого, порогом не является.
 */
const МОИ = [
  'stroop', 'stroopEmotional', 'flanker', 'simon', 'choiceRt', 'ant', 'cpt',
  'switchingTask', 'targets', 'wcst', 'inhibition', 'goNoGo', 'stopSignal',
  'posner', 'prl', 'iowa', 'bart', 'proofreading',
] as const;

/** Слова, которых в справке игрока быть не должно. */
const ЖАРГОН = [
  // имена внутренних полей и переменных
  'win_stay', 'lose_shift', '_errors', '_rate', 'pending', 'avg pumps',
  // термины метода, ничего не говорящие игроку
  'vmPFC', 'орбитофронт', 'биомаркер', 'коррелят', 'CV-RT', 'ADHD',
  'omission', 'commission', 'SSRT', 'action restraint', 'action cancellation',
  'трайл', 'конгруэнт', 'incongruent', 'attentional bias', 'switch cost',
  'validity effect', 'orienting', 'alerting', 'executive', 'cue (',
  // формулы в тексте для человека
  'RT(', 'Метрика:', 'Метрики:',
  // русские термины методик — человеку они ничего не говорят
  'персеверат', 'интерференци', 'дисперси', 'z-скор', 'конгруэнтн',
];

/**
 * ⚠️ КОРОТКИЕ СОКРАЩЕНИЯ ЛОВИМ СЛОВОМ, А НЕ ПОДСТРОКОЙ.
 * «ISI» подстрокой сидит внутри английского «decisions», и проба покраснела на
 * честной строке «Snap decisions». Три ложных срабатывания из трёх — ровно тот
 * случай, когда слишком жадный прибор дороже отсутствующего.
 */
const ЖАРГОН_СЛОВОМ = ['SOA', 'ISI', 'CV-RT', 'SSRT', 'ADHD'];

function жаргонВ(текст: string): string[] {
  const t = текст.toLowerCase();
  const найдено = ЖАРГОН.filter((ж) => t.includes(ж.toLowerCase()));
  for (const ж of ЖАРГОН_СЛОВОМ) {
    if (new RegExp(`(^|[^A-Za-z])${ж.replace('-', '\\-')}([^A-Za-z]|$)`, 'i').test(текст)) найдено.push(ж);
  }
  return найдено;
}

function справка(ключ: string): { ru: string; en: string } | null {
  /* translateFor отдаёт САМ КЛЮЧ, когда строки нет — иначе «текста нет»
     читалось бы как «текст пустой», и проверка зеленела бы вслепую. */
  const k = `${ключ}IntroDesc`;
  const ru = translateFor('ru', k);
  const en = translateFor('en', k);
  return ru && en && ru !== k && en !== k ? { ru, en } : null;
}

describe('справка раздела написана для игрока', () => {
  it('🔴 справка есть у каждого из восемнадцати экранов', () => {
    const без = МОИ.filter((к) => справка(к) === null);
    expect(без).toEqual([]);
  });

  it('🔴 в справке нет имён переменных и терминов не для игрока', () => {
    const грязные: string[] = [];
    for (const к of МОИ) {
      const т = справка(к);
      if (!т) continue;
      const текст = `${т.ru} ${т.en}`.toLowerCase();
      const нашлось = жаргонВ(текст);
      if (нашлось.length) грязные.push(`${к}: ${нашлось.join(', ')}`);
    }
    expect(грязные).toEqual([]);
  });

  it('и это не зелёное вслепую: список слов действительно ловит', () => {
    /* Контроль с известным ответом. Без него проверка выше зеленела бы и на
       пустом списке, и на опечатке в именах ключей. */
    const образец = 'Биомаркеры: omission, commission, CV-RT — сильный ADHD-маркер'.toLowerCase();
    const поймано = жаргонВ(образец);
    expect(поймано.length).toBeGreaterThanOrEqual(4);
  });

  it('🔴 в карточках «что тренирует» тоже нет жаргона', () => {
    /* Справка — не единственный текст перед партией. Карточки пользы висят на
       том же экране, и 16.09 в трёх из них стояли «Attentional bias»,
       «RT variability (ADHD-маркер)» и «Обучение по обратной связи (vmPFC)» —
       тот же дефект, просто в другом поле. Ключи вида benefit<Игра><N>. */
    const грязные: string[] = [];
    for (const к of МОИ) {
      const имя = к.charAt(0).toUpperCase() + к.slice(1);
      for (const n of ['1', '2', '3', '2_2', '1_2', '3_2']) {
        const ключ = `benefit${имя}${n}`;
        const ru = translateFor('ru', ключ);
        const en = translateFor('en', ключ);
        if (ru === ключ && en === ключ) continue;   // такой карточки нет — это норма
        const текст = `${ru} ${en}`.toLowerCase();
        const нашлось = жаргонВ(текст);
        if (нашлось.length) грязные.push(`${ключ}: ${нашлось.join(', ')}`);
      }
    }
    expect(грязные).toEqual([]);
  });

  it('🔴 жаргона нет НИ В ОДНОМ тексте моих экранов, а не только в справке', () => {
    /* 🔴 УРОК, РАДИ КОТОРОГО ЭТА ПРОВЕРКА И НАПИСАНА. Первый гейт смотрел только
       `<игра>IntroDesc` и был зелёным, пока рядом висели семь карточек
       `benefit<Игра><N>` с «Attentional bias» и «RT variability (ADHD-маркер)».
       Расширил на benefit — и он снова позеленел, пока в `wcstPass` и
       `wcstModeLevelsDesc` стояли «персеверативные ошибки»: это строка условия
       прохода и подпись режима, человек читает их на том же экране.
       Покрытие надо считать по МЕСТУ ПОКАЗА, а не по удобному семейству ключей.

       ⚠️ Проверка идёт по СЫРОМУ словарю: ключей у экрана бывает три десятка,
       и перечислять их руками — значит снова оставить дыру. */
    const { readFileSync } = require('fs');
    const { join } = require('path');
    const словарь: string = readFileSync(join(__dirname, '..', 'contexts', 'LanguageContext.tsx'), 'utf8');
    const грязные: string[] = [];
    const строки = словарь.split('\n');
    for (const строка of строки) {
      const m = /^ {2}([A-Za-z][A-Za-z0-9_]*):\s*\{\s*ru:\s*'((?:[^'\\]|\\.)*)'/.exec(строка);
      if (!m) continue;
      const ключ = m[1]!, текст = m[2]!;
      if (!МОИ.some((и) => ключ.toLowerCase().includes(и.toLowerCase()))) continue;
      const нашлось = жаргонВ(текст);
      if (нашлось.length) грязные.push(`${ключ}: ${нашлось.join(', ')}`);
    }
    expect(грязные).toEqual([]);
  });

  it('справка объясняет, ЧТО ДЕЛАТЬ, а не только чем это меряют', () => {
    /* Грубая, но честная проверка: текст для игрока обращается к нему —
       «жми», «смотри», «нужно», «press», «look», «watch». Совсем без этого
       справка описывает методику, а не задание. */
    const обращения =
      /жми|нажм|смотри|следи|нужно|надо|выбирай|держись|реагир|назов|баланс|ищи|найд|остановись|не читай|подсказ|задача|press|look|watch|pick|stay|ignore|respond|name the|find|stop|do not|goal is/i;
    const описательные = МОИ.filter((к) => {
      const т = справка(к);
      return т ? !обращения.test(`${т.ru} ${т.en}`) : false;
    });
    expect(описательные).toEqual([]);
  });
});
