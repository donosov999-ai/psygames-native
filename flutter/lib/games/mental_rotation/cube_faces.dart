/// ГРАНИ РАСКРАШЕННОГО КУБИКА — перенос второй половины `core/geometry.ts`.
///
/// Тот же движок поворота, что у фигур, только едут не кубики, а значки на гранях. Нужен
/// «Развёртке»: вариант ответа — кубик, у которого видно ровно три грани.
///
/// 🔴 ВАРИАНТ СУДИТСЯ ПО ВИДИМОЙ ТРОЙКЕ, А НЕ ПО ВСЕМУ КУБУ. Подделка, отличающаяся только
/// невидимой гранью, с экрана неотличима от правильной — вопрос остался бы без ответа.
library;

import 'geometry.dart';

enum CubeFace { up, down, front, back, right, left }

enum FaceMark { dot, ring, square, triangle, plus, bar }

/// Значок на каждой грани. Порядок ключей ничего не решает: [faceKey] берёт свой.
typedef FaceMap = Map<CubeFace, FaceMark>;

const List<CubeFace> cubeFaces = CubeFace.values;
const List<FaceMark> faceMarks = FaceMark.values;

/// Нормали граней. Согласованы с изометрией экрана: y — вверх, z — на зрителя, x — вправо.
const Map<CubeFace, Cube> faceNormals = {
  CubeFace.up: [0, 1, 0],
  CubeFace.down: [0, -1, 0],
  CubeFace.front: [0, 0, 1],
  CubeFace.back: [0, 0, -1],
  CubeFace.right: [1, 0, 0],
  CubeFace.left: [-1, 0, 0],
};

final Map<String, CubeFace> _normalToFace = {
  for (final f in cubeFaces) faceNormals[f]!.join(','): f,
};

CubeFace faceOfNormal(Cube n) {
  final face = _normalToFace[n.join(',')];
  if (face == null) throw ArgumentError('не грань куба: [${n.join(',')}]');
  return face;
}

/// Поворот раскрашенного куба: значок едет вместе со своей гранью.
FaceMap rotateFaces(FaceMap cube, Axis axis, [int times = 1]) {
  final fn = rotator(axis);
  final n = ((times % 4) + 4) % 4;
  var out = cube;
  for (var i = 0; i < n; i++) {
    final next = <CubeFace, FaceMark>{};
    for (final face in out.keys) {
      next[faceOfNormal(fn(faceNormals[face]!))] = out[face]!;
    }
    out = next;
  }
  return out;
}

String faceKey(FaceMap cube) => cubeFaces.map((f) => '${f.name}:${cube[f]!.name}').join('|');

/// Все различные ориентации раскрашенного куба. При шести разных значках их 24.
List<FaceMap> allCubeOrientations(FaceMap cube) {
  final seen = <String, FaceMap>{};
  for (var rx = 0; rx < 4; rx++) {
    for (var ry = 0; ry < 4; ry++) {
      for (var rz = 0; rz < 4; rz++) {
        final cand = rotateFaces(
          rotateFaces(rotateFaces(cube, Axis.x, rx), Axis.y, ry),
          Axis.z,
          rz,
        );
        seen.putIfAbsent(faceKey(cand), () => cand);
      }
    }
  }
  return seen.values.toList();
}

/// Что человек ВИДИТ на варианте — значки верхней, передней и правой граней.
String visibleTriple(FaceMap cube) =>
    '${cube[CubeFace.up]!.name}|${cube[CubeFace.front]!.name}|${cube[CubeFace.right]!.name}';

Set<String> allVisibleTriples(FaceMap cube) => allCubeOrientations(cube).map(visibleTriple).toSet();

/// Зеркальная сборка: левая и правая грани меняются значками.
FaceMap mirrorCube(FaceMap cube) => {
  ...cube,
  CubeFace.right: cube[CubeFace.left]!,
  CubeFace.left: cube[CubeFace.right]!,
};

/// Перестановка значков двух граней — то, что человек путает чаще всего.
FaceMap swapFaces(FaceMap cube, CubeFace a, CubeFace b) => {...cube, a: cube[b]!, b: cube[a]!};

/// Противоположная грань. Нужна, чтобы подделка «переставили две грани» брала СОСЕДНИЕ.
CubeFace oppositeFace(CubeFace face) {
  final n = faceNormals[face]!;
  return faceOfNormal([-n[0], -n[1], -n[2]]);
}
