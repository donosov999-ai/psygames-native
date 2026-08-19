/* psygames-rhythm-pitch-audio · VER 1 · 19.08.2026 */
/**
 * ЗВУК ЭТОЙ ИГРЫ ХОДИТ ЧЕРЕЗ ОБЩИЙ ТУМБЛЕР ПРИЛОЖЕНИЯ — И БОЛЬШЕ НИКАК.
 *
 * 🔴 ЗАЧЕМ ОБЁРТКА, А НЕ ПРОВЕРКА В ЭКРАНЕ. Модуль из лаборатории умеет одно:
 * дали движок — играет. Он не знает ни про тумблер «Звук» в настройках, ни про
 * тихий вечерний шаг зарядки. Если проверку положить только на экран (кнопка
 * «Начать» не показывается), то останется щель: человек выключил звук в
 * настройках, пока партия уже идёт, — и игра допищит раунд до конца.
 *
 * Поэтому запрет стоит там, где звук РОЖДАЕТСЯ: ни один осциллятор не создаётся,
 * пока `soundOn()` не сказал «да». Это та же самая единственная проверка, что и
 * у всего приложения (`src/services/feedback.ts`): она разом накрывает и тумблер
 * человека, и тихий шаг (`setCalmHush`). Своего флага здесь нет и быть не должно —
 * второй источник правды про звук означал бы, что где-то он разойдётся с первым.
 *
 * 🔴 ЧАСЫ. Модуль сравнивает ОЖИДАЕМОЕ время сигнала (его считает движок) с
 * ФАКТИЧЕСКИМ временем нажатия (его ставит экран). Оба конца обязаны идти по
 * одним часам — иначе разница между ними это не задержка человека, а разница
 * эпох двух таймеров. Поправка задержки в модуле зажата диапазоном −250…+500 мс,
 * так что рассинхрон не «немного сдвинет ритм», а молча упрётся в границу и
 * испортит счёт. Поэтому движку отдаём `gameNow` — те же игровые часы, что и
 * экрану: пока человек пишет отзыв, оба конца стоят вместе.
 *
 * ⚠️ Расписание самих тонов Web Audio ведёт по `ctx.currentTime` — это его
 * внутренние часы, остановить их нельзя. Пауза приложения гасит звук иначе:
 * модуль на паузе зовёт `stop()`/`suspend()`, то есть звучать во время паузы
 * просто нечему.
 */
import { soundOn } from '@/src/services/feedback';
import { gameNow } from '@/src/services/gamePause';
import {
  AudioOutputUnavailableError,
  WebToneAudioEngine,
  type AudioPlaybackPlan,
  type ToneAudioEngine,
} from './audio/ToneAudioEngine';
import type { RhythmPitchRound } from './core/types';

export interface AppToneAudioEngineOptions {
  /**
   * Что показать человеку, когда звук выключен. Текст приходит из экрана
   * (через словарь приложения), чтобы не заводить здесь второй словарь.
   */
  mutedMessage: () => string;
  /** Подмена проверки звука — только для проверок; в приложении не передаётся. */
  isSoundOn?: () => boolean;
  /** Подмена часов — только для проверок. */
  now?: () => number;
}

/**
 * Движок приложения: тот же локальный синтез синусом, но немой, пока звук
 * выключен. Наружу торчит ровно контракт `ToneAudioEngine` — модуль не знает,
 * что его водят за руку.
 */
export class AppToneAudioEngine implements ToneAudioEngine {
  private readonly inner: ToneAudioEngine;
  private readonly mutedMessage: () => string;
  private readonly isSoundOn: () => boolean;

  constructor(options: AppToneAudioEngineOptions) {
    this.mutedMessage = options.mutedMessage;
    this.isSoundOn = options.isSoundOn ?? soundOn;
    this.inner = new WebToneAudioEngine({ performanceClock: options.now ?? gameNow });
  }

  /**
   * Модуль спрашивает это ПЕРЕД стартом раунда (`begin`) и по ответу решает,
   * показывать ли экран «звука нет». Выключенный тумблер здесь и означает
   * «выхода нет» — с точки зрения игры разницы никакой.
   */
  get available(): boolean {
    return this.isSoundOn() && this.inner.available;
  }

  private guard(): void {
    if (!this.isSoundOn()) throw new AudioOutputUnavailableError(this.mutedMessage());
  }

  async initialize(): Promise<void> {
    this.guard();
    await this.inner.initialize();
  }

  async playCalibration(volume: number): Promise<AudioPlaybackPlan> {
    this.guard();
    return this.inner.playCalibration(volume);
  }

  async playRound(round: RhythmPitchRound, volume: number): Promise<AudioPlaybackPlan> {
    this.guard();
    return this.inner.playRound(round, volume);
  }

  /** Остановка, усыпление и закрытие идут насквозь ВСЕГДА: гасить звук можно и нужно даже немому. */
  stop(): Promise<void> { return this.inner.stop(); }
  suspend(): Promise<void> { return this.inner.suspend(); }
  dispose(): Promise<void> { return this.inner.dispose(); }
}

export function createAppToneAudioEngine(options: AppToneAudioEngineOptions): AppToneAudioEngine {
  return new AppToneAudioEngine(options);
}
