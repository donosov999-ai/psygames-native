/* eslint-disable import/first */
import React from 'react';
import renderer, { act } from 'react-test-renderer';

/**
 * 🔴 КАДРЫ КАНАЛА ОБЯЗАНЫ ПОПАДАТЬ В СНИМОК ЭКРАНА.
 *
 * Отчёт 6734447a (04.09.2026, iPhone, v2.37.48): «кот дырявый» — на приложенном
 * снимке пустое место вместо питомца и пустые все четыре карточки обликов, при
 * том что в самом приложении кот был виден. Денис: «он на скрине пропадает».
 *
 * Причина не в питомце, а в способе доставки кадров. Снимок делает html2canvas по
 * DOM и КАЖДУЮ картинку перекачивает заново в CORS-режиме (`useCORS: true` в
 * `appFeedback.captureScreenshot`). Листы канала лежат на `mascot.asibots.pro` —
 * это R2 за Cloudflare, и он, как всякий S3-совместимый бакет, отдаёт
 * `Access-Control-Allow-Origin` и `Vary: Origin` ТОЛЬКО при наличии заголовка
 * `Origin` в запросе. Обычный `<img>` его не шлёт → в кэш (max-age 14400) ложится
 * ответ без разрешения и без `Vary` → следующий запрос того же адреса в
 * CORS-режиме достаёт из кэша именно его, проверку не проходит, и html2canvas
 * молча выбрасывает картинку.
 *
 * 📍 Замер 04.09.2026 в браузере, один свежий адрес, два порядка обращения:
 *      CORS-загрузка первой           → ok
 *      обычная, следом CORS тем же URL → ОШИБКА
 *
 * Лечение — не договариваться с кэшем (`crossOrigin` в react-native-web у `Image`
 * не поддерживается, а заголовок на кромке CF нам не поправить: `mascot.asibots.pro`
 * это CNAME на `public.r2.dev`, токен зоны прав на Transform Rules не имеет), а
 * убрать чужой origin из DOM: лист скачивается ОДИН раз честным CORS-запросом и
 * дальше живёт как `blob:`.
 *
 * ⚠️ ЭТА ПРОБА СМОТРИТ НА ОТРИСОВАННОЕ, А НЕ НА ИСХОДНИК. Проверяется адрес,
 * который компонент реально отдал в `<Image source>` после загрузки канала.
 */
