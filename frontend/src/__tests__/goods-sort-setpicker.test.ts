/**
 * Выбор набора товаров в «Сортировке товаров»: витрина обязана ПОКАЗЫВАТЬ набор.
 *
 * 🔴 ЧТО ЛОМАЛОСЬ. Репорт Вали 19.08.2026 (сборка 1.206.3, профиль «Релакс»):
 * «это что за уродливое перечисление товаров кровь из глаз просто».
 *
 * Замер живой сборки 20.08.2026 — цифры, а не впечатление:
 *   • экран 390px → карточка набора 58.8px, экран 360px → 52.8px;
 *   • внутрь верстался ряд из 4 миниатюр 18×28 = 75px содержимого;
 *   • ряд не ужимался — он ВЫЛЕЗАЛ: на 360px по 11.1px за каждый край, из-за
 *     чего полоска соседней карточки НАКЛАДЫВАЛАСЬ на эту на 14.2px;
 *   • подписи туда тоже не влезали: «Напитки» 53.5px, «Игрушки» 56px,
 *     «Молочное» 63.5px против карточки в 52.8px.
 * Пять наборов читались одной смазанной лентой — ровно то, что она и написала.
 *
 * Плюс отдельный тихий дефект: витрина бралась как `pool.slice(0, 4)`, а у
 * «Микса» первые четыре индекса — кола, лимонад, кефир, молоко. То есть набор
 * «всё сразу» выглядел ровно как «Напитки»: четыре бутылки.
 *
 * ЧЕМ МЕРЯЕМ. Порог взят из САМОЙ ИГРЫ, а не из вкуса: на доске первого уровня
 * при экране 360px товар рисуется в коробке 32×51px. Витрина не имеет права
 * быть мельче — иначе выбирать просят по картинке хуже той, по которой играть.
 *
 * ⚠️ Сравниваем КОРОБКИ, а не нарисованную картинку: спрайты разной пропорции
 * (кола 0.57, мишка 0.80, кефир 0.38), а contain вписывает картинку в коробку.
 * Коробка не меньше игровой по ОБЕИМ сторонам ⇒ min(w, h·r) тоже не меньше при
 * любой пропорции. Этого достаточно, разбирать webp-заголовки не нужно.
 */
import {
  GOOD_ONBOARD_W, GOOD_ONBOARD_H, SET_COLS, THUMBS_PER_CARD,
  setThumbBox, setRows, levelCfg,
} from '@/app/games/goods-sort';

declare const __dirname: string;
declare function require(id: string): any;

const { readFileSync } = require('fs');
const { join } = require('path');

/** ⚠️ Комментарии срезаем ДО поиска: иначе гейт зеленеет от слова в разборе. */
const SRC: string = (() => {
  const raw = readFileSync(join(__dirname, '../../app/games/goods-sort.tsx'), 'utf8') as string;
  return raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
})();

/** Ширины, на которых игру реально смотрят: iPhone 390 и самый узкий Android 360. */
const WIDTHS = [390, 360];

/** Витрины наборов, вынутые из исходника — числа обязаны совпадать с игрой. */
function previews(): { key: string; pool: number[]; preview: number[]; alike: boolean }[] {
  const out: { key: string; pool: number[]; preview: number[]; alike: boolean }[] = [];
  const re = /key: '(\w+)',[^\]]*pool: \[([^\]]+)\],\s*preview: \[([^\]]+)\](,\s*alike: true)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(SRC))) {
    const nums = (s: string) => s.split(',').map((x) => Number(x.trim()));
    out.push({ key: m[1], pool: nums(m[2]), preview: nums(m[3]), alike: !!m[4] });
  }
  return out;
}

describe('выбор набора: витрина не мельче товара на доске', () => {
  it.each(WIDTHS)('на %ipx миниатюра не мельче игровой коробки 32×51', (win) => {
    const { w, h } = setThumbBox(win);
    expect(`${win}px → ${w.toFixed(1)}×${h.toFixed(1)}, надо ≥ ${GOOD_ONBOARD_W}×${GOOD_ONBOARD_H}`)
      .toBe(`${win}px → ${w.toFixed(1)}×${h.toFixed(1)}, надо ≥ ${Math.min(w, GOOD_ONBOARD_W)}×${Math.min(h, GOOD_ONBOARD_H)}`);
  });

  it('миниатюра выросла против сборки 1.206.3, где была 18×28', () => {
    const { w, h } = setThumbBox(360);
    expect(w).toBeGreaterThan(18);
    expect(h).toBeGreaterThan(28);
  });
});

