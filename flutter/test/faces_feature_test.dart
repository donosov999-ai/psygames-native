import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/faces_names/lesson.dart';
import 'package:psygames_flutter/games/faces_names/model.dart';

/// 🔴 ЧЕРТА ОБЯЗАНА ОТЛИЧАТЬ, ИНАЧЕ ПРИЁМ НЕ РАБОТАЕТ.
///
/// Разбор «Лиц и имён» учит цеплять имя за ОДНУ черту. Если эта черта есть и у
/// соседнего лица, человек на опросе выберет не того — и решит, что приём плохой.
/// Поэтому проба мерит не «называется ли черта», а НАЗЫВАЕТСЯ ЛИ РАЗЛИЧАЮЩАЯ.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('🔴 названная черта уникальна среди лиц раунда', () async {
    final lib = FacesNamesLibrary.fromJsonString(
      await rootBundle.loadString('assets/faces-names.json'),
    );
    var named = 0;
    var rounds = 0;
    // Раунды по 3, 5 и 8 лиц: чем их больше, тем труднее найти уникальный признак.
    for (final size in [3, 5, 8]) {
      for (var start = 0; start + size <= lib.people.length; start += size) {
        final faces = [for (var i = 0; i < size; i += 1) lib.people[start + i].face];
        rounds += 1;
        for (final f in faces) {
          final key = faceFeatureKey(f, faces);
          if (key == null) continue;
          named += 1;
          // ⚠️ Проверяем СВОЙСТВО, а не то, что функция что-то вернула: признак,
          // по которому названа черта, обязан быть уникальным в раунде.
          final same = faces.where((o) {
            if (key.startsWith('faceFeature')) return o.glasses == f.glasses;
            if (key.startsWith('faceShape')) return o.faceShape == f.faceShape;
            return o.hairStyle == f.hairStyle;
          }).length;
          expect(same, 1, reason: 'черта «$key» есть ещё у ${same - 1} лиц раунда');
        }
      }
    }
    expect(rounds, greaterThan(10), reason: 'раундов для замера мало: $rounds');
    // Число, а не «работает»: если завтра черта перестанет находиться, это видно.
    expect(named, greaterThan(40), reason: 'черта названа лишь у $named лиц');
  });
}
