/* psygames-pause-image-effects · VER 1 · 26.08.2026 */
import type { VisualGuideFrame } from './engine';

/**
 * Clean-room implementations of common pixel operations requested after
 * inspecting Denis/Claude's local WireChanger research prototype. That source
 * only informed the effect inventory and remains outside this repository:
 * /Users/denisonosov/Downloads/Code claude/wirechanger-effects/generator.html
 *
 * No WireChanger binary, preset, artwork, branding, or source file is included.
 * This module is deterministic and DOM-free. Expensive modifiers are prepared
 * once; phase animation uses the cheap recipe returned by buildImagePhaseRecipe.
 */

export type ImageEffectId =
  | 'black-white'
  | 'xray'
  | 'colour-glass'
  | 'blur'
  | 'emboss'
  | 'color-planes'
  | 'sharpen'
  | 'water-colour'
  | 'brightness-noise'
  | 'kaleidoscope'
  | 'fractal-julia'
  | 'mosaic';

export type ImageEffectCost = 'realtime-filter' | 'precompute-light' | 'precompute-heavy';

export interface ImageEffectDefinition {
  readonly id: ImageEffectId;
  readonly titleRu: string;
  readonly titleEn: string;
  readonly cost: ImageEffectCost;
  readonly deterministic: true;
}

export const IMAGE_EFFECT_CATALOG: readonly ImageEffectDefinition[] = [
  { id: 'black-white', titleRu: 'Чёрно-белый', titleEn: 'Black and white', cost: 'realtime-filter', deterministic: true },
  { id: 'xray', titleRu: 'Рентген', titleEn: 'X-ray', cost: 'realtime-filter', deterministic: true },
  { id: 'colour-glass', titleRu: 'Цветное стекло', titleEn: 'Colour glass', cost: 'precompute-light', deterministic: true },
  { id: 'blur', titleRu: 'Размытие', titleEn: 'Blur', cost: 'realtime-filter', deterministic: true },
  { id: 'emboss', titleRu: 'Тиснение', titleEn: 'Emboss', cost: 'precompute-light', deterministic: true },
  { id: 'color-planes', titleRu: 'Цветовые плоскости', titleEn: 'Color planes', cost: 'precompute-light', deterministic: true },
  { id: 'sharpen', titleRu: 'Резкость', titleEn: 'Sharpen', cost: 'precompute-light', deterministic: true },
  { id: 'water-colour', titleRu: 'Акварель', titleEn: 'Water-colour', cost: 'precompute-heavy', deterministic: true },
  { id: 'brightness-noise', titleRu: 'Яркостный шум', titleEn: 'Brightness noise', cost: 'precompute-light', deterministic: true },
  { id: 'kaleidoscope', titleRu: 'Калейдоскоп', titleEn: 'Kaleidoscope', cost: 'precompute-heavy', deterministic: true },
  { id: 'fractal-julia', titleRu: 'Фрактал Julia', titleEn: 'Julia fractal', cost: 'precompute-heavy', deterministic: true },
  { id: 'mosaic', titleRu: 'Мозаика', titleEn: 'Mosaic', cost: 'precompute-light', deterministic: true },
] as const;

export interface PixelSurface {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export type ImageEffectParameters = Readonly<Record<string, number | boolean>>;

export interface ImageEffectRequest {
  readonly id: ImageEffectId;
  readonly parameters?: ImageEffectParameters;
  readonly seed?: number;
}

export interface ImagePhaseOptions {
  readonly reducedMotion?: boolean;
  readonly lowPower?: boolean;
  readonly mirrorEdges?: boolean;
  /** False for a non-breath cue: keeps the image at a neutral static phase. */
  readonly animatePhase?: boolean;
}

export interface ImagePhaseRecipe {
  readonly scale: number;
  readonly saturation: number;
  readonly grayscale: number;
  readonly blurPx: number;
  readonly brightness: number;
  readonly contrast: number;
  readonly pixelSize: number;
  readonly mirrorEdges: boolean;
  readonly updateIntervalMs: number;
  readonly cssFilter: string;
}

function assertDimension(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 8_192) {
    throw new Error(`${label} must be an integer between 1 and 8192`);
  }
}

