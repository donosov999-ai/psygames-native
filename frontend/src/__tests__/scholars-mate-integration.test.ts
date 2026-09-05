/**
 * СТЫКОВКА «ДЕТСКОГО МАТА» С ПРИЛОЖЕНИЕМ — ПОВЕДЕНИЕМ, А НЕ ТЕКСТОМ.
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНЫЙ ГЕЙТ. Экран — обёртка: партию целиком рисует модуль
 * `ScholarsMateGame`, и всё, что человек читает во время подхода, приходит из
 * него: вопрос («поставьте мат», «защититесь», «грозит ли мат»), полоса
 * времени, счёт позиций. Экран передаёт только подписи. Значит проверка
 * «строка задания на экране есть» по исходнику ЭКРАНА ничего не доказывает:
 * там лежит `labels={{…}}`, а рисует их другой файл.
 *
 * ⚠️ НА ЭТОМ УЖЕ ОБЖИГАЛИСЬ. В SET бейдж отсчёта был написан, переведён на
 * двенадцать языков, покрыт проверкой — и не показывался ни разу: сторожили
 * РАЗМЕТКУ, а элемент был мёртв. Поэтому здесь настоящий рендер: позиции
 * решаются нажатиями по клеткам, и утверждения — про то, что нарисовано и что
 * реально вызвано.
 *
 * 🔴 И ГЛАВНОЕ ДЛЯ ЭТОГО УПРАЖНЕНИЯ: секундомер. Замер скорости — предмет
 * игры, а не украшение. Проба ниже проверяет, что прозеванная позиция
 * записывается как попытка (иначе доля верных врёт в плюс) и что время идёт по
 * ИГРОВЫМ часам, которые приходят снаружи, — иначе пауза на отзыв засчиталась
 * бы как медленное узнавание.
 */
import React from 'react';

import ScholarsMateGame from '@/src/games/scholars-mate/ScholarsMateGame';
import { buildDeck, levelParams } from '@/src/games/scholars-mate/core/deck';
import { check, shownFen } from '@/src/games/scholars-mate/core/check';
import { РАМКА_ДОСКИ, размерКлетки, ширинаДоски } from '@/src/games/scholars-mate/core/run';
import type { ScholarsResult } from '@/src/games/scholars-mate/core/types';

declare function require(m: string): any;
const TestRenderer = require('react-test-renderer');

const THEME = {
  surface: '#1C1C1E', text: '#FFFFFF', textSecondary: '#8E8E93',
  border: '#38383A', primary: '#8e5b2f', success: '#12a594', danger: '#e24b4a',
};

/** Подписи заметно разные — чтобы вопрос нельзя было спутать один с другим. */
const LABELS = {
  mate: 'ВОПРОС-МАТ', defend: 'ВОПРОС-ЗАЩИТА', threat: 'ВОПРОС-УГРОЗА',
  sacrifice: 'ВОПРОС-ЖЕРТВА', yes: 'ДА', no: 'НЕТ', best: 'верно было',
  timeUp: 'время', sec: 'с',
};

let mounted: { unmount: () => void }[] = [];
afterEach(() => {
  // Снятие тоже меняет дерево — иначе React ругается «update … not wrapped in act».
  TestRenderer.act(() => {
    mounted.forEach((t) => { try { t.unmount(); } catch { /* уже снят */ } });
  });
  mounted = [];
});

function renderedText(node: any, acc: string[] = []): string[] {
  if (node == null || node === false) return acc;
  if (typeof node === 'string') { acc.push(node); return acc; }
  if (typeof node === 'number') { acc.push(String(node)); return acc; }
  if (Array.isArray(node)) { node.forEach((n) => renderedText(n, acc)); return acc; }
  if (node.children) renderedText(node.children, acc);
  return acc;
}

interface Стол {
  tree: any;
  тап: (клетка: string) => void;
  текст: () => string;
  тик: (мс: number) => void;
  итоги: ScholarsResult[];
  вехи: boolean[];
}

