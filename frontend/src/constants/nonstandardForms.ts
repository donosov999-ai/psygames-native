/* psygames-nonstandard-forms · VER 1 · 02.10.2026 */
/**
 * НЕНОРМАТИВНЫЕ ФОРМЫ — ДАННЫЕ, А НЕ ГЕНЕРАТОР (решение Дениса 01.10.2026,
 * задача d0ad03d9: «почему русских псевдослов нет, типа ихний»).
 *
 * ⚠️ ТЕРМИН. «Ихний», «irregardless» — не псевдослово (несуществующее слово), а
 * НЕНОРМАТИВНАЯ ФОРМА: в речи живёт, литературной норме не соответствует.
 * Поэтому и вопрос к игроку другой — «по норме или нет?», а не «слово или нет?».
 *
 * Каждая пара «форма → норма» сверена по словарю, НЕ по памяти:
 *  · `wikt` — пометка статьи Викисловаря (en.wiktionary.org, CC BY-SA 4.0),
 *    снята 02.10.2026 выгрузкой kaikki.org по категориям «nonstandard»,
 *    «proscribed», «misspellings», «eggcorns»; в `label` — сама пометка;
 *  · `gramota` — ответ справочной службы Грамоты.ру, номер вопроса в `ref`
 *    (https://gramota.ru/spravka/vopros/<ref>), снят 02.10.2026;
 *  · `fipi2026` — «Орфоэпический список — 2026» ФИПИ (задание 4 ЕГЭ, по
 *    государственному орфоэпическому словарю Института русского языка РАН):
 *    https://doc.fipi.ru/navigator-podgotovki/navigator-ege/2026/ru-1-fonetika.pdf
 *    Ударная гласная — прописной буквой, как в самом списке.
 *
 * Ступень (`tier`) — ось трудности: 1 — грубая просторечная форма, 2 — близко к
 * норме (написание, слитно/раздельно, фраза «на слух»), 3 — ударение и пары,
 * которые путают. Правило (`rule`) — ключ объяснения на разборе
 * (`nsRule_<rule>` в словаре интерфейса).
 *
 * Английский первым, русский вторым — основной язык приложения английский
 * (шапка ~/dev/psygames/PROJECT_REF.md, 01.10.2026).
 */

export type NsRule =
  | 'possessive' | 'verbForm' | 'wordForm' | 'sound' | 'wordChoice'
  | 'spelling' | 'separate' | 'eggcorn' | 'misheard' | 'doubleNegative'
  | 'stress' | 'confused';

export interface NonstandardForm {
  /** Как говорят и пишут вне нормы. */
  form: string;
  /** Как по норме. */
  norm: string;
  rule: NsRule;
  tier: 1 | 2 | 3;
  src: 'wikt' | 'gramota' | 'fipi2026';
  /** Номер вопроса справочной службы — у `gramota`. */
  ref?: number;
  /** Пометка источника — дословно. */
  label: string;
}

const w = (form: string, norm: string, rule: NsRule, tier: 1 | 2 | 3, label: string): NonstandardForm =>
  ({ form, norm, rule, tier, src: 'wikt', label });
const g = (form: string, norm: string, rule: NsRule, tier: 1 | 2 | 3, ref: number): NonstandardForm =>
  ({ form, norm, rule, tier, src: 'gramota', ref, label: `Грамота.ру, вопрос №${ref}: «Правильно: ${norm}»` });
const f = (form: string, norm: string): NonstandardForm =>
  ({ form, norm, rule: 'stress', tier: 3, src: 'fipi2026', label: 'орфоэпический список' });

