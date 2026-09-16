/* attention-help-is-for-the-player · VER 1 · 16.09.2026 */
import { translateFor } from '@/src/contexts/LanguageContext';

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
];

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
      const нашлось = ЖАРГОН.filter((ж) => текст.includes(ж.toLowerCase()));
      if (нашлось.length) грязные.push(`${к}: ${нашлось.join(', ')}`);
    }
    expect(грязные).toEqual([]);
  });

  it('и это не зелёное вслепую: список слов действительно ловит', () => {
    /* Контроль с известным ответом. Без него проверка выше зеленела бы и на
       пустом списке, и на опечатке в именах ключей. */
    const образец = 'Биомаркеры: omission, commission, CV-RT — сильный ADHD-маркер'.toLowerCase();
    const поймано = ЖАРГОН.filter((ж) => образец.includes(ж.toLowerCase()));
    expect(поймано.length).toBeGreaterThanOrEqual(4);
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
