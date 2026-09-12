// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // 'src/games/tatham-bridge/tatham.js' — МАШИННЫЙ вывод Emscripten, а не наш код:
    // одна строка на 12 КБ, 141 замечание линта. Мерить её нашим стилем бессмысленно,
    // править нельзя (перезапишется пересборкой). Пересобирается build.sh рядом.
    /**
     * 🔴 МОДУЛИ «ЧИСЛОВОГО ЗАБЕГА» — ЧУЖОЙ КОД, ПЕРЕНЕСЁННЫЙ ПОБАЙТНО.
     *
     * Их написал `psygames-codex-mac` (LOCAL 0.4), и инструкция переноса прямо
     * запрещает переписывать: «сохранить механику», «изменение упаковки не повод
     * объявить новую механику». Сверка SHA-256 с лабораторией — часть приёмки.
     *
     * ⚠️ ПРИЧИНА ИМЕННО В ЛИНТЕРЕ, А НЕ В КОДЕ. `runner-numerals.mjs` грузит шрифт
     * через `import … with {type:'json'}` — это import attributes. Babel проекта
     * синтаксис ПРИНИМАЕТ (проверено прогоном), Metro собирает, приложение работает;
     * парсер линтера его не знает и роняет разбор, а с ним и два файла, которые его
     * импортируют. Глушить правила по одному бессмысленно: ошибка на уровне разбора.
     *
     * 📌 Механику этих файлов сторожат не правила стиля, а 45 тестов ядра
     * (`node --test runner-core.test.mjs runner-campaign.test.mjs`) — они прогоняются
     * и на перенесённой копии. Наш код стыковки (`NumberRunGame.web.tsx`, route)
     * линтуется как обычно и из исключения НЕ выведен.
     */
    ignores: ['dist/*', 'src/games/tatham-bridge/tatham.js', 'src/games/number-run/*.mjs'],
  },
]);
