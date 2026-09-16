/* psygames-spatial-help-matches-second-action · VER 1 · 17.09.2026 */
/* psygames-spatial-claude-mac · приёмка 50b87961, пункт «справка своя» */
/**
 * 🔴 СПРАВКА ГОЛОВОЛОМОК «ПРОСТРАНСТВА» ОПИСЫВАЕТ ТУ ВТОРУЮ КНОПКУ, КОТОРАЯ ЕСТЬ НА ЭКРАНЕ.
 *
 * Найдено 17.09.2026 сверкой справки с механикой: на всех 12 языках справка «Сети»
 * говорила «уверен в куске — запри его вторым действием». Запирания в приложении нет:
 * у `net.c` оно на СРЕДНЕЙ кнопке (или правой со стилусом), а наша вторая кнопка шлёт
 * правую — замер 16.09: она возвращает кусок туда, откуда его увела левая (Трубы 15/15),
 * и на экране подписана «Повернуть обратно». Человек читал справку и искал замок.
 *
 * Что стережёт проба, на всех 12 языках и для всех 10 режимов раздела:
 *   · справка не обещает запирания;
 *   · справка не говорит обезличенное «второе действие» — у кнопки есть имя;
 *   · у режимов, где справка упоминает вторую кнопку, она названа своей экранной подписью.
 */
import { translateFor, LANGUAGES } from '@/src/contexts/LanguageContext';
import { ИМЯ_ВТОРОГО, КЛЮЧ_ОПИСАНИЯ } from '@/src/games/tatham-bridge/names';
import { HELP_MAP } from '@/src/constants/helpMap';

const РЕЖИМЫ = ['Slide', 'Sokoban', 'Net', 'Netslide', 'Twiddle', 'Cube', 'Flip', 'Sixteen', 'Fifteen', 'Untangle'];

/** Слова запирания — литералами на всех языках, а не из проверяемого словаря. */
/*
 * ⚠️ Глагольные формы и границы слова: первая версия ловила «lock» внутри «block» — «Клоцки»
 * на английском и немецком («Block») краснели на верном тексте.
 */
const ЗАМОК = /запир|запри|\block(s|ed|ing)?\b|\bfij(a|ar|ala|ada)\b|\bfíjala\b|\btranc(a|ar|ada)\b|\btranque|\bsperr|\bverrouill|\bblocca(lo|la)?\b|锁定|固定|잠그|잠가|잠글|ثبّت/i;
/** Обезличенное «второе действие» — литералами. */
const БЕЗЛИКО = /второе действие|вторым действием|second action|segunda acción|segunda ação|zweite(n)? Aktion|seconde action|seconda azione|第二动作|第二動作|두 번째 동작|दूसरी क्रिया|الإجراء الثاني/i;

const тексты = (режим: string, язык: string): string[] => {
  const справка = HELP_MAP[`/games/puzzles?mode=${режим}`];
  return [translateFor(язык, КЛЮЧ_ОПИСАНИЯ[режим]), справка ? translateFor(язык, справка.introKey) : ''];
};

describe('справка головоломок «Пространства» и вторая кнопка', () => {
  it('прибор жив: у всех 10 режимов есть описание и справка, у «Сети» — второе действие', () => {
    expect(LANGUAGES.length).toBe(12);
    for (const р of РЕЖИМЫ) {
      expect(`${р}: ${Boolean(HELP_MAP[`/games/puzzles?mode=${р}`])}`).toBe(`${р}: true`);
      expect(translateFor('ru', КЛЮЧ_ОПИСАНИЯ[р])).not.toBe(КЛЮЧ_ОПИСАНИЯ[р]);
    }
    expect(ИМЯ_ВТОРОГО.Net).toBe('puzzleSecondTurnBack');
    // контроль словаря-ловушки: он узнаёт старую формулировку
    expect(ЗАМОК.test('Уверен в куске — запри его вторым действием')).toBe(true);
    expect(БЕЗЛИКО.test('the second action locks one you are sure of')).toBe(true);
  });

  it('🔴 ни одна справка ни на одном языке не обещает запирания, которого нет', () => {
    const плохо: string[] = [];
    for (const р of РЕЖИМЫ) for (const { code } of LANGUAGES) for (const т of тексты(р, code)) {
      if (ЗАМОК.test(т)) плохо.push(`${р} ${code}: «${т.slice(0, 90)}»`);
    }
    expect(плохо.slice(0, 5)).toEqual([]);
  });

  it('🔴 вторая кнопка названа своим именем, а не «вторым действием»', () => {
    const плохо: string[] = [];
    for (const р of РЕЖИМЫ) for (const { code } of LANGUAGES) for (const т of тексты(р, code)) {
      if (БЕЗЛИКО.test(т)) плохо.push(`${р} ${code}: «${т.slice(0, 90)}»`);
    }
    expect(плохо.slice(0, 5)).toEqual([]);
  });

  it('справка «Сети» на каждом языке называет кнопку ровно так, как она подписана на экране', () => {
    const плохо: string[] = [];
    for (const { code } of LANGUAGES) {
      const подпись = translateFor(code, ИМЯ_ВТОРОГО.Net);
      for (const т of тексты('Net', code)) if (!т.includes(подпись)) плохо.push(`${code}: нет «${подпись}» в «${т.slice(0, 70)}»`);
    }
    expect(плохо).toEqual([]);
  });
});
