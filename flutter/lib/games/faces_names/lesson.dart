library;

import 'model.dart';

/// 🔴 ЧЕРТА ЛИЦА — ТА, ЧТО ОТЛИЧАЕТ ЕГО ОТ СОСЕДНИХ, А НЕ ПРОСТО ОПИСАНИЕ.
///
/// Лицо запоминается не целиком, а одной ЧЕРТОЙ, за которую цепляется имя. Но
/// черта обязана быть РАЗЛИЧАЮЩЕЙ: сказать «у неё тёмные волосы», когда тёмные
/// волосы у троих из пяти, — значит дать зацепку, которая на опросе не сработает,
/// а человек решит, что приём не работает.
///
/// ⚠️ Признак берётся из самого портрета (`FaceSpec`), а не придумывается: у
/// веб-учителя это отдельно оговорено, и там же сказано, чем кончается выдумка —
/// «скажи разбор „у неё рыжие волосы“, когда волосы тёмные, и приём сломается на
/// первом же опросе».
///
/// Порядок перебора — по заметности: очки видно раньше формы лица, форму раньше
/// причёски. Если ни один признак не уникален, возвращается `null`: честное «черты
/// нет» лучше зацепки, которая не отличает.
String? faceFeatureKey(FaceSpec face, List<FaceSpec> others) {
  bool unique<T>(T Function(FaceSpec) of) => others.where((f) => of(f) == of(face)).length == 1;

  if (unique((f) => f.glasses)) {
    return face.glasses ? 'faceFeatureGlasses' : 'faceFeatureNoGlasses';
  }
  if (unique((f) => f.faceShape)) {
    return switch (face.faceShape) {
      'round' => 'faceShapeRound',
      'oval' => 'faceShapeOval',
      'long' => 'faceShapeLong',
      _ => 'faceShapeAngular',
    };
  }
  if (unique((f) => f.hairStyle)) {
    return switch (face.hairStyle) {
      'crop' => 'faceHairCrop',
      'parted' => 'faceHairParted',
      'wave' => 'faceHairWave',
      _ => 'faceHairCurve',
    };
  }
  return null;
}
