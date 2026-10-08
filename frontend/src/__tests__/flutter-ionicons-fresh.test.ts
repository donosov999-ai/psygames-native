/* psygames-flutter-ionicons-fresh · VER 1 · 07.10.2026 */
/**
 * ЗНАЧКИ ВЕБА ВО FLUTTER — ТЕМ ЖЕ ШРИФТОМ, А НЕ ПОХОЖИМИ (задачи 7c88c0b8 и др., правило 4e679f41).
 *
 * Веб рисует значки шрифтом Ionicons (`@expo/vector-icons`). На перенесённых экранах их подменяли
 * «ближайшими» Material (вкладки, развилка, зарядка, кнопка отзыва) — это и есть скрытый редизайн
 * по мелочи: другая толщина линий, другие формы. Здесь шрифт кладётся во Flutter побайтно, а таблица
 * имя → код — const-таблицей Dart (`flutter/lib/shell/ionicons.g.dart`): константы не ломают
 * отсечение неиспользуемых значков в сборке выпуска.
 *
 * ⚠️ СТОРОЖ: без WRITE сравнивает и краснеет. Перевыпуск из `frontend/`:
 *   WRITE=1 npx jest -i --runTestsByPath src/__tests__/flutter-ionicons-fresh.test.ts
 */
declare const require: { (id: string): any; resolve(id: string): string };
declare const __dirname: string;
declare const process: { env: Record<string, string | undefined> };
const fs = require('fs') as {
  readFileSync(p: string, e?: string): any; writeFileSync(p: string, d: any, e?: string): void;
  existsSync(p: string): boolean; mkdirSync(p: string, o: object): void;
};
const path = require('path') as { resolve(...p: string[]): string; dirname(p: string): string };

const GLYPHS = require.resolve('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json');
const FONT = path.resolve(path.dirname(GLYPHS), '../Fonts/Ionicons.ttf');
const OUT_FONT = path.resolve(__dirname, '../../../flutter/assets/fonts/Ionicons.ttf');
const OUT_DART = path.resolve(__dirname, '../../../flutter/lib/shell/ionicons.g.dart');

function dart(): string {
  const map = JSON.parse(fs.readFileSync(GLYPHS, 'utf8')) as Record<string, number>;
  const rows = Object.keys(map).sort().map((k) => `    '${k}': IconData(0x${map[k].toString(16)}, fontFamily: _f),`);
  return [
    '// СГЕНЕРИРОВАНО frontend/src/__tests__/flutter-ionicons-fresh.test.ts — руками не править.',
    '// ignore_for_file: lines_longer_than_80_chars',
    "import 'package:flutter/widgets.dart';",
    '',
    '/// Значки веба (Ionicons из `@expo/vector-icons`) — тем же шрифтом, что на вебе.',
    'class Ion {',
    '  Ion._();',
    "  static const _f = 'Ionicons';",
    '',
    '  static const map = <String, IconData>{',
    ...rows,
    '  };',
    '',
    '  /// Значок по имени веба; нет такого — `null` (рисующий решает, что показать).',
    '  static IconData? of(String? name) => name == null ? null : map[name];',
    '}',
    '',
  ].join('\n');
}

describe('Ionicons во Flutter — тот же шрифт и та же таблица, что у веба', () => {
  it('шрифт совпадает побайтно', () => {
    const src = fs.readFileSync(FONT);
    if (process.env.WRITE === '1') {
      fs.mkdirSync(path.dirname(OUT_FONT), { recursive: true });
      fs.writeFileSync(OUT_FONT, src);
    }
    const was = fs.existsSync(OUT_FONT) ? fs.readFileSync(OUT_FONT) : Buffer.alloc(0);
    expect({ same: Buffer.compare(src, was) === 0, regenerate: 'cd frontend && WRITE=1 npx jest -i --runTestsByPath src/__tests__/flutter-ionicons-fresh.test.ts' })
      .toEqual({ same: true, regenerate: expect.any(String) });
  });

  it('таблица имя → код совпадает', () => {
    const now = dart();
    if (process.env.WRITE === '1') fs.writeFileSync(OUT_DART, now, 'utf8');
    const was = fs.existsSync(OUT_DART) ? fs.readFileSync(OUT_DART, 'utf8') : '';
    expect({ fresh: was === now }).toEqual({ fresh: true });
  });
});