describe('выбор набора: витрина не вылезает за карточку', () => {
  const BTN_EDGE = 10;   // borderWidth 2 + paddingHorizontal 8
  const THUMB_GAP = 4;

  it.each(WIDTHS)('на %ipx ряд миниатюр ровно заполняет карточку, не выходя за край', (win) => {
    // Раньше полоска вылезала за края карточки и лезла на соседнюю (замер: −11.1px
    // слева, +11.1px справа при зазоре 8px между карточками → перекрытие 14.2px).
    const { w } = setThumbBox(win);
    const cardW = (win - 16 * 2 - 16 * 2 - 8 * (SET_COLS - 1)) / SET_COLS;
    const inner = cardW - BTN_EDGE * 2;
    const strip = THUMBS_PER_CARD * w + (THUMBS_PER_CARD - 1) * THUMB_GAP;
    expect(`вылет за край ${Math.max(0, (strip - inner) / 2).toFixed(1)}px`).toBe('вылет за край 0.0px');
  });

  it('витрина показывает три товара — по одному тему не прочесть, шестью снова получится лента', () => {
    expect(THUMBS_PER_CARD).toBe(3);
    expect(SRC).toContain('s.preview.slice(0, THUMBS_PER_CARD)');
  });

  it('в разметке витрины нет размеров, посчитанных от ширины окна', () => {
    // 🔴 Первая версия правки считала ширину миниатюры из useWindowDimensions —
    // и живая сборка ответила React #418: в предрендере окна нет, width приходит
    // нулём, сервер клал width:-22px, клиент width:38px, гидрация разошлась.
    const render = SRC.slice(SRC.indexOf('styles.setPreview'), SRC.indexOf('setNameRow}'));
    expect(render).toContain('styles.setThumb');
    expect(render).not.toMatch(/width=\{[^}]*(width|thumb)/);
    expect(SRC).toMatch(/setThumb: \{[^}]*flex: 1[^}]*aspectRatio/);
    // модель раскладки живёт для гейта и НЕ зовётся из разметки
    expect(SRC.match(/setThumbBox\(/g) ?? []).toHaveLength(1);
  });
});

