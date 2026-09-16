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
  /**
   * 🔴 ЗАМЕНЯЕТ ЛИ ЭТА СПРАВКА ОБЩУЮ СТАТЬЮ ЭКРАНА.
   *
   * По умолчанию нет: у судоку контекстная часть — правило текущего раунда, а общая
   * статья про судоку рядом полезна.
   *
   * У головоломок Тэтхэма всё иначе, и ради этого флаг и заведён. Все 42 режима живут
   * на одном маршруте `/games/puzzles`, режим стоит в `?mode=`, а справка выбирает
   * запись по `pathname` — то есть общая статья у всех сорока двух ОДНА, про «Чёт-нечет».
   * Замер 16.09.2026: открыть «Сокобан» → «Правила» → заголовок «Чёт-нечет» и примеры
   * про «Магниты» и «Мины». Денис: «надо чтобы разное было, у каждого своё, без лишнего
   * описания чужих игр». Поэтому режим публикует СВОЮ справку и просит убрать чужую.
   */
  replacesIntro?: boolean;
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
