import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/switching_task/model.dart';
import 'package:psygames_flutter/games/switching_task/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/level_rules.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// «ПЕРЕКЛЮЧЕНИЕ ЗАДАЧ»: МАТЕРИАЛ ПАРТИИ — ИЗ АДРЕСА И С ЭКРАНА НАСТРОЙКИ, КАК У ВЕБА.
///
/// Веб читает `str('stimMode', 'mix')` и даёт выбрать «Что показывать» из четырёх режимов.
/// Натив до 07.10.2026 не делал ни того, ни другого: адрес с `num3` молча открывал
/// «цифру+букву», а сменить материал было нечем (задача b02a91c2). Проба смотрит на ЭКРАН:
/// правила в настройке и сам стимул в партии.
void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    await L.load('ru');
    LevelRules.debugSetTable(const {});
  });
  tearDown(() {
    GamePreset.clear();
    LevelRules.debugSetTable(null);
  });

  String? textOf(Key key) {
    final e = find.byKey(key).evaluate();
    return e.isEmpty ? null : (e.first.widget as Text).data;
  }

  bool selected(StimMode m) => (find.byKey(Key('switching-mode-${m.name}')).evaluate().single.widget as ChoiceChip).selected;

  /// Начать партию и дождаться первого стимула в коробке.
  Future<String> firstStimulus(WidgetTester tester) async {
    await tester.tap(find.text(L.t('start')));
    for (var i = 0; i < 40; i++) {
      await tester.pump(const Duration(milliseconds: 50));
      final s = textOf(const Key('switching-stimulus'));
      if (s != null && s.isNotEmpty) return s;
    }
    fail('стимул не показан');
  }

  /// Правила режима — то, что экран настройки обязан назвать до начала.
  String rulesOf(StimMode m) {
    final a = taskMeta(m, 0), b = taskMeta(m, 1);
    return '${a.cue} → ${a.left}/${a.right}\n${b.cue} → ${b.left}/${b.right}';
  }

  final stimulusShape = {
    StimMode.mix: RegExp(r'^\d[A-Z]$'),
    StimMode.num2: RegExp(r'^\d{2}$'),
    StimMode.num3: RegExp(r'^\d{3}$'),
    StimMode.letters: RegExp(r'^[A-Z]$'),
  };

  for (final m in StimMode.values) {
    testWidgets('🔴 адрес stimMode=${m.name}: выбран, правила и стимул этого режима', (tester) async {
      GamePreset.set({'stimMode': m.name});
      await tester.pumpWidget(MaterialApp(home: SwitchingTaskScreen(state: state)));
      await tester.pumpAndSettle();
      expect(selected(m), isTrue, reason: 'на выборе отмечен не тот режим');
      expect(textOf(const Key('switching-rules')), rulesOf(m));
      final s = await firstStimulus(tester);
      expect(stimulusShape[m]!.hasMatch(s), isTrue, reason: 'стимул «$s» не из режима ${m.name}');
      await tester.pumpWidget(const SizedBox());
    });
  }

  testWidgets('неизвестное имя в адресе — режим экрана, а не падение', (tester) async {
    GamePreset.set({'stimMode': 'emoji'});
    await tester.pumpWidget(MaterialApp(home: SwitchingTaskScreen(state: state)));
    await tester.pumpAndSettle();
    expect(selected(StimMode.mix), isTrue);
    expect(textOf(const Key('switching-rules')), rulesOf(StimMode.mix));
  });

  testWidgets('🔴 выбор на экране: «Только буквы» — правила и стимул сменились, уровень тот же', (tester) async {
    await tester.pumpWidget(MaterialApp(home: SwitchingTaskScreen(state: state)));
    await tester.pumpAndSettle();
    final level = find.text('${L.t('level')} 1');
    expect(level, findsOneWidget);
    expect(selected(StimMode.mix), isTrue, reason: 'по умолчанию — цифра+буква, как у веба');

    await tester.tap(find.byKey(const Key('switching-mode-letters')));
    await tester.pumpAndSettle();
    expect(selected(StimMode.letters), isTrue);
    expect(selected(StimMode.mix), isFalse);
    expect(textOf(const Key('switching-rules')), rulesOf(StimMode.letters));
    expect(level, findsOneWidget, reason: 'смена материала не двигает лестницу');
    final s = await firstStimulus(tester);
    expect(stimulusShape[StimMode.letters]!.hasMatch(s), isTrue, reason: 'стимул «$s» не буква');
    // Посреди партии выбора нет: смешать пробы двух режимов в одну цену переключения нельзя.
    expect(find.byKey(const Key('switching-mode-mix')), findsNothing);
    await tester.pumpWidget(const SizedBox());
  });

  test('подписи выбора — словом из словаря на 12 языках, а не ключом', () async {
    final cyr = RegExp('[А-Яа-яЁё]');
    for (final lang in ['ru', 'en', 'de', 'es', 'pt', 'fr', 'it', 'zh', 'ja', 'ko', 'hi', 'ar']) {
      await L.load(lang);
      for (final key in ['stimulusLabel', 'switchMode_mix', 'switchMode_num2', 'switchMode_num3', 'switchMode_letters']) {
        expect(L.t(key), isNot(key), reason: '$lang: «$key» вернул ключ');
      }
      for (final m in StimMode.values) {
        final label = switchModeLabel(m);
        expect(label.trim(), isNotEmpty, reason: '$lang ${m.name}');
        if (lang != 'ru') expect(cyr.hasMatch(label), isFalse, reason: '$lang ${m.name}: «$label» по-русски');
      }
    }
  });

  group('выбор на малых экранах', () {
    for (final lang in ['ru', 'en', 'de', 'hi', 'ar']) {
      for (final size in const [Size(320, 568), Size(360, 640), Size(390, 844)]) {
        testWidgets('$lang ${size.width.toInt()}×${size.height.toInt()}', (tester) async {
          await L.load(lang);
          tester.view.physicalSize = size * 3;
          tester.view.devicePixelRatio = 3;
          addTearDown(tester.view.reset);
          await tester.pumpWidget(MaterialApp(home: SwitchingTaskScreen(state: state)));
          await tester.pumpAndSettle();
          final start = tester.getRect(find.text(L.t('start')));
          expect(start.bottom, lessThanOrEqualTo(size.height), reason: '«Начать» ушла за край');
          for (final m in StimMode.values) {
            final r = tester.getRect(find.byKey(Key('switching-mode-${m.name}')));
            expect(r.left >= 0 && r.right <= size.width && r.top >= 0 && r.bottom <= start.top, isTrue,
                reason: '${m.name} за краем или под «Начать»: $r');
          }
          // Правила — то, что обязано быть видно до начала без прокрутки.
          expect(tester.getRect(find.byKey(const Key('switching-rules'))).bottom, lessThanOrEqualTo(start.top),
              reason: 'правила режима ушли под «Начать»');
        });
      }
    }
  });
}