/** Смонтировать модуль с управляемыми часами. */
function стол(level: number, seed = 1): Стол {
  const итоги: ScholarsResult[] = [];
  const вехи: boolean[] = [];
  let часы = 1_000_000;
  let tree: any;

  TestRenderer.act(() => {
    tree = TestRenderer.create(React.createElement(ScholarsMateGame as any, {
      level, seed, size: 320, theme: THEME, labels: LABELS,
      now: () => часы,
      onProgress: (armed: boolean) => вехи.push(armed),
      onComplete: (r: ScholarsResult) => итоги.push(r),
    }));
    mounted.push(tree);
  });

  const нажать = (клетка: string) => {
    часы += 250;                          // человек не мгновенен — иначе замер выходит нулевым
    const узел = tree.root.findAll(
      (n: any) => typeof n.props?.onPress === 'function'
        && (n.props.accessibilityLabel === клетка
          || String(n.props.accessibilityLabel ?? '').startsWith(`${клетка},`)),
      { deep: true },
    )[0];
    if (!узел) throw new Error(`нет клетки «${клетка}» на доске`);
    TestRenderer.act(() => { узел.props.onPress(); });
  };

  return {
    tree,
    тап: нажать,
    /** ⚠️ Пробелы схлопываем: RN отдаёт «2», « / », «8» тремя кусками. */
    текст: () => renderedText(tree.toJSON()).join(' ').replace(/\s+/g, ' '),
    /** Игровые часы двигаются вместе с таймерами — как в живой партии. */
    тик: (мс: number) => {
      часы += мс;
      TestRenderer.act(() => { jest.advanceTimersByTime(мс); });
    },
    итоги,
    вехи,
  };
}

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

describe('«Детский мат»: партия на живом дереве', () => {
  it('есть что проверять: доска нарисована и на ней 64 клетки', () => {
    const с = стол(1);
    const клетки = с.tree.root.findAll(
      (n: any) => typeof n.props?.onPress === 'function'
        && /^[a-h][1-8](,|$)/.test(String(n.props.accessibilityLabel ?? '')),
      { deep: true },
    );
    expect(клетки.length).toBe(64);
  });

  /**
   * 🔴 СТРОКА «ЧТО ДЕЛАТЬ» РИСУЕТСЯ И ЗАВИСИТ ОТ ВИДА ЗАДАНИЯ.
   *
   * Экран отдаёт четыре подписи разом; выбирает из них модуль. Ошибка здесь
   * тихая: человек читает «поставьте мат», а от него ждут защиты — и он
   * получает «неверно» за правильно решённую не ту задачу.
   */
  it('🔴 вопрос на экране соответствует виду ПЕРВОЙ позиции колоды', () => {
    const ожидаемый: Record<string, string> = {
      mate: LABELS.mate, fromGames: LABELS.mate,
      defend: LABELS.defend, threat: LABELS.threat, sacrifice: LABELS.sacrifice,
    };
    const виды = new Set<string>();
    for (const L of [1, 15, 25, 27, 33]) {
      const первая = buildDeck(L, 1)[0]!;
      виды.add(первая.kind);
      const с = стол(L, 1);
      expect(`уровень ${L} (${первая.kind}): ${с.текст().includes(ожидаемый[первая.kind]!)}`)
        .toBe(`уровень ${L} (${первая.kind}): true`);
    }
    // Проба не зелена вслепую: вопросы на выбранных уровнях РАЗНЫЕ.
    expect(виды.size).toBeGreaterThan(1);
  });

  it('🔴 счётчик позиций и секунды видны — иначе замер не читается', () => {
    const с = стол(1);
    const п = levelParams(1);
    expect(с.текст()).toContain(`1 / ${п.count}`);
    expect(с.текст()).toContain(LABELS.sec);
  });

  /**
   * 🔴 ХОД ДЕЛАЕТСЯ ДВУМЯ НАЖАТИЯМИ И ЗАСЧИТЫВАЕТСЯ.
   *
   * Ход берётся из решения, посчитанного ядром отдельно от интерфейса: если
   * доска рисует одну позицию, а движок разбирает другую, верный ход не
   * пройдёт — и это ровно та беда, ради которой написана `scholars-mate-board`.
   */
  it('🔴 верный ход по доске засчитывается, и подход двигается дальше', () => {
    const с = стол(1);
    const задача = buildDeck(1, 1)[0]!;
    const uci = задача.solutions[0]!;
    expect(check(задача, uci).correct).toBe(true);

    с.тап(uci.slice(0, 2));
    с.тап(uci.slice(2, 4));
    expect(с.текст()).toContain('✓');
    expect(с.вехи).toContain(true);           // «есть что терять» поднялось

    // Показ ответа ~0,55 с, дальше вторая позиция.
    с.тик(700);
    expect(с.текст()).toContain(`2 / ${levelParams(1).count}`);
  });

  it('🔴 неверный ход показывает верный ответ, а не молча промахивается', () => {
    const с = стол(1);
    const задача = buildDeck(1, 1)[0]!;
    const g = new (require('chess.js').Chess)(shownFen(задача));
    const мимо = (g.moves({ verbose: true }) as { from: string; to: string }[])
      .map((m) => m.from + m.to)
      .find((u) => !задача.solutions.includes(u))!;

    с.тап(мимо.slice(0, 2));
    с.тап(мимо.slice(2, 4));
    expect(с.текст()).toContain('✕');
    expect(с.текст()).toContain(LABELS.best);
  });

  /**
   * 🔴 ПРОЗЕВАННАЯ ПОЗИЦИЯ — ЭТО ПОПЫТКА, А НЕ ПУСТОЕ МЕСТО.
   *
   * Если время вышло и попытка НЕ записана, доля верных считается от меньшего
   * числа и растёт сама собой: чем больше зевков, тем выше «точность». Уровень
   * тогда берётся молчанием.
   */
  it('🔴 вышло время — записана попытка, а не пропуск', () => {
    const с = стол(1);
    const секунды = levelParams(1).seconds;
    с.тик(секунды * 1000 + 300);
    expect(с.вехи).toContain(true);
    с.тик(1600);
    expect(с.текст()).toContain(`2 / ${levelParams(1).count}`);
  });

  /**
   * 🔴 ЧАСЫ — ИГРОВЫЕ. Секундомер обязан слушать `now` снаружи: пока человек
   * пишет отзыв, партия стоит, и время стоять обязано вместе с ней. Здесь
   * таймеры двигаются, а часы — нет: полоса времени не должна убежать.
   */
  it('🔴 таймеры тикают, а игровые часы стоят — позиция не сгорает', () => {
    const с = стол(1);
    const было = с.текст();
    TestRenderer.act(() => { jest.advanceTimersByTime(levelParams(1).seconds * 1000 + 2000); });
    expect(с.текст()).toBe(было);
    expect(с.вехи).toEqual([]);
  });

  /**
   * 🔴 ПОДХОД ЗАКАНЧИВАЕТСЯ ИТОГОМ, И В ИТОГЕ ЕСТЬ МЕДИАНА.
   *
   * Экран пишет в сессию `median_ms` — главную цифру упражнения. Если модуль
   * не доходит до `onComplete`, в базу не уходит ничего, и лестница молчит.
   */
  it('🔴 весь подход доигрывается, и наверх уходит медиана времени', () => {
    const с = стол(1);
    const колода = buildDeck(1, 1);
    for (const задача of колода) {
      const uci = задача.solutions[0]!;
      с.тап(uci.slice(0, 2));
      с.тап(uci.slice(2, 4));
      с.тик(700);
    }
    expect(с.итоги.length).toBe(1);
    const r = с.итоги[0]!;
    expect(r.total).toBe(колода.length);
    expect(r.solved).toBe(колода.length);
    expect(r.medianMs).toBeGreaterThan(0);
    expect(r.accuracy).toBe(1);
  });
});

