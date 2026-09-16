/* psygames-spatial-help-says-how-to-move · VER 1 · 17.09.2026 */
/* psygames-spatial-claude-mac · приёмка 50b87961, пункт «справка своя» */
/**
 * 🔴 СПРАВКА КАЖДОЙ КАРТОЧКИ «ПРОСТРАНСТВА» ГОВОРИТ, ЧТО ДЕЛАТЬ РУКОЙ.
 *
 * Отзывы Дениса 16.09.2026 на соседние развилки: «короткое описание вообще непонятно, как
 * играть», «Как играть? Где справка?». Сверка справок раздела 17.09 нашла четыре, где
 * вообще не было действия игрока: «Соедини точки» («проложите путь»), «Навигатор»
 * («восстановите путь»), «Соединение по порядку» («соединяйте по порядку»), лаборатория
 * («поверни трубы» — а нажатие только выбирает). Цель названа, способ — нет.
 *
 * Проба грубая намеренно: она не проверяет, ВЕРНО ли описан ввод (это делают соседние
 * пробы — вторая кнопка «Сети», кнопки лаборатории), а ловит справку, где действия нет
 * вовсе. Глаголы — литералами на каждом языке.
 */
import { translateFor, LANGUAGES } from '@/src/contexts/LanguageContext';
import { HELP_MAP } from '@/src/constants/helpMap';

/** Обе карточки лаборатории (`?mode=net|twiddle`) открывают одну справку `/games/spatial-lab`. */
const КАРТОЧКИ = [
  '/games/mental-rotation', '/games/spatial-lab', '/games/dots-connect',
  '/games/one-line', '/games/trail-making', '/games/navigator',
  ...['Slide', 'Sokoban', 'Net', 'Netslide', 'Twiddle', 'Cube', 'Flip', 'Sixteen', 'Fifteen', 'Untangle'].map((m) => `/games/puzzles?mode=${m}`),
];

const ДЕЙСТВИЕ: Record<string, RegExp> = {
  ru: /нажим|нажми|провед|веди|ведите|тян|кнопк|стрелк|выбер|выбир/i,
  en: /\btap\b|drag|swipe|slide your|button|arrow|\bpick\b|choose/i,
  es: /toca|arrastra|desliza|bot[oó]n|flecha|elige/i,
  pt: /toque|arraste|deslize|bot[aã]o|bot[õo]es|seta|escolha/i,
  de: /tipp|zieh|fahr|wisch|knopf|knöpf|pfeil|wähl/i,
  fr: /touchez|glissez|glisser|bouton|flèche|choisissez/i,
  it: /tocca|trascina|scorri|pulsant|frecc|scegli/i,
  zh: /点|拖|滑|按钮|箭头|方向键|选/,
  ja: /押|なぞ|スワイプ|ドラッグ|ボタン|矢印|選/,
  ko: /누르|누르면|끌|쓸어|버튼|화살표|고르/,
  hi: /दबा|खींच|फिरा|बटन|तीर|चुन/,
  ar: /المس|اسحب|مرّر|زر|أزرار|سهم|أسهم|اختر/,
};

describe('справки «Пространства» говорят, как ходить', () => {
  it('прибор жив: 16 справок на 17 карточек, 12 языков, ловушка узнаёт старую справку «Навигатора»', () => {
    expect(КАРТОЧКИ.length).toBe(16);
    for (const к of КАРТОЧКИ) expect(`${к}: ${Boolean(HELP_MAP[к])}`).toBe(`${к}: true`);
    expect(Object.keys(ДЕЙСТВИЕ).sort()).toEqual(LANGUAGES.map((l) => l.code).sort());
    expect(ДЕЙСТВИЕ.ru.test('Тренирует пространственную память: изучите маршрут, мысленно удерживайте карту и восстановите путь или направление домой.')).toBe(false);
  });

  it('🔴 в справке каждой карточки на каждом языке есть действие игрока', () => {
    const плохо: string[] = [];
    for (const к of КАРТОЧКИ) for (const { code } of LANGUAGES) {
      const т = translateFor(code, HELP_MAP[к].introKey);
      if (!ДЕЙСТВИЕ[code].test(т)) плохо.push(`${к} ${code}: «${т.slice(0, 70)}»`);
    }
    expect(плохо.slice(0, 8)).toEqual([]);
  });
});
