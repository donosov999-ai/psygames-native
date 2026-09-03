/* psygames-mascot-channel · VER 1 · 03.09.2026 */
/**
 * ПРИЁМНАЯ СТОРОНА МАСКОТ-КАНАЛА: облики питомца приезжают с сервиса, а не только
 * из бандла.
 *
 * ЗАЧЕМ (решение Дениса 07.08.2026, задача e1cd469e). Синапс переведён под
 * маскот-сервис: там его пересобирают, там же переснимают состояния. Пока кадры
 * лежали только в бандле, любая перерисовка требовала выпуска приложения — то есть
 * дней ожидания магазинов ради картинки.
 *
 * 🔴 КАНАЛ — ПЕРВЫЙ ИСТОЧНИК, А НЕ ЗАМЕНА. Приложение обязано работать без сети:
 * вшитые кадры остаются на месте и рисуются, пока канал не ответил, не ответил
 * вовремя или ответил мусором. Самолётный режим не должен стирать питомца.
 *
 * ⚠️ ПУТЬ ПАКА БЕРЁТСЯ ИЗ МАНИФЕСТА, А НЕ ЗАШИВАЕТСЯ. Проверка 03.09.2026: в
 * задаче стояли ссылки на версию 1.0.0 — все пять листов отдавали 404, потому что
 * паки уехали на 1.0.2. Манифест при этом верен. Зашитая версия ломается молча,
 * и по картинке этого не видно: рисуется вшитое, будто канала и нет.
 *
 * ⚠️ ОБЛИК ПЕРЕКЛЮЧАЕТСЯ ЦЕЛИКОМ ИЛИ НЕ ПЕРЕКЛЮЧАЕТСЯ ВОВСЕ. Пока не приехали и
 * не раскодированы ВСЕ пять состояний, рисуем вшитое. Иначе питомец шёл бы
 * каналом, а спал вшитым — две разные съёмки в одном облике, и переход между
 * ними виден рывком.
 *
 * ⚠️ ЯКОРИ ЕДУТ ВМЕСТЕ С КАДРАМИ. Аксессуар садится по якорю КОНКРЕТНОГО кадра
 * (жалоба Вали 19.08.2026 — «бабочка то на пузе, то на хвосте»), а у канала своя
 * съёмка и свои кадры. Взять новые картинки со старыми якорями значило бы вернуть
 * ту же жалобу: в канале `<состояние>/anim.json` несёт массив `anchors` по кадрам,
 * и берём мы его оттуда же, откуда и лист.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'react-native';

export const MASCOT_BASE = 'https://mascot.asibots.pro';
const MANIFEST = `${MASCOT_BASE}/channels/stable.json`;
const CACHE_KEY = 'psygames_mascot_channel_v1';
/** Сеть не должна держать питомца: не ответили — рисуем вшитое и живём дальше. */
const TIMEOUT_MS = 8000;

export type ChannelAnchor = { x: number; y: number; scale: number; rotate: number };
export type ChannelFrameAnchors = { head_top: ChannelAnchor; eyes: ChannelAnchor; neck: ChannelAnchor };
export type ChannelState = {
  size: number;
  frames: number;
  fps: number;
  strip: string;               // абсолютный URL листа
  anchors: ChannelFrameAnchors[];
};
export type ChannelPack = { version: string; states: Record<string, ChannelState> };

/** Какой пак канала соответствует какому облику приложения. */
export const PACK_OF_SKIN: Record<string, string> = {
  cat: 'synapse-cat',
  robot: 'synapse-robot',
  constellation: 'synapse-constellation',
};

const НУЖНЫ = ['walk', 'idle', 'wave', 'jump', 'sleep'] as const;

let готовые: Record<string, ChannelPack> = {};
const слушатели = new Set<() => void>();

/** Пак облика, если он ПОЛНОСТЬЮ приехал. Иначе undefined — рисуем вшитое. */
export function channelPack(skin: string): ChannelPack | undefined {
  return готовые[skin];
}

export function onChannelChange(fn: () => void): () => void {
  слушатели.add(fn);
  return () => { слушатели.delete(fn); };
}

/** Только для проб: подставить пак и очистить. */
export function __setChannelPack(skin: string, pack: ChannelPack | undefined): void {
  if (pack) готовые[skin] = pack; else delete готовые[skin];
  слушатели.forEach((f) => f());
}
export function __resetChannel(): void { готовые = {}; слушатели.forEach((f) => f()); }

async function взять(url: string): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

/** Проверка формы: чужой или недоделанный пак не должен доехать до экрана. */
function годен(s: any): s is ChannelState {
  return !!s && typeof s.size === 'number' && s.size > 0
    && typeof s.frames === 'number' && s.frames > 0
    && typeof s.strip === 'string' && s.strip.length > 0
    && Array.isArray(s.anchors) && s.anchors.length === s.frames
    && s.anchors.every((a: any) => a && a.head_top && a.eyes && a.neck);
}

