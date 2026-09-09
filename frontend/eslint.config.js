// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // 'src/games/tatham-bridge/tatham.js' — МАШИННЫЙ вывод Emscripten, а не наш код:
    // одна строка на 12 КБ, 141 замечание линта. Мерить её нашим стилем бессмысленно,
    // править нельзя (перезапишется пересборкой). Пересобирается build.sh рядом.
    ignores: ['dist/*', 'src/games/tatham-bridge/tatham.js'],
  },
]);
