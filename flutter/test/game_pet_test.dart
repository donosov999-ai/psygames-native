import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/game_pet.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПИТОМЕЦ В ШАПКЕ НАТИВНОЙ ИГРЫ — ТОТ ЖЕ, ЧТО В ВЕБ-ПОЛОВИНЕ.
///
/// 🔴 Проба держит ТРИ вещи, каждая из которых ломается молча:
/// · кадры берутся с ВСТРОЕННОГО сервера, а не из ассетов Flutter — иначе в
///   сборку уедут лишние 4,2 МБ уже лежащих там картинок;
/// · настроение переводится в тот же вид, что в `GamePet.tsx` (верное → jump,
///   уровень → wave, ошибка → sleep). Разойдётся — человек увидит в одном
///   приложении двух разных питомцев;
/// · выключенный питомец не рисуется вовсе: ключ `psygames_pet_on` общий с вебом.
void main() {
  Future<SharedState> open(Map<String, Object> values) async {
    SharedPreferences.setMockInitialValues(values);
    return SharedState.open();
  }

  Future<void> show(WidgetTester t, SharedState s, PetMood mood) =>
      t.pumpWidget(MaterialApp(
        home: GamePet(state: s, origin: 'http://127.0.0.1:1234', mood: mood),
      ));

  String? urlOf(WidgetTester t) {
    final f = find.byType(Image);
    if (f.evaluate().isEmpty) return null;
    return ((t.widget<Image>(f).image) as NetworkImage).url;
  }

  testWidgets('🔴 кадр берётся со встроенного сервера, а не из ассетов', (t) async {
    final s = await open({});
    await show(t, s, PetMood.idle);
    expect(urlOf(t), 'http://127.0.0.1:1234/assets/images/pet/cat/idle0.webp');
  });

  testWidgets('🔴 выключенный питомец не рисуется вовсе', (t) async {
    final s = await open({'psygames_pet_on': 'false'});
    await show(t, s, PetMood.idle);
    expect(find.byType(Image), findsNothing);
  });

  testWidgets('облик берётся из общей памяти, а не зашит', (t) async {
    final s = await open({'psygames_pet_skin': 'robot'});
    await show(t, s, PetMood.idle);
    expect(urlOf(t), contains('/pet/robot/'));
  });

  testWidgets('🔴 настроение переводится в тот же вид, что в вебе', (t) async {
    final s = await open({});
    for (final pair in [
      (PetMood.good, 'jump'),
      (PetMood.win, 'wave'),
      (PetMood.bad, 'sleep'),
    ]) {
      await t.pumpWidget(MaterialApp(
          home: GamePet(state: s, origin: 'http://127.0.0.1:1234', mood: PetMood.idle)));
      await t.pumpWidget(MaterialApp(
          home: GamePet(state: s, origin: 'http://127.0.0.1:1234', mood: pair.$1)));
      await t.pump();
      expect(urlOf(t), contains('/${pair.$2}0.webp'),
          reason: 'в GamePet.tsx ${pair.$1.name} → ${pair.$2}');
      // ⚠️ Дожидаемся выдержки: иначе таймер реакции переживёт пробу, и
      // flutter_test справедливо ругнётся на «Pending timers».
      await t.pump(const Duration(milliseconds: 1700));
    }
  });

  testWidgets('реакция держится и возвращается в покой', (t) async {
    final s = await open({});
    await show(t, s, PetMood.idle);
    await t.pumpWidget(MaterialApp(
        home: GamePet(state: s, origin: 'http://127.0.0.1:1234', mood: PetMood.win)));
    await t.pump();
    expect(urlOf(t), contains('wave'));
    await t.pump(const Duration(milliseconds: 1700));
    expect(urlOf(t), contains('idle'), reason: 'после выдержки возвращается в покой');
  });
}
