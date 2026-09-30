/// «ДВОРЕЦ ПАМЯТИ» НА ЭКРАНЕ: СВЕРНУЛ ПОСРЕДИ РАСКЛАДКИ — ВЕРНУЛСЯ В НЕЁ ЖЕ.
///
/// Ядро снимка сверено с вебом отдельно (`memory_palace_resume_test.dart`). Здесь — доходит ли
/// это до человека нажатиями: запись после хода, подъём при входе, веб-запись в ОБЩЕМ ключе,
/// шаг зарядки не поднимает старую партию, «Заново» стирает запись.
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/memory_palace/model.dart';
import 'package:psygames_flutter/games/memory_palace/screen.dart';
import 'package:psygames_flutter/shell/game_clock.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _key = 'psygames_resume_memory_palace_nzt48';

void main() {
  late SharedState state;
  late MemoryPalaceContent content;

  setUpAll(() {
    content = MemoryPalaceContent.fromJsonString(File('assets/memory-palace.json').readAsStringSync());
  });

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
  });

  tearDown(() {
    GamePreset.clear();
    resetGameClock();
    gameWallMs = () => DateTime.now().millisecondsSinceEpoch;
  });

  Future<MemoryPalaceSession> boot(WidgetTester tester, {String tag = 'a'}) async {
    // Отложенная запись идёт по часам партии — ведём их поддельным временем пробы.
    gameWallMs = () => tester.binding.clock.now().millisecondsSinceEpoch;
    await tester.pumpWidget(MaterialApp(home: MemoryPalaceScreen(key: ValueKey(tag), state: state, content: content)));
    await tester.pump();
    await tester.pump();
    return (tester.state(find.byType(MemoryPalaceScreen)) as dynamic).session as MemoryPalaceSession;
  }

  Future<void> tap(WidgetTester tester, String key) async {
    final f = find.byKey(ValueKey(key));
    await tester.ensureVisible(f);
    await tester.tap(f);
    await tester.pump();
  }

  testWidgets('🔴 два предмета разложены → экран закрыли → открыли: та же расстановка и фаза', (tester) async {
    var s = await boot(tester);
    await tap(tester, 'mp-start');
    await tap(tester, 'mp-to-place');
    final t = [for (final i in s.round.targetItems) i.id];
    await tap(tester, 'item-${t[0]}');
    await tap(tester, 'locus-0');
    await tap(tester, 'item-${t[1]}');
    await tap(tester, 'locus-1');
    await tester.pump(const Duration(milliseconds: 500));   // отложенная запись
    expect(state.get(_key), isNotNull, reason: 'после хода партия обязана лечь в общий ключ');
    final seed = s.round.seed;

    await tester.pumpWidget(const SizedBox());   // экран снесли
    s = await boot(tester, tag: 'b');
    expect(s.round.seed, seed, reason: 'поднята та же раскладка');
    expect(s.phase, MemoryPalacePhase.place);
    expect(s.placements.take(2), [t[0], t[1]]);
  });

  testWidgets('🔴 запись веб-половины в общем ключе поднимается нативно', (tester) async {
    final ref = jsonDecode(File('test/fixtures/memory-palace-resume-reference.json').readAsStringSync()) as Map;
    final web = (ref['cases'] as List).cast<Map>().firstWhere((c) => c['name'] == 'recall-forward' && c['level'] == 4);
    await state.set(_key, jsonEncode({'v': 1, 'savedAt': DateTime.now().millisecondsSinceEpoch, 'state': web['snapshot']}));
    final s = await boot(tester);
    expect(s.round.seed, web['seed']);
    expect(s.phase, MemoryPalacePhase.recallForward);
    expect(s.forwardResponses, hasLength(2));
    expect(find.byKey(ValueKey('candidate-${s.round.recallCandidates.first.id}')), findsOneWidget,
        reason: 'поднятая партия сразу показывает выбор ответа');
  });

  testWidgets('шаг зарядки старую партию не поднимает и идёт на уровне шага', (tester) async {
    final ref = jsonDecode(File('test/fixtures/memory-palace-resume-reference.json').readAsStringSync()) as Map;
    final web = (ref['cases'] as List).cast<Map>().firstWhere((c) => c['name'] == 'study' && c['level'] == 9);
    await state.set(_key, jsonEncode({'v': 1, 'savedAt': DateTime.now().millisecondsSinceEpoch, 'state': web['snapshot']}));
    GamePreset.set({'wu': '1', 'level': '5'});
    final s = await boot(tester);
    expect(s.round.seed, isNot(web['seed']));
    expect(s.round.level, 5, reason: 'уровень из адреса важнее сохранённого');
    expect(s.phase, MemoryPalacePhase.route, reason: 'шаг зарядки стартует сам');
  });

  testWidgets('«Заново» — новая раскладка и запись стёрта; две партии подряд не повторяют раскладку', (tester) async {
    final s = await boot(tester);
    await tap(tester, 'mp-start');
    await tap(tester, 'mp-to-place');
    await tap(tester, 'item-${s.round.targetItems.first.id}');
    await tap(tester, 'locus-0');
    await tester.pump(const Duration(milliseconds: 500));
    expect(state.get(_key), isNotNull);
    final before = s.round.seed;
    await tester.tap(find.byIcon(Icons.refresh).first);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    final after = (tester.state(find.byType(MemoryPalaceScreen)) as dynamic).session as MemoryPalaceSession;
    expect(after.round.seed, isNot(before), reason: 'зерно свежее на каждый заход (как в вебе)');
    expect(after.phase, MemoryPalacePhase.route);
    expect(state.get(_key), isNull, reason: '«Заново» стирает недоигранную партию');
  });
}
