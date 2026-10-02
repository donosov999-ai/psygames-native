/// СЛОВА ЭКРАНА — СЛОВАРЬ МОДУЛЯ ВЕБА `core/i18n.ts`, НА ДВЕНАДЦАТИ ЯЗЫКАХ.
///
/// Вопросы заданий, подписи вариантов и пояснения разбора живут у веба в модуле игры
/// (`frontend/src/games/mental-rotation/core/i18n.ts`), сразу на двенадцати языках. Сюда они
/// приезжают файлом `assets/l10n/mental-rotation.json` (экспортёр в репо —
/// `frontend/src/games/mental-rotation/tools/record-flutter-strings.gen.ts`) и читаются через
/// `ModuleStrings`. Раньше здесь стояла русская копия этих строк: немец и кореец читали вопрос
/// задания по-русски посреди своего экрана.
///
/// Формулировки — ДОСЛОВНО веба, а не пересказ: вопрос задания — часть правил, и «как выглядит
/// фигура, если смотреть сверху» ≠ «вид сверху». Второго набора слов в игре быть не должно.
///
/// ⚠️ СЛОВАРЬ ЗАРЯЖАЕТ ЭКРАН ДО ПЕРВОГО КАДРА (`loadMentalRotationWords`), пробы — тем же
/// вызовом. До загрузки функции ниже возвращают ключи: пустота выглядела бы «так и задумано»,
/// а ключ на экране виден сразу и ловится пробой двенадцати языков.
library;

import 'package:flutter/services.dart' show AssetBundle;

import '../../shell/l10n.dart';
import '../../shell/module_strings.dart';
import 'geometry.dart';
import 'levels.dart';
import 'net.dart';
import 'oblique.dart';
import 'pieces.dart';
import 'projection.dart';
import 'rotation.dart';
import 'same.dart';
import 'section.dart';
import 'task.dart';
import 'viewpoint.dart';

ModuleStrings _words = ModuleStrings.empty;

/// Словарь модуля для текущего языка приложения. Звать при входе на экран и после смены языка.
Future<void> loadMentalRotationWords({AssetBundle? bundle}) async {
  _words = await ModuleStrings.load('mental-rotation', bundle: bundle);
}

/// Слово модуля по ключу — для подписей экрана, которых нет среди функций ниже.
String mrWord(String key) => _words.t(key);

/// Шаблон модуля с подстановкой — «Вариант {n}», «Только этот вид, задания уровня {level}…».
String mrFill(String key, Map<String, Object> values) => _words.fill(key, values);

String kindWord(TaskKind kind) => _words.t(switch (kind) {
  TaskKind.rotation => 'taskRotation',
  TaskKind.projection => 'taskProjection',
  TaskKind.net => 'taskNet',
  TaskKind.viewpoint => 'taskViewpoint',
  TaskKind.same => 'taskSame',
  TaskKind.assembly => 'taskAssembly',
  TaskKind.memory => 'taskMemory',
  TaskKind.formation => 'taskFormation',
  TaskKind.section => 'taskSection',
  TaskKind.missing => 'taskMissing',
  TaskKind.oblique => 'taskOblique',
});

String viewWord(ProjectionView view) => _words.t(switch (view) {
  ProjectionView.top => 'viewTop',
  ProjectionView.front => 'viewFront',
  ProjectionView.side => 'viewSide',
});

String axisWord(Axis axis) => _words.t(switch (axis) {
  Axis.x => 'axisX',
  Axis.y => 'axisY',
  Axis.z => 'axisZ',
});

/// Секунды показа для «Памяти»: 4,5 — с запятой там, где так пишут дроби. Список языков — тот же,
/// что у веба (`секунды` в `app/games/mental-rotation.tsx`).
String seconds(int ms) {
  final s = ms / 1000;
  final text = s == s.roundToDouble() ? s.round().toString() : s.toStringAsFixed(1);
  return const ['ru', 'es', 'de', 'pt', 'fr', 'it'].contains(L.locale) ? text.replaceAll('.', ',') : text;
}

/// Вопрос задания. У «Проекции» и «Среза» он зависит от оси взгляда, у «Памяти» — от того,
/// показан ли ещё эталон. У «Поворота» — короткая строка веба (`hintCompact`): поле узкое.
String promptOf(TaskKind kind, {ProjectionView? view, bool studying = false, int exposureMs = 0}) =>
    switch (kind) {
      TaskKind.rotation => _words.t('hintCompact'),
      TaskKind.memory =>
        studying ? _words.fill('memoryStudyPrompt', {'s': seconds(exposureMs)}) : _words.t('memoryPrompt'),
      TaskKind.projection => _words.fill('projectionPrompt', {'view': viewWord(view!)}),
      TaskKind.viewpoint => _words.t('viewpointPrompt'),
      TaskKind.same => _words.t('samePrompt'),
      TaskKind.missing => _words.t('missingPrompt'),
      TaskKind.assembly => _words.t('assemblyPrompt'),
      TaskKind.formation => _words.t('formationPrompt'),
      TaskKind.oblique => _words.t('obliquePrompt'),
      TaskKind.section => _words.fill('sectionPrompt', {'view': viewWord(view!)}),
      TaskKind.net => _words.t('netPrompt'),
    };