function assertSurface(surface: PixelSurface): void {
  assertDimension(surface.width, 'width');
  assertDimension(surface.height, 'height');
  if (surface.data.length !== surface.width * surface.height * 4) {
    throw new Error('Pixel data length does not match width × height × 4');
  }
}

function cloneSurface(surface: PixelSurface): PixelSurface {
  assertSurface(surface);
  return { width: surface.width, height: surface.height, data: new Uint8ClampedArray(surface.data) };
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function parameter(
  parameters: ImageEffectParameters | undefined,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = parameters?.[key];
  const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
  return Math.max(minimum, Math.min(maximum, value));
}

function booleanParameter(parameters: ImageEffectParameters | undefined, key: string, fallback: boolean): boolean {
  const raw = parameters?.[key];
  return typeof raw === 'boolean' ? raw : fallback;
}

function seededRandom(seed: number): () => number {
  let state = (Number.isSafeInteger(seed) ? seed : 0) >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function convolve(surface: PixelSurface, kernel: readonly number[], divisor = 1, offset = 0, grayscale = false): void {
  const size = Math.sqrt(kernel.length);
  if (!Number.isSafeInteger(size) || size % 2 === 0) throw new Error('Kernel must be an odd square');
  const source = new Uint8ClampedArray(surface.data);
  const half = Math.floor(size / 2);
  for (let y = 0; y < surface.height; y += 1) {
    for (let x = 0; x < surface.width; x += 1) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let kernelIndex = 0;
      for (let offsetY = -half; offsetY <= half; offsetY += 1) {
        for (let offsetX = -half; offsetX <= half; offsetX += 1) {
          const sampleX = reflectedIndex(x + offsetX, surface.width);
          const sampleY = reflectedIndex(y + offsetY, surface.height);
          const sourceIndex = (sampleY * surface.width + sampleX) * 4;
          const weight = kernel[kernelIndex++]!;
          red += source[sourceIndex]! * weight;
          green += source[sourceIndex + 1]! * weight;
          blue += source[sourceIndex + 2]! * weight;
        }
      }
      const targetIndex = (y * surface.width + x) * 4;
      if (grayscale) {
        const value = clampByte((red + green + blue) / 3 / divisor + offset);
        surface.data[targetIndex] = value;
        surface.data[targetIndex + 1] = value;
        surface.data[targetIndex + 2] = value;
      } else {
        surface.data[targetIndex] = clampByte(red / divisor + offset);
        surface.data[targetIndex + 1] = clampByte(green / divisor + offset);
        surface.data[targetIndex + 2] = clampByte(blue / divisor + offset);
      }
    }
  }
}

function boxBlur(surface: PixelSurface, radius: number): void {
  const source = new Uint8ClampedArray(surface.data);
  const boundedRadius = Math.max(1, Math.min(10, Math.round(radius)));
  for (let y = 0; y < surface.height; y += 1) {
    for (let x = 0; x < surface.width; x += 1) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let count = 0;
      for (let offsetY = -boundedRadius; offsetY <= boundedRadius; offsetY += 1) {
        for (let offsetX = -boundedRadius; offsetX <= boundedRadius; offsetX += 1) {
          const sampleX = reflectedIndex(x + offsetX, surface.width);
          const sampleY = reflectedIndex(y + offsetY, surface.height);
          const index = (sampleY * surface.width + sampleX) * 4;
          red += source[index]!;
          green += source[index + 1]!;
          blue += source[index + 2]!;
          count += 1;
        }
      }
      const target = (y * surface.width + x) * 4;
      surface.data[target] = red / count;
      surface.data[target + 1] = green / count;
      surface.data[target + 2] = blue / count;
    }
  }
}

