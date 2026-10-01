/// ИМЯ СТУПЕНИ ТЭТХЭМА НА ЯЗЫКЕ ЧЕЛОВЕКА (задача 92e1b615, 01.10.2026).
///
/// 🔴 ПОВОД. Основной язык — английский (решение Дениса 01.10.2026), а имя ступени в полосе
/// «Доска» приходит ДАННЫМИ из веба: `frontend/src/games/tatham-bridge/sections/*.ts`, поле
/// `лестница[].имя`, → `tools/embed-puzzle-modes.mjs` → `assets/puzzles/modes.json`. Замер
/// 01.10: 78 имён из 88 — русские строки («Случайная 5×5», «9×9, 10 мин», «6×6, хитрая»), и
/// на английском телефоне человек видел их по-русски. Веб эти имена не показывает вовсе —
/// они нужны только нативной полосе.
///
/// ПОЧЕМУ РАЗБОР, А НЕ КЛЮЧ НА КАЖДОЕ ИМЯ. Имена собраны из десятка повторяющихся частей:
/// размер, трудность (девять слов), «N мин», «N цветов», «N мест», «Крест», «Случайная»,
/// «поворот N×N», «с направлением» и числа словами у «Пятнашек». Ключ на часть — 18 строк
/// словаря вместо 78, и данные пяти чужих разделов остаются нетронутыми.
///
/// Русскому показывается исходное имя как есть. Часть, которой нет в разборе, оставляет имя
/// исходным — и это ловит проба `sudoku_section_english_test.dart`: на английском каждое имя
/// всех режимов обязано разобраться. Новое имя в данных → строка шаблона здесь.
library;

import '../../shell/l10n.dart';

/// Ключи трудности зовутся из таблицы, а не литералом — список для `tools/embed-l10n.mjs`
/// (без него сборщик словаря их не увидит, и экран покажет `tathamDiffEasy`).
const tathamDifficultyKeys = <String>[
  'tathamDiffEasy', 'tathamDiffNormal', 'tathamDiffMedium', 'tathamDiffHard', 'tathamDiffTricky',
  'tathamDiffExtreme', 'tathamDiffUnreasonable', 'tathamDiffBasic', 'tathamDiffAdvanced',
];

const _difficulty = {
  'лёгкая': 'tathamDiffEasy',
  'обычная': 'tathamDiffNormal',
  'средняя': 'tathamDiffMedium',
  'трудная': 'tathamDiffHard',
  'хитрая': 'tathamDiffTricky',
  'крайняя': 'tathamDiffExtreme',
  'запредельная': 'tathamDiffUnreasonable',
  'начальная': 'tathamDiffBasic',
  'продвинутая': 'tathamDiffAdvanced',
};

/// Числа словами у «Пятнашек» — сколько плиток на поле.
const _numberWords = {
  'восемь': 8,
  'пятнадцать': 15,
  'девятнадцать': 19,
  'двадцать четыре': 24,
  'тридцать пять': 35,
};

final _size = RegExp(r'^\d+×\d+$');
final _sized = RegExp(r'^(Случайная|Крест) (\d+×\d+)$');
final _counted = RegExp(r'^(\d+) (мин|цвета|цветов|места|мест)$');
final _rotation = RegExp(r'^поворот (\d+×\d+)$');
final _tiles = RegExp(r'^(.+?)(?: плиток)?$');

String _with(String text, Object n) => text.replaceAll('{n}', '$n');

/// Одна часть имени (между запятыми) на языке человека; `null` — части нет в разборе.
String? _part(String p) {
  if (_size.hasMatch(p)) return p;
  final key = _difficulty[p];
  if (key != null) return L.t(key);
  if (p == 'Восьмиугольник') return L.t('tathamOctagon');
  if (p == 'с направлением') return L.t('tathamOrientable');
  final s = _sized.firstMatch(p);
  if (s != null) {
    return _with(s.group(1) == 'Крест' ? L.t('tathamCross') : L.t('tathamRandom'), s.group(2)!);
  }
  final c = _counted.firstMatch(p);
  if (c != null) {
    final n = c.group(1)!;
    return switch (c.group(2)) {
      'мин' => _with(L.t('tathamMines'), n),
      'цвета' || 'цветов' => _with(L.t('tathamColours'), n),
      _ => _with(L.t('tathamPegs'), n),
    };
  }
  final r = _rotation.firstMatch(p);
  if (r != null) return _with(L.t('tathamRotation'), r.group(1)!);
  final t = _tiles.firstMatch(p);
  final n = t == null ? null : _numberWords[t.group(1)];
  if (n != null) return _with(L.t('tathamTiles'), n);
  return null;
}

/// Имя ступени для полосы «Доска». Русский — как в данных; иначе по частям.
String stepTitle(String raw) {
  if (L.locale == 'ru') return raw;
  final parts = raw.split(', ').map(_part).toList();
  if (parts.any((p) => p == null)) return raw;
  return parts.join(', ');
}
