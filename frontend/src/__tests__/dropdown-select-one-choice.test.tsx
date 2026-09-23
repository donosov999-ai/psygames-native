/* psygames-dropdown-select-one-choice · VER 2 · 23.09.2026 */
/**
 * ВЫПАДАЮЩИЙ СПИСОК: ЗАКРЫТ — ВИДЕН ВЫБОР, ОТКРЫТ — ВИДНЫ ВАРИАНТЫ, ВЫБОР ЗАКРЫВАЕТ.
 *
 * 🔴 РЕШЕНИЕ ДЕНИСА 17.09.2026: «лучше бы выбор выпадающим списком сделать» (по
 * двенадцати кнопкам «Вида заданий» во «Вращении») и на вопрос про общий компонент —
 * «да делать». Компонент `DropdownSelect` вынесен ровно затем, чтобы список был ОДИН:
 * в тот же день на подходе было три отдельные копии («Вращение», «Корректура»,
 * «Пары слов»).
 *
 * ПОЧЕМУ ПРОБА НА КОМПОНЕНТ, А НЕ НА ЭКРАН. Как у `ArrowPad`: сторожим сам компонент —
 * значит и всех, кто его возьмёт. Экран «Пар слов» проверен отдельно, одной строкой
 * внизу: что он берёт общий список, а не рисует свои кнопки снова.
 *
 * ⚠️ ЧЕГО ЭТА ПРОБА НЕ ВИДИТ. Она читает пропы узлов React, а не DOM. Замер «Вращения»
 * 17.09.2026: проп `accessibilityState.expanded` был, а в браузере `aria-expanded`
 * оставался null. Поэтому здесь проверяется ПРЯМОЙ проп `aria-expanded` — тот, который
 * react-native-web переносит в атрибут, — а сам атрибут меряется живьём в браузере при
 * приёмке. Геометрию экрана (сколько места занимает список) эта проба тоже не меряет.
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import DropdownSelect, { НЕТ_ВЫБОРА, type ВариантВыбора } from '@/src/components/DropdownSelect';

// В tsconfig проекта нет типов узла — объявляем так же, как соседние пробы (language-offer-honest).
declare const __dirname: string;
declare function require(m: string): any;

const АКЦЕНТ = '#FF00AA';
const ВАРИАНТЫ: readonly ВариантВыбора<string | null>[] = [
  { значение: null, текст: 'Вперемешку' },
  { значение: 'rotation', текст: 'Поворот' },
  { значение: 'section', текст: 'Сечение', справа: 'Уровень 24' },
];

type Узел = renderer.ReactTestInstance;
const пропы = (у: Узел) => у.props as Record<string, any>;

function собрать(начало: string | null = 'rotation', доп: Record<string, unknown> = {}) {
  const выборы: (string | null)[] = [];
  let д: renderer.ReactTestRenderer;
  const props = {
    подпись: 'Вид заданий',
    значение: начало,
    варианты: ВАРИАНТЫ,
    onChange: (v: string | null) => { выборы.push(v); },
    акцент: АКЦЕНТ,
    testID: 'kind',
    ...доп,
  };
  act(() => { д = renderer.create(<DropdownSelect {...(props as any)} />); });
  // ⚠️ testID висит и на Pressable, и на узле хоста под ним: берём тот, у кого есть onPress.
  const нажимаемый = (id: string): Узел | undefined => д!.root.findAll(
    (у) => пропы(у).testID === id && typeof пропы(у).onPress === 'function', { deep: true },
  )[0];
  const есть = (id: string) => д!.root.findAll((у) => пропы(у).testID === id, { deep: true }).length > 0;
  const жать = (id: string) => {
    const у = нажимаемый(id);
    if (!у) throw new Error(`нечего нажать: ${id}`);
    act(() => { пропы(у).onPress(); });
  };
  const строкиСписка = () => ВАРИАНТЫ.map((в) => нажимаемый(`kind-${String(в.значение)}`)).filter(Boolean) as Узел[];
  return { д: д!, нажимаемый, есть, жать, строкиСписка, выборы, снять: () => act(() => { д!.unmount(); }) };
}

const высота = (у: Узел) => Number(StyleSheet.flatten(пропы(у).style)?.minHeight ?? 0);

describe('выпадающий список выбора — один на приложение', () => {
  it('есть что мерить — закрытая строка на месте, список закрыт', () => {
    const с = собрать();
    expect(`строка выбора: ${Boolean(с.нажимаемый('kind'))}`).toBe('строка выбора: true');
    expect(`список раскрыт: ${с.есть('kind-list')}`).toBe('список раскрыт: false');
    с.снять();
  });

  it('🔴 закрытая строка называет текущий выбор — словами, а не только цветом', () => {
    const с = собрать('section');
    expect(пропы(с.нажимаемый('kind')!).accessibilityLabel).toBe('Вид заданий: Сечение');
    const тексты = с.д.root.findAll((у) => typeof пропы(у).children === 'string', { deep: true })
      .map((у) => пропы(у).children as string);
    expect(тексты).toContain('Сечение');
    с.снять();
  });

  it('значение вне списка — честный прочерк, а не первая строка', () => {
    const с = собрать('нет-такого');
    expect(пропы(с.нажимаемый('kind')!).accessibilityLabel).toBe(`Вид заданий: ${НЕТ_ВЫБОРА}`);
    с.снять();
  });

  it('🔴 нажатие раскрывает список под строкой и закрывает его обратно; aria-expanded — прямым пропом', () => {
    const с = собрать();
    expect(`aria-expanded закрытой: ${пропы(с.нажимаемый('kind')!)['aria-expanded']}`).toBe('aria-expanded закрытой: false');
    с.жать('kind');
    expect(`список раскрыт: ${с.есть('kind-list')}`).toBe('список раскрыт: true');
    expect(`строк в списке: ${с.строкиСписка().length}`).toBe(`строк в списке: ${ВАРИАНТЫ.length}`);
    // Прямой проп, а не только accessibilityState: react-native-web 0.21 переносит в DOM именно его.
    expect(`aria-expanded раскрытой: ${пропы(с.нажимаемый('kind')!)['aria-expanded']}`).toBe('aria-expanded раскрытой: true');
    с.жать('kind');
    expect(`после второго нажатия раскрыт: ${с.есть('kind-list')}`).toBe('после второго нажатия раскрыт: false');
    с.снять();
  });

  it('🔴 выбор строки отдаёт значение и ЗАКРЫВАЕТ список', () => {
    const с = собрать('rotation');
    с.жать('kind');
    с.жать('kind-section');
    expect(с.выборы).toEqual(['section']);
    expect(`после выбора раскрыт: ${с.есть('kind-list')}`).toBe('после выбора раскрыт: false');
    // null — полноценное значение («Вперемешку»), а не «ничего не выбрано».
    с.жать('kind');
    с.жать('kind-null');
    expect(с.выборы).toEqual(['section', null]);
    с.снять();
  });

  it('галочка и цвет акцента — только у выбранной строки', () => {
    const с = собрать('section');
    с.жать('kind');
    const метки = ВАРИАНТЫ.map((в) => {
      const знак = с.д.root.findAll((у) => пропы(у).testID === `kind-${String(в.значение)}-mark`, { deep: true })[0];
      return `${в.текст}: ${знак ? пропы(знак).color : 'нет знака'}`;
    });
    expect(метки).toEqual(['Вперемешку: transparent', 'Поворот: transparent', `Сечение: ${АКЦЕНТ}`]);
    const выбранные = с.строкиСписка().filter((у) => пропы(у)['aria-selected'] === true).map((у) => пропы(у).accessibilityLabel);
    expect(выбранные).toEqual(['Сечение, Уровень 24']);
    с.снять();
  });

  it('🔴 высоты — не ниже пола нажатия: строка выбора ≥ 56, строка списка ≥ 48', () => {
    const с = собрать();
    expect(`строка выбора: ${высота(с.нажимаемый('kind')!) >= 56}`).toBe('строка выбора: true');
    с.жать('kind');
    const низкие = с.строкиСписка().filter((у) => высота(у) < 48).map((у) => `${пропы(у).accessibilityLabel}=${высота(у)}`);
    expect(низкие).toEqual([]);
    с.снять();
  });

  it('🔴 строки списка — role="button": иначе tap-target-audit их не видит', () => {
    const с = собрать();
    с.жать('kind');
    const роли = с.строкиСписка().map((у) => пропы(у).accessibilityRole);
    expect(роли).toEqual(ВАРИАНТЫ.map(() => 'button'));
    с.снять();
  });

  it('🔴 текст строк выровнен по интерфейсу, а не по письму слова: арабское слово не уезжает вправо в ЛТР', () => {
    const с = собрать('rotation');
    с.жать('kind');
    const края = ['kind-value', ...ВАРИАНТЫ.map((в) => `kind-${String(в.значение)}-text`)].map((id) => {
      const у = с.д.root.findAll((х) => пропы(х).testID === id, { deep: true })[0];
      return `${id}: ${у ? StyleSheet.flatten(пропы(у).style)?.textAlign : 'нет узла'}`;
    });
    // В jest документа нет — isRTL() даёт false, значит везде «left».
    expect(края).toEqual(['kind-value: left', 'kind-null-text: left', 'kind-rotation-text: left', 'kind-section-text: left']);
    с.снять();
  });

  it('управляемый режим: раскрытие решает владелец, компонент только сообщает', () => {
    const запросы: boolean[] = [];
    const с = собрать('rotation', { открыт: true, наОткрытие: (v: boolean) => { запросы.push(v); } });
    expect(`раскрыт по пропу: ${с.есть('kind-list')}`).toBe('раскрыт по пропу: true');
    с.жать('kind');
    expect(запросы).toEqual([false]);
    // Владелец ещё не закрыл — список остаётся: своё состояние в управляемом режиме не ведётся.
    expect(`раскрыт после запроса: ${с.есть('kind-list')}`).toBe('раскрыт после запроса: true');
    с.снять();
  });
});

describe('VER 2: картинка и описание в строке (ради «Дыхания», 23.09.2026)', () => {
  const БОГАТЫЕ: readonly ВариантВыбора<string>[] = [
    { значение: 'box', текст: 'Квадратное', справа: '4-4-4-4', описание: 'Успокаивает и собирает',
      значок: React.createElement('Фигура', { key: 'a', форма: 'квадрат' }),
      значокЗакрытой: React.createElement('Фигура', { key: 'b', форма: 'квадрат' }) },
    { значение: 'calm478', текст: '4-7-8', справа: '4-7-8', описание: 'Помогает уснуть',
      значок: React.createElement('Фигура', { key: 'c', форма: 'треугольник' }),
      значокЗакрытой: React.createElement('Фигура', { key: 'd', форма: 'треугольник' }) },
  ];
  const собратьБогатый = (доп: Record<string, unknown> = {}) => {
    let д!: renderer.ReactTestRenderer;
    act(() => {
      д = renderer.create(
        <DropdownSelect
          подпись="Техника" значение="box" варианты={БОГАТЫЕ as any} onChange={() => {}}
          testID="tech" {...(доп as any)}
        />,
      );
    });
    const нажимаемый = (id: string) => д.root.findAll((у) => пропы(у).testID === id && typeof пропы(у).onPress === 'function', { deep: true })[0];
    return { д, нажимаемый, снять: () => act(() => { д.unmount(); }) };
  };

  it('🔴 описание варианта видно в списке, а не только в подписи для чтения вслух', () => {
    const с = собратьБогатый();
    act(() => { пропы(с.нажимаемый('tech')).onPress(); });
    const описания = БОГАТЫЕ.map((в) => {
      const у = с.д.root.findAll((n) => пропы(n).testID === `tech-${в.значение}-desc`, { deep: true })[0];
      return `${в.значение}: ${у ? пропы(у).children : 'НЕТ'}`;
    });
    expect(описания).toEqual(['box: Успокаивает и собирает', 'calm478: Помогает уснуть']);
    с.снять();
  });

  it('🔴 картинка варианта рисуется и в списке, и в закрытой строке — двумя разными узлами', () => {
    const с = собратьБогатый();
    // Закрытая строка: картинка выбранного варианта на месте.
    expect(`значок закрытой: ${Boolean(с.д.root.findAll((у) => пропы(у).testID === 'tech-icon', { deep: true })[0])}`)
      .toBe('значок закрытой: true');
    act(() => { пропы(с.нажимаемый('tech')).onPress(); });
    const фигур = с.д.root.findAll((у) => пропы(у).форма !== undefined, { deep: true }).length;
    // Две в списке + одна в закрытой строке: узлы разные, иначе одно из мест осталось бы пустым.
    expect(`фигур на экране: ${фигур}`).toBe('фигур на экране: 3');
    с.снять();
  });

  it('🔴 приписка в ЗАКРЫТОЙ строке — по просьбе экрана и ОТДЕЛЬНЫМ узлом, название ею не режется', () => {
    const узел = (с: ReturnType<typeof собратьБогатый>, id: string) =>
      с.д.root.findAll((у) => пропы(у).testID === id, { deep: true })[0];
    // По умолчанию закрытая строка прежняя: иначе 23.09.2026 покраснели бы «Корректура» и этот сторож.
    const без = собратьБогатый();
    expect(пропы(узел(без, 'tech-value')).children).toBe('Квадратное');
    expect(`приписка без просьбы: ${Boolean(узел(без, 'tech-suffix'))}`).toBe('приписка без просьбы: false');
    без.снять();

    const с = собратьБогатый({ сПрипиской: true });
    // ⚠️ Значение остаётся ЧИСТОЙ строкой: пробы ищут его по typeof children === 'string',
    // а приписка внутри него ещё и съедала бы ширину у названия («Квадратное дыхан…»).
    expect(пропы(узел(с, 'tech-value')).children).toBe('Квадратное');
    expect(typeof пропы(узел(с, 'tech-value')).children).toBe('string');
    expect(пропы(узел(с, 'tech-suffix')).children).toBe('4-4-4-4');
    // С припиской название переносится: иначе многоточие съедает его, а не приписку.
    expect(`название: ${пропы(узел(с, 'tech-value')).numberOfLines} строки · приписка не сжимается: ${
      Boolean(StyleSheet.flatten(пропы(узел(с, 'tech-suffix')).style)?.flexShrink === 0)}`)
      .toBe('название: 2 строки · приписка не сжимается: true');
    с.снять();
  });

  it('🔴 длинное название с описанием переносится, а не обрезается многоточием', () => {
    const с = собратьБогатый();
    act(() => { пропы(с.нажимаемый('tech')).onPress(); });
    const строки = БОГАТЫЕ.map((в) => {
      const у = с.д.root.findAll((n) => пропы(n).testID === `tech-${в.значение}-text`, { deep: true })[0];
      return `${в.значение}: ${пропы(у).numberOfLines}`;
    });
    expect(строки).toEqual(['box: 2', 'calm478: 2']);
    с.снять();
  });
});

describe('«Пары слов» берут общий список, а не рисуют свои кнопки', () => {
  const read = (rel: string): string => require('fs').readFileSync(require('path').join(__dirname, '..', '..', rel), 'utf8');
  const экран = read('app/games/word-pairs.tsx');

  it('язык перевода выбирается через DropdownSelect', () => {
    // Структурная строка, а не замер: геометрию настройки меряет живой проход 375×812.
    expect(экран).toMatch(/<DropdownSelect\s[\s\S]{0,120}testID="word-pairs-target-lang"/);
  });

  it('🔴 состав языков по-прежнему выводится из словаря, а не вписан руками', () => {
    const блок = экран.slice(экран.indexOf('testID="word-pairs-target-lang"'), экран.indexOf('testID="word-pairs-target-lang"') + 600);
    expect(блок).toMatch(/hasVocab\(l\.code\)/);
  });
});
