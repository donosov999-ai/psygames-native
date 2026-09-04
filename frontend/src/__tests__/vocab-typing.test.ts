/**
 * ПЕЧАТНЫЙ ОТВЕТ В СЛОВАРЕ (задача 676a62cb) — механика Шестова.
 *
 * Выбор из вариантов меряет УЗНАВАНИЕ: правильный ответ лежит на экране. Печать
 * меряет ИЗВЛЕЧЕНИЕ — тот самый testing effect. Ядро механики одно: опечатка НЕ
 * ПУСКАЕТ дальше, курсор стоит, пока не нажат верный символ.
 *
 * Здесь проверяется поведение движка и проводка режима, а не текст на экране.
 */
import { createState, pressChar, backspace, stats, MARK, hasPhysicalKeyboard } from '@/src/services/typing';

const набрать = (слово: string, ввод: string, блок = true) => {
  const ст = createState([слово]);
  const итоги = [...ввод].map((с) => pressChar(ст, с, блок));
  return { ст, итоги };
};

describe('движок печати', () => {
  it('🔴 опечатка НЕ продвигает курсор — в этом весь метод', () => {
    const { ст, итоги } = набрать('casa', 'cx');
    expect(итоги[1]!.accepted).toBe(false);
    expect(итоги[1]!.wrong).toBe(true);
    expect(ст.pos).toBe(1);                    // курсор остался на второй букве
    expect(ст.errors).toBe(1);
  });

  it('после опечатки верный символ идёт как ни в чём не бывало', () => {
    const ст = createState([['c', 'a', 's', 'a'].join('')]);
    pressChar(ст, 'c', true);
    pressChar(ст, 'x', true);                  // мимо
    pressChar(ст, 'a', true);                  // верно
    expect(ст.pos).toBe(2);
    expect(ст.marks[1]).toBe(MARK.CORRECT);
  });

  it('слово набирается целиком и отмечается законченным', () => {
    const { ст, итоги } = набрать('casa', 'casa');
    expect(итоги[3]!.finished).toBe(true);
    expect(ст.finishedAt).not.toBeNull();
    expect(ст.errors).toBe(0);
  });

  it('лишние нажатия после конца ничего не ломают', () => {
    const ст = createState(['ok']);
    pressChar(ст, 'o', true); pressChar(ст, 'k', true);
    const после = pressChar(ст, 'x', true);
    expect(после).toEqual({ accepted: false, wrong: false, finished: true });
    expect(ст.errors).toBe(0);
  });

  it('backspace возвращает курсор и снимает отметку', () => {
    const ст = createState(['casa']);
    pressChar(ст, 'c', true); pressChar(ст, 'a', true);
    backspace(ст);
    expect(ст.pos).toBe(1);
    expect(ст.marks[1]).toBe(MARK.PENDING);
  });

  it('точность считает опечатки, а не отменяет их', () => {
    const { ст } = набрать('casa', 'cxasa');
    const с = stats(ст);
    expect(с.typed).toBe(4);
    expect(с.errors).toBe(1);
    expect(с.accuracy).toBe(80);               // 4 верных из 5 нажатий
  });

  it('слово с пробелом набирается пробелом, а не пропускается', () => {
    const { ст } = набрать('mi casa', 'mi casa');
    expect(ст.pos).toBe(7);
    expect(ст.finishedAt).not.toBeNull();
  });
});

describe('клавиатура определяется указателем, а не платформой', () => {
  const было = (window as any).matchMedia;
  afterEach(() => { (window as any).matchMedia = было; });

  it('🔴 мышь/трекпад (pointer: fine) — клавиатура есть', () => {
    (window as any).matchMedia = (q: string) => ({ matches: q.includes('fine') });
    expect(hasPhysicalKeyboard()).toBe(true);
  });

  it('🔴 палец (pointer: coarse) — клавиатуры нет, хотя платформа та же «web»', () => {
    // Ровно случай Tauri-сборки под Android: Platform.OS === 'web', а печатать нечем.
    (window as any).matchMedia = (q: string) => ({ matches: !q.includes('fine') });
    expect(hasPhysicalKeyboard()).toBe(false);
  });

  it('неизвестность считаем «клавиатуры нет» — лучше не показать поле, чем показать пустое', () => {
    (window as any).matchMedia = undefined;
    expect(hasPhysicalKeyboard()).toBe(false);
    (window as any).matchMedia = () => { throw new Error('нет'); };
    expect(hasPhysicalKeyboard()).toBe(false);
  });
});

// Файлы читаем через require: гейт типов в CI гоняет свой tsconfig без типов node.
declare const __dirname: string;
declare function require(m: string): any;

describe('проводка режима в экране словаря', () => {
  const экран: string = require('fs').readFileSync(
    require('path').join(__dirname, '../../app/games/vocab-srs.tsx'), 'utf8',
  );

  it('режим печати есть в типе направлений и в выборе на экране настройки', () => {
    expect(экран).toContain("type Direction = 'recognize' | 'recall' | 'typing'");
    expect(экран).toMatch(/клавиатура[\s\S]{0,200}'typing', t\('srsTyping'\)/);
  });

  it('🔴 без клавиатуры кнопки НЕТ, а причина — есть', () => {
    expect(экран).toContain('srsTypingNeedsKeyboard');
    expect(экран).toMatch(/!клавиатура && \(/);
  });

  it('сохранённый «typing» не переживает переход на телефон', () => {
    expect(экран).toMatch(/с === 'typing' && !hasPhysicalKeyboard\(\) \? 'recall' : с/);
  });

  it('🔴 опечатки НЕ идут в ошибки сессии, но и не пропадают', () => {
    expect(экран).toContain('typosRef.current += typos');
    expect(экран).toContain('typos: typosRef.current');
    // setWrongCount в печатном пути отсутствует: опечатка блокировала и исправлена
    const кусок = экран.slice(экран.indexOf('const handleTyped'), экран.indexOf('const handlePick'));
    expect(кусок).not.toContain('setWrongCount');
    expect(кусок).toContain('setCorrectCount');
  });

  it('печать заменяет варианты ответа, а не соседствует с ними', () => {
    expect(экран).toMatch(/печатаем \? \(\s*<TypingAnswer/);
  });
});
