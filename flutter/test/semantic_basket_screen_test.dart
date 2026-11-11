import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/semantic_sort/basket_field.dart';
import 'package:psygames_flutter/games/semantic_sort/basket_model.dart';
import 'package:psygames_flutter/games/semantic_sort/screen.dart';
import 'package:psygames_flutter/games/languages/lang_picker.dart';
import 'package:psygames_flutter/shell/game_clock.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/restart_scope.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

const basketVocab = <Map<String, String>>[
  {'en': 'soft', 'ru': 'мягкий', 'es': 'suave', 'cat': 'adjectives'},
  {'en': 'warm', 'ru': 'тёплый', 'es': 'cálido', 'cat': 'adjectives'},
  {'en': 'easy', 'ru': 'лёгкий', 'es': 'fácil', 'cat': 'adjectives'},
  {'en': 'bright', 'ru': 'яркий', 'es': 'brillante', 'cat': 'adjectives'},
  {'en': 'chair', 'ru': 'стул', 'es': 'silla', 'cat': 'home'},
  {'en': 'lamp', 'ru': 'лампа', 'es': 'lámpara', 'cat': 'home'},
  {'en': 'mirror', 'ru': 'зеркало', 'es': 'espejo', 'cat': 'home'},
  {'en': 'sofa', 'ru': 'диван', 'es': 'sofá', 'cat': 'home'},
];