/// Подпись под вариантом в разборе: чем именно вариант плох. Порядок — как у `optionNote` веба:
/// верный вариант подписан «верный ответ» при любом виде задания, включая «Точку зрения» и
/// «Сравнение», у которых подделка без имени.
String flawNote(Object option, {required bool oblique}) {
  String w(String key) => _words.t(key);
  if (option is RotationOption) {
    return switch (option.flaw) {
      Flaw.none => w('optionCorrect'),
      Flaw.mirror => w('optionMirror'),
      Flaw.other => w('optionOther'),
    };
  }
  if (option is ProjectionOption) {
    return switch (option.flaw) {
      ProjectionFlaw.none => w('optionCorrect'),
      ProjectionFlaw.otherView => w('optionOtherView'),
      ProjectionFlaw.editedShape => w('optionEditedShape'),
    };
  }
  if (option is PieceOption) {
    return switch (option.flaw) {
      PieceFlaw.none => w('optionCorrect'),
      PieceFlaw.mirror => w('optionMirror'),
      PieceFlaw.oneCube => w('optionEditedShape'),
      PieceFlaw.other => w('optionOther'),
      PieceFlaw.otherView => w('optionOtherView'),
    };
  }
  if (option is SectionOption) {
    return switch (option.flaw) {
      SectionFlaw.none => w('optionCorrect'),
      SectionFlaw.whole => w('optionWholeFigure'),
      SectionFlaw.neighbour => w('optionNeighbourLayer'),
      SectionFlaw.mirror => w('optionMirror'),
      SectionFlaw.turned => w('optionTurned'),
      SectionFlaw.oneCell => w('optionEditedShape'),
    };
  }
  if (option is ObliqueOption) {
    return switch (option.flaw) {
      ObliqueFlaw.none => w('optionCorrect'),
      ObliqueFlaw.seen => w('optionSeenAtAngle'),
      ObliqueFlaw.shadow => w('optionShadow'),
      // «Сечение»: «другая» — это другая плоскость, а не другая фигура.
      ObliqueFlaw.other => oblique ? w('optionOtherPlane') : w('optionOther'),
    };
  }
  // «Развёртка»: подделка — зеркальная сборка или куб с переставленными гранями.
  if (option is NetOption) {
    return switch (option.flaw) {
      NetFlaw.none => w('optionCorrect'),
      NetFlaw.mirror => w('optionMirror'),
      NetFlaw.swap => w('optionSwap'),
    };
  }
  if (option is ViewpointOption) return option.isMatch ? w('optionCorrect') : '';
  if (option is SameOption) return option.isMatch ? w('optionCorrect') : '';
  return '';
}

/// Пояснение разбора — по виду задания.
String reviewHint(TaskKind kind) => _words.t(switch (kind) {
  TaskKind.rotation => 'reviewRotationHint',
  TaskKind.projection => 'reviewProjectionHint',
  TaskKind.net => 'reviewNetHint',
  TaskKind.viewpoint => 'reviewViewpointHint',
  TaskKind.same => 'reviewSameHint',
  TaskKind.missing => 'reviewMissingHint',
  TaskKind.assembly => 'reviewAssemblyHint',
  TaskKind.formation => 'reviewFormationHint',
  TaskKind.section => 'reviewSectionHint',
  TaskKind.memory => 'reviewMemoryHint',
  TaskKind.oblique => 'reviewObliqueHint',
});

/// Описание ступени на экране настройки — перенос `levelSummary` из `core/levelSummary.ts`:
/// числа из спецификации уровня, а не из памяти.
String levelSummary(int level) {
  final s = rotationLevelSpec(level);
  final axes = s.path.toSet().length;
  final a = 90 * s.path.length, b = 90 * (s.path.length + 1);
  return [
    _words.fill('levelCubes', {'n': s.cubes}),
    _words.fill('levelOptions', {'n': s.optionCount}),
    _words.fill(axes == 1 ? 'levelTurnFlat' : 'levelTurnDepth', {'a': a, 'b': b}),
    if (s.foil == 'one-cube') _words.t('levelFoilOneCube'),
  ].join(' · ');
}
