/* psygames-navigator-input · VER 1 · 19.08.2026 */
import { homeSectorForBearing } from './geometry';
import type {
  CardinalDirection,
  HomeSector,
  TurnInstruction,
} from './types';

export function cardinalFromKey(key: string): CardinalDirection | null {
  const normalized = key.toLowerCase();
  if (normalized === 'arrowup' || normalized === 'w') return 'north';
  if (normalized === 'arrowright' || normalized === 'd') return 'east';
  if (normalized === 'arrowdown' || normalized === 's') return 'south';
  if (normalized === 'arrowleft' || normalized === 'a') return 'west';
  return null;
}

export function cardinalFromSwipe(
  deltaX: number,
  deltaY: number,
  threshold = 24,
): CardinalDirection | null {
  if (Math.hypot(deltaX, deltaY) < threshold) return null;
  if (Math.abs(deltaX) > Math.abs(deltaY)) return deltaX > 0 ? 'east' : 'west';
  return deltaY > 0 ? 'south' : 'north';
}

export function turnFromKey(key: string): TurnInstruction | null {
  const normalized = key.toLowerCase();
  if (normalized === 'arrowleft' || normalized === 'a') return 'left';
  if (normalized === 'arrowright' || normalized === 'd') return 'right';
  if (normalized === 'arrowup' || normalized === 'w' || normalized === ' ') return 'straight';
  return null;
}

export function turnFromSwipe(
  deltaX: number,
  deltaY: number,
  threshold = 24,
): TurnInstruction | null {
  if (Math.hypot(deltaX, deltaY) < threshold) return null;
  if (Math.abs(deltaX) > Math.abs(deltaY)) return deltaX > 0 ? 'right' : 'left';
  return deltaY < 0 ? 'straight' : null;
}

export function homeSectorFromKey(key: string): HomeSector | null {
  const normalized = key.toLowerCase();
  const byKey: Record<string, HomeSector> = {
    '8': 'north',
    '9': 'north-east',
    '6': 'east',
    '3': 'south-east',
    '2': 'south',
    '1': 'south-west',
    '4': 'west',
    '7': 'north-west',
    arrowup: 'north',
    arrowright: 'east',
    arrowdown: 'south',
    arrowleft: 'west',
    w: 'north',
    d: 'east',
    s: 'south',
    a: 'west',
  };
  return byKey[normalized] ?? null;
}

export function homeSectorFromSwipe(
  deltaX: number,
  deltaY: number,
  threshold = 24,
): HomeSector | null {
  if (Math.hypot(deltaX, deltaY) < threshold) return null;
  const bearing = Math.atan2(deltaX, -deltaY) * 180 / Math.PI;
  return homeSectorForBearing(bearing);
}
