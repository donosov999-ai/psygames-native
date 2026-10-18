import 'dart:async';

import 'package:ecosystem_account/ecosystem_account.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/sudoku_support_screen.dart';
import 'package:psygames_flutter/shell/sudoku_support_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _UnusedVault implements AccountVault {
  int accesses = 0;
  Never _unexpected() {
    accesses++;
    throw StateError('Widget fake must not access account credentials');
  }

  @override
  Future<String?> read(String key) async => _unexpected();
  @override
  Future<void> write(String key, String value) async => _unexpected();
  @override
  Future<void> remove(String key) async => _unexpected();
}

/// Only the screen's service boundary is faked; no authenticated SDK or HTTP.
class _Support extends SudokuSupportService {
  _Support(SharedState state, EcosystemAccount account, this.calls)
    : super(state: state, account: account, backupEnabled: () => false);

  final List<String> calls;
  final enables = <(String, String)>[];
  final applies = <(String, bool)>[];
  bool available = true;
  bool working = false;
  bool choice = false;
  bool requestChoice = false;
  bool pendingLocalWrite = false;
  bool dead = false;
  String? failure;
  List<Map<String, dynamic>> grantRows = [];
  List<Map<String, dynamic>> correctionRows = [];
  Completer<void>? pendingRefresh;

  @override
  bool get ready => available;
  @override
  bool get busy => working;
  @override
  String? get error => failure;
  @override
  bool get needsResumeChoice => choice;
  @override
  bool get hasPendingLocalWrite => pendingLocalWrite;
  @override
  List<Map<String, dynamic>> get grants => grantRows;
  @override
  List<Map<String, dynamic>> get corrections => correctionRows;

  @override
  Future<void> refresh() async {
    calls.add('refresh');
    final pending = pendingRefresh;
    if (pending != null) {
      working = true;
      notifyListeners();
      await pending.future;
      working = false;
      calls.add('operation-finished');
      if (!dead) notifyListeners();
    }
  }

  @override
  Future<void> enable({required String profile, required String road}) async {
    calls.add('enable');
    enables.add((profile, road));
  }

  @override
  Future<void> revoke(String grantId) async => calls.add('revoke:$grantId');

  @override
  Future<void> apply(
    String correctionId, {
    bool restartSavedGame = false,
  }) async {
    calls.add('apply');
    applies.add((correctionId, restartSavedGame));
    choice = requestChoice && !restartSavedGame;
    notifyListeners();
  }

  @override
  void suspend() {
    calls.add('suspend');
    working = false;
    if (!dead) notifyListeners();
  }

  @override
  Future<void> drain() async {
    calls.add('drain');
    await pendingRefresh?.future;
    calls.add('drained');
  }

  @override
  void dispose() {
    dead = true;
    super.dispose();
  }
}

class _Pops extends NavigatorObserver {
  _Pops(this.calls);
  final List<String> calls;
  @override
  void didPop(Route<dynamic> route, Route<dynamic>? previousRoute) {
    if (route.settings.name == 'sudoku-support') calls.add('pop');
    super.didPop(route, previousRoute);
  }
}

