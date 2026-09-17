/* psygames-test-helper-mjs-as-cjs · VER 1 · 17.09.2026 */
/* psygames-spatial-claude-mac · задача f3fae4e2 */
/**
 * ЯДРО ЛАБОРАТОРИИ (`src/games/spatial-core/*.mjs`) В JEST — ДЛЯ ПРОБ, КОТОРЫЕ МОНТИРУЮТ ЭКРАН.
 *
 * jest эти модули не преобразует (`.mjs` вне его трансформа), поэтому прежние пробы
 * лаборатории брали данные у настоящего node подпроцессом, а экран читали исходником.
 * Экран `SpatialLab` импортирует ядро напрямую — чтобы смонтировать его и жать кнопки, проба
 * подменяет импорты этой загрузкой: исходник .mjs переводится babel в CommonJS и исполняется,
 * взаимные импорты ядра разрешаются здесь же, по одному экземпляру на файл.
 *
 * Использование в пробе:
 *   jest.mock('@/src/games/spatial-core/core.mjs', () => require('./helpers/mjsAsCjs').загрузить('core.mjs'));
 */
declare const require: ((id: string) => any) & { resolve: (id: string) => string };
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

declare const __dirname: string;
const ЯДРО = path.join(__dirname, '..', '..', 'games', 'spatial-core');
const кэш = new Map<string, Record<string, unknown>>();

export function загрузить(файл: string): Record<string, unknown> {
  const полный = path.join(ЯДРО, файл);
  const готов = кэш.get(полный);
  if (готов) return готов;
  const исходник = fs.readFileSync(полный, 'utf8');
  const { code } = babel.transformSync(исходник, {
    babelrc: false,
    configFile: false,
    filename: полный,
    plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
  });
  const module = { exports: {} as Record<string, unknown> };
  кэш.set(полный, module.exports);
  const свойRequire = (id: string) => (id.startsWith('./') && id.endsWith('.mjs') ? загрузить(id.slice(2)) : require(id));
  new Function('exports', 'require', 'module', code)(module.exports, свойRequire, module);
  кэш.set(полный, module.exports);
  return module.exports;
}
