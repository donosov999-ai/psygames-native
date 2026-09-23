/// СЛОВА ЭКРАНА — русская часть `core/i18n.ts`.
///
/// В веб-версии двенадцать языков; здесь пока один — тот, на котором играет Денис. Формулировки
/// перенесены ДОСЛОВНО, а не пересказаны: вопрос задания — часть правил, и «как выглядит фигура,
/// если смотреть сверху» ≠ «вид сверху». Второго набора слов в игре быть не должно.
library;

import 'geometry.dart';
import 'oblique.dart';
import 'pieces.dart';
import 'projection.dart';
import 'levels.dart';
import 'rotation.dart';
import 'section.dart';
import 'task.dart';

String kindWord(TaskKind kind) => switch (kind) {
  TaskKind.rotation => 'Поворот',
  TaskKind.projection => 'Проекция',
  TaskKind.net => 'Развёртка',
  TaskKind.viewpoint => 'Точка зрения',
  TaskKind.same => 'Одинаковая фигура',
  TaskKind.assembly => 'Сборка',
  TaskKind.memory => 'Память',
  TaskKind.formation => 'Три вида',
  TaskKind.section => 'Срез',
  TaskKind.missing => 'Недостающая часть',
  TaskKind.oblique => 'Сечение',
};

String viewWord(ProjectionView view) => switch (view) {
  ProjectionView.top => 'сверху',
  ProjectionView.front => 'спереди',
  ProjectionView.side => 'справа',
};

String axisWord(Axis axis) => 'ось ${axis.name.toUpperCase()}';

/// Секунды показа для «Памяти»: 4,5 — с запятой, как пишут дроби по-русски.
String seconds(int ms) {
  final s = ms / 1000;
  return (s == s.roundToDouble() ? s.round().toString() : s.toStringAsFixed(1)).replaceAll(
    '.',
    ',',
  );
}

/// Вопрос задания. У «Проекции» и «Среза» он зависит от оси взгляда, у «Памяти» — от того,
/// показан ли ещё эталон.
String promptOf(TaskKind kind, {ProjectionView? view, bool studying = false, int exposureMs = 0}) =>
    switch (kind) {
      TaskKind.rotation => 'Найди повёрнутую копию фигуры',
      TaskKind.memory =>
        studying
            ? 'Запомни фигуру — у тебя ${seconds(exposureMs)} с'
            : 'Какая из фигур — та, что была? Она повёрнута',
      TaskKind.projection => 'Как выглядит фигура, если смотреть ${viewWord(view!)}?',
      TaskKind.viewpoint => 'Фигуру обходят кругом. Что видно с отмеченной точки?',
      TaskKind.same => 'Это одна и та же фигура, только повёрнутая?',
      TaskKind.missing => 'Какой кусок заполнит пустое место в фигуре?',
      TaskKind.assembly => 'Какая фигура сложится из этих двух кусков?',
      TaskKind.formation => 'Какая фигура даёт такие виды сверху, спереди и справа?',
      TaskKind.oblique => 'Плоскость режет тело. Какой формы сечение на самом деле?',
      TaskKind.section =>
        'Сплошные кубики — один слой фигуры, остальные показаны пунктиром. '
            'Как выглядит этот срез ${viewWord(view!)}?',
      TaskKind.net => 'Какой кубик сложится из этой выкройки?',
    };

/// Подпись под вариантом в разборе: чем именно вариант плох.
const String noteCorrect = 'верный ответ';
const String noteMirror = 'зеркало';
const String noteOther = 'другая фигура';
const String noteOtherPlane = 'другая плоскость';
const String noteOtherView = 'вид с другой стороны';
const String noteEdited = 'кубик не на месте';
const String noteWhole = 'вся фигура';
const String noteNeighbour = 'соседний слой';
const String noteTurned = 'повёрнут';
const String noteSwap = 'грани переставлены';
const String noteSeen = 'как видно на рисунке';
const String noteShadow = 'тень на грань';