void main() {
  final binding = TestWidgetsFlutterBinding.ensureInitialized();
  late SharedState state;
  final reports = <Map<String, dynamic>>[];
  setUp(() async {
    resetGameClock();
    gameWallMs = () => binding.clock.now().millisecondsSinceEpoch;
    SharedPreferences.setMockInitialValues({
      'language': 'en',
      'psygames_active_profile': 'nzt48',
    });
    state = await SharedState.open();
    await L.load('en');
    reports.clear();
    SessionReport.sink = (s) async =>
        reports.add(jsonDecode(s) as Map<String, dynamic>);
    GamePreset.set({'auto': '1', 'mode': 'baskets', 'targetLang': 'en'});
  });
  tearDown(() {
    GamePreset.clear();
    SessionReport.sink = null;
    resetGameClock();
  });
  Widget app({List<Map<String, String>> vocab = basketVocab}) => MaterialApp(
    home: RestartScope(
      builder: (_) => SemanticSortScreen(
        state: state,
        random: () => .4,
        vocabOverride: vocab,
        distractorsOverride: const {},
      ),
    ),
  );
  SemanticBasketParty party(WidgetTester t) =>
      t.widget<SemanticBasketField>(find.byType(SemanticBasketField)).party;
  Future<void> place(WidgetTester t, int id, String cat) async {
    await t.tap(find.byKey(Key('semantic-card-$id')));
    await t.pumpAndSettle();
    await t.tap(find.byKey(Key('semantic-basket-$cat')));
    await t.pump();
  }

  testWidgets(
    'tap + tap: stable slots, honest score and one report after all cards',
    (t) async {
      await t.pumpWidget(app());
      await t.pumpAndSettle();
      final p = party(t);
      final anchor = t.getRect(find.byKey(const Key('semantic-card-1')));
      await place(t, 0, p.rounds[0].correctCat);
      expect(t.getRect(find.byKey(const Key('semantic-card-1'))), anchor);
      expect(find.byKey(const Key('semantic-card-0')), findsNothing);
      for (var i = 1; i < p.rounds.length; i++) {
        await place(t, i, p.rounds[i].correctCat);
      }
      await t.pump(const Duration(seconds: 1));
      await t.pumpAndSettle();
      expect(find.byKey(const Key('semantic-score')), findsOneWidget);
      expect(reports, hasLength(1));
      expect(reports.single['details']['mode'], 'baskets');
      expect(reports.single['details']['accuracy'], 1);
      expect(state.get(SharedState.levelKey('semantic_sort', 'nzt48')), '2');
    },
  );

  testWidgets(
    'wrong basket returns card; repeated correction does not become 100%',
    (t) async {
      await t.pumpWidget(app());
      await t.pumpAndSettle();
      final p = party(t);
      for (var id = 0; id < 2; id++) {
        await place(
          t,
          id,
          p.rounds[id].cats.firstWhere((c) => c != p.rounds[id].correctCat),
        );
        expect(p.placed(id), isFalse);
        expect(find.byKey(Key('semantic-card-$id')), findsOneWidget);
        // The wrong card remains selected; tap the correct basket directly.
        await t.tap(
          find.byKey(Key('semantic-basket-${p.rounds[id].correctCat}')),
        );
        await t.pumpAndSettle();
      }
      for (var i = 2; i < p.rounds.length; i++) {
        await place(t, i, p.rounds[i].correctCat);
      }
      await t.pump(const Duration(seconds: 1));
      await t.pumpAndSettle();
      expect(reports.single['details']['accuracy'], .75);
      expect(reports.single['errors'], 2);
      expect(
        state.get(SharedState.levelKey('semantic_sort', 'nzt48')),
        anyOf(isNull, '1'),
      );
    },
  );

  testWidgets('long press drag accepts a real card in the basket', (t) async {
    await t.pumpWidget(app());
    await t.pumpAndSettle();
    final p = party(t);
    final g = await t.startGesture(
      t.getCenter(find.byKey(const Key('semantic-card-0'))),
    );
    await t.pump(const Duration(milliseconds: 250));
    await g.moveTo(
      t.getCenter(find.byKey(Key('semantic-basket-${p.rounds[0].correctCat}'))),
    );
    await t.pump(const Duration(milliseconds: 100));
    await g.up();
    await t.pumpAndSettle();
    expect(p.placed(0), isTrue);
    expect(p.completed, 1);
    expect(p.errors, 0);
  });

  testWidgets(
    'pause holds the completed-board timer; dispose cancels late result',
    (t) async {
      await t.pumpWidget(app());
      await t.pumpAndSettle();
      final p = party(t);
      for (var i = 0; i < p.rounds.length; i++) {
        await place(t, i, p.rounds[i].correctCat);
      }
      final release = holdGame();
      await t.pump(const Duration(seconds: 2));
      expect(reports, isEmpty);
      await t.pumpWidget(const MaterialApp(home: SizedBox()));
      release();
      await t.pump(const Duration(seconds: 2));
      expect(reports, isEmpty);
    },
  );

  testWidgets(
    'two bilingual boards finish a preset once without moving the personal ladder',
    (t) async {
      GamePreset.set({
        'wu': '1',
        'mode': 'baskets',
        'targetLang': 'en',
        'bilingual': '1',
        'lang2': 'es',
        'rounds': '12',
        'cats': '2',
      });
      const extra = <Map<String, String>>[
        {'en': 'good', 'ru': 'хороший', 'es': 'bueno', 'cat': 'adjectives'},
        {'en': 'cold', 'ru': 'холодный', 'es': 'frío', 'cat': 'adjectives'},
        {'en': 'table', 'ru': 'стол', 'es': 'mesa', 'cat': 'home'},
        {'en': 'door', 'ru': 'дверь', 'es': 'puerta', 'cat': 'home'},
      ];
      await t.pumpWidget(app(vocab: [...basketVocab, ...extra]));
      await t.pumpAndSettle();
      final p = party(t);
      expect(p.batches, [6, 6]);
      expect(find.text('EN'), findsWidgets);
      expect(find.text('ES'), findsWidgets);
      while (!p.complete) {
        for (final id in p.visibleIds.toList()) {
          await place(t, id, p.rounds[id].correctCat);
        }
        await t.pump(const Duration(seconds: 1));
        await t.pumpAndSettle();
      }
      expect(find.byKey(const Key('semantic-score')), findsOneWidget);
      expect(reports, hasLength(1));
      expect(reports.single['score'], 12);
      expect(reports.single['details']['target_lang'], 'en+es');
      expect(
        state.get(SharedState.levelKey('semantic_sort', 'nzt48')),
        anyOf(isNull, '1'),
      );
    },
  );

  testWidgets('restart rejects callbacks from the disposed old board', (
    t,
  ) async {
    await t.pumpWidget(app());
    await t.pumpAndSettle();
    final oldField = t.widget<SemanticBasketField>(
      find.byType(SemanticBasketField),
    );
    RestartScope.of(t.element(find.byType(SemanticSortScreen)))!();
    await t.pumpAndSettle();
    final current = party(t);
    oldField.onAnswer(0, oldField.party.rounds[0].correctCat);
    await t.pump(const Duration(seconds: 1));
    expect(current.completed, 0);
    expect(current.errors, 0);
    expect(reports, isEmpty);
  });

  testWidgets(
    'normal entry offers baskets and preserves the single-word mode',
    (t) async {
      GamePreset.clear();
      await t.pumpWidget(app());
      await t.pumpAndSettle();
      expect(find.text(L.t('semanticBasketMode')), findsOneWidget);
      expect(find.text(L.t('semanticBasketHelp')), findsOneWidget);
      await t.tap(find.byKey(const Key('semantic-mode')));
      await t.pumpAndSettle();
      await t.tap(find.text(L.t('semanticSingleMode')).last);
      await t.pumpAndSettle();
      await t.ensureVisible(find.byKey(const Key('semantic-start')));
      await t.tap(find.byKey(const Key('semantic-start')));
      await t.pumpAndSettle();
      expect(find.byKey(const Key('semantic-word')), findsOneWidget);
      expect(find.byType(SemanticBasketField), findsNothing);
    },
  );

  testWidgets('walkthrough does not reveal any word from the scored board', (
    t,
  ) async {
    await t.pumpWidget(app());
    await t.pumpAndSettle();
    final words = party(t).rounds.map((r) => r.word).toSet();
    await t.tap(find.byKey(const Key('game-lesson')));
    await t.pumpAndSettle();
    for (final word in words) {
      expect(find.text(word), findsNothing);
    }
    expect(find.textContaining(L.t('semanticSortIntroDesc')), findsWidgets);
  });

  testWidgets(
    'normal baskets entry -> pass -> next level rejects previous party callbacks',
    (t) async {
      GamePreset.clear();
      await t.pumpWidget(app());
      await t.pumpAndSettle();
      await t.ensureVisible(find.byKey(const Key('semantic-start')));
      await t.tap(find.byKey(const Key('semantic-start')));
      await t.pumpAndSettle();
      final previousField = t.widget<SemanticBasketField>(
        find.byType(SemanticBasketField),
      );
      final previous = party(t);
      expect(previous.rounds.first.lang, 'es');
      for (final id in previous.visibleIds) {
        await place(t, id, previous.rounds[id].correctCat);
      }
      await t.pump(const Duration(seconds: 1));
      await t.pumpAndSettle();
      expect(reports, hasLength(1));
      expect(state.get(SharedState.levelKey('semantic_sort', 'nzt48')), '2');
      await t.tap(find.byKey(const Key('semantic-again')));
      await t.pumpAndSettle();
      await t.ensureVisible(find.byKey(const Key('semantic-start')));
      await t.tap(find.byKey(const Key('semantic-start')));
      await t.pumpAndSettle();
      final current = party(t);
      expect(identical(previous, current), isFalse);
      previousField.onAnswer(0, previous.rounds[0].correctCat);
      await t.pump();
      expect(
        current.completed,
        0,
        reason: 'late input belongs to the previous party',
      );
      expect(current.errors, 0);
      expect(reports, hasLength(1));
    },
  );

  testWidgets(
    'autostart target stays visible when returning to configuration',
    (t) async {
      await t.pumpWidget(app());
      await t.pumpAndSettle();
      final p = party(t);
      for (final id in p.visibleIds) {
        await place(t, id, p.rounds[id].correctCat);
      }
      await t.pump(const Duration(seconds: 1));
      await t.pumpAndSettle();
      await t.tap(find.byKey(const Key('semantic-again')));
      await t.pumpAndSettle();
      final picker = t.widget<LangDropdown>(
        find.byKey(const Key('semantic-lang')),
      );
      expect(picker.value, 'en');
      expect(
        picker.langs,
        contains('en'),
        reason:
            'keep the explicit autostart language visible, not a blank picker',
      );
      final dropdown = t.widget<DropdownButtonFormField<String>>(
        find.descendant(
          of: find.byKey(const Key('semantic-lang')),
          matching: find.byType(DropdownButtonFormField<String>),
        ),
      );
      expect(dropdown.initialValue, 'en');
    },
  );

  testWidgets('two basket taps in the same frame never crash or score twice', (
    t,
  ) async {
    await t.pumpWidget(app());
    await t.pumpAndSettle();
    final p = party(t);
    await t.tap(find.byKey(const Key('semantic-card-0')));
    await t.pumpAndSettle();
    final target = find.byKey(Key('semantic-basket-${p.rounds[0].correctCat}'));
    await t.tap(target);
    await t.tap(target); // Deliberately no frame/rebuild between these inputs.
    await t.pumpAndSettle();
    expect(t.takeException(), isNull);
    expect(p.completed, 1);
    expect(p.correctFirst, 1);
    expect(p.errors, 0);
  });

  testWidgets('dropping outside baskets is not an error or a scored answer', (
    t,
  ) async {
    await t.pumpWidget(app());
    await t.pumpAndSettle();
    final p = party(t);
    final g = await t.startGesture(
      t.getCenter(find.byKey(const Key('semantic-card-0'))),
    );
    await t.pump(const Duration(milliseconds: 250));
    await g.moveTo(const Offset(5, 5));
    await t.pump();
    await g.up();
    await t.pumpAndSettle();
    expect(p.completed, 0);
    expect(p.errors, 0);
    expect(find.byKey(const Key('semantic-card-0')), findsOneWidget);
  });

  testWidgets(
    'wrong drag returns the card, corrected drag keeps first-attempt score honest',
    (t) async {
      await t.pumpWidget(app());
      await t.pumpAndSettle();
      final p = party(t);
      Future<void> dragTo(String cat) async {
        final g = await t.startGesture(
          t.getCenter(find.byKey(const Key('semantic-card-0'))),
        );
        await t.pump(const Duration(milliseconds: 250));
        await g.moveTo(t.getCenter(find.byKey(Key('semantic-basket-$cat'))));
        await t.pump();
        await g.up();
        await t.pumpAndSettle();
      }

      await dragTo(
        p.rounds[0].cats.firstWhere((c) => c != p.rounds[0].correctCat),
      );
      expect(p.completed, 0);
      expect(p.errors, 1);
      expect(find.byKey(const Key('semantic-card-0')), findsOneWidget);
      await dragTo(p.rounds[0].correctCat);
      expect(p.completed, 1);
      expect(p.correctFirst, 0);
      expect(p.errors, 1);
    },
  );

  testWidgets('selected single-word mode survives the shared restart', (
    t,
  ) async {
    GamePreset.clear();
    await t.pumpWidget(app());
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('semantic-mode')));
    await t.pumpAndSettle();
    await t.tap(find.text(L.t('semanticSingleMode')).last);
    await t.pumpAndSettle();
    await t.ensureVisible(find.byKey(const Key('semantic-start')));
    await t.tap(find.byKey(const Key('semantic-start')));
    await t.pumpAndSettle();
    expect(find.byKey(const Key('semantic-word')), findsOneWidget);
    RestartScope.of(t.element(find.byType(SemanticSortScreen)))!();
    await t.pumpAndSettle();
    expect(find.text(L.t('semanticSingleMode')), findsOneWidget);
    await t.ensureVisible(find.byKey(const Key('semantic-start')));
    await t.tap(find.byKey(const Key('semantic-start')));
    await t.pumpAndSettle();
    expect(find.byKey(const Key('semantic-word')), findsOneWidget);
    expect(find.byType(SemanticBasketField), findsNothing);
  });

  testWidgets('a workout does not overwrite the personal mode preference', (
    t,
  ) async {
    const key = 'psygames_semantic_sort_mode_nzt48';
    await state.set(key, 'single');
    GamePreset.set({
      'wu': '1',
      'mode': 'baskets',
      'targetLang': 'en',
      'rounds': '4',
      'cats': '2',
    });
    await t.pumpWidget(app());
    await t.pumpAndSettle();
    expect(find.byType(SemanticBasketField), findsOneWidget);
    expect(state.get(key), 'single');
    final p = party(t);
    for (final id in p.visibleIds) {
      await place(t, id, p.rounds[id].correctCat);
    }
    await t.pump(const Duration(seconds: 1));
    await t.pumpAndSettle();
    expect(state.get(key), 'single');
    expect(
      state.get(SharedState.levelKey('semantic_sort', 'nzt48')),
      anyOf(isNull, '1'),
    );
  });
}