describe('выбор набора: наборы видно, что разные', () => {
  it('витрина берётся только из своего пула', () => {
    const bad = previews()
      .map((p) => ({ key: p.key, alien: p.preview.filter((i) => !p.pool.includes(i)) }))
      .filter((x) => x.alien.length)
      .map((x) => `${x.key}: ${x.alien.join(',')}`);
    expect(bad).toEqual([]);
  });

  it('первые три товара любых двух наборов совпадают не больше чем одним', () => {
    // Старый `pool.slice(0,4)` давал «Миксу» [0,1,2] против «Напитков» [0,1,4] —
    // два товара из трёх общие, и наборы выглядели одинаково.
    const ps = previews();
    const bad: string[] = [];
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i].preview.slice(0, 3), b = ps[j].preview.slice(0, 3);
        const common = a.filter((x) => b.includes(x));
        if (common.length > 1) bad.push(`${ps[i].key} vs ${ps[j].key}: общих ${common.length}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('«Микс» показывает товары из разных тем, а не четыре бутылки подряд', () => {
    const ps = previews();
    const mix = ps.find((p) => p.key === 'mix')!;
    const others = ps.filter((p) => p.key !== 'mix');
    const themes = new Set(
      mix.preview.slice(0, 3).map((i) => others.find((o) => o.pool.includes(i))?.key ?? '?'),
    );
    expect(`тем в первой тройке «Микса»: ${themes.size}`).toBe('тем в первой тройке «Микса»: 3');
  });

  it('«Молочное» помечено как похожие — иначе подвох виден только в бою', () => {
    const alike = previews().filter((p) => p.alike).map((p) => p.key);
    expect(alike).toEqual(['dairy']);
    expect(SRC).toContain("t('goodsSetAlike')");
  });
});

describe('выбор набора: раскладка рядами', () => {
  it('ни один набор не потерян и не задвоен', () => {
    const keys = previews().map((p) => p.key);
    expect(setRows(keys).flat().filter(Boolean)).toEqual(keys);
  });

  it('все ряды одной длины — неполный добирается пустым местом, а не растягивается', () => {
    // Растянутая одиночная карточка дала бы «Миксу» миниатюры крупнее соседних,
    // и наборы стало бы не с чем сравнивать глазом.
    const rows = setRows(previews().map((p) => p.key));
    expect(rows.map((r) => r.length)).toEqual([SET_COLS, SET_COLS, SET_COLS]);
    // Порядок наборов — по возрастанию порога открытия
    // (mix 1 · food 6 · drinks 10 · toys 10 · dairy 12 · pets 18), см. goods-sort-unlock.
    // С шестым набором последний ряд заполнен целиком — пустого места не осталось.
    expect(rows[2]).toEqual(['dairy', 'pets']);
    // ⚠️ Пустое место обязано быть ТЕМ ЖЕ setBtn, только прозрачным: у flex-элемента
    // с basis 0 пол ширины — его padding+border, и голый View «легче» карточки на 20px.
    // Замер живой сборки до фикса: ряд делился 169/149, миниатюры «Микса» 47px против 43.7px.
    expect(SRC).toContain('[styles.setBtn, styles.setBtnGhost]');
    expect(SRC).toMatch(/setBtnGhost: \{[^}]*borderColor: 'transparent'/);
  });

  it('числа в стилях совпадают с арифметикой раскладки', () => {
    // Разойдутся — витрина снова вылезет за карточку, и молча.
    const btn = SRC.match(/setBtn: \{[^}]*\}/)![0];
    expect(btn).toContain('borderWidth: 2');
    expect(btn).toContain('paddingHorizontal: 8');
    expect(SRC).toMatch(/setPreview: \{[^}]*gap: 4/);
    expect(SRC).toMatch(/setRow: \{[^}]*gap: 8/);
    expect(SRC).toMatch(/configContainer: \{ padding: 16/);
    expect(SRC).toMatch(/optionCard: \{ padding: 16/);
  });
});

/**
 * Есть ли вообще смысл в выборе набора — или это настройка ради настройки.
 *
 * Разбор 20.08.2026: смысл есть, но не сразу. `types` считается как
 * min(poolSize, потолок доски, 4 + L/2), то есть размер пула УПИРАЕТСЯ в игру
 * только когда 4 + L/2 его перерастёт: «Еда» (6) — с 6-го уровня, «Напитки»
 * (8) — с 10-го, «Игрушки»/«Молочное» (9) — с 12-го. До шестого все наборы
 * механически одинаковы, и разница там только в картинках (и в восприятии —
 * «Молочное» труднее на любом уровне, оно намеренно неразличимое).
 *
 * Гейт держит именно это: если пулы сравняют, выбор станет украшением, и это
 * должно упасть, а не тихо проехать.
 */
describe('выбор набора влияет на трудность, а не только на картинки', () => {
  const poolSize = (k: string) => previews().find((p) => p.key === k)!.pool.length;
  const types = (k: string, L: number) => levelCfg(L, poolSize(k), true).types;

  it('пулы наборов разного размера', () => {
    const sizes = previews().map((p) => `${p.key}:${p.pool.length}`);
    // Читаются в порядке показа: от самого широкого (открыт сразу) к узким.
    // 30.08.2026: лиса выведена из «Игрушек» (9→8), заведён набор «Зверята» (12),
    // «Микс» вобрал новых и потерял лису (32→43).
    /**
     * ⚠️ 34, а не прежние 43: из «Микса» убраны девять молочных бутылок
     * (23…31) — в наборе по умолчанию они давали шесть пар одинакового
     * силуэта, различимых только оттенком этикетки. Различение оттенков
     * осталось в «Молочном», где оно и есть суть набора.
     */
    expect(sizes).toEqual(['mix:34', 'food:6', 'drinks:8', 'toys:8', 'dairy:9', 'pets:12']);
  });

  it('на 12-м уровне разные наборы дают разное число видов товара', () => {
    const at12 = ['food', 'drinks', 'toys', 'pets', 'mix'].map((k) => `${k}:${types(k, 12)}`);
    expect(new Set(at12.map((s) => s.split(':')[1])).size).toBeGreaterThan(1);
    // «Зверята» (12 видов) на 12-м ещё не упираются — дают столько же, сколько «Микс».
    expect(at12).toEqual(['food:6', 'drinks:8', 'toys:8', 'pets:10', 'mix:10']);
  });

  it('на первых уровнях выбор набора трудность НЕ меняет — и это честно сказано в разборе', () => {
    for (const L of [1, 2, 3, 4, 5]) {
      const all = previews().map((p) => types(p.key, L));
      expect(`ур.${L}: ${new Set(all).size}`).toBe(`ур.${L}: 1`);
    }
  });
});