jest.mock('@/src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: { text: '#000', textSecondary: '#888', surface: '#fff', border: '#ccc', background: '#fff' } }),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));

import PetSprite from '@/src/components/pet/PetSprite';
import {
  MASCOT_BASE, loadMascotChannel, channelPack, __resetChannel,
} from '@/src/services/mascotChannel';

const СЕРВИС = MASCOT_BASE;
const СОСТОЯНИЯ = ['walk', 'idle', 'wave', 'jump', 'sleep'] as const;

type Запрос = { url: string; mode?: string };
let запросы: Запрос[] = [];
let выданных = 0;

const якорь = (x: number, y: number) => ({ x, y, scale: 1, rotate: 0 });

/** Канал отвечает как настоящий: манифест → pack.json → anim.json по состояниям. */
function поднятьКанал(): void {
  запросы = [];
  выданных = 0;
  (globalThis as unknown as { fetch: unknown }).fetch = (async (url: string, init?: { mode?: string }) => {
    запросы.push({ url: String(url), mode: init?.mode });
    const u = String(url);
    const json = (o: unknown) => ({ ok: true, status: 200, json: async () => o });
    if (u.endsWith('/channels/stable.json')) {
      return json({ packs: {
        'synapse-cat': { version: '1.0.4', path: 'packs/synapse-cat/1.0.4/' },
        'synapse-robot': { version: '1.0.4', path: 'packs/synapse-robot/1.0.4/' },
        'synapse-constellation': { version: '1.0.4', path: 'packs/synapse-constellation/1.0.4/' },
      } });
    }
    if (u.endsWith('pack.json')) {
      const states: Record<string, string> = {};
      for (const st of СОСТОЯНИЯ) states[st] = `${st}/anim.json`;
      return json({ apps: { psygames: true }, states });
    }
    if (u.endsWith('anim.json')) {
      return json({
        size: 300, frames: 4, fps: 7, strip: 'walk-strip.png',
        anchors: Array.from({ length: 4 }, (_, i) => ({
          head_top: якорь(40 + i, 20), eyes: якорь(50 + i, 38), neck: якорь(49, 67),
        })),
      });
    }
    // сам лист — байты
    выданных += 1;
    return { ok: true, status: 200, blob: async () => ({ size: 4096, type: 'image/png' }) };
  }) as unknown as typeof fetch;
}

beforeAll(() => {
  const g = globalThis as unknown as {
    window?: { dispatchEvent?: () => void };
    URL: { createObjectURL?: (b: unknown) => string; revokeObjectURL?: (u: string) => void };
  };
  g.window = g.window ?? {};
  if (!g.window.dispatchEvent) g.window.dispatchEvent = () => {};
  let n = 0;
  g.URL.createObjectURL = () => `blob:http://localhost/лист-${++n}`;
  g.URL.revokeObjectURL = () => {};
});

afterEach(() => { __resetChannel(); });

function адресаКартинок(state: 'idle' | 'walk' = 'idle'): string[] {
  let t!: renderer.ReactTestRenderer;
  act(() => { t = renderer.create(<PetSprite state={state} size={60} skin="cat" />); });
  const найдено: string[] = [];
  t.root.findAll((у) => {
    const src = (у.props as { source?: { uri?: string } })?.source;
    if (src && typeof src === 'object' && typeof src.uri === 'string') найдено.push(src.uri);
    return false;
  });
  return найдено;
}

test('после загрузки канала питомец рисуется своим origin, а не адресом сервиса', async () => {
  поднятьКанал();
  await act(async () => { await loadMascotChannel(); });

  // канал действительно включился — иначе проба ничего не проверяет
  expect(channelPack('cat')).toBeTruthy();

  const адреса = адресаКартинок('idle');
  expect(адреса.length).toBeGreaterThan(0);
  for (const u of адреса) {
    expect(u.startsWith(СЕРВИС)).toBe(false);   // ← из-за этого кот пропадал со снимка
    expect(u.startsWith('blob:')).toBe(true);
  }
});

test('лист берётся ровно одним CORS-запросом — второго, обычного, быть не должно', async () => {
  поднятьКанал();
  await act(async () => { await loadMascotChannel(); });

  const заЛистами = запросы.filter((з) => з.url.endsWith('walk-strip.png'));
  expect(заЛистами.length).toBe(выданных);
  expect(заЛистами.length).toBeGreaterThan(0);
  // ⚠️ Именно `mode: 'cors'`: без него ответ приедет без разрешения и отравит кэш
  // на 4 часа — ровно то, из-за чего снимок терял картинки.
  for (const з of заЛистами) expect(з.mode).toBe('cors');
});

test('не смог втянуть лист — облик не публикуется, рисуются вшитые кадры', async () => {
  поднятьКанал();
  const прежний = globalThis.fetch;
  (globalThis as unknown as { fetch: unknown }).fetch = (async (url: string, init?: { mode?: string }) => {
    if (String(url).endsWith('walk-strip.png')) return { ok: false, status: 403 };
    return (прежний as unknown as (u: string, i?: unknown) => Promise<unknown>)(url, init);
  }) as unknown as typeof fetch;

  await act(async () => { await loadMascotChannel(); });

  expect(channelPack('cat')).toBeUndefined();
  // и на экране всё равно кот: вшитые кадры — не uri, а ресурс сборки
  const адреса = адресаКартинок('idle');
  for (const u of адреса) expect(u.startsWith(СЕРВИС)).toBe(false);
});

test('кэш отравлен прошлой версией — лист берётся повторно мимо кэша, облик включается', async () => {
  поднятьКанал();
  const прежний = globalThis.fetch as unknown as (u: string, i?: { cache?: string }) => Promise<unknown>;
  const попытки: (string | undefined)[] = [];
  (globalThis as unknown as { fetch: unknown }).fetch = (async (url: string, init?: { cache?: string; mode?: string }) => {
    if (String(url).endsWith('walk-strip.png')) {
      попытки.push(init?.cache);
      // ⚠️ Так ведёт себя браузер с отравленной записью: обычный CORS-запрос
      // отвергается ещё до ответа сервера — «No Access-Control-Allow-Origin».
      if (init?.cache !== 'reload') throw new TypeError('blocked by CORS policy');
      выданных += 1;
      return { ok: true, status: 200, blob: async () => ({ size: 4096, type: 'image/png' }) };
    }
    return прежний(url, init);
  }) as unknown as typeof fetch;

  await act(async () => { await loadMascotChannel(); });

  expect(channelPack('cat')).toBeTruthy();                 // облик всё-таки включился
  expect(попытки).toContain('reload');                     // именно мимо кэша
  for (const u of адресаКартинок('idle')) expect(u.startsWith('blob:')).toBe(true);
});
