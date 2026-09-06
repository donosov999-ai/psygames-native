/**
 * СОБРАННЫЙ ЯЗЫК ОБЯЗАН ДОЕХАТЬ ДО ИГРОКА.
 *
 * 🔴 ЗАЧЕМ. 06.09.2026 наборов «Найди все слова» стало восемь — все лежали в
 * constants/, были подключены в движке и проходили гейт лестницы. А переключатель
 * языка показывал ДВА: `WORD_LANGS = ['ru','en']` был один на все игры. Полдня
 * работа семи чатов была собрана и невидима, и ни одна проба этого не ловила:
 * каждая проверяла свой слой, а стык между «набор есть» и «язык предлагается» не
 * проверял никто.
 *
 * ⚠️ И ОБРАТНАЯ ОШИБКА ОПАСНЕЕ ПЕРВОЙ: предложить язык, которого у режима нет.
 * Классика и «Квадрат слов» кормятся из ANAGRAM_DICT с ключами ru и en; корейский
 * там дал бы человеку пустой банк — это хуже, чем не показать язык вовсе.
 */
import { wordLangsFor, WORD_LANGS, WORD_LANG_LABEL, defaultWordLang, isWordLang } from '@/src/services/wordLanguage';
import { allWordsLocales, allWordsCount } from '@/src/games/anagrams/core/allWords';

describe('языки слов доезжают до игрока', () => {
  it('🔴 каждый собранный набор предлагается в анаграммах', () => {
    const предлагаем = wordLangsFor('anagrams');
    const собрано = allWordsLocales();
    const невидимые = собрано.filter((l) => !естьВСписке(предлагаем, l));
    expect(невидимые).toEqual([]);
  });

  it('🔴 каждый предложенный язык имеет непустой набор', () => {
    const пустые = wordLangsFor('anagrams').filter((l) => allWordsCount(l) === 0);
    expect(пустые).toEqual([]);
  });

  it('🔴 у каждого языка есть подпись, и на СВОЁМ языке', () => {
    const без = wordLangsFor('anagrams').filter((l) => !WORD_LANG_LABEL[l]);
    expect(без).toEqual([]);
    // подпись не должна быть просто кодом локали
    const кодом = wordLangsFor('anagrams').filter((l) => WORD_LANG_LABEL[l] === l);
    expect(кодом).toEqual([]);
  });

  it('⚠️ «Беглость речи» остаётся на двух языках — там это замер письменности', () => {
    expect([...wordLangsFor('phonemic_fluency')]).toEqual([...WORD_LANGS]);
    expect([...wordLangsFor('игра-которой-нет')]).toEqual([...WORD_LANGS]);
  });

  it('🔴 сохранённый язык не сбрасывается: проверка идёт ПО ИГРЕ', () => {
    // корейский законен в анаграммах и незаконен в «Беглости»
    expect(isWordLang('ko', 'anagrams')).toBe(true);
    expect(isWordLang('ko', 'phonemic_fluency')).toBe(false);
    expect(isWordLang('выдумка', 'anagrams')).toBe(false);
  });

  it('язык по умолчанию берётся из интерфейса, если игра его знает', () => {
    expect(defaultWordLang('de', 'anagrams')).toBe('de');
    expect(defaultWordLang('de', 'phonemic_fluency')).toBe('en');
    expect(defaultWordLang('ja', 'anagrams')).toBe('en');
  });
});

/** Вынесено, чтобы сравнение шло по значению, а не по ссылке на readonly-массив. */
function естьВСписке(список: readonly string[], язык: string): boolean {
  return список.indexOf(язык) >= 0;
}
