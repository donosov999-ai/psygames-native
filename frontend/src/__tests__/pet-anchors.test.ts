/**
 * Аксессуары питомца обязаны сидеть на КАЖДОМ кадре, а не на одном.
 *
 * ЖАЛОБА, ИЗ КОТОРОЙ ВЫРОС ЭТОТ ГЕЙТ. Валя 19.08.2026, экран магазина: «Почему
 * бабочка на пузе, папочка должна быть на шее? Она то на пузе, то на хвосте».
 * Якоря снимали по ОДНОМУ кадру idle0 и ставили константой на весь облик, а у
 * облика двадцать кадров: пять состояний по четыре. У кота шея стояла намертво
 * на 62.5% высоты кадра — в sleep кот лежит, и это пузо; в jump2 поза другая, и
 * это хвост.
 *
 * ⚠️ ЧЕМУ НАУЧИЛ ПРОШЛЫЙ ГЕЙТ, СТОЯВШИЙ ЗДЕСЬ ЖЕ. Он сверял якоря с таблицей
 * «замеренных макушек», которую автор написал сам, и в таблице была ТА ЖЕ
 * ошибка: за макушку кота принято 10.9% — кончики антенн. Гейт сверял мои числа
 * с моими же числами и был согласен. Поэтому здесь чисел, введённых руками, нет
 * вовсе: гейт ПЕРЕСЧИТЫВАЕТ якоря по силуэтам кадров тем же правилом, что и
 * скрипт замера, и сверяет результат с таблицей.
 *
 * ОТКУДА СИЛУЭТЫ. jest не умеет декодировать webp: декодера нет в
 * package-lock.json, а в CI ставится ровно он. Поэтому построчные профили всех
 * 60 кадров лежат в pet-silhouette.generated.json — их пишет тот же скрипт
 * scripts/measure-pet-anchors.mjs, что и таблицу. Цепочка честности замыкается
 * хешами: в силуэтах записан sha256 КАЖДОЙ картинки, и гейт сверяет его с
 * файлом на диске. Значит:
 *   • подправят числа в таблице руками     → пересчёт не сойдётся;
 *   • перерисуют спрайты                    → не сойдутся хеши;
 *   • подменят силуэты, не трогая картинки  → не сойдутся хеши.
 * Чего цепочка НЕ доказывает: что сам скрипт считает верно. Это проверено
 * глазами — `node scripts/measure-pet-anchors.mjs --sheet` кладёт контактные
 * листы, где настоящая вещь надета на все 20 кадров облика.
 */
declare const __dirname: string;
declare function require(m: string): any;
type NodeBuf = Uint8Array & { readInt16LE(off: number): number };
declare const Buffer: { from(s: string, enc: string): NodeBuf };
const { readFileSync } = require('fs');
const { join } = require('path');
const { createHash } = require('crypto');
const { gunzipSync } = require('zlib');

import { FRAME_ANCHORS } from '../components/pet/petAnchors.generated';
import { petAnchor } from '../components/pet/PetSprite';

const SKINS = ['cat', 'robot', 'constellation'] as const;
const STATES = ['walk', 'idle', 'wave', 'jump', 'sleep'] as const;
const FRAMES = 4;
const ANCHORS = ['head_top', 'eyes', 'neck'] as const;
type Skin = (typeof SKINS)[number];
type State = (typeof STATES)[number];
type Name = (typeof ANCHORS)[number];

const SRC: string = readFileSync(join(__dirname, '../components/pet/PetSprite.tsx'), 'utf8');

/* ─── Силуэты ──────────────────────────────────────────────────────────────── */
interface Rec { skin: Skin; state: State; frame: number; w: number; h: number; sha: string; at: number }
const SIL: { thresholds: Record<string, number>; index: Rec[]; rows: string } =
  JSON.parse(readFileSync(join(__dirname, 'pet-silhouette.generated.json'), 'utf8'));
const ROWS: NodeBuf = gunzipSync(Buffer.from(SIL.rows, 'base64'));

