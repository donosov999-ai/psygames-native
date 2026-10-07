import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/corsi/model.dart';
import 'package:psygames_flutter/games/corsi/screen.dart';
import 'package:psygames_flutter/shell/game_clock.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/level_rules.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ШАГ «ОЦЕНКИ» ДЛЯ «КОРСИ»: ИГРАЕТСЯ ПО ПРАВИЛАМ ШАГА И ОПОЗНАЁТСЯ ШАГОМ.
///
/// Шаг батареи (frontend/src/services/assessment.ts, ASSESSMENT_PLAYLIST) —
/// `/games/corsi?wu=1&diff=medium&mode=forward`: партия обязана прийти с
/// difficulty 'medium' и mode 'forward' (sessionFitsStep сверяет дословно), а
/// метрику домена «Оценка» берёт из details.span. До 30.09.2026 нативная партия
/// уходила с difficulty = уровень и без details — шаг её не опознавал, и домен
/// «пространственная рабочая память» молча считался средним (z = 0).
///
/// Проба играет шаг тычками по блокам, как человек, у игрока с 12-м уровнем:
/// там обычный ряд — из восьми и в ОБРАТНОМ порядке, а шаг велит прямой и из
/// четырёх. Ряд считывается с экрана по вспышкам — подсматривать в модель нельзя.
void main() {
  late SharedState state;
  final sent = <Map<String, dynamic>>[];

  // Словарь и таблица правил уровней — до пробы, как в приложении (грузятся при запуске).
  // Таблица, догруженная посреди партии, перестраивает шапку каркаса в случайный момент
  // поддельного времени: замер 01.10.2026 — 1 провал из 3 («нажатие мимо блока»), с
  // загрузкой заранее — 3 из 3 зелёные.
  setUpAll(() async {
    await L.load('ru');
    await LevelRules.load();
  });

  setUp(() async {
    SharedPreferences.setMockInitialValues({'psygames_corsi_level_nzt48': '12'});
    state = await SharedState.open();
    sent.clear();
    SessionReport.sink = (json) async => sent.add(jsonDecode(json) as Map<String, dynamic>);
  });

  tearDown(() {
    GamePreset.clear();
    SessionReport.sink = null;
    gameWallMs = () => DateTime.now().millisecondsSinceEpoch;
  });

  int? litBlock(WidgetTester tester) {
    for (var i = 0; i < corsiBlocks; i++) {
      final f = find.byKey(Key('corsi-block-$i'));
      if (f.evaluate().isEmpty) continue;
      final m = tester.widget<Material>(find.ancestor(of: f, matching: find.byType(Material)).first);
      if (m.color == Theme.of(tester.element(f)).colorScheme.primary) return i;
    }
    return null;
  }

  /// Ряд по вспышкам. Новая вспышка — и после тёмного кадра, и когда горящий блок сменился
  /// другим без тёмного кадра между ними.
  Future<List<int>> watch(WidgetTester tester) async {
    final seen = <int>[];
    var dark = true;
    int? last;
    for (var i = 0; i < 120; i++) {
      final lit = litBlock(tester);
      if (lit == null) {
        dark = true;
      } else if (dark || lit != last) {
        seen.add(lit);
        dark = false;
      }
      last = lit;
      await tester.pump(const Duration(milliseconds: 50));
    }
    return seen;
  }

  bool hud(WidgetTester tester, String key, String value) => find
      .byWidgetPredicate((w) => w is Semantics && w.properties.label == '${L.t(key)}: $value')
      .evaluate()
      .isNotEmpty;

  test('параметры шага: длина — желание шага под потолком освоенного, темп классический', () {
    final top = LevelParams.preset(level: 12, want: 4, reverse: false);
    expect([top.startSpan, top.tickMs, top.flashMs, top.holdMs, top.reverse], [4, 800, 500, 0, false],
        reason: 'наверху лесенки (освоено 8) желание не срезается; шаг forward — прямой порядок');
    expect(LevelParams.preset(level: 1, want: 5, reverse: false).startSpan, 4,
        reason: 'освоено 3 — шаг не даёт больше 3 + 1 (capPresetByLevel)');
    expect(LevelParams.preset(level: 3, want: 0, reverse: true).startSpan, LevelParams.of(3).startSpan,
        reason: 'шаг без startLen — длина уровня');
  });

  testWidgets('🔴 шаг «Оценки»: стартует сам, прямой ряд из 4 у 12-го уровня, отчёт опознаётся шагом',
      (tester) async {
    // Паузы показа — на игровых часах каркаса: им нужно поддельное время пробы.
    gameWallMs = () => tester.binding.clock.now().millisecondsSinceEpoch;
    GamePreset.set({'wu': '1', 'diff': 'medium', 'mode': 'forward', 'startLen': '4'});
    await tester.pumpWidget(MaterialApp(home: CorsiScreen(state: state)));
    await tester.pump();
    await tester.pump();
    expect(find.text(L.t('start')), findsNothing, reason: 'шаг стартует сам, экрана «Начать» нет');

    final seq = await watch(tester);
    expect(seq.length, 4, reason: 'длина ряда — из шага (startLen=4), а не 8 от 12-го уровня');
    for (final b in seq) {
      await tester.tap(find.byKey(Key('corsi-block-$b')));
      await tester.pump();
    }
    expect(hud(tester, 'hud_span', '4'), isTrue,
        reason: 'ряд в ПРЯМОМ порядке засчитан: шаг forward, хотя 12-й уровень играет обратным');
    // Пауза после верного ряда — 600 мс, и всё это время последний нажатый блок горит цветом
    // вспышки. Начни смотреть сразу — подсветка нажатия запишется первым блоком нового ряда, а
    // его настоящая первая вспышка потеряется: она загорается в том же кадре, без тёмного
    // промежутка. Тогда «заведомо неверный» блок пробы совпадал с настоящим первым примерно в
    // одном случае из восьми: нажатие засчитывалось верным, игра ждала продолжения, и показа
    // больше не было — «ряд показан: []» (CI PR #152 и замер на маке 02.10.2026: 4 провала из 28).
    await tester.pump(const Duration(milliseconds: 650));

    // Две ошибки подряд заканчивают партию — классический Корси.
    for (var miss = 0; miss < 2; miss++) {
      final next = await watch(tester);
      expect(next, isNotEmpty, reason: 'ряд показан');
      final wrong = List.generate(corsiBlocks, (i) => i).firstWhere((i) => i != next.first);
      await tester.tap(find.byKey(Key('corsi-block-$wrong')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 800));
    }
    await tester.pump(const Duration(seconds: 2));

    expect(sent, hasLength(1), reason: 'партия шага ушла в статистику ровно один раз');
    final s = sent.single;
    // Правило опознания веба (sessionFitsStep) и метрика домена (extractMetric):
    expect(s['game_type'], 'corsi');
    expect('${s['difficulty']} / ${s['mode']}', 'medium / forward',
        reason: 'метки шага — дословно, иначе «Оценка» партию не опознает');
    expect((s['details'] as Map)['span'], 4, reason: 'метрика домена — лучшая взятая длина');
    expect((s['details'] as Map)['level'], 12);
    await tester.pump(const Duration(seconds: 6));
  });
}
