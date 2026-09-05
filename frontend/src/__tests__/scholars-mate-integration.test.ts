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
