import { DeviceEventEmitter } from 'react-native';

/**
 * Контекстная часть глобальной справки: экран игры публикует правило именно
 * текущего раунда, а GameHelpOverlay добавляет его перед общей статьёй.
 *
 * Реестр синхронный, потому что дочерний экран может смонтироваться раньше
 * глобального оверлея и одно событие тогда потерялось бы.
 */
export interface GameContextHelp {
  gameId: string;
  title: string;
  body: string;
}

const EVENT = 'psygames:game-context-help';
let current: GameContextHelp | null = null;

export function publishGameContextHelp(help: GameContextHelp): void {
  current = help;
  DeviceEventEmitter.emit(EVENT, help);
}

export function clearGameContextHelp(gameId: string): void {
  if (current?.gameId !== gameId) return;
  current = null;
  DeviceEventEmitter.emit(EVENT, null);
}

export function getGameContextHelp(gameId: string): GameContextHelp | null {
  return current?.gameId === gameId ? current : null;
}

export function subscribeGameContextHelp(listener: (help: GameContextHelp | null) => void) {
  return DeviceEventEmitter.addListener(EVENT, listener);
}
