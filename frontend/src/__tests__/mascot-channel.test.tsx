/* eslint-disable import/first */
import React from 'react';
import renderer, { act } from 'react-test-renderer';

/**
 * 🔴 КАНАЛ — ПЕРВЫЙ ИСТОЧНИК, БАНДЛ — ЗАПАСНОЙ, И ОБА ПРОВЕРЯЮТСЯ РИСОВАНИЕМ.
 *
 * Задача e1cd469e: облики Синапса переехали на маскот-сервис. Опасностей ровно три,
 * и каждая проверяется здесь тем, что видит человек, а не чтением исходника:
 *
 *  1. САМОЛЁТНЫЙ РЕЖИМ. Нет сети — питомец обязан остаться. Проба рисует спрайт без
 *     пака и требует вшитые кадры.
 *  2. ЧУЖОЙ ИЛИ НЕДОДЕЛАННЫЙ ПАК. Канал отдал пак без одного состояния или с числом
 *     якорей, не равным числу кадров, — брать его нельзя. Замер 03.09.2026 показал,
 *     почему это не выдумка: ссылки из задания вели на версию 1.0.0 и отдавали 404,
 *     паки уехали на 1.0.2. Плохой ответ обязан кончаться вшитыми кадрами.
 *  3. ЯКОРИ ОТ ЧУЖОЙ СЪЁМКИ. У канала свои кадры и свои позы. Посадить вещь по
 *     замеру вшитых кадров — это жалоба Вали 19.08.2026 («бабочка то на пузе, то на
 *     хвосте») заново. Проба требует, чтобы якорь пришёл из пака и МЕНЯЛСЯ по кадрам.
 */