String flawNote(Object option, {required bool oblique}) {
  if (option is RotationOption) {
    return switch (option.flaw) {
      Flaw.none => noteCorrect,
      Flaw.mirror => noteMirror,
      Flaw.other => noteOther,
    };
  }
  if (option is ProjectionOption) {
    return switch (option.flaw) {
      ProjectionFlaw.none => noteCorrect,
      ProjectionFlaw.otherView => noteOtherView,
      ProjectionFlaw.editedShape => noteEdited,
    };
  }
  if (option is PieceOption) {
    return switch (option.flaw) {
      PieceFlaw.none => noteCorrect,
      PieceFlaw.mirror => noteMirror,
      PieceFlaw.oneCube => noteEdited,
      PieceFlaw.other => noteOther,
      PieceFlaw.otherView => noteOtherView,
    };
  }
  if (option is SectionOption) {
    return switch (option.flaw) {
      SectionFlaw.none => noteCorrect,
      SectionFlaw.whole => noteWhole,
      SectionFlaw.neighbour => noteNeighbour,
      SectionFlaw.mirror => noteMirror,
      SectionFlaw.turned => noteTurned,
      SectionFlaw.oneCell => noteEdited,
    };
  }
  if (option is ObliqueOption) {
    return switch (option.flaw) {
      ObliqueFlaw.none => noteCorrect,
      ObliqueFlaw.seen => noteSeen,
      ObliqueFlaw.shadow => noteShadow,
      // «Сечение»: «другая» — это другая плоскость, а не другая фигура.
      ObliqueFlaw.other => oblique ? noteOtherPlane : noteOther,
    };
  }
  return '';
}

/// Пояснение разбора — по виду задания.
String reviewHint(TaskKind kind) => switch (kind) {
  TaskKind.rotation => 'Эталон поворачивается шаг за шагом к правильному ответу.',
  TaskKind.projection =>
    'Клетка закрашена, если вдоль этой линии взгляда стоит хотя бы один кубик.',
  TaskKind.net =>
    'Верный кубик складывается из выкройки; зеркальный не совместить с ним никаким поворотом.',
  TaskKind.viewpoint =>
    'Метка показывает, с какой стороны смотрят; эталон нарисован от нулевой отметки.',
  TaskKind.same => 'Зеркальную копию не совместить с оригиналом никаким поворотом — в отличие от просто повёрнутой.',
  TaskKind.missing =>
    'Верный кусок — повёрнутая копия пустого места. У подделки переставлен кубик или она зеркальна: '
        'никаким поворотом её в пустоту не вставить.',
  TaskKind.assembly =>
    'Куски можно поворачивать, но не отражать. Подделку из них не сложить: в ней переставлен кубик, '
        'она зеркальна или это другая фигура.',
  TaskKind.formation =>
    'Вид — это тень фигуры на стену: клетка закрашена, если вдоль взгляда стоит хоть один кубик. '
        'Подделка совпадает с одним-двумя видами, но хотя бы один вид у неё другой.',
  TaskKind.section =>
    'Срез — только кубики своего слоя, а не вся фигура: клетка закрашена, если кубик стоит в самом '
        'слое. Проекция всей фигуры — самая частая подделка.',
  TaskKind.memory =>
    'Вот фигура, которую нужно было запомнить. Верный вариант — она же, только повёрнутая: смотри, '
        'как она доворачивается. Зеркальная копия и похожая фигура — ловушки.',
  TaskKind.oblique =>
    'Вершины сечения лежат на рёбрах тела — там, где их пересекает плоскость. На рисунке сечение '
        'видно под углом и кажется сплющенным; настоящая форма другая, её и нужно было найти.',
};

/// Описание ступени на экране настройки: числа берутся из спецификации уровня, а не из памяти.
String levelSummary(int level) {
  final s = rotationLevelSpec(level);
  final axes = s.path.toSet().length;
  final a = 90 * s.path.length, b = 90 * (s.path.length + 1);
  final turn = axes == 1
      ? 'поворот в плоскости экрана: $a–$b°'
      : 'поворот в объёме по двум осям, в сумме: $a–$b°';
  return [
    'Кубиков: ${s.cubes}',
    'вариантов: ${s.optionCount}',
    turn,
    if (s.foil == 'one-cube') 'подделка отличается одним кубиком',
  ].join(' · ');
}