async function собратьПак(base: string, path: string, version: string): Promise<ChannelPack | null> {
  const packUrl = `${base}/${path}pack.json`;
  const pack = await взять(packUrl);
  if (!pack || pack.apps?.psygames !== true) return null;   // пак не для нас
  const states: Record<string, ChannelState> = {};
  for (const st of НУЖНЫ) {
    const rel = pack.states?.[st];
    if (!rel) return null;                                   // состояние отсутствует — облик неполный
    const anim = await взять(`${base}/${path}${rel}`);
    const dir = String(rel).split('/').slice(0, -1).join('/');
    const s: ChannelState = {
      size: anim?.size, frames: anim?.frames, fps: anim?.fps || 6,
      strip: `${base}/${path}${dir}/${anim?.strip}`,
      anchors: anim?.anchors,
    };
    if (!годен(s)) return null;
    states[st] = s;
  }
  return { version, states };
}

/**
 * Загрузить облики канала. Зовётся один раз при старте; ошибки глотаются нарочно —
 * канал это улучшение, а не условие работы.
 *
 * ⚠️ Кэш держим ТОЛЬКО на описания (json). Сами листы кэширует загрузчик картинок
 * платформы, и дублировать его в AsyncStorage значило бы хранить мегабайты дважды.
 */
let вЗагрузке: Promise<void> | null = null;
/**
 * 🔴 ЗАГРУЗКУ ЗОВЁТ ТОТ, КОМУ ОНА НУЖНА — САМ ПИТОМЕЦ, А НЕ КОРЕНЬ ПРИЛОЖЕНИЯ.
 *
 * Замер 03.09.2026 на симуляторе: эффект в корневом слое `app/_layout.tsx` до
 * загрузчика не доходил — внутренний журнал оставался ПУСТЫМ, то есть не
 * выполнилась даже первая строка. Ставить диагноз корню незачем: питомец знает
 * сам, когда ему нужен облик, и первый же его показ и есть верный момент.
 * Повторных заходов нет — обещание одно на весь запуск.
 */
export function ensureMascotChannel(): void {
  if (!вЗагрузке) вЗагрузке = loadMascotChannel().catch(() => {});
}

export async function loadMascotChannel(): Promise<void> {
  // 1. Мгновенно — из кэша прошлого запуска: без сети облик всё равно не вшитый.
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) {
      const кэш = JSON.parse(raw) as Record<string, ChannelPack>;
      for (const [skin, pack] of Object.entries(кэш)) {
        if (pack?.states && НУЖНЫ.every((st) => годен(pack.states[st]))) {
          if (await прогреть(pack)) { готовые[skin] = pack; }
        }
      }
      if (Object.keys(готовые).length) слушатели.forEach((f) => f());
    }
  } catch { /* порченый кэш — не беда, ниже перезапишем */ }

  // 2. Затем — свежее с канала.
  try {
    const man = await взять(MANIFEST);
    const свежие: Record<string, ChannelPack> = {};
    for (const [skin, packId] of Object.entries(PACK_OF_SKIN)) {
      const рек = man?.packs?.[packId];
      if (!рек?.path) continue;
      if (готовые[skin]?.version === рек.version) { свежие[skin] = готовые[skin]; continue; }
      const pack = await собратьПак(MASCOT_BASE, String(рек.path), String(рек.version));
      if (pack && await прогреть(pack)) свежие[skin] = pack;
    }
    if (Object.keys(свежие).length) {
      готовые = { ...готовые, ...свежие };
      слушатели.forEach((f) => f());
      try { await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(готовые)); } catch { /* кэш — удобство */ }
    }
  } catch { /* нет сети или канал молчит — вшитые кадры уже рисуются */ }
}

/**
 * Скачать и раскодировать листы ДО показа. Без этого первый кадр канала пустой:
 * компонент уже переключился на новый источник, а картинка ещё едет.
 */
async function прогреть(pack: ChannelPack): Promise<boolean> {
  try {
    const все = НУЖНЫ.map((st) => pack.states[st]?.strip).filter(Boolean) as string[];
    /**
     * ⚠️ УСПЕХ — ЭТО «НЕ БРОСИЛО», А НЕ «ВЕРНУЛО true». Замер 03.09.2026 в вебе:
     * все 34 запроса к каналу отдали 200, листы скачались — и облик всё равно не
     * включился, потому что `Image.prefetch` в react-native-web разрешается БЕЗ
     * значения, а проверка стояла `every(Boolean)`. Питомец рисовался вшитым при
     * полностью исправном канале, и по картинке это неотличимо от «нет сети».
     */
    const ok = await Promise.all(все.map((u) => Image.prefetch(u).then(() => true).catch(() => false)));
    return ok.every(Boolean);
  } catch { return false; }
}