Map<String, dynamic> _correction(
  String id, {
  String status = 'pending',
  String profile = 'women',
}) => {
  'id': id,
  'profile': profile,
  'road': 'normal',
  'target_level': 80,
  'status': status,
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late SharedState state;
  late _UnusedVault vault;
  late EcosystemAccount account;
  late _Support support;
  late List<String> calls;
  late GlobalKey<NavigatorState> navigator;

  setUp(() async {
    SharedPreferences.setMockInitialValues({
      'psygames_active_profile': 'kids',
      'psygames_sudoku_level_women': '78',
      'psygames_resume_sudoku_women': 'opaque-original-board',
    });
    state = await SharedState.open();
    vault = _UnusedVault();
    account = EcosystemAccount(
      appId: 'psygames',
      url: 'https://example.supabase.co',
      publishableKey: 'unused-public',
      callback: Uri.parse('com.psygames.app://auth/callback'),
      vault: vault,
    );
    calls = [];
    support = _Support(state, account, calls);
    navigator = GlobalKey<NavigatorState>();
  });

  Future<void> open(
    WidgetTester tester, {
    String language = 'en',
    bool large = false,
  }) async {
    await tester.runAsync(() => L.load(language));
    expect(L.locale, language);
    expect(L.has('sudokuSupportTitle'), true);
    await tester.binding.setSurfaceSize(
      large ? const Size(320, 568) : const Size(390, 844),
    );
    addTearDown(() async {
      support.pendingRefresh?.completeIfPending();
      await tester.pumpWidget(const SizedBox.shrink());
      support.dispose();
      await account.dispose();
      expect(vault.accesses, 0);
      state.dispose();
      await tester.binding.setSurfaceSize(null);
    });
    await tester.pumpWidget(
      MaterialApp(
        navigatorKey: navigator,
        navigatorObservers: [_Pops(calls)],
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(large ? 1.8 : 1)),
          child: child!,
        ),
        home: Scaffold(
          body: Center(
            child: TextButton(
              key: const Key('gameplay-home'),
              onPressed: () => navigator.currentState!.push(
                MaterialPageRoute<void>(
                  settings: const RouteSettings(name: 'sudoku-support'),
                  builder: (_) =>
                      SudokuSupportScreen(service: support, profile: 'women'),
                ),
              ),
              child: const Text('Open account support'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.byKey(const Key('gameplay-home')));
    await tester.pumpAndSettle();
  }

  Future<void> tap(WidgetTester tester, String key) async {
    final target = find.byKey(Key(key));
    await tester.scrollUntilVisible(
      target,
      180,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    await tester.tap(target);
    await tester.pumpAndSettle();
  }

  for (final language in ['ru', 'en']) {
    for (final active in [false, true]) {
      testWidgets(
        '$language 320x568 at 1.8x: ${active ? 'active grant, fixes, error' : 'enable'} has no overflow',
        (tester) async {
          if (active) {
            support.grantRows = [
              {
                'id': 'grant-a',
                'profile': 'women',
                'road': 'normal',
                'enabled': true,
                'expires_at': DateTime.now()
                    .toUtc()
                    .add(const Duration(hours: 24))
                    .toIso8601String(),
              },
            ];
            support.correctionRows = [
              _correction('pending'),
              _correction('done', status: 'applied'),
            ];
            support.failure = 'ack_uncertain';
          }
          final before = state.snapshot();
          await open(tester, language: language, large: true);
          expect(find.text(L.t('sudokuSupportTitle')), findsOneWidget);
          final bottom = active
              ? find.text(L.t('sudokuSupportApplied'))
              : find.byKey(const Key('support-refresh'));
          await tester.scrollUntilVisible(
            bottom,
            180,
            scrollable: find.byType(Scrollable).first,
          );
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          expect(calls, ['refresh']);
          expect(support.enables, isEmpty);
          expect(support.applies, isEmpty);
          expect(state.snapshot(), before);
        },
      );
    }

    testWidgets(
      '$language initial refresh never enables or applies a pending request',
      (tester) async {
        support.correctionRows = [_correction('pending')];
        final before = state.snapshot();
        await open(tester, language: language);
        expect(calls, ['refresh']);
        expect(support.enables, isEmpty);
        expect(support.applies, isEmpty);
        expect(state.snapshot(), before);
        expect(tester.takeException(), isNull);
      },
    );

    testWidgets(
      '$language explicit enable uses selected road and screen profile',
      (tester) async {
        await open(tester, language: language);
        await tap(tester, 'support-road');
        await tester.tap(find.text(L.t('sudokuRoadHard')).last);
        await tester.pumpAndSettle();
        expect(calls, ['refresh'], reason: 'Changing the road is not consent');
        await tap(tester, 'support-enable');
        expect(support.enables, [('women', 'hard')]);
        expect(
          state.activeProfile,
          'kids',
          reason: 'Screen profile must not be replaced by global profile',
        );
        expect(calls, ['refresh', 'enable', 'refresh']);
        expect(support.applies, isEmpty);
      },
    );

    testWidgets(
      '$language 320x568 at 1.8x: saved-board dialog has no overflow',
      (tester) async {
        support.requestChoice = true;
        support.correctionRows = [_correction('pending')];
        await open(tester, language: language, large: true);
        await tap(tester, 'support-apply-pending');
        expect(find.byType(AlertDialog), findsOneWidget);
        expect(
          tester.takeException(),
          isNull,
          reason: 'Consent text and restart actions must fit or scroll at accessibility sizes',
        );
        expect(support.applies, [('pending', false)]);
      },
    );

    for (final confirm in [false, true]) {
      testWidgets(
        '$language saved-board dialog ${confirm ? 'confirms explicit restart' : 'cancel never restarts'}',
        (tester) async {
          support.requestChoice = true;
          support.correctionRows = [
            _correction('pending'),
            _correction('other-profile', profile: 'kids'),
          ];
          final before = state.snapshot();
          await open(tester, language: language);
          await tap(tester, 'support-apply-pending');
          expect(find.byType(AlertDialog), findsOneWidget);
          expect(find.text(L.t('sudokuSupportSavedTitle')), findsOneWidget);
          expect(support.applies, [('pending', false)]);
          expect(
            find.byKey(const Key('support-apply-other-profile')),
            findsNothing,
          );
          expect(tester.takeException(), isNull);
          if (confirm) {
            await tester.ensureVisible(
              find.byKey(const Key('support-restart-confirm')),
            );
            await tester.tap(find.byKey(const Key('support-restart-confirm')));
          } else {
            await tester.tap(
              find.widgetWithText(TextButton, L.t('btn_cancel')),
            );
          }
          await tester.pumpAndSettle();
          expect(find.byType(AlertDialog), findsNothing);
          expect(
            support.applies,
            confirm
                ? [('pending', false), ('pending', true)]
                : [('pending', false)],
          );
          expect(
            state.snapshot(),
            before,
            reason: 'Only service unit tests exercise persistence',
          );
          expect(tester.takeException(), isNull);
        },
      );
    }
  }

  for (final systemBack in [false, true]) {
    testWidgets(
      '${systemBack ? 'system back' : 'app bar back'} suspends then drains pending operation before pop',
      (tester) async {
        await open(tester);
        support.pendingRefresh = Completer<void>();
        await tester.ensureVisible(find.byKey(const Key('support-refresh')));
        await tester.tap(find.byKey(const Key('support-refresh')));
        await tester.pump();
        expect(support.busy, true);
        calls.clear();
        if (systemBack) {
          await navigator.currentState!.maybePop();
        } else {
          await tester.tap(find.byType(BackButton));
        }
        await tester.pump();
        expect(calls, ['suspend', 'drain']);
        expect(find.byType(SudokuSupportScreen), findsOneWidget);
        expect(find.byKey(const Key('gameplay-home')), findsNothing);
        await navigator.currentState!.maybePop();
        await tester.pump(const Duration(milliseconds: 50));
        expect(calls, [
          'suspend',
          'drain',
        ], reason: 'Repeated back cannot bypass pending drain');
        support.pendingRefresh!.complete();
        await tester.pumpAndSettle();
        expect(
          calls.indexOf('operation-finished'),
          lessThan(calls.indexOf('drained')),
        );
        expect(calls.indexOf('drained'), lessThan(calls.indexOf('pop')));
        expect(find.byType(SudokuSupportScreen), findsNothing);
        expect(find.byKey(const Key('gameplay-home')), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );
  }
}

extension on Completer<void> {
  void completeIfPending() {
    if (!isCompleted) complete();
  }
}
