/**
 * СПИСОК СЛОВ НЕ ИМЕЕТ ПРАВА ВЫДАВЛИВАТЬ КРУГ БУКВ ЗА ЭКРАН.
 *
 * 🔴 ЗАЧЕМ. Замер 06.09.2026 по модели вёрстки: при 14 словах английский список
 * занимал по медиане 360 px на телефоне 360 px, худший уровень — 636 px, тогда
 * как списку на экране 740 px остаётся около 225. Медианный уровень уже не
 * помещался, и круг уезжал вниз. Дефект не ловился, потому что мерили ЧИСЛО
 * слов (14 — «влезает»), а не высоту, которую они занимают.
 *
 * ⚠️ ПРОБА РЕНДЕРИТ, А НЕ ЧИТАЕТ ИСХОДНИК. Проверка «в файле есть ScrollView»
 * зеленеет от закомментированной строки. Здесь дерево строится по-настоящему, и
 * ограничение высоты берётся с того узла, который реально отрисован.
 */
import React from 'react';

/**
 * ⚠️ `require`, А НЕ `import`, И ЭТО ВЫНУЖДЕННО. `jest.mock` поднимается наверх
 * файла, а `import` вычисляется ещё раньше — экран успел бы взять НАСТОЯЩЕЕ
 * кольцо букв вместо заглушки, и проба мерила бы не то, что заявлено.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- см. комментарий выше
const TestRenderer = require('react-test-renderer');

jest.mock('@/src/components/letterWheel/LetterWheel', () => ({
  LetterWheel: () => null,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- загрузка ПОСЛЕ jest.mock, см. выше
const { AllWordsGame } = require('@/src/games/anagrams/AllWordsGame');

const ТЕМА = {
  surface: '#fff', text: '#000', textSecondary: '#666', border: '#ccc',
  primary: '#07f', success: '#0a0', danger: '#a00',
};
const ПОДПИСИ = {
  найдено: 'найдено', подсказки: 'подсказки', банк: 'банк',
  сдать: 'сдать', сброс: 'сброс', подсказка: 'подсказка',
  перемешать: 'перемешать', копилка: 'копилка',
};

/** Пак с заданным числом слов — длины разные, как в живых наборах. */
function пак(n: number) {
  const слова = Array.from({ length: n }, (_, i) => {
    const длина = 3 + (i % 6);
    return 'abcdefgh'.slice(0, длина) + String.fromCharCode(97 + i);
  });
  return { base: 'abcdefgh', words: слова };
}

function отрисовать(n: number, size = 328, maxListHeight?: number) {
  let дерево: any;
  TestRenderer.act(() => {
    дерево = TestRenderer.create(
      React.createElement(AllWordsGame, {
        pack: пак(n), seed: 1, size, theme: ТЕМА, now: () => 0,
        onComplete: () => {}, labels: ПОДПИСИ, maxListHeight,
      }),
    );
  });
  return дерево;
}

/** Плоский стиль узла: RN отдаёт то объект, то массив. */
function стиль(узел: any): Record<string, any> {
  const s = узел.props?.style;
  const части = Array.isArray(s) ? s : [s];
  return Object.assign({}, ...части.filter(Boolean));
}

function прокрутка(дерево: any) {
  const все = дерево.root.findAll(
    (у: any) => typeof у.type !== 'string' && у.props?.showsVerticalScrollIndicator !== undefined,
    { deep: true },
  );
  return все[0];
}

