/**
 * «ПАУЗА / ЗАРЯДКА» — ТОЧКА ВХОДА МОДУЛЯ.
 *
 * Ядро (`core/`) — общее с отдельным приложением «Умный будильник»
 * (`~/dev/psygames-game-lab/smart-alarm`), и это НЕ копия: у будильника сборка
 * компилирует ядро отсюда и кладёт результат себе в `web-dist/shared/`.
 * Поэтому ядро обязано оставаться платформенно чистым — ни `react-native`,
 * ни `document`, ни `window`, ни `localStorage`. Это сторожит гейт
 * `pause-shared-core.test.ts`: сломается чистота — будильник перестанет
 * собираться, и узнается это НЕ здесь, а через неделю в чужом репозитории.
 *
 * ⚠️ `web/ImageEffectCanvasRenderer` СЮДА НЕ ПЕРЕНЕСЁН. Он рисует через
 * `<canvas>` и `CanvasRenderingContext2D`, которых в React Native нет вовсе.
 * Рецепты эффектов считает `core/imageEffects` — он чистый и переехал; сам
 * вывод на экран делает платформа. Экспортировать веб-рисовалку отсюда значило
 * бы уронить сборку Android на первом же импорте.
 */
export * from './core/engine';
export * from './core/integration';
export * from './core/imageEffects';
export { PausePracticesGame } from './ui/PausePracticesGame';
export type { PausePracticesGameProps, PausePracticesTheme } from './ui/PausePracticesGame';