function applyOilPaint(surface: PixelSurface, radius: number, levels: number): void {
  const source = new Uint8ClampedArray(surface.data);
  const boundedRadius = Math.max(1, Math.min(7, Math.round(radius)));
  const boundedLevels = Math.max(1, Math.min(32, Math.round(levels)));
  const counts = new Int32Array(boundedLevels);
  const reds = new Int32Array(boundedLevels);
  const greens = new Int32Array(boundedLevels);
  const blues = new Int32Array(boundedLevels);
  for (let y = 0; y < surface.height; y += 1) {
    for (let x = 0; x < surface.width; x += 1) {
      counts.fill(0);
      reds.fill(0);
      greens.fill(0);
      blues.fill(0);
      for (let offsetY = -boundedRadius; offsetY <= boundedRadius; offsetY += 1) {
        for (let offsetX = -boundedRadius; offsetX <= boundedRadius; offsetX += 1) {
          const sampleX = reflectedIndex(x + offsetX, surface.width);
          const sampleY = reflectedIndex(y + offsetY, surface.height);
          const index = (sampleY * surface.width + sampleX) * 4;
          const intensity = Math.min(
            boundedLevels - 1,
            Math.floor(((source[index]! + source[index + 1]! + source[index + 2]!) / 3) * boundedLevels / 256),
          );
          counts[intensity] = counts[intensity]! + 1;
          reds[intensity] = reds[intensity]! + source[index]!;
          greens[intensity] = greens[intensity]! + source[index + 1]!;
          blues[intensity] = blues[intensity]! + source[index + 2]!;
        }
      }
      let dominant = 0;
      for (let level = 1; level < boundedLevels; level += 1) {
        if (counts[level]! > counts[dominant]!) dominant = level;
      }
      const count = Math.max(1, counts[dominant]!);
      const target = (y * surface.width + x) * 4;
      surface.data[target] = reds[dominant]! / count;
      surface.data[target + 1] = greens[dominant]! / count;
      surface.data[target + 2] = blues[dominant]! / count;
    }
  }
}

