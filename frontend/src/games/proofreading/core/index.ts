/* psygames-proofreading-series-core-index · VER 1 · 23.08.2026 */
/**
 * Единая дверь в ядро серии корректурки: экран берёт всё отсюда и не лазит по
 * файлам модуля. Так внутреннюю раскладку файлов можно менять, не трогая игру.
 */
export * from './vocab';
export * from './field';
export * from './blocks';
export * from './progress';
export * from './i18n';