export const NONSTANDARD_FORMS: Record<string, readonly NonstandardForm[]> = {
  en: [
    w('irregardless', 'regardless', 'doubleNegative', 1, 'nonstandard, proscribed'),
    w('could of', 'could have', 'misheard', 1, 'eye dialect of could have'),
    w('should of', 'should have', 'misheard', 1, 'eye dialect of should have'),
    w('would of', 'would have', 'misheard', 1, 'eye dialect of would have'),
    w("ain't", "isn't", 'wordForm', 1, 'dialectal, informal, nonstandard'),
    w('supposably', 'supposedly', 'sound', 1, 'nonstandard'),
    w('expresso', 'espresso', 'sound', 1, 'proscribed'),
    w('nucular', 'nuclear', 'sound', 1, 'pronunciation spelling of nuclear'),
    w('heighth', 'height', 'sound', 1, 'proscribed'),
    w('acrost', 'across', 'sound', 1, 'dialectal, nonstandard'),
    w('mischievious', 'mischievous', 'sound', 1, 'nonstandard'),
    w('Febuary', 'February', 'sound', 1, 'nonstandard spelling'),
    w('brung', 'brought', 'verbForm', 1, 'colloquial, dialectal, nonstandard'),
    w('brang', 'brought', 'verbForm', 1, 'colloquial, dialectal, nonstandard'),
    w('growed', 'grew', 'verbForm', 1, 'nonstandard'),
    w('knowed', 'knew', 'verbForm', 1, 'nonstandard'),
    w('drownded', 'drowned', 'verbForm', 1, 'nonstandard'),
    w('tooken', 'taken', 'verbForm', 1, 'dialectal, nonstandard'),
    w('attackted', 'attacked', 'verbForm', 1, 'dialectal'),
    w('hisself', 'himself', 'wordForm', 1, 'dialectal, informal'),
    w('theirselves', 'themselves', 'wordForm', 1, 'dialectal'),
    w('conversate', 'converse', 'wordForm', 1, 'nonstandard'),
    w('alot', 'a lot', 'separate', 2, 'nonstandard, proscribed'),
    w('definately', 'definitely', 'spelling', 2, 'misspelling'),
    w('seperate', 'separate', 'spelling', 2, 'misspelling'),
    w('recieve', 'receive', 'spelling', 2, 'misspelling'),
    w('occured', 'occurred', 'spelling', 2, 'misspelling'),
    w('wich', 'which', 'spelling', 2, 'misspelling'),
    w('tommorow', 'tomorrow', 'spelling', 2, 'misspelling'),
    w('goverment', 'government', 'spelling', 2, 'misspelling'),
    w('begining', 'beginning', 'spelling', 2, 'misspelling'),
    w('beleive', 'believe', 'spelling', 2, 'misspelling'),
    w('acheive', 'achieve', 'spelling', 2, 'misspelling'),
    w('neccessary', 'necessary', 'spelling', 2, 'misspelling'),
    w('wierd', 'weird', 'spelling', 2, 'misspelling'),
    w('libary', 'library', 'spelling', 2, 'misspelling'),
    w('pronounciation', 'pronunciation', 'spelling', 2, 'misspelling'),
    w('for all intensive purposes', 'for all intents and purposes', 'eggcorn', 2, 'nonstandard; eggcorn'),
    w('mute point', 'moot point', 'eggcorn', 2, 'eggcorn'),
    w('deep-seeded', 'deep-seated', 'eggcorn', 2, 'eggcorn'),
    w('tow the line', 'toe the line', 'eggcorn', 2, 'nonstandard; eggcorn'),
    w('free reign', 'free rein', 'eggcorn', 2, 'proscribed; eggcorn'),
    w('escape goat', 'scapegoat', 'eggcorn', 2, 'eggcorn'),
    w('sneak peak', 'sneak peek', 'eggcorn', 2, 'misspelling'),
    w('taller then me', 'taller than me', 'confused', 3, 'then: misspelling of than'),
    w('your welcome', "you're welcome", 'confused', 3, "your: misspelling of you're"),
    w('their here', "they're here", 'confused', 3, "their: misspelling of they're"),
    w('over their', 'over there', 'confused', 3, 'their: misspelling of there'),
    w("don't loose it", "don't lose it", 'confused', 3, 'loose: misspelling of lose'),
  ],
  ru: [
    w('ихний', 'их', 'possessive', 1, 'colloquial, nonstandard, proscribed'),
    w('егошний', 'его', 'possessive', 1, 'nonstandard'),
    w('еёшний', 'её', 'possessive', 1, 'nonstandard'),
    w('ейный', 'её', 'possessive', 1, 'colloquial, dialectal'),
    w('евоный', 'его', 'possessive', 1, 'dialectal'),
    w('ложить', 'класть', 'verbForm', 1, 'nonstandard, proscribed'),
    w('покласть', 'положить', 'verbForm', 1, 'nonstandard, proscribed'),
    w('ехай', 'поезжай', 'verbForm', 1, 'nonstandard, proscribed'),
    w('едь', 'поезжай', 'verbForm', 1, 'nonstandard, proscribed'),
    w('ехайте', 'поезжайте', 'verbForm', 1, 'nonstandard, proscribed'),
    w('ездиют', 'ездят', 'verbForm', 1, 'nonstandard, proscribed'),
    w('хочут', 'хотят', 'verbForm', 1, 'nonstandard, proscribed'),
    w('хочем', 'хотим', 'verbForm', 1, 'nonstandard, proscribed'),
    w('хочете', 'хотите', 'verbForm', 1, 'nonstandard, proscribed'),
    w('ляжь', 'ляг', 'verbForm', 1, 'nonstandard'),
    w('ляжьте', 'лягте', 'verbForm', 1, 'nonstandard'),
    w('трёс', 'тряс', 'verbForm', 1, 'nonstandard'),
    w('использовывать', 'использовать', 'verbForm', 1, 'colloquial, nonstandard, proscribed'),
    w('купивши', 'купив', 'verbForm', 1, 'proscribed'),
    w('съевши', 'съев', 'verbForm', 1, 'proscribed'),
    w('наихороший', 'наилучший', 'wordForm', 1, 'colloquial, nonstandard'),
    w('тута', 'тут', 'sound', 1, 'colloquial, nonstandard'),
    w('тама', 'там', 'sound', 1, 'colloquial, nonstandard'),
    w('хто', 'кто', 'sound', 1, 'colloquial, nonstandard, proscribed'),
    w('шо', 'что', 'sound', 1, 'colloquial, nonstandard, proscribed'),
    w('ничё', 'ничего', 'sound', 1, 'nonstandard, proscribed'),
    w('пинжак', 'пиджак', 'sound', 1, 'colloquial, dialectal, proscribed'),
    w('капишон', 'капюшон', 'sound', 1, 'nonstandard'),
    w('двоюрный', 'двоюродный', 'sound', 1, 'nonstandard, proscribed'),
    w('некторый', 'некоторый', 'sound', 1, 'nonstandard, proscribed'),
    w('проволка', 'проволока', 'sound', 1, 'nonstandard'),
    w('куфня', 'кухня', 'sound', 1, 'dialectal, nonstandard'),
    w('обымать', 'обнимать', 'sound', 1, 'nonstandard'),
    w('заместо', 'вместо', 'wordChoice', 1, 'nonstandard, proscribed'),
    w('касаемо', 'касательно', 'wordChoice', 1, 'nonstandard'),
    w('выйграть', 'выиграть', 'spelling', 2, 'misspelling'),
    w('мороженное', 'мороженое', 'spelling', 2, 'misspelling'),
    w('серебрянный', 'серебряный', 'spelling', 2, 'misspelling'),
    w('симпотичный', 'симпатичный', 'spelling', 2, 'misspelling'),
    w('облоко', 'облако', 'spelling', 2, 'misspelling'),
    w('мущина', 'мужчина', 'spelling', 2, 'misspelling'),
    w('водалей', 'водолей', 'spelling', 2, 'misspelling'),
    w('экспрессо', 'эспрессо', 'spelling', 2, 'misspelling'),
    w('деревяный', 'деревянный', 'spelling', 2, 'nonstandard'),
    w('жевачка', 'жвачка', 'spelling', 2, 'colloquial, proscribed'),
    w('комфорка', 'конфорка', 'spelling', 2, 'nonstandard'),
    w('продливать', 'продлевать', 'spelling', 2, 'nonstandard'),
    w('подскользнуться', 'поскользнуться', 'spelling', 2, 'colloquial'),
    g('будующий', 'будущий', 'spelling', 2, 212395),
    g('координально', 'кардинально', 'spelling', 2, 204713),
    w('вообщем', 'в общем', 'separate', 2, 'misspelling'),
    w('врятли', 'вряд ли', 'separate', 2, 'misspelling'),
    w('всмысле', 'в смысле', 'separate', 2, 'colloquial, proscribed'),
    w('еслибы', 'если бы', 'separate', 2, 'nonstandard'),
    w('сходу', 'с ходу', 'separate', 2, 'misspelling'),
    f('тортЫ', 'тОрты'),
    f('бантЫ', 'бАнты'),
    f('аэропортЫ', 'аэропОрты'),
    f('шарфЫ', 'шАрфы'),
    f('кранЫ', 'крАны'),
    f('дОсуг', 'досУг'),
    f('жАлюзи', 'жалюзИ'),
    f('катАлог', 'каталОг'),
    f('квАртал', 'квартАл'),
    f('килОметр', 'киломЕтр'),
    f('дОкумент', 'докумЕнт'),
    f('кОрысть', 'корЫсть'),
    f('крЕмень', 'кремЕнь'),
    f('некрОлог', 'некролОг'),
    f('пАртер', 'партЕр'),
    f('пОртфель', 'портфЕль'),
    f('свеклА', 'свЁкла'),
    f('статУя', 'стАтуя'),
    f('стОляр', 'столЯр'),
    f('тАможня', 'тамОжня'),
    f('туфлЯ', 'тУфля'),
    f('цЕмент', 'цемЕнт'),
    f('шОфер', 'шофЁр'),
    f('Эксперт', 'экспЕрт'),
    f('дЕфис', 'дефИс'),
    f('красивЕе', 'красИвее'),
    f('кухОнный', 'кУхонный'),
    f('Оптовый', 'оптОвый'),
    f('сливОвый', 'слИвовый'),
    f('звОнит', 'звонИт'),
    f('позвОнит', 'позвонИт'),
    f('врУчит', 'вручИт'),
    f('облЕгчить', 'облегчИть'),
    f('откупОрить', 'откУпорить'),
    f('углУбить', 'углубИть'),
    f('щелкАть', 'щЁлкать'),
    f('клеИть', 'клЕить'),
    f('начАл', 'нАчал'),
    f('принЯл', 'прИнял'),
    f('ждАла', 'ждалА'),
    f('воврЕмя', 'вОвремя'),
    f('нАдолго', 'надОлго'),
  ],
};

/** Языки, на которых есть данные ненормативных форм. Выводится из данных. */
export const NONSTANDARD_LANGS: readonly string[] = Object.keys(NONSTANDARD_FORMS)
  .filter((l) => (NONSTANDARD_FORMS[l]?.length ?? 0) > 0);

export function hasNonstandardForms(lang: string): boolean {
  return NONSTANDARD_LANGS.includes(lang);
}

/** Адрес источника пары — для разбора и проверки. */
export function nonstandardSourceUrl(lang: string, x: NonstandardForm): string {
  if (x.src === 'fipi2026') return 'https://doc.fipi.ru/navigator-podgotovki/navigator-ege/2026/ru-1-fonetika.pdf';
  if (x.src === 'gramota') return `https://gramota.ru/spravka/vopros/${x.ref}`;
  void lang;
  // У спутанных пар статья — про слово, а не про фразу: «then: misspelling of than».
  const page = x.rule === 'confused' ? x.label.split(':')[0]! : x.form;
  return `https://en.wiktionary.org/wiki/${encodeURIComponent(page.replace(/ /g, '_'))}`;
}
