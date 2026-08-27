/* psygames-chess-blind-core-index · VER 2 · 27.08.2026 */
/**
 * Единая дверь в ядро серии: экран берёт всё отсюда и не лазит по файлам модуля.
 * Так внутреннюю раскладку файлов можно менять, не трогая игру.
 */
export * from './board';
export * from './games';
export * from './knight';
export * from './positions';
export * from './puzzle';
export * from './blocks';
export * from './progress';
export * from './i18n';