export function applyImageEffect(input: PixelSurface, request: ImageEffectRequest): PixelSurface {
  const surface = cloneSurface(input);
  const { data, width, height } = surface;
  const params = request.parameters;
  switch (request.id) {
    case 'black-white':
      for (let index = 0; index < data.length; index += 4) {
        const luminance = 0.299 * data[index]! + 0.587 * data[index + 1]! + 0.114 * data[index + 2]!;
        data[index] = luminance;
        data[index + 1] = luminance;
        data[index + 2] = luminance;
      }
      break;
    case 'xray':
      for (let index = 0; index < data.length; index += 4) {
        const luminance = 255 - (0.299 * data[index]! + 0.587 * data[index + 1]! + 0.114 * data[index + 2]!);
        const value = clampByte(luminance * 1.15);
        data[index] = value;
        data[index + 1] = value;
        data[index + 2] = value;
      }
      break;
    case 'colour-glass': {
      const levels = Math.round(parameter(params, 'levels', 5, 2, 8));
      const step = 255 / (levels - 1);
      for (let index = 0; index < data.length; index += 4) {
        for (let channel = 0; channel < 3; channel += 1) {
          data[index + channel] = clampByte(Math.round(data[index + channel]! / step) * step);
        }
        const maximum = Math.max(data[index]!, data[index + 1]!, data[index + 2]!);
        const minimum = Math.min(data[index]!, data[index + 1]!, data[index + 2]!);
        const midpoint = (maximum + minimum) / 2;
        for (let channel = 0; channel < 3; channel += 1) {
          data[index + channel] = clampByte(midpoint + (data[index + channel]! - midpoint) * 1.35);
        }
      }
      break;
    }
    case 'blur':
      boxBlur(surface, parameter(params, 'radius', 5, 2, 10));
      break;
    case 'emboss': {
      const radius = parameter(params, 'radius', 1, 1, 10);
      convolve(surface, [-2 * radius, -radius, 0, -radius, 1, radius, 0, radius, 2 * radius], 1, 128, !booleanParameter(params, 'color', true));
      break;
    }
    case 'color-planes': {
      const levels = Math.round(parameter(params, 'levels', 30, 2, 255));
      const step = 255 / (levels - 1);
      for (let index = 0; index < data.length; index += 4) {
        for (let channel = 0; channel < 3; channel += 1) {
          data[index + channel] = clampByte(Math.round(data[index + channel]! / step) * step);
        }
      }
      break;
    }
    case 'sharpen':
      convolve(surface, [0, -1, 0, -1, 5, -1, 0, -1, 0]);
      break;
    case 'water-colour':
      applyOilPaint(surface, parameter(params, 'radius', 3, 1, 7), parameter(params, 'levels', 12, 1, 32));
      break;
    case 'brightness-noise': {
      const random = seededRandom(request.seed ?? 0);
      const strength = parameter(params, 'strength', 35, 1, 100) / 100 * 160;
      for (let index = 0; index < data.length; index += 4) {
        const noise = (random() - 0.5) * strength;
        data[index] = clampByte(data[index]! + noise);
        data[index + 1] = clampByte(data[index + 1]! + noise);
        data[index + 2] = clampByte(data[index + 2]! + noise);
      }
      break;
    }
    case 'kaleidoscope': {
      const source = new Uint8ClampedArray(data);
      const segments = Math.round(parameter(params, 'segments', 8, 3, 16));
      const centerX = width / 2;
      const centerY = height / 2;
      const segmentAngle = Math.PI * 2 / segments;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const distanceX = x - centerX;
          const distanceY = y - centerY;
          const radius = Math.hypot(distanceX, distanceY);
          let angle = ((Math.atan2(distanceY, distanceX) % segmentAngle) + segmentAngle) % segmentAngle;
          if (angle > segmentAngle / 2) angle = segmentAngle - angle;
          const sourceX = reflectedIndex(Math.round(centerX + Math.cos(angle) * radius), width);
          const sourceY = reflectedIndex(Math.round(centerY + Math.sin(angle) * radius), height);
          const target = (y * width + x) * 4;
          const origin = (sourceY * width + sourceX) * 4;
          data[target] = source[origin]!;
          data[target + 1] = source[origin + 1]!;
          data[target + 2] = source[origin + 2]!;
          data[target + 3] = source[origin + 3]!;
        }
      }
      break;
    }
    case 'fractal-julia': {
      const mix = parameter(params, 'mix', 70, 20, 100) / 100;
      const scale = parameter(params, 'scale', 3, 2, 8);
      const iterations = Math.round(parameter(params, 'iterations', 90, 20, 120));
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          let real = (x / width - 0.5) * scale;
          let imaginary = (y / height - 0.5) * scale;
          let iteration = 0;
          while (real * real + imaginary * imaginary < 4 && iteration < iterations) {
            const nextReal = real * real - imaginary * imaginary - 0.7;
            imaginary = 2 * real * imaginary + 0.27015;
            real = nextReal;
            iteration += 1;
          }
          const ratio = iteration / iterations;
          const target = (y * width + x) * 4;
          const fractalRed = 255 * Math.min(1, ratio * 2);
          const fractalGreen = 255 * ratio;
          const fractalBlue = 255 * (1 - ratio);
          data[target] = clampByte(data[target]! * (1 - mix) + fractalRed * mix);
          data[target + 1] = clampByte(data[target + 1]! * (1 - mix) + fractalGreen * mix);
          data[target + 2] = clampByte(data[target + 2]! * (1 - mix) + fractalBlue * mix);
        }
      }
      break;
    }
    case 'mosaic': {
      const cell = Math.round(parameter(params, 'cell', 18, 4, 60));
      for (let blockY = 0; blockY < height; blockY += cell) {
        for (let blockX = 0; blockX < width; blockX += cell) {
          const endX = Math.min(width, blockX + cell);
          const endY = Math.min(height, blockY + cell);
          let red = 0;
          let green = 0;
          let blue = 0;
          let count = 0;
          for (let y = blockY; y < endY; y += 1) {
            for (let x = blockX; x < endX; x += 1) {
              const index = (y * width + x) * 4;
              red += data[index]!;
              green += data[index + 1]!;
              blue += data[index + 2]!;
              count += 1;
            }
          }
          for (let y = blockY; y < endY; y += 1) {
            for (let x = blockX; x < endX; x += 1) {
              const index = (y * width + x) * 4;
              data[index] = red / count;
              data[index + 1] = green / count;
              data[index + 2] = blue / count;
            }
          }
        }
      }
      break;
    }
    default: {
      const exhaustive: never = request.id;
      throw new Error(`Unknown image effect: ${exhaustive as string}`);
    }
  }
  return surface;
}

