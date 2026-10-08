import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/collection_model.dart';
import 'package:psygames_flutter/shell/home_inputs.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/profiles.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/training_history.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ВХОДЫ ГЛАВНОЙ НА DART = ВХОДЫ ВЕБА НА ТОМ ЖЕ ХРАНИЛИЩЕ (задача d6a60b02, вариант Б, Главная — 7б).
///
/// Эталоны выгружает веб-проба `home-host-model.test.tsx`: настоящая Главная на подготовленном
/// хранилище при замороженных часах — вход сборщика модели и всё хранилище после монтирования, миг,
/// пояс, ширина окна, язык. Здесь то же хранилище кладётся в общую память, и Dart собирает вход сам:
/// профиль с файлом состава, доступные игры, очки, уровень, серия, вещи, лестница, сундук, «Сегодня»,
/// «продолжить», цель дня, рекомендации, вызов, любимые разделы, окно цели. Цвета темы и события
/// веба (бонус входа, ставка, «Уровень N!», обновление) берутся из образца — их Dart не считает.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  Object? json(String f) => jsonDecode(File(f).readAsStringSync());
  Map<String, Object?> obj(String f) => (json(f)! as Map).cast<String, Object?>();
  final data = HomeInputsData.fromJson(
    catalog: obj('assets/catalog.json'),
    inputs: obj('assets/home_inputs.json'),
    home: obj('assets/home.json'),
    profilesJson: obj('assets/profiles.json'),
    rules: StatsRules.fromJson(obj('assets/stats_rules.json')),
    figures: CollectionData.fromJson(obj('assets/collection.json')),
  );
  final profiles = Profiles.parse(File('assets/profiles.json').readAsStringSync());
  void lang(String l) => L.useForTest(l, (jsonDecode(File('assets/l10n/$l.json').readAsStringSync()) as Map).cast<String, String>());

  /// Часы эталона: `getTimezoneOffset` веба — минуты «UTC минус местное».
  Wall wallOf(int offsetMinutes) =>
      (ms) => DateTime.fromMillisecondsSinceEpoch(ms - offsetMinutes * 60000, isUtc: true);

  for (final name in ['fresh', 'rich', 'evening']) {
    test('🔴 home_inputs_$name: вход Главной на Dart = вход веба на том же хранилище и часах', () async {
      final f = obj('test/fixtures/home_inputs_$name.json');
      final want = (f['input']! as Map).cast<String, Object?>();
      SharedPreferences.setMockInitialValues((f['storage']! as Map).cast<String, Object>());
      final state = await SharedState.open();
      lang(f['language']! as String);
      final dart = homeInputsFrom(
        state,
        data,
        profiles: profiles,
        now: (f['now']! as num).toInt(),
        wall: wallOf((f['tzOffsetMinutes']! as num).toInt()),
        language: f['language']! as String,
        colors: (want['colors']! as Map).cast<String, Object?>(),
        winW: f['winW']! as num,
        events: {for (final k in ['update', 'streakToast', 'wagerToast', 'levelUp']) k: want[k]},
      );
      final got = (jsonDecode(jsonEncode(dart)) as Map).cast<String, Object?>();
      // По полю — чтобы расхождение называло, какой вход разошёлся.
      for (final k in want.keys) {
        expect(got[k], want[k], reason: 'поле $k');
      }
      expect(got.keys.toSet(), want.keys.toSet());
    });
  }

  test('зерно рекомендаций — FNV-1a веба с Math.imul (без знака)', () {
    expect(recoSeed('', ''), recoSeed('', ''));
    // `recoSeed('a', 'b')` живого TS (node, 08.10.2026) — 692878806.
    expect(recoSeed('a', 'b'), 692878806);
    expect(slotForHour(4), 'night');
    expect([slotForHour(5), slotForHour(12), slotForHour(18), slotForHour(23)], ['morning', 'day', 'evening', 'evening']);
  });
}