describe('«Детский мат»: доска не разъезжается', () => {
  /**
   * 🔴 ВОСЕМЬ КЛЕТОК ОБЯЗАНЫ ВЛЕЗТЬ В РЯД. Доска — `flexWrap`, и лишний пиксель
   * в ряду переносит восьмую клетку на следующую строку: сверху семь колонок,
   * снизу обрезанные фигуры. Позиция при этом разбирается верно, врёт только
   * картинка, — значит ни одна проба на ядре этого не поймает.
   *
   * 📍 Так и было 05.09.2026 в браузере на 375 px: клетка считалась `size / 8`
   * = 42,875, восемь таких = 343, а внутрь рамки влезало 339.
   */
  it('🔴 восемь клеток плюс рамка помещаются в отведённую ширину', () => {
    const плохие: string[] = [];
    // Ширины экранов от узкого телефона до планшета плюс потолок 420 из экрана.
    for (let size = 200; size <= 420; size++) {
      const клетка = размерКлетки(size);
      if (!Number.isInteger(клетка)) плохие.push(`${size}: клетка ${клетка} дробная`);
      if (клетка * 8 + РАМКА_ДОСКИ * 2 > size) плохие.push(`${size}: ряд ${клетка * 8} не влезает`);
      if (ширинаДоски(size) > size) плохие.push(`${size}: доска ${ширинаДоски(size)} шире отведённого`);
    }
    expect(плохие.slice(0, 5)).toEqual([]);
  });

  it('🔴 клетка не съёживается: доска занимает почти всю отведённую ширину', () => {
    // Обратная сторона: «влезает» достигается и клеткой в один пиксель.
    for (const size of [320, 343, 360, 420]) {
      expect(`${size}: ${ширинаДоски(size) >= size - 8}`).toBe(`${size}: true`);
    }
  });

  it('🔴 на живом дереве все 64 клетки одного размера', () => {
    const с = стол(1);
    const размеры = new Set<number>();
    с.tree.root.findAll(
      (n: any) => typeof n.props?.onPress === 'function'
        && /^[a-h][1-8](,|$)/.test(String(n.props.accessibilityLabel ?? '')),
      { deep: true },
    ).forEach((n: any) => { размеры.add(n.props.style.width); размеры.add(n.props.style.height); });
    expect([...размеры]).toHaveLength(1);
    expect(Number.isInteger([...размеры][0])).toBe(true);
  });
});