/** Пороги замера приходят из силуэтов, а не переписаны сюда: одно число — один хозяин. */
const { ALPHA, DARK, SKULL_RUN, SINK, NECK_K } = SIL.thresholds;

const recOf = (skin: Skin, state: State, frame: number): Rec =>
  SIL.index.find((r) => r.skin === skin && r.state === state && r.frame === frame)!;

/** На строку кадра: границы самой длинной сплошной полосы и число тёмных пикселей. */
function prof(r: Rec) {
  return {
    w: r.w, h: r.h,
    x0: (y: number) => ROWS.readInt16LE(r.at + y * 6),
    x1: (y: number) => ROWS.readInt16LE(r.at + y * 6 + 2),
    dark: (y: number) => ROWS.readInt16LE(r.at + y * 6 + 4),
    run: (y: number) => { const a = ROWS.readInt16LE(r.at + y * 6); return a < 0 ? 0 : ROWS.readInt16LE(r.at + y * 6 + 2) - a + 1; },
    mid: (y: number) => { const a = ROWS.readInt16LE(r.at + y * 6); return a < 0 ? r.w / 2 : (a + ROWS.readInt16LE(r.at + y * 6 + 2)) / 2; },
  };
}
type Prof = ReturnType<typeof prof>;

/* ─── Правило замера, переписанное здесь заново ────────────────────────────── */
/**
 * Те же три шага, что в шапке scripts/measure-pet-anchors.mjs:
 *   head_top — первая строка, где САМАЯ ДЛИННАЯ СПЛОШНАЯ полоса непрозрачных
 *     пикселей превышает 40% от максимума по кадру (сплошная: уши и антенны дают
 *     в строке две отдельные полоски, череп — одну широкую);
 *   eyes — строка с максимумом тёмных непрозрачных пикселей в пределах головы;
 *   neck — eyes + 0.55 × (eyes − head_top).
 * Переписано, а не импортировано, нарочно: импорт превратил бы проверку в
 * сверку функции с самой собой.
 */
function skullRow(p: Prof): number {
  let M = 0;
  for (let y = 0; y < p.h; y++) M = Math.max(M, p.run(y));
  for (let y = 0; y < p.h; y++) if (p.run(y) > SKULL_RUN * M) return y;
  return 0;
}
function headAxisX(p: Prof, H: number): number {
  let wmax = 0, wrow = H;
  const lim = Math.min(p.h - 1, H + Math.round(p.h * 0.35));
  for (let y = H; y <= lim; y++) { const v = p.run(y); if (v > wmax) { wmax = v; wrow = y; } }
  return p.mid(wrow);
}
function chinRow(p: Prof, H: number): number {
  let run = 0;
  for (let y = H; y < p.h; y++) { run = Math.max(run, p.run(y)); if (p.run(y) < 0.55 * run) return y; }
  return p.h - 1;
}
function eyesRowRaw(p: Prof, H: number): number {
  const chin = chinRow(p, H);
  let best = H, bv = -1;
  for (let y = H; y <= chin; y++) if (p.dark(y) > bv) { bv = p.dark(y); best = y; }
  return best;
}
function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y); const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
/**
 * Глубина глаз внутри головы — по облику, а не по кадру.
 *
 * ⚠️ ЗАЧЕМ ТАК. Правило «самая тёмная строка головы» молча ломается на кадрах,
 * где питомец ЗАКРЫЛ ГЛАЗА: зрачков нет, и самой тёмной оказывается тень под
 * животом. У кота так в четырёх кадрах sleep — глаза «находились» на 72–83%
 * высоты, а производная от них шея уезжала на 95–112%, то есть ЗА КРАЙ КАДРА.
 * Голова же у всех трёх обликов жёсткая: ездит целиком, а глаза внутри неё не
 * переезжают. Поэтому положение головы берём покадрово, а глубину глаз внутри
 * головы — медианой по кадрам, где правило применимо; выбросы отсекаются по MAD,
 * то есть замером, а не на глаз.
 */
