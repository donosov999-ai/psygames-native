/* psygames-number-run-types · VER 1 · 12.09.2026 · psygames-claude-mac */
/**
 * ТИПЫ ПЕРЕНЕСЁННЫХ МОДУЛЕЙ ЛАБОРАТОРИИ.
 *
 * Сами модули — `.mjs` без типов: так их написал `psygames-codex-mac` в
 * `renderer-lab`, и переписывать их в TypeScript при переносе запрещено
 * инструкцией («сохранить механику», «изменение упаковки не повод объявить
 * новую механику»). Поэтому типы живут отдельным файлом рядом.
 *
 * ⚠️ ЭТО ОПИСЬ, А НЕ ИСТОЧНИК ИСТИНЫ. Если подпись в `.mjs` изменится, TypeScript
 * об этом НЕ узнает — он поверит этому файлу. Поэтому здесь описано ровно то, чем
 * пользуется адаптер, и `состояние` намеренно оставлено широким: раскрывать его
 * поля тут значило бы завести вторую копию контракта, которая тихо разойдётся с
 * первой. Проверка механики — на тестах ядра (45 штук), а не на этих типах.
 */

declare module '*/runner-core.mjs' {
  export const CORE_VERSION: string;
  export const FIXED_DT: number;
  /** Состояние забега. Форму держит ядро; адаптер читает sum/stage/status/elapsed. */
  export type СостояниеЗабега = Record<string, any>;
  export function initial(course: any): СостояниеЗабега;
  export function setTarget(s: СостояниеЗабега, x: number): СостояниеЗабега;
  export function changeLane(s: СостояниеЗабега, delta: number): СостояниеЗабега;
  export function pause(s: СостояниеЗабега, reason?: string): СостояниеЗабега;
  export function resume(s: СостояниеЗабега): СостояниеЗабега;
  export function step(s: СостояниеЗабега, dt: number, course: any): СостояниеЗабега;
  /** Дробит большой кадр на шаги FIXED_DT — в `step` большой dt подавать нельзя. */
  export function advanceFrame(s: СостояниеЗабега, dt: number, course: any): СостояниеЗабега;
  export function numberScale(value: number): number;
  export function jumpHeight(s: СостояниеЗабега): number;
  /** Упрощённая проверка маршрута, НЕ восстановление произвольного прохода. */
  export function replay(course: any, lanes: number[]): number;
}

declare module '*/runner-campaign.mjs' {
  export const CAMPAIGN_VERSION: string;
  export const STAGE_COUNT: number;
  export function makeCampaign(seed?: number): any;
}

declare module '*/runner-levels.mjs' {
  export const LEVELS: any[];
  export function makeCourse(...args: any[]): any;
  export function applyOperation(...args: any[]): number;
  export function solveCourse(...args: any[]): any;
  export function stationaryWins(...args: any[]): boolean;
  export function parseRule(...args: any[]): any;
  export function meets(...args: any[]): boolean;
  export function ruleDifference(...args: any[]): number;
  export function ruleText(...args: any[]): string;
}

declare module '*/runner-scene.mjs' {
  export interface Сцена {
    canvas: HTMLCanvasElement;
    dpr: number;
    load(course: any): void;
    render(state: any, time: number): void;
    destroy(): void;
  }
  export function createScene(container: HTMLElement): Сцена;
}

declare module '*/runner-numerals.mjs' {
  export function createNumerals(...args: any[]): any;
}

declare module '*/runner-storage.mjs' {
  export const STORAGE_KEY: string;
  export const LEGACY_KEY: string;
  export function emptyProgress(): any;
  /** Валидация сохранённого прогресса — при переносе НЕ выбрасывать. */
  export function decodeProgress(raw: string | null): any;
}