jest.mock('@/src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: { text: '#000', textSecondary: '#888', surface: '#fff', border: '#ccc', background: '#fff' } }),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));

import PetSprite, { petAnchor, petHeadCenter } from '@/src/components/pet/PetSprite';
import { __setChannelPack, __resetChannel, channelPack, loadMascotChannel, type ChannelPack } from '@/src/services/mascotChannel';

beforeAll(() => {
  const g = globalThis as unknown as { window?: { dispatchEvent?: () => void } };
  g.window = g.window ?? {};
  if (!g.window.dispatchEvent) g.window.dispatchEvent = () => {};
});

afterEach(() => { __resetChannel(); });

const якорь = (x: number, y: number) => ({ x, y, scale: 1, rotate: 0 });
function пакИз(кадров: number, сдвиг = 0): ChannelPack {
  const состояние = (имя: string) => ({
    size: 300, frames: кадров, fps: 7,
    strip: `https://mascot.asibots.pro/packs/synapse-cat/1.0.2/${имя}/walk-strip.png`,
    anchors: Array.from({ length: кадров }, (_, i) => ({
      head_top: якорь(40 + i + сдвиг, 20 + i), eyes: якорь(50 + i + сдвиг, 38 + i), neck: якорь(49, 67),
    })),
  });
  return { version: '1.0.2', states: { walk: состояние('walk'), idle: состояние('idle'), wave: состояние('wave'), jump: состояние('jump'), sleep: состояние('sleep') } };
}

function нарисовать(props: Record<string, unknown>) {
  let t!: renderer.ReactTestRenderer;
  act(() => { t = renderer.create(<PetSprite state="idle" size={60} skin="cat" {...props} />); });
  return t.root;
}
function картинки(root: ReturnType<typeof нарисовать>) {
  return root.findAll((у) => typeof у.type === 'string' ? false : String((у.type as { displayName?: string })?.displayName || '') === 'Image'
    || !!(у.props as Record<string, unknown>).source);
}

describe('маскот-канал: приёмная сторона', () => {
  it('🔴 без канала питомец рисуется вшитыми кадрами — самолётный режим не стирает его', () => {
    expect(channelPack('cat')).toBeUndefined();
    const root = нарисовать({});
    const src = картинки(root).map((n) => (n.props as Record<string, unknown>).source);
    expect(src.length).toBeGreaterThan(0);
    // Вшитый кадр — это ресурс сборки (число или объект без uri), а не ссылка.
    const ссылок = src.filter((s) => typeof s === 'object' && s !== null && 'uri' in (s as object)).length;
    expect(`ссылок ${ссылок} из ${src.length}`).toBe(`ссылок 0 из ${src.length}`);
  });

  it('🔴 с паком канала рисуется ЛИСТ, сдвинутый на текущий кадр', () => {
    __setChannelPack('cat', пакИз(6));
    const root = нарисовать({});
    const кадры = картинки(root).filter((n) => {
      const s = (n.props as Record<string, unknown>).source as { uri?: string } | undefined;
      return !!s?.uri;
    });
    expect(кадры.length).toBe(1);                      // один лист, а не стопка кадров
    const st = ([] as Record<string, unknown>[]).concat((кадры[0].props as Record<string, unknown>).style as never)
      .reduce((a, x) => ({ ...a, ...(x || {}) }), {} as Record<string, unknown>);
    expect(st.width).toBe(60 * 6);                     // лист растянут на все кадры
    expect(st.left).toBe(-0);                          // нулевой кадр — без сдвига
    expect(String((кадры[0].props as { source: { uri: string } }).source.uri)).toContain('/idle/walk-strip.png');
  });

  it('🔴 якорь берётся из пака и МЕНЯЕТСЯ по кадрам — иначе вещь снова уедет', () => {
    const свои = [0, 1, 2].map((f) => petAnchor('cat', 'idle', f, 'eyes'));
    __setChannelPack('cat', пакИз(6, 7));
    const канальные = [0, 1, 2].map((f) => petAnchor('cat', 'idle', f, 'eyes'));
    expect(канальные[0].x).toBe(57);                                   // 50 + 0 + сдвиг 7
    expect(канальные[1].x).toBe(58);
    expect(new Set(канальные.map((a) => a.x)).size).toBe(3);           // по кадрам разные
    expect(канальные[0].x).not.toBe(свои[0].x);                        // и это НЕ вшитый замер
  });

  it('центр головы для медальона тоже считается по кадрам канала', () => {
    const было = petHeadCenter('cat', 'idle');
    __setChannelPack('cat', пакИз(6, 7));
    const стало = petHeadCenter('cat', 'idle');
    expect(стало.x).toBeCloseTo(57 + 2.5, 5);     // среднее по шести кадрам 57..62
    expect(стало.x).not.toBeCloseTo(было.x, 5);
  });

  it('🔴 вещь садится по якорю КАНАЛА, а не по замеру вшитых кадров', () => {
    /**
     * Ради этого переезд и делался. Замер 03.09.2026, глаза в среднем по кадрам
     * покоя (проценты высоты кадра): кот вшитые 49.2 против канальных 38.8,
     * робот 71.8 против 57.6. То есть очки, посаженные по старому замеру на новую
     * съёмку, оказались бы у кота на 10 процентов кадра ниже глаз, у робота на 14 —
     * это морда и грудь. Проверяем НАРИСОВАННОЕ положение, а не таблицу.
     */
    const где = (пак: ChannelPack | null) => {
      __resetChannel();
      if (пак) __setChannelPack('cat', пак);
      const root = нарисовать({ accessory: 'glasses' });
      const узлы = root.findAll((у) => {
        const st = ([] as Record<string, unknown>[]).concat((у.props as Record<string, unknown>).style as never)
          .reduce((a, x) => ({ ...a, ...(x || {}) }), {} as Record<string, unknown>);
        return st.position === 'absolute' && typeof st.top === 'number' && typeof st.left === 'number' && !!(у.props as Record<string, unknown>).pointerEvents;
      });
      const st = ([] as Record<string, unknown>[]).concat((узлы[0].props as Record<string, unknown>).style as never)
        .reduce((a, x) => ({ ...a, ...(x || {}) }), {} as Record<string, unknown>);
      return { top: Number(st.top), height: Number(st.height) };
    };
    // Якорь глаз пака: y = 38 у нулевого кадра при размере 60 → центр вещи ≈ 22.8 px.
    const свои = где(null);
    const канальные = где(пакИз(6));
    expect(свои.top).not.toBeCloseTo(канальные.top, 1);
    // Очки садятся ЦЕНТРОМ видимой части на точку глаз — проверяем именно это.
    const кан = пакИз(6);
    const глазаY = (кан.states.idle.anchors[0].eyes.y / 100) * 60;
    const серединаВещи = канальные.top + канальные.height * (0.318 + 0.361 / 2);
    expect(Math.abs(серединаВещи - глазаY)).toBeLessThan(1);
  });

  it('🔴 недоделанный пак канала не берётся: остаются вшитые кадры', async () => {
    const битые: Record<string, unknown> = {
      'channels/stable.json': { packs: { 'synapse-cat': { version: '1.0.2', path: 'packs/synapse-cat/1.0.2/' } } },
      'packs/synapse-cat/1.0.2/pack.json': {
        apps: { psygames: true },
        states: { walk: 'walk/anim.json', idle: 'idle/anim.json', wave: 'wave/anim.json', jump: 'jump/anim.json', sleep: 'sleep/anim.json' },
      },
      // 6 кадров, но якорей 2 — ровно тот случай, когда вещь села бы мимо
      anim: { size: 300, frames: 6, fps: 7, strip: 'walk-strip.png', anchors: [{ head_top: {}, eyes: {}, neck: {} }, { head_top: {}, eyes: {}, neck: {} }] },
    };
    const было = globalThis.fetch;
    (globalThis as unknown as { fetch: unknown }).fetch = async (url: string) => {
      const ключ = Object.keys(битые).find((k) => String(url).includes(k)) ?? 'anim';
      return { ok: true, json: async () => битые[ключ] } as unknown as Response;
    };
    await loadMascotChannel();
    (globalThis as unknown as { fetch: unknown }).fetch = было;
    expect(channelPack('cat')).toBeUndefined();
  });

  it('🔴 канал молчит — загрузка не падает и не стирает питомца', async () => {
    const было = globalThis.fetch;
    (globalThis as unknown as { fetch: unknown }).fetch = async () => { throw new Error('нет сети'); };
    await expect(loadMascotChannel()).resolves.toBeUndefined();
    (globalThis as unknown as { fetch: unknown }).fetch = было;
    expect(channelPack('cat')).toBeUndefined();
    expect(картинки(нарисовать({})).length).toBeGreaterThan(0);
  });
});