function eyeDepth(skin: Skin): number {
  const vals: number[] = [];
  for (const st of STATES) for (let f = 0; f < FRAMES; f++) {
    const p = prof(recOf(skin, st, f));
    const H = skullRow(p);
    vals.push(((eyesRowRaw(p, H) - H) / p.h) * 100);
  }
  const m = median(vals);
  const cut = Math.max(1.4826 * median(vals.map((v) => Math.abs(v - m))) * 3, 1.0);
  return median(vals.filter((v) => Math.abs(v - m) <= cut));
}
const DEPTH: Record<string, number> = {};
for (const s of SKINS) DEPTH[s] = eyeDepth(s);

/** Пересчёт трёх якорей кадра «с нуля». */
function recompute(skin: Skin, state: State, frame: number) {
  const p = prof(recOf(skin, state, frame));
  const H = skullRow(p);
  const d = DEPTH[skin];
  const headTopY = (H / p.h) * 100 + SINK;
  const eyesY = (H / p.h) * 100 + d;
  const neckY = eyesY + NECK_K * d;
  const row = (yPct: number) => Math.max(0, Math.min(p.h - 1, Math.round((yPct / 100) * p.h)));
  return {
    head_top: { x: (headAxisX(p, H) / p.w) * 100, y: headTopY },
    eyes: { x: (p.mid(row(eyesY)) / p.w) * 100, y: eyesY },
    neck: { x: (p.mid(row(neckY)) / p.w) * 100, y: neckY },
  };
}

/** Точка на непрозрачном пикселе питомца? Считаем по самой длинной сплошной полосе
 *  строки — это подмножество непрозрачных пикселей, то есть проверка строгая. */
function insideSilhouette(skin: Skin, state: State, frame: number, x: number, y: number): boolean {
  const p = prof(recOf(skin, state, frame));
  const r = Math.round((y / 100) * p.h);
  if (r < 0 || r >= p.h) return false;
  const a = p.x0(r), b = p.x1(r);
  if (a < 0) return false;
  const px = (x / 100) * p.w;
  return px >= a && px <= b;
}

/** Крепление вещей — читается из исходника, чтобы гейт и компонент не разъехались. */
const MOUNT: Record<string, { at: Name; edge: string }> = {
  party_hat: { at: 'head_top', edge: 'bottom' },
  bow: { at: 'head_top', edge: 'center' },
  glasses: { at: 'eyes', edge: 'center' },
  bow_tie: { at: 'neck', edge: 'top' },
};

/** Допуск сверки. Пересчёт делается тем же правилом, поэтому расходиться числа
 *  могут только на округлении таблицы до сотых. */
const TOL = 0.02;

