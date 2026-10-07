import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/anagrams/all_words_board.dart';
import 'package:psygames_flutter/games/anagrams/all_words_screen.dart';
import 'package:psygames_flutter/games/anagrams/board.dart';
import 'package:psygames_flutter/games/anagrams/crossword_board.dart';
import 'package:psygames_flutter/games/anagrams/crossword_screen.dart';
import 'package:psygames_flutter/games/anagrams/model.dart';
import 'package:psygames_flutter/games/anagrams/ring.dart';
import 'package:psygames_flutter/games/anagrams/ring_board.dart';
import 'package:psygames_flutter/games/anagrams/ring_screen.dart';
import 'package:psygames_flutter/games/anagrams/screen.dart';
import 'package:psygames_flutter/games/anagrams/word_lang.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/restart_scope.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ЯЗЫК СЛОВ АНАГРАММ — ПО ПРАВИЛУ ВЕБА, А НЕ РУССКИЙ У ВСЕХ.
///
/// 📍 До 07.10.2026 все четыре экрана создавались без языка, а умолчание было `'ru'`: на
/// английском телефоне человек собирал русские слова, и выбрать язык было негде. Веб
/// выбирал язык по `useWordLanguage`, а выбор появился по двум отчётам Дениса от 05.09
/// («надо добавить выбор языка»). Английский с 01.10 — основной язык продукта.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const key = 'psygames_anagrams_wordlang_nzt48';

  Future<SharedState> stateWith(Map<String, Object> prefs) async {
    SharedPreferences.setMockInitialValues(prefs);
    return SharedState.open();
  }

  setUp(() async {
    GamePreset.clear();
    await L.load('ru');
  });
  tearDown(GamePreset.clear);

  group('правило выбора', () {
    test('ключ — тот же, что у веба: wordLangKey(\'anagrams\', профиль)', () {
      expect(anagramWordLangKey('nzt48'), key);
    });

    test('ничего не выбрано — язык интерфейса, если на нём есть слова, иначе английский', () async {
      for (final (ui, mode, want) in [
        ('en', AnagramMode.classic, 'en'),
        ('ru', AnagramMode.classic, 'ru'),
        ('de', AnagramMode.square, 'de'),
        ('zh', AnagramMode.all, 'en'), // слов на китайском нет
        ('hi', AnagramMode.classic, 'en'),
      ]) {
        final s = await stateWith({'language': ui});
        expect(anagramWordLang(s, mode), want, reason: 'интерфейс $ui, режим ${mode.name}');
      }
    });

    test('выбор человека сильнее языка интерфейса; негодный — молча пропускается', () async {
      expect(anagramWordLang(await stateWith({'language': 'ru', key: 'de'}), AnagramMode.all), 'de');
      expect(anagramWordLang(await stateWith({'language': 'ru', key: 'xx'}), AnagramMode.all), 'ru');
    });

    test('язык из шага зарядки сильнее выбора — и НЕ записывается поверх него', () async {
      final s = await stateWith({'language': 'ru', key: 'de'});
      GamePreset.set({'wu': '1', 'targetLang': 'es'});
      expect(anagramWordLang(s, AnagramMode.classic), 'es');
      expect(s.get(key), 'de');
      GamePreset.set({'wu': '1', 'targetLang': 'zz'}); // негодный шаг — прежний путь
      expect(anagramWordLang(s, AnagramMode.classic), 'de');
    });

    test('язык, которого нет у режима, — английский на эту партию, выбор в хранилище цел', () async {
      final s = await stateWith({'language': 'ru', key: 'ko'});
      expect(anagramWordLang(s, AnagramMode.all), 'ko');
      expect(anagramWordLang(s, AnagramMode.cross), 'ko');
      expect(anagramWordLang(s, AnagramMode.classic), 'en', reason: 'у классики нет корейского');
      expect(s.get(key), 'ko', reason: 'веб тут писал pick(\'en\') и терял выбор — здесь нельзя');
      final ar = await stateWith({key: 'ar'});
      expect(anagramWordLang(ar, AnagramMode.cross), 'en', reason: 'арабский кроссворд не влезает в экран');
      expect(anagramWordLang(ar, AnagramMode.square), 'en', reason: 'колец на арабском нет');
      expect(anagramWordLang(ar, AnagramMode.all), 'ar');
    });
  });

  group('у каждого предложенного языка есть слова', () {
    // Предложить язык и отдать пустой банк — то, от чего веб берёг список режимов.
    // `resolve` молча подменяет незнакомый язык английским, поэтому сверяется и код банка.
    for (final mode in AnagramMode.values) {
      test(mode.name, () async {
        for (final l in anagramLangsOf(mode)) {
          if (mode == AnagramMode.square) {
            final p = await RingPacks.load(l);
            expect(p.locale, l, reason: 'кольца $l подменены другим языком');
            expect(p.rings, isNotEmpty, reason: 'колец $l нет');
          } else {
            final b = await WordBank.load(l);
            expect(b.locale, l, reason: 'набор $l подменён другим языком');
            expect(b.packCount, greaterThan(0), reason: 'наборов $l нет');
            if (mode == AnagramMode.classic) {
              expect(b.wordsOfLength(5), isNotEmpty, reason: 'у классики $l нет слов из пяти букв');
            }
          }
        }
      });
    }
  });

  group('на настоящих экранах', () {
    final latin = RegExp(r'^[A-Za-z]+$');
    final cyrillic = RegExp(r'^[А-Яа-яЁё]+$');

    final cases = <({String name, Widget Function(SharedState) screen, Type board, List<String> Function(WidgetTester) letters})>[
      (
        name: 'классика',
        screen: (s) => AnagramsScreen(state: s),
        board: AnagramBoard,
        letters: (t) => t.widget<AnagramBoard>(find.byType(AnagramBoard)).letters,
      ),
      (
        name: '«Все слова»',
        screen: (s) => AllWordsScreen(state: s),
        board: AllWordsBoard,
        letters: (t) => t.widget<AllWordsBoard>(find.byType(AllWordsBoard)).letters,
      ),
      (
        name: 'кроссворд',
        screen: (s) => CrosswordScreen(state: s),
        board: CrosswordBoard,
        letters: (t) => t.widget<CrosswordBoard>(find.byType(CrosswordBoard)).letters,
      ),
      (
        name: 'слово-квадрат',
        screen: (s) => RingScreen(state: s),
        board: RingBoard,
        letters: (t) => t.widget<RingBoard>(find.byType(RingBoard)).letters,
      ),
    ];

    Future<void> waitBoard(WidgetTester tester, Type board) async {
      await tester.runAsync(() async {
        for (var i = 0; i < 200; i++) {
          await tester.pump(const Duration(milliseconds: 50));
          await Future<void>.delayed(const Duration(milliseconds: 50));
          if (find.byType(board).evaluate().isNotEmpty) break;
        }
      });
      await tester.pump();
      expect(find.byType(board), findsOneWidget, reason: 'поле не поднялось');
    }

    for (final c in cases) {
      testWidgets('🔴 ${c.name}: английский телефон — английские буквы, русский — русские', (tester) async {
        for (final (ui, script) in [('en', latin), ('ru', cyrillic)]) {
          final s = await stateWith({'language': ui});
          await tester.pumpWidget(MaterialApp(key: ValueKey(ui), home: RestartScope(builder: (_) => c.screen(s))));
          await waitBoard(tester, c.board);
          final letters = c.letters(tester);
          expect(letters, isNotEmpty);
          expect(letters.where((l) => !script.hasMatch(l)), isEmpty,
              reason: 'интерфейс $ui, а буквы ${letters.join()} — не той письменности');
        }
      });
    }

    testWidgets('🔴 выбор в паузе: сохраняется, партия начинается на новом языке, ступень та же', (tester) async {
      final s = await stateWith({'language': 'en', 'psygames_anagrams_level_nzt48': '3'});
      await tester.pumpWidget(MaterialApp(home: RestartScope(builder: (_) => AnagramsScreen(state: s))));
      await waitBoard(tester, AnagramBoard);

      await tester.tap(find.byTooltip(L.t('teachPause')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('${L.t('wordLangLabel')} · EN'));
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 200)));
      await tester.pumpAndSettle();
      // Подписи — на своём языке, а языков классики ровно столько, сколько она тянет.
      expect(find.text('Deutsch'), findsOneWidget);
      expect(find.text('한국어'), findsNothing, reason: 'у классики нет корейского — предлагать нельзя');
      await tester.tap(find.byKey(const Key('anagram-wordlang-de')));
      await tester.pumpAndSettle();
      await waitBoard(tester, AnagramBoard);

      expect(s.get(key), 'de');
      expect(s.get('psygames_anagrams_level_nzt48'), '3', reason: 'смена языка сдвинула ступень');
      await tester.tap(find.byTooltip(L.t('teachPause')));
      await tester.pumpAndSettle();
      expect(find.text('${L.t('wordLangLabel')} · DE'), findsOneWidget, reason: 'партия не перешла на немецкий');
    });
  });
}
