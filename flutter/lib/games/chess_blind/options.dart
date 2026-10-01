/// ВАРИАНТЫ ОТВЕТА ДЛЯ ВОПРОСА «ЧТО СТОИТ НА КЛЕТКЕ».
///
/// Перенос с живого TS (`frontend/src/games/chess-blind/core/options.ts`).
/// Две оси трудности лестницы: ЧИСЛО вариантов (`optionCount`, 6 → 8) и доля
/// отвлекающих ТОГО ЖЕ ЦВЕТА (`sameColorShare`, 0 → 0,5): отличить чёрного коня
/// от белой ладьи легко, от чёрной ладьи — нет.
///
/// 🔴 ПОЧЕМУ ЭТО ОТДЕЛЬНЫЙ ФАЙЛ. Перенос 24.09 вариантов не имел вовсе: вопрос
/// нёс один верный вариант, а экран дорисовывал к нему «пешку и коня» и ставил
/// верный ПЕРВОЙ кнопкой — ответ был виден без памяти. Сверять здесь порядок с
/// вебом нельзя (случай разный), поэтому проба держит СВОЙСТВА: сколько
/// вариантов, есть ли верный, нет ли повторов, сколько одноцветных.
library;

import 'dart:math';

import 'ladder.dart';
import 'questions.dart';

/// Вариант ответа: вид фигуры и сторона.
typedef Combo = ({String type, bool white});

/// «Qw», «Nb» — как ключ фигуры в вопросе.
String comboKey(Combo c) => '${c.type}${c.white ? 'w' : 'b'}';

Combo comboOf(String key) => (type: key[0], white: key[1] == 'w');

const List<String> _types = ['K', 'Q', 'R', 'B', 'N', 'P'];

List<T> _shuffled<T>(List<T> source, Random rnd) {
  final a = [...source];
  for (var i = a.length - 1; i > 0; i--) {
    final j = rnd.nextInt(i + 1);
    final tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

/// Варианты ответа на вопрос уровня [level]; верный — среди них, порядок
/// случайный.
///
/// ⚠️ ДОЛЯ ОДНОЦВЕТНЫХ — МИНИМУМ, А НЕ ПРЕДПИСАНИЕ «ОСТАЛЬНЫЕ ЧУЖИЕ»: при доле 0
/// все варианты чужого цвета выдали бы ответ цветом (так было в первой редакции
/// веба). Сперва берутся одноцветные по доле, остаток — из общей кучи.
List<Combo> buildOptions(
  List<PuzzlePiece> onBoard,
  Combo answer,
  int level,
  Random rnd,
) {
  final params = puzzleLevelParams(level);
  final all = <Combo>[
    for (final t in _types) ...[
      (type: t, white: true),
      (type: t, white: false),
    ],
  ].where((c) => !(c.type == answer.type && c.white == answer.white)).toList();

  final present = {for (final p in onBoard) p.comboKey};
  bool fromBoard(Combo c) => present.contains(comboKey(c));
  List<Combo> byUse(List<Combo> a) => [
    ...a.where(fromBoard),
    ...a.where((c) => !fromBoard(c)),
  ];

  final own = _shuffled(
    all.where((c) => c.white == answer.white).toList(),
    rnd,
  );
  final other = _shuffled(
    all.where((c) => c.white != answer.white).toList(),
    rnd,
  );

  final need = params.optionCount - 1;
  final wantOwn = min(own.length, (need * params.sameColorShare).round());
  final required = byUse(own).take(wantOwn).toList();
  final rest = _shuffled([...byUse(own).skip(wantOwn), ...byUse(other)], rnd);

  final opts = <Combo>[answer];
  for (final c in [...required, ...rest]) {
    if (opts.length > need) break;
    if (!opts.any((o) => o.type == c.type && o.white == c.white)) opts.add(c);
  }
  return _shuffled(opts, rnd);
}
