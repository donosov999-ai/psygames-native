/**
 * ИГРА, ПОМЕЧЕННАЯ «В ХАБЕ», ОБЯЗАНА БЫТЬ В ХАБЕ ВИДНА.
 *
 * 🔴 ЗАЧЕМ. Вопрос Дениса 04.09.2026: «проверь, что так же висит, но не
 * показывается в хабах». Повод — «Торможение»: у `go_no_go` и `stop_signal` в
 * каталоге стояло `mergedInto: 'attention_conflict'`, то есть «мы в хабе», а
 * экран хаба про них не знал вовсе. Карточка при этом спрятана из каталога
 * (`hideFromMenu`), и попасть в упражнение было НЕОТКУДА — оно жило только тем,
 * что на него ссылался пресет зарядки.
 *
 * Пометка `mergedInto` — это обещание человеку: «ищи внутри такого-то хаба».
 * Гейт проверяет, что обещание выполнимо: из экрана хаба ДО игры можно дойти по
 * ссылкам (в том числе через промежуточный экран — например, групповую карточку).
 *
 * ⚠️ Комментарии срезаем: упоминание маршрута в объяснении не считается ссылкой.
 */
declare const __dirname: string;
declare function require(m: string): any;
const fs = require('fs');
const path = require('path');

const КОРЕНЬ = path.join(__dirname, '../..');
const КАТАЛОГ = path.join(КОРЕНЬ, 'src/constants/games.ts');

const безКомментариев = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

interface Карточка { id: string; route?: string; merged?: string }

function каталог(): Карточка[] {
  const src = безКомментариев(fs.readFileSync(КАТАЛОГ, 'utf8'));
  const из: Карточка[] = [];
  for (const m of src.matchAll(/\n {2}\{\n([\s\S]*?)\n {2}\},/g)) {
    const b = m[1]!;
    const id = /id:\s*'([a-z0-9_-]+)'/.exec(b)?.[1];
    if (!id) continue;
    из.push({
      id,
      route: /route:\s*'(\/games\/[a-z0-9-]+)'/.exec(b)?.[1],
      merged: /mergedInto:\s*'([a-z0-9_]+)'/.exec(b)?.[1],
    });
  }
  if (!из.length) throw new Error('каталог не разобрался — гейт проверял бы пустоту');
  return из;
}

/** Дойти от экрана `старт` до `цель` по ссылкам между экранами игр. */
function достижимо(старт: string, цель: string): boolean {
  const виден = new Set<string>();
  const очередь = [старт];
  while (очередь.length) {
    const r = очередь.shift()!;
    if (r === цель) return true;
    if (виден.has(r)) continue;
    виден.add(r);
    const f = path.join(КОРЕНЬ, 'app' + r + '.tsx');
    if (!fs.existsSync(f)) continue;
    const s = безКомментариев(fs.readFileSync(f, 'utf8'));
    for (const m of s.matchAll(/'(\/games\/[a-z0-9-]+)'/g)) if (!виден.has(m[1]!)) очередь.push(m[1]!);
  }
  return false;
}

/**
 * ДОЛГ, НАЗВАННЫЙ ПОИМЁННО. Обе подпробы реализованы ВНУТРИ экрана «Торможение»
 * как режимы (`SubMode`), а отдельные экраны `go-no-go.tsx` и `stop-signal.tsx`
 * — их дубликаты на 1012 строк. Из хаба до них не дойти по построению, и это
 * решается не ссылкой, а решением Дениса: оставить дубликаты или снести.
 *
 * ⚠️ Запись здесь не «разрешение», а расписка: пока строка стоит, дефект виден.
 */
const ДОЛГ: Record<string, string> = {
  go_no_go: 'реализована режимом внутри /games/inhibition; отдельный экран go-no-go.tsx — дубликат, живёт ссылкой из пресета зарядки (profiles.ts). Решение о сносе за Денисом',
  stop_signal: 'реализована режимом внутри /games/inhibition; отдельный экран stop-signal.tsx — дубликат, из интерфейса не достижим вовсе. Решение о сносе за Денисом',
};

describe('игры, помеченные слитыми в хаб', () => {
  const карточки = каталог();
  const поId = Object.fromEntries(карточки.map((к) => [к.id, к]));
  const слитые = карточки.filter((к) => к.merged);

  it('есть что проверять — иначе гейт зелен вслепую', () => {
    expect(слитые.length).toBeGreaterThan(5);
  });

  it('🔴 у каждой слитой игры хаб существует и имеет свой экран', () => {
    const плохие = слитые
      .filter((к) => {
        const хаб = поId[к.merged!];
        return !хаб?.route || !fs.existsSync(path.join(КОРЕНЬ, 'app' + хаб.route + '.tsx'));
      })
      .map((к) => `${к.id} → «${к.merged}»`);
    expect(плохие).toEqual([]);
  });

  it('🔴 из хаба до слитой игры МОЖНО дойти по ссылкам', () => {
    const сироты = слитые
      .filter((к) => !ДОЛГ[к.id])
      .filter((к) => {
        const хаб = поId[к.merged!];
        return !к.route || !хаб?.route || !достижимо(хаб.route, к.route);
      })
      .map((к) => `${к.id} (${к.route}) — помечена в «${к.merged}», но из хаба не дойти`);
    expect(сироты).toEqual([]);
  });

  it('долг не протух: записанные сироты всё ещё сироты', () => {
    const починенные = Object.keys(ДОЛГ).filter((id) => {
      const к = поId[id];
      const хаб = к?.merged ? поId[к.merged] : undefined;
      return к?.route && хаб?.route && достижимо(хаб.route, к.route);
    });
    expect(`починены, но остались в долге: ${починенные.join(', ')}`).toBe('починены, но остались в долге: ');
  });

  it('самопроверка: выдуманная слитая игра ловится', () => {
    const хаб = поId['attention_conflict'];
    expect(хаб?.route).toBeTruthy();
    expect(достижимо(хаб!.route!, '/games/такой-игры-нет')).toBe(false);
  });
});