function reflectedIndex(value: number, length: number): number {
  if (length === 1) return 0;
  const period = length * 2;
  const normalized = ((value % period) + period) % period;
  return normalized < length ? normalized : period - normalized - 1;
}

/** Extends a contained image to a target aspect ratio with mirrored tiles. */
export function createMirroredSurface(input: PixelSurface, targetWidth: number, targetHeight: number): PixelSurface {
  assertSurface(input);
  assertDimension(targetWidth, 'targetWidth');
  assertDimension(targetHeight, 'targetHeight');
  const output = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  const scale = Math.min(targetWidth / input.width, targetHeight / input.height);
  const drawnWidth = input.width * scale;
  const drawnHeight = input.height * scale;
  const offsetX = (targetWidth - drawnWidth) / 2;
  const offsetY = (targetHeight - drawnHeight) / 2;
  for (let y = 0; y < targetHeight; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = reflectedIndex(Math.floor((x - offsetX) / scale), input.width);
      const sourceY = reflectedIndex(Math.floor((y - offsetY) / scale), input.height);
      const source = (sourceY * input.width + sourceX) * 4;
      const target = (y * targetWidth + x) * 4;
      output[target] = input.data[source]!;
      output[target + 1] = input.data[source + 1]!;
      output[target + 2] = input.data[source + 2]!;
      output[target + 3] = input.data[source + 3]!;
    }
  }
  return { width: targetWidth, height: targetHeight, data: output };
}

export function hashPixelSurface(surface: PixelSurface): string {
  assertSurface(surface);
  let hash = 0x811c9dc5;
  hash ^= surface.width;
  hash = Math.imul(hash, 0x01000193);
  hash ^= surface.height;
  hash = Math.imul(hash, 0x01000193);
  for (const value of surface.data) {
    hash ^= value;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function buildImagePhaseRecipe(frame: VisualGuideFrame, options: ImagePhaseOptions = {}): ImagePhaseRecipe {
  const reducedMotion = options.reducedMotion === true;
  const staticPhase = reducedMotion || options.animatePhase === false;
  const expansion = staticPhase ? 0.5 : Math.max(0, Math.min(1, (frame.scale - 0.72) / 0.28));
  const saturation = staticPhase ? 0.72 : Math.max(0.45, Math.min(1, frame.saturation));
  const blurPx = staticPhase ? 2 : Math.max(0, Math.min(6, frame.blurPx));
  const grayscale = Math.max(0, Math.min(0.4, (1 - saturation) * 0.6));
  const brightness = 0.94 + expansion * 0.06;
  const contrast = 0.9 + expansion * 0.1;
  const pixelSize = staticPhase ? 6 : Math.max(1, Math.min(12, Math.round(frame.pixelSize)));
  const updateIntervalMs = reducedMotion ? 0 : options.lowPower ? 250 : 100;
  return {
    // Full-screen scenery needs a subtle 1.00–1.04 movement, not the
    // 0.72–1.00 range used by the foreground breathing leader.
    scale: staticPhase ? 1.02 : 1 + expansion * 0.04,
    saturation,
    grayscale,
    blurPx,
    brightness,
    contrast,
    pixelSize,
    mirrorEdges: options.mirrorEdges !== false,
    updateIntervalMs,
    cssFilter: [
      `blur(${blurPx.toFixed(2)}px)`,
      `saturate(${saturation.toFixed(3)})`,
      `grayscale(${grayscale.toFixed(3)})`,
      `brightness(${brightness.toFixed(3)})`,
      `contrast(${contrast.toFixed(3)})`,
    ].join(' '),
  };
}