/**
 * 🔴 ТО, ЧТО РАНЬШЕ НЕ СТЕРЁГ НИКТО (рецензия 05.09.2026).
 *
 * Разбор предъявил 15 утверждений, зелёных при вырезанном механизме, и пять
 * бед, у которых пробы не было вовсе. Здесь — те, что видны только на живом
 * дереве: залипший вердикт, неостановленный подход, разворот доски посреди
 * набора, мёртвые клетки и вторая попытка в одном кадре.
 */
describe('«Детский мат»: беды, которые ловятся только рендером', () => {
  /**
   * 🔴 ВЕРДИКТ СНИМАЕТСЯ, ДАЖЕ ЕСЛИ РОДИТЕЛЬ ПЕРЕРИСОВЫВАЕТСЯ.
   *
   * 📍 Замер: эффект показа вердикта зависел от `дальше`, тот — от
   * `onComplete`, а тот — от `п.kinds`, нового массива на каждый рендер
   * экрана. 0 перерисовок — вердикт 550 мс, 1 — 650, 2 — 750; при перерисовке
   * каждые 200 мс он не снимался вовсе. Доска замирала навсегда.
   */
  it('🔴 перерисовки родителя не удерживают вердикт на экране', () => {
    const с = стол(1);
    const задача = buildDeck(1, 1)[0]!;
    const uci = задача.solutions[0]!;
    с.тап(uci.slice(0, 2));
    с.тап(uci.slice(2, 4));
    expect(с.текст()).toContain('✓');

    // Дёргаем дерево, как это делает экран: новые пропсы каждые 200 мс.
    for (let i = 0; i < 5; i++) {
      TestRenderer.act(() => {
        с.tree.update(React.createElement(ScholarsMateGame as any, {
          level: 1, seed: 1, size: 320, theme: THEME, labels: LABELS,
          now: () => 1_000_000, onProgress: () => {}, onComplete: () => {},
        }));
      });
      с.тик(200);
    }
    // 1000 мс игровых часов прошло — вердикт (550 мс) обязан был смениться позицией.
    expect(с.текст()).toContain(`2 / ${levelParams(1).count}`);
  });

  /**
   * 🔴 ПОДХОД ЗАКАНЧИВАЕТСЯ ОДИН РАЗ, И ЧАСЫ ПОСЛЕ ЭТОГО СТОЯТ.
   *
   * 📍 Замер: через 25 секунд после конца подхода `onComplete` был вызван ПЯТЬ
   * раз, а попыток записано 13 вместо 8 — секундомер продолжал идти по старому
   * началу отсчёта и добивал позиции таймаутами.
   */
  it('🔴 после конца подхода итог не приходит второй раз', () => {
    const с = стол(1);
    for (const задача of buildDeck(1, 1)) {
      const uci = задача.solutions[0]!;
      с.тап(uci.slice(0, 2));
      с.тап(uci.slice(2, 4));
      с.тик(700);
    }
    expect(с.итоги.length).toBe(1);
    const попыток = с.итоги[0]!.total;
    /**
     * ⚠️ ТИКАЕМ МЕЛКО, А НЕ ОДНИМ ПРЫЖКОМ. Один `тик(30_000)` эту беду НЕ
     * ловит: часы уезжают разом, секундомер видит уже истёкшее время один раз
     * и дальше не оживает. Дефект живёт в том, что время идёт МЕЖДУ
     * перерисовками. Замер на вырезанном замке: мелкими тиками — 8 итогов
     * вместо одного и 15 попыток вместо 8, одним прыжком — ровно 1 и 8.
     */
    for (let i = 0; i < 300; i++) с.тик(100);
    expect(`итогов ${с.итоги.length}, попыток ${с.итоги[с.итоги.length - 1]!.total}`)
      .toBe(`итогов 1, попыток ${попыток}`);
  });

  /**
   * 🔴 ДОСКА НЕ ПЕРЕВОРАЧИВАЕТСЯ ПОСРЕДИ ПОДХОДА.
   *
   * 📍 Замер по 2000 колод: ориентация менялась внутри подхода в 97% случаев.
   * Это систематическая добавка ко времени узнавания, а медиана убирает
   * выбросы, а не систематику.
   */
  it('🔴 порядок клеток на доске не меняется от позиции к позиции', () => {
    const порядок = () => с.tree.root.findAll(
      (n: any) => typeof n.props?.onPress === 'function'
        && /^[a-h][1-8](,|$)/.test(String(n.props.accessibilityLabel ?? '')),
      { deep: true },
    ).map((n: any) => String(n.props.accessibilityLabel).slice(0, 2)).join('');

    // Уровень со смешанными сторонами: в наборе есть и белые, и чёрные.
    const с = стол(14, 3);
    const первый = порядок();
    for (let i = 0; i < 4; i++) {
      с.тик(levelParams(14).seconds * 1000 + 200);   // прозевали позицию
      с.тик(1600);                                    // показ ответа
    }
    expect(порядок()).toBe(первый);
  });

  /** Пережитая мутация: на «грозит ли» 64 клетки оставались живыми кнопками. */
  it('🔴 в вопросе «грозит ли мат» клетки доски не кнопки', () => {
    // Ищем уровень и зерно, где первая позиция — «грозит ли».
    let найдено: { L: number; seed: number } | null = null;
    for (const L of [19, 20, 22, 24, 26, 28]) {
      for (let seed = 1; seed <= 12 && !найдено; seed++) {
        if (buildDeck(L, seed)[0]?.kind === 'threat') найдено = { L, seed };
      }
      if (найдено) break;
    }
    expect(найдено).toBeTruthy();
    const с = стол(найдено!.L, найдено!.seed);
    const живые = с.tree.root.findAll(
      (n: any) => typeof n.props?.onPress === 'function'
        && /^[a-h][1-8](,|$)/.test(String(n.props.accessibilityLabel ?? '')),
      { deep: true },
    );
    expect(живые.length).toBe(0);
    // А кнопки «да»/«нет» на месте — иначе отвечать нечем.
    expect(с.текст()).toContain(LABELS.yes);
    expect(с.текст()).toContain(LABELS.no);
  });

  /** Пережитая мутация: замок от второй попытки снят (набегало 1422 попытки на 8 позиций). */
  it('🔴 второй тап в том же кадре не записывает вторую попытку', () => {
    const с = стол(1);
    const задача = buildDeck(1, 1)[0]!;
    const uci = задача.solutions[0]!;
    с.тап(uci.slice(0, 2));
    // Два тапа по цели подряд, без перерисовки между ними.
    с.тап(uci.slice(2, 4));
    с.тап(uci.slice(2, 4));
    с.тик(700);
    // Если бы записались две попытки, счётчик показал бы третью позицию.
    expect(с.текст()).toContain(`2 / ${levelParams(1).count}`);
  });

  /** Пережитая мутация: фигуры не рисуются вовсе — доска могла быть пустой. */
  it('🔴 на доске нарисованы фигуры, а не только клетки', () => {
    const с = стол(1);
    const сФигурой = с.tree.root.findAll(
      (n: any) => typeof n.props?.onPress === 'function'
        && /^[a-h][1-8], /.test(String(n.props.accessibilityLabel ?? '')),
      { deep: true },
    );
    // В дебютной позиции фигур заведомо больше двадцати.
    expect(сФигурой.length).toBeGreaterThan(20);
  });

  /** Пережитая мутация: полоса времени застыла на полном — проба искала подстроку «с». */
  it('🔴 счётчик секунд убывает, а не стоит', () => {
    const с = стол(1);
    const число = () => Number((с.текст().match(/([\d.]+) с/) ?? [])[1] ?? -1);
    const было = число();
    expect(было).toBeGreaterThan(0);
    с.тик(3000);
    const стало = число();
    expect(`${было} → ${стало}`).toBe(`${было} → ${Number((было - 3).toFixed(1))}`);
  });
});