describe('якоря аксессуаров питомца', () => {
  it('есть что проверять — иначе гейт зелен вслепую', () => {
    expect(SIL.index.length).toBe(SKINS.length * STATES.length * FRAMES);
    expect(Object.keys(FRAME_ANCHORS).sort()).toEqual(['cat', 'constellation', 'robot']);
    expect(ALPHA > 0 && DARK > 0 && SKULL_RUN > 0 && NECK_K > 0).toBe(true);
  });

  /* ── 1. Полнота: пропущенное состояние — красное ─────────────────────────── */
  it('у каждого облика якоря есть на ВСЕ состояния и все кадры', () => {
    const holes: string[] = [];
    for (const skin of SKINS) {
      const byState = FRAME_ANCHORS[skin] as Record<string, unknown[]>;
      for (const st of STATES) {
        const list = byState[st];
        if (!Array.isArray(list)) { holes.push(`${skin}/${st}: состояния нет вовсе`); continue; }
        if (list.length !== FRAMES) { holes.push(`${skin}/${st}: кадров ${list.length}, а не ${FRAMES}`); continue; }
        list.forEach((fr, i) => {
          for (const nm of ANCHORS) {
            const a = (fr as Record<string, { x: number; y: number }>)[nm];
            if (!a || !Number.isFinite(a.x) || !Number.isFinite(a.y)) holes.push(`${skin}/${st}${i}: нет точки ${nm}`);
            else if (a.y < 0 || a.y > 100 || a.x < 0 || a.x > 100) holes.push(`${skin}/${st}${i}: ${nm} вне кадра (${a.x}, ${a.y})`);
          }
        });
      }
      const extra = Object.keys(byState).filter((k) => !(STATES as readonly string[]).includes(k));
      if (extra.length) holes.push(`${skin}: лишние состояния ${extra.join(',')}`);
    }
    expect(holes).toEqual([]);
  });

  /* ── 2. Числа не выдуманы ────────────────────────────────────────────────── */
  it('спрайты не перерисованы с последнего замера (sha256 всех 60 кадров)', () => {
    const bad: string[] = [];
    for (const r of SIL.index) {
      const file = join(__dirname, `../../assets/images/pet/${r.skin}/${r.state}${r.frame}.webp`);
      const sha: string = createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 16);
      if (sha !== r.sha) bad.push(`${r.skin}/${r.state}${r.frame}: картинка ${sha}, в замере ${r.sha}`);
    }
    expect(bad).toEqual([]);
  });

  it('таблица совпадает с пересчётом по силуэтам — числа не введены руками', () => {
    const off: string[] = [];
    for (const skin of SKINS) for (const st of STATES) for (let f = 0; f < FRAMES; f++) {
      const want = recompute(skin, st, f);
      for (const nm of ANCHORS) {
        const have = FRAME_ANCHORS[skin][st][f][nm];
        const dx = Math.abs(have.x - want[nm].x), dy = Math.abs(have.y - want[nm].y);
        if (dx > TOL || dy > TOL) {
          off.push(`${skin}/${st}${f}/${nm}: в таблице (${have.x}, ${have.y}), пересчёт (${want[nm].x.toFixed(2)}, ${want[nm].y.toFixed(2)})`);
        }
      }
    }
    expect(off).toEqual([]);
  });

  /* ── 3. Якорь берётся у СВОЕГО кадра ─────────────────────────────────────── */
  it('вещь получает состояние и номер кадра, а не якорь облика', () => {
    // Компонент обязан передать в накладку ТОТ ЖЕ кадр, которым он анимирует.
    expect(/<AccessoryOverlay[^>]*state=\{state\}[^>]*frame=\{shown\}/.test(SRC)).toBe(true);
    // И взять якорь по этому кадру, а не по фиксированному.
    expect(/petAnchor\(skin, state, frame, mount\.at\)/.test(SRC)).toBe(true);
    // Прежний общий на облик набор должен исчезнуть — иначе к нему потянутся снова.
    expect(SRC.includes('SKIN_ANCHORS')).toBe(false);
  });

  it('petAnchor отдаёт РАЗНОЕ для разных кадров — иначе всё выше бессмысленно', () => {
    const same: string[] = [];
    for (const skin of SKINS) {
      const base = petAnchor(skin, 'idle', 0, 'neck');
      const moved = STATES.flatMap((st) => [0, 1, 2, 3].map((f) => petAnchor(skin, st, f, 'neck')))
        .filter((a) => Math.abs(a.y - base.y) > TOL).length;
      if (moved === 0) same.push(`${skin}: шея одинакова во всех 20 кадрах`);
    }
    expect(same).toEqual([]);
  });

  /**
   * СКОЛЬКО СТОИЛА ПРЕЖНЯЯ СХЕМА — в процентах высоты кадра. Не украшение: если
   * кто-то снова прибьёт один якорь на облик, здесь видно цену. Кот в sleep3 —
   * тот самый кадр, где бабочка оказывалась на пузе.
   */
  it('якорь idle0 на чужом кадре промахивается — вот насколько', () => {
    const worst: Record<string, number> = {};
    for (const skin of SKINS) {
      const base = petAnchor(skin, 'idle', 0, 'neck');
      let m = 0;
      for (const st of STATES) for (let f = 0; f < FRAMES; f++) {
        m = Math.max(m, Math.abs(petAnchor(skin, st, f, 'neck').y - base.y));
      }
      worst[skin] = m;
    }
    // Кот: idle0 против sleep3 — 13.1% высоты кадра, это пузо вместо шеи.
    expect(worst.cat).toBeGreaterThan(10);
    expect(Math.max(...Object.values(worst))).toBeGreaterThan(10);
  });

  /* ── 4. Вещь не уезжает за силуэт — главная проверка ─────────────────────── */
  /**
   * ⚠️ ИМЕННО ЭТОГО НЕ БЫЛО, И ИМЕННО ЭТО ДАЛО «БАБОЧКУ НА ХВОСТЕ». Точка
   * крепления обязана попадать в непрозрачную область питомца НА КАЖДОМ кадре.
   * Проверка строгая: считается попадание в самую длинную сплошную полосу
   * строки, то есть в тело, а не в кончик хвоста или ухо.
   */
  it.each(Object.keys(MOUNT))('%s: точка крепления внутри силуэта на всех 60 кадрах', (kind) => {
    const at = MOUNT[kind].at;
    const outside: string[] = [];
    for (const skin of SKINS) for (const st of STATES) for (let f = 0; f < FRAMES; f++) {
      const a = petAnchor(skin, st, f, at);
      if (!insideSilhouette(skin, st, f, a.x, a.y)) outside.push(`${skin}/${st}${f}: (${a.x}, ${a.y}) мимо питомца`);
    }
    expect(outside).toEqual([]);
  });

  it('порядок точек в каждом кадре: макушка выше глаз, глаза выше шеи', () => {
    const wrong: string[] = [];
    for (const skin of SKINS) for (const st of STATES) for (let f = 0; f < FRAMES; f++) {
      const a = FRAME_ANCHORS[skin][st][f];
      if (!(a.head_top.y < a.eyes.y && a.eyes.y < a.neck.y)) {
        wrong.push(`${skin}/${st}${f}: макушка ${a.head_top.y}, глаза ${a.eyes.y}, шея ${a.neck.y}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  /* ── 5. Что уже ловилось раньше и должно ловиться дальше ─────────────────── */
  /**
   * ⚠️ БАНТ — ЗАКОЛКА НА ГОЛОВУ, А НЕ БАБОЧКА НА ШЕЮ. Решение Дениса 14.08.2026:
   * «бант надо чтобы на голове был, как раньше, как девчачий головной убор».
   */
  it('бант крепится к МАКУШКЕ серединой, а не к шее', () => {
    expect(/bow:\s*\{\s*at:\s*'head_top',\s*edge:\s*'center'/.test(SRC)).toBe(true);
  });

  /**
   * ⚠️ Бабочка — ВЕРХНИМ краем на шею. Середина увела бы половину предмета выше
   * точки шеи, коту прямо на морду: ровно та жалоба Вали 14.08.2026, из-за
   * которой бант и переезжал на голову.
   */
  it('бабочка крепится к шее верхним краем, а не серединой', () => {
    expect(/bow_tie:\s*\{\s*at:\s*'neck',\s*edge:\s*'top'/.test(SRC)).toBe(true);
  });

  it('считаем от ВИДИМОЙ части предмета, а не от границ картинки', () => {
    // У банта треть кадра сверху пустая: пока считали от кадра, он уезжал на морду.
    expect(SRC).toContain('ACCESSORY_INSET');
    expect(SRC.includes('IMG_PAD')).toBe(false);
  });

  it('поля бабочки замерены, а не списаны у банта', () => {
    const grab = (k: string) => {
      const m = SRC.match(new RegExp(`${k}:\\s*\\{ top: ([0-9.]+), height: ([0-9.]+) \\}`));
      return m ? `${m[1]}/${m[2]}` : null;
    };
    expect(grab('bow_tie')).toBe('0.287/0.426');
    expect(grab('bow_tie')).not.toBe(grab('bow'));
  });
});