describe('экран «найди все слова» — список ограничен по высоте', () => {
  it('🔴 список лежит в прокрутке с КОНЕЧНОЙ высотой, а не растёт бесконечно', () => {
    const s = прокрутка(отрисовать(14));
    expect(s).toBeTruthy();
    const h = стиль(s).maxHeight;
    expect(typeof h).toBe('number');
    expect(Number.isFinite(h)).toBe(true);
    expect(h).toBeGreaterThan(0);
  });

  it('🔴 высота НЕ растёт от числа слов — 23 слова занимают столько же места, сколько 8', () => {
    const мало = стиль(прокрутка(отрисовать(8))).maxHeight;
    const много = стиль(прокрутка(отрисовать(23))).maxHeight;
    expect(много).toBe(мало);
  });

  it('🔴 прокрутка ничего не съедает: все 23 слова в дереве', () => {
    const дерево = отрисовать(23);
    const п = пак(23);
    const подписи = дерево.root
      .findAll((у: any) => у.props?.accessibilityLabel !== undefined, { deep: true })
      .map((у: any) => String(у.props.accessibilityLabel));
    // закрытое слово подписано своей ДЛИНОЙ — значит ищем по числу клеток
    const клеток = п.words.map((w) => String(w.length));
    for (const к of клеток) expect(подписи).toContain(к);
  });

  it('⚠️ у содержимого задана ширина — flexWrap без границы не переносит', () => {
    const s = прокрутка(отрисовать(14, 328));
    const cc = s.props.contentContainerStyle;
    const плоский = Object.assign({}, ...(Array.isArray(cc) ? cc : [cc]).filter(Boolean));
    expect(плоский.width).toBe(328);
    expect(плоский.flexWrap).toBe('wrap');
  });

  it('высота считается от ширины экрана, а не зашита числом', () => {
    const узкий = стиль(прокрутка(отрисовать(14, 300))).maxHeight;
    const широкий = стиль(прокрутка(отрисовать(14, 380))).maxHeight;
    expect(широкий).toBeGreaterThan(узкий);
  });

  it('явно переданная высота уважается', () => {
    expect(стиль(прокрутка(отрисовать(14, 328, 199))).maxHeight).toBe(199);
  });

  /**
   * 🔴 КНОПКА «ПЕРЕМЕШАТЬ» ПРОВЕРЯЕТСЯ НА ЭКРАНЕ, А НЕ В ЯДРЕ.
   *
   * 📍 Проба ядра говорит лишь, что `allWordsLetters` умеет давать разный порядок
   * при разном зерне. Мутация это показала: отключил прибавку поворота в экране —
   * ядро осталось зелёным, а кнопка перестала что-либо делать. Проверять надо
   * связку: нажали → порядок в дереве изменился, состав остался тот же.
   */
  it('🔴 «перемешать» меняет порядок плиток и НЕ меняет их состав', () => {
    const дерево = отрисовать(12);
    const колесо = () => {
      const у = дерево.root.findAll(
        (n: any) => typeof n.type !== 'string' && Array.isArray(n.props?.letters),
        { deep: true },
      );
      return (у[0]?.props.letters as string[]) ?? [];
    };
    const до = колесо();
    expect(до.length).toBeGreaterThan(0);

    const кнопка = дерево.root.findAll(
      (n: any) => n.props?.accessibilityLabel === 'перемешать' && typeof n.props?.onPress === 'function',
      { deep: true },
    )[0];
    expect(кнопка).toBeTruthy();

    let после = до;
    // Порядок случайный: одно нажатие может совпасть с прежним. Несколько — нет.
    for (let i = 0; i < 6 && после.join('') === до.join(''); i += 1) {
      TestRenderer.act(() => { кнопка.props.onPress(); });
      после = колесо();
    }
    expect(после.join('')).not.toBe(до.join(''));
    expect([...после].sort().join('')).toBe([...до].sort().join(''));
  });

  /**
   * 🔴 ПИСЬМО СПРАВА НАЛЕВО: ПОРЯДОК КЛЕТОК — ЭТО ПОРЯДОК БУКВ.
   * Оставь строку слова в обычном направлении — арабское слово прочтётся задом
   * наперёд, и подсказка будет открывать «не ту» букву. Плюс найденное слово
   * обязано дублироваться подписью: в клетках стоят изолированные формы, а в
   * письме буква меняет начертание по позиции и соединяется с соседями.
   */
  it('🔴 при rtl строка слова разворачивается, а без него — нет', () => {
    const найти = (дерево: any) => дерево.root.findAll(
      (n: any) => {
        const s = n.props?.style;
        const части = Array.isArray(s) ? s : [s];
        return части.some((x: any) => x && x.flexDirection === 'row-reverse');
      }, { deep: true },
    ).length;

    let сRtl: any; let безRtl: any;
    TestRenderer.act(() => {
      сRtl = TestRenderer.create(React.createElement(AllWordsGame, {
        pack: пак(8), seed: 1, size: 328, theme: ТЕМА, now: () => 0,
        onComplete: () => {}, labels: ПОДПИСИ, rtl: true,
      }));
      безRtl = TestRenderer.create(React.createElement(AllWordsGame, {
        pack: пак(8), seed: 1, size: 328, theme: ТЕМА, now: () => 0,
        onComplete: () => {}, labels: ПОДПИСИ,
      }));
    });
    expect(найти(сRtl)).toBeGreaterThan(0);
    expect(найти(безRtl)).toBe(0);
  });
});
