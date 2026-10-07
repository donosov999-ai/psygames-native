import 'app_look.dart';
import 'settings_screen.dart';
import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../games/corsi/screen.dart';
import '../games/n_back/screen.dart';
import '../games/find_move/screen.dart';
import '../games/knights_queens/screen.dart';
import '../games/solitaire_chess/screen.dart';
import '../games/picture_pairs/screen.dart';
import '../games/digit_span/screen.dart';
import '../games/listening_span/screen.dart';
import '../games/ant/screen.dart';
import '../games/bart/screen.dart';
import '../games/choice_rt/screen.dart';
import '../games/cpt/screen.dart';
import '../games/flanker/screen.dart';
import '../games/gonogo/screen.dart';
import '../games/inhibition/screen.dart';
import '../games/iowa/screen.dart';
import '../games/reading_span/screen.dart';
import '../games/posner/screen.dart';
import '../games/proofreading/screen.dart';
import '../games/prl/screen.dart';
import '../games/simon/screen.dart';
import '../games/stop_signal/screen.dart';
import '../games/stroop_emotional/screen.dart';
import '../games/wcst/screen.dart';
import '../games/switching_task/screen.dart';
import '../games/targets/screen.dart';
import '../games/dots_connect/screen.dart';
import '../games/memory_matrix/screen.dart';
import '../games/stroop/screen.dart';
import '../games/submarines/screen.dart';
import '../games/one_line/screen.dart';
import '../games/anagrams/screen.dart';
import '../games/anagrams/all_words_screen.dart';
import '../games/anagrams/crossword_screen.dart';
import '../games/anagrams/ring_screen.dart';
import '../games/deep/screen.dart';
import '../games/fractal/screen.dart';
import '../games/goods_sort/screen.dart';
import '../games/sort_tubes/board.dart' show TubeSkin;
import '../games/cake_sort/board.dart' show CakeSkin;
import '../games/cake_sort/screen.dart';
import '../games/hanoi/screen.dart';
import '../games/tower_london/screen.dart';
import '../games/animal_queue/screen.dart';
import '../games/kids_find/screen.dart';
import '../games/kids_sort/screen.dart';
import '../games/traffic_jam/screen.dart';
import '../games/monster_traits/missing_screen.dart';
import '../games/monster_traits/screen.dart';
import '../games/number_run/screen.dart';
import '../games/search_runner/screen.dart';
import '../games/roll_and_bank/screen.dart';
import '../games/hidden_character/screen.dart';
import '../games/sort_tubes/screen.dart';
import '../games/mental_rotation/screen.dart';
import '../games/navigator/screen.dart';
import '../games/trail_making/screen.dart';
import '../games/samurai/screen.dart';
import '../games/spatial_hub/screen.dart';
import '../games/spatial_lab/screen.dart';
import '../games/spatial_span/screen.dart';
import '../games/sudoku/modes.dart';
import '../games/cats/screen.dart';
import '../games/sudoku/screen.dart';
import '../games/mahjong/screen.dart';
import '../games/math_slider/screen.dart';
import '../games/math_sprint/screen.dart';
import '../games/number_bonds/screen.dart';
import '../games/ospan/screen.dart';
import '../games/sdmt/screen.dart';
import '../games/counter/screen.dart';
import '../games/find_differences/screen.dart';
import '../games/counting_hub/screen.dart';
import '../games/search_hub/screen.dart';
import '../games/span_hub/screen.dart';
import '../games/visual_search/screen.dart';
import '../games/set_game/screen.dart';
import '../games/object_tracker/screen.dart';
import '../games/pattern/screen.dart';
import '../games/quick_count/screen.dart';
import '../games/schulte/screen.dart';
import '../games/pause/screen.dart';
import 'asset_server.dart';
import 'l10n.dart';
import 'feedback_fab.dart';
import 'feedback_screen.dart';
import 'home_screen.dart';
import 'profile_switcher.dart';
import 'screen_ui.dart';
import 'native_tabs.dart';
import 'stats_screen.dart';
import 'streak_calendar_screen.dart';
import 'assessment_result_screen.dart';
import 'onboarding_screen.dart';
import 'friends_screen.dart';
import 'shop_screen.dart';
import 'whats_new_screen.dart';
import 'pet_screen.dart';
import 'info_screens.dart';
import 'walking_pet.dart';
import 'web_theme.dart';
import '../games/sorting_hub/screen.dart';
import '../games/faces_names/screen.dart';
import '../games/memory_palace/screen.dart';
import '../games/mnemonics/screen.dart';
import '../games/rmet/screen.dart';
import '../games/word_pairs/screen.dart';
import '../games/vocab_srs/screen.dart';
import '../games/semantic_sort/screen.dart';
import '../games/cloze/screen.dart';
import '../games/lexical_decision/screen.dart';
import '../games/story_recall/screen.dart';
import '../games/phonemic_fluency/screen.dart';
import '../games/pseudoword_echo/screen.dart';
import '../games/phoneme_pairs/screen.dart';
import '../games/chinese_tones/screen.dart';
import '../games/dictation/screen.dart';
import '../games/rhythm_pitch/screen.dart';
import 'catalog.dart';
import 'catalog_screen.dart';
import 'hub_screen.dart';
import 'warmup_bridge.dart';
import 'warmup_step_bridge.dart';
import 'game_pet.dart';
import 'session_report.dart';
import 'game_preset.dart';
import 'game_rules.dart';
import 'level_transition.dart';
import 'game_shell.dart';
import 'puzzle_routes.g.dart';
import '../games/chess_blind/screen.dart';
import '../games/chess_hub/screen.dart';
import '../games/scholars_mate/screen.dart';
import 'shared_state.dart';
import 'restart_scope.dart';
import 'tap_latency.dart';
import 'warmup_screens.dart';


/// ГИБРИД: снаружи Flutter, внутри — НЫНЕШНЕЕ ПРИЛОЖЕНИЕ ЦЕЛИКОМ.
///
/// 🔴 ПОЧЕМУ НЕ СВОЙ СПИСОК ИГР. Первый вариант пилота рисовал собственное меню
/// из перенесённых игр. Для замеров этого хватало, но продукту не годится: у
/// человека пропали бы главная, каталог, питомец, зарядки, статистика — всё, что
/// ещё не перенесено. Поэтому корень — веб-сборка как есть, а Flutter
/// ПЕРЕХВАТЫВАЕТ переход на перенесённые игры и показывает нативный экран.
/// Так переезд идёт по одной игре, и на каждом шаге приложение целое.
///
/// Прогресс общий: [SharedState] вливает снимок в страницу до её кода и ловит
/// каждую запись обратно.
class HybridApp extends StatefulWidget {
  /// Скрипт страницы: дождаться адреса [path] (не дольше 60 кадров), ещё два кадра — и сказать
  /// оболочке `painted`. Адрес сверяется так же, как в [_onPagePath]: без `.html` и `/index`.
  static String paintedScript(int gen, String path) =>
      '(function(){var g=$gen,p=${jsonEncode(path)},n=0;'
      'var post=function(){try{window.${SharedState.channel}.postMessage(JSON.stringify({op:"painted",gen:g}));}catch(e){}};'
      'var here=function(){var x=location.pathname.replace(/\\.html\$/,"").replace(/\\/index\$/,"");return x||"/";};'
      'var wait=function(){if(here()!==p&&n++<60){requestAnimationFrame(wait);return;}'
      'requestAnimationFrame(function(){requestAnimationFrame(post);});};wait();})();';

  const HybridApp({super.key, required this.state, required this.server});

  final SharedState state;

  /// Раздача вложенной веб-сборки — внутри приложения, см. [AssetServer].
  final AssetServer server;

  /// 🔴 ЭКРАНЫ ОБОЛОЧКИ — НЕ ИГРЫ: выбор зарядки и её итог (задача 748c3f5f,
  /// `warmup_screens.dart`). Отдельно от [native], потому что обходы-переписи проб
  /// считают каждый адрес [native] игрой с правилами, уровнями и разбором.
  /// Считает за ними по-прежнему страница — здесь только рисунок по её модели.
  static Map<String, Widget Function(SharedState)> get shell => {
        '/warmup-picker': (_) => const WarmupPickerScreen(),
        '/warmup-complete': (_) => const WarmupCompleteScreen(),
        '/warmup-bridge': (_) => const WarmupBridgeScreen(),
        // ⚠️ `/games` здесь больше НЕТ: вкладка «Игры» — не экран поверх страницы, а вкладка
        // оболочки рядом с ней (`NativeTabs.native`, задача 5136754e). См. `_onPagePath`.
        // Настройки на Flutter (задача eae0879c) — пишут те же ключи, что веб; главная открывает их по `/settings`.
        '/settings': (s) => SettingsScreen(state: s),
      };

  /// Игра перенесена → строится нативно. Ключ — путь маршрута веб-сборки.
  static Map<String, Widget Function(SharedState)> get native => {
        /*
         * 🔴 АНАГРАММЫ — ЧЕТЫРЕ РАЗНЫЕ ИГРЫ ЗА ОДНИМ АДРЕСОМ, и каждая получает
         * свой ключ. Голый `/games/anagrams` ведёт на классику: это режим по
         * умолчанию на экране настройки, и человек, пришедший по ссылке без
         * хвоста, попадает туда же, куда попал бы в вебе.
         *
         * ⚠️ Включено ТОЛЬКО когда готовы все четыре. Один ключ без хвоста
         * накрыл бы разом все режимы, и человек, выбравший кроссворд, получил бы
         * классику — а проба бы этого не заметила: маршрут-то открывается.
         */
        '/games/anagrams': (s) => AnagramsScreen(state: s),
        '/games/anagrams?mode=classic': (s) => AnagramsScreen(state: s),
        '/games/anagrams?mode=all': (s) => AllWordsScreen(state: s),
        '/games/anagrams?mode=cross': (s) => CrosswordScreen(state: s),
        '/games/anagrams?mode=square': (s) => RingScreen(state: s),
        '/games/dots-connect': (s) => DotsConnectScreen(state: s),
        '/games/one-line': (s) => OneLineScreen(state: s),
        '/games/reading-span': (s) => ReadingSpanScreen(state: s),
        '/games/digit-span': (s) => DigitSpanScreen(state: s),
        '/games/memory-matrix': (s) => MemoryMatrixScreen(state: s),
        '/games/corsi': (s) => CorsiScreen(state: s),
        '/games/n-back': (s) => NBackScreen(state: s),
        '/games/picture-pairs': (s) => PicturePairsScreen(state: s),
        '/games/listening-span': (s) => ListeningSpanScreen(state: s),
        '/games/schulte': (s) => SchulteScreen(state: s),
        // «Пауза / Зарядка» — хаб практик; `?set=…` доходит до экрана через GamePreset.
        '/games/pause': (s) => PauseScreen(state: s),
        // «Дыхание» слито в «Паузу» (решение Дениса 30.09): тот же экран, режим дыхания,
        // партия пишется под прежним `breathing`. Техника шага зарядки — `?tech=`.
        '/games/breathing': (s) => PauseScreen(state: s, flavor: PauseFlavor.breathing),
        // «Гимнастика для глаз» слита туда же: лестница 15 уровней и 11 узоров перенесены
        // со сверкой по живому экрану, партия — под прежним `eye_gym`.
        '/games/eye-gym': (s) => PauseScreen(state: s, flavor: PauseFlavor.eyeGym),
        '/games/mahjong': (s) => MahjongScreen(state: s),
        '/games/math-slider': (s) => MathSliderScreen(state: s),
        '/games/object-tracker': (s) => ObjectTrackerScreen(state: s),
        '/games/quick-count': (s) => QuickCountScreen(state: s),
        '/games/pattern': (s) => PatternScreen(state: s),
        '/games/math-sprint': (s) => MathSprintScreen(state: s),
        '/games/number-bonds': (s) => NumberBondsScreen(state: s),
        '/games/ospan': (s) => OspanScreen(state: s),
        '/games/sdmt': (s) => SdmtScreen(state: s),
        '/games/set-game': (s) => SetGameScreen(state: s),
        '/games/counter': (s) => CounterScreen(state: s),
        // «Числовой забег» (задача 41845727): на общем ядре дороги раннеров; веб-страница с WebGL
        // остаётся для веб-сборки, в приложении — нативный экран.
        '/games/number-run': (s) => NumberRunScreen(state: s),
        '/games/find-differences': (s) => FindDifferencesScreen(state: s),
        '/games/visual-search': (s) => VisualSearchScreen(state: s),
        '/games/stroop': (s) => StroopScreen(state: s),
        '/games/flanker': (s) => FlankerScreen(state: s),
        '/games/simon': (s) => SimonScreen(state: s),
        '/games/sudoku': (s) => SudokuScreen(state: s),
        // Режимы той же доски: адрес отличается только хвостом, экран — тот же.
        '/games/sudoku?mode=towers': (s) => SudokuScreen(state: s, mode: SideMode.towers),
        '/games/sudoku?mode=unequal': (s) => SudokuScreen(state: s, mode: SideMode.unequal),
        // «Судоку для малышей» (4×4, звери) — только нативно: доски строит junior.dart.
        '/games/sudoku?mode=junior': (s) => SudokuScreen(state: s, junior: true),
        // «Киллер» и «Свободно» — режимы переключателя веб-экрана, потерянные при переносе
        // (задача 55b97845): карточки развилки ведут сюда.
        '/games/sudoku?mode=killer': (s) => SudokuScreen(state: s, mode: SideMode.killer),
        '/games/sudoku?mode=free': (s) => SudokuScreen(state: s, mode: SideMode.free),
        // «Кошки» (Queens / Star Battle) — первая игра, рождённая сразу нативной:
        // веб-страницы у неё нет вовсе, поэтому перехват не «отнимает» веб-версию,
        // а является единственным входом. Карточку в развилку кладёт координатор.
        '/games/cats': (s) => CatsScreen(state: s),
        // Развилки раздела — на ОБЩЕМ экране каркаса: карточки уже лежат в
        // `assets/hubs.json`, вторая копия начала бы отставать молча.
        '/games/sudoku-hub': (s) => HubScreen(
              state: s,
              hubRoute: '/games/sudoku-hub',
              icon: Icons.apps,
              gradient: const [Color(0xFF3B2F7A), Color(0xFF5B4D9E)],
              isNative: native.containsKey,
            ),
        '/games/sudoku-samurai': (s) => SamuraiScreen(state: s),
        '/games/sudoku-fractal': (s) => FractalScreen(state: s),
        '/games/sudoku-fractal-deep': (s) => DeepScreen(state: s),
        '/games/go-no-go': (s) => GoNoGoScreen(state: s),
        '/games/mental-rotation': (s) => MentalRotationScreen(state: s),
        '/games/navigator': (s) => NavigatorScreen(state: s),
        '/games/trail-making': (s) => TrailMakingScreen(state: s),
        '/games/spatial-span': (s) => SpatialSpanScreen(state: s),
        // Все четыре упражнения лаборатории перенесены, поэтому перехват честен: адрес с
        // `?mode=` попадает в ту же строку карты, и ни один режим не остаётся в вебе.
        '/games/spatial-lab': (s) => SpatialLabScreen(state: s),
        '/games/spatial-hub': (s) => SpatialHubScreen(state: s),
        '/games/goods-sort': (s) => GoodsSortScreen(state: s),
      '/games/water-sort': (s) => SortTubesScreen(
            state: s, gameId: 'water_sort', title: L.t('waterSort'), skin: TubeSkin.water),
      '/games/ball-sort': (s) => SortTubesScreen(
            state: s, gameId: 'ball_sort', title: L.t('ballSort'), skin: TubeSkin.balls),
      '/games/nut-sort': (s) => SortTubesScreen(
            state: s, gameId: 'nut_sort', title: L.t('nutSort'), skin: TubeSkin.nuts),
      '/games/cake-sort': (s) => CakeSortScreen(
            state: s, gameId: 'cake_sort', title: L.t('cakeSort'), skin: CakeSkin.cake),
      '/games/pizza-sort': (s) => CakeSortScreen(
            state: s, gameId: 'pizza_sort', title: L.t('pizzaSort'), skin: CakeSkin.pizza),
      '/games/hanoi': (s) => HanoiScreen(state: s),
      '/games/tower-london': (s) => TowerLondonScreen(state: s),
      // MindLab (решение Дениса 30.09.2026): только нативные, веб-двойника у них нет.
      '/games/animal-queue': (s) => AnimalQueueScreen(state: s),
      '/games/kids-sort': (s) => KidsSortScreen(state: s),
      // MindLab у координатора (задача f5034811): тоже только нативные, карточки — в
      // развилках «Пространство», «Поиск глазами», «Конфликт внимания», «Головоломки».
      '/games/traffic-jam': (s) => TrafficJamScreen(state: s),
      '/games/monster-traits': (s) => MonsterTraitsScreen(state: s),
      // MindLab «Найди» (kids/find.py) — раздел «Поиск», задача c8a2783f: только нативная.
      '/games/kids-find': (s) => KidsFindScreen(state: s),
      // MindLab «Подлодки» (submarinos/sea.py) — раздел «Поиск», задача c8a2783f: только нативная.
      '/games/submarines': (s) => SubmarinesScreen(state: s),
      // Второй режим «Найди признак» — «Кого не хватает» (MindLab Missing, задача 664b414a).
      '/games/monster-traits?mode=missing': (s) => MonsterMissingScreen(state: s),
      '/games/roll-and-bank': (s) => RollAndBankScreen(state: s),
      '/games/hidden-character': (s) => HiddenCharacterScreen(state: s),
      // Раннер «Поиска глазами» (задача 5386c0e8): сразу нативный, веб-двойника нет.
      '/games/search-runner': (s) => SearchRunnerScreen(state: s),
        /*
         * 🔴 РАЗВИЛКА ТОЖЕ ПЕРЕХВАТЫВАЕТСЯ. Она ведёт на восемь игр, из которых
         * все восемь уже нативные: оставь её в вебе — и каждый заход в игру шёл
         * бы через веб-страницу, которую мы всё равно перехватим кадром позже.
         * Какую игру чем открыть, решает оболочка (см. `_openNative`), а не хаб.
         */
        '/games/sorting-hub': (s) =>
            SortingHubScreen(state: s, isNative: native.containsKey),
        // Развилки моего раздела: состав — данными, ход в веб даёт хост гибрида.
        '/games/search-hub': (s) =>
            SearchHubScreen(state: s, isNative: native.containsKey),
        '/games/counting-hub': (s) =>
            CountingHubScreen(state: s, isNative: native.containsKey),
        // Развилка «Релаксация» (07.10.2026, b271f702): состав — данными (hubs.json), вид — общий хаб.
        '/games/relaxation-hub': (s) => HubScreen(
              state: s,
              hubRoute: '/games/relaxation-hub',
              icon: Icons.spa_outlined,
              gradient: const [Color(0xFF0F766E), Color(0xFF36D1DC)],
              isNative: native.containsKey,
            ),
        // Развилка «Объём памяти» — адрес без хвоста `-hub`, развилкой её делает
        // запись в `assets/hubs.json`. Неперенесённые карточки открывает
        // веб-половина: какую чем — решает оболочка, а не хаб.
        '/games/span': (s) => SpanHubScreen(state: s, isNative: native.containsKey),
        '/games/choice-rt': (s) => ChoiceRtScreen(state: s),
        '/games/stop-signal': (s) => StopSignalScreen(state: s),
        '/games/posner': (s) => PosnerScreen(state: s),
        '/games/stroop-emotional': (s) => EmoStroopScreen(state: s),
        // «Доска в уме» перенесена целиком: партия (лестница, ходы по одному,
        // варианты, помеха) и серия (часы блоков, разности, прогресс) — 01.10.2026.
        '/games/chess-blind': (s) => ChessBlindScreen(state: s),
        '/games/find-move': (s) => FindMoveScreen(state: s),
        '/games/solitaire-chess': (s) => SolitaireChessScreen(state: s),
        '/games/knights-queens': (s) => KnightsQueensScreen(state: s),
        // «Детский мат» перенесён целиком: лестница, узоры, микс, жертва и поток.
        '/games/scholars-mate': (s) => ScholarsMateScreen(state: s),
        '/games/switching-task': (s) => SwitchingTaskScreen(state: s),
        '/games/targets': (s) => TargetsScreen(state: s),
        '/games/inhibition': (s) => InhibitionScreen(state: s),
        '/games/faces-names': (s) => FacesNamesScreen(state: s),
        '/games/memory-palace': (s) => MemoryPalaceScreen(state: s),
        '/games/mnemonics': (s) => MnemonicsScreen(state: s),
        '/games/rmet': (s) => RmetScreen(state: s),
        '/games/ant': (s) => AntScreen(state: s),
        // РАЗВИЛКА «КОНФЛИКТ ВНИМАНИЯ» — НА ОБЩЕМ ЭКРАНЕ, СВОЕГО НЕ ПИШЕМ. Девять
        // карточек уже лежат в `assets/hubs.json` (выгружены из hubContents.ts),
        // заголовок — там же в `meta`, подписи — в словарях. Своя копия списка стала
        // бы вторым реестром и отстала бы молча. Все девять карточек ведут на
        // нативные экраны: раздел перенесён целиком. Градиент — как в вебе
        // (`attention-conflict.tsx`, GRADIENT).
        '/games/attention-conflict': (s) => HubScreen(
              state: s,
              hubRoute: '/games/attention-conflict',
              icon: Icons.psychology_alt,
              gradient: const [Color(0xFF7C3AED), Color(0xFFEC4899)],
              isNative: native.containsKey,
            ),
        '/games/iowa': (s) => IowaScreen(state: s),
        '/games/prl': (s) => PrlScreen(state: s),
        '/games/bart': (s) => BartScreen(state: s),
        '/games/wcst': (s) => WcstScreen(state: s),
        '/games/cpt': (s) => CptScreen(state: s),
        '/games/proofreading': (s) => ProofreadingScreen(state: s),
        /*
         * 🔴 СОРОК ТРИ АДРЕСА ОДНОГО ЭКРАНА — СГЕНЕРИРОВАНЫ, А НЕ ВПИСАНЫ.
         *
         * Головоломки устроены не как остальные игры: экран один, а режимов 42, и
         * отличает их только хвост `?mode=`. Сорок две строки, переписанные с
         * реестра, — сорок два места молча разойтись с ним. Поэтому карта их
         * адресов собирается из `assets/puzzles/modes.json`
         * (`tools/embed-puzzle-routes.mjs`), и там же лежит правило кодирования
         * пробела в именах вроде «Light Up».
         *
         * ⚠️ Перехват включён 23.09.2026 — ПОСЛЕ того, как замер показал, что
         * открываются все 42 (до этого у 28 из них экран падал на пустом списке
         * ступеней; см. `test/puzzles_all_modes_open_test.dart`).
         */
        ...puzzleRoutes(),
        '/games/word-pairs': (s) => WordPairsScreen(state: s),
        // «Языки»: словарь SRS — узнавание, припоминание, печать и два языка сразу.
        // Настройки шага языковой зарядки (`targetLang`, `bilingual`, `lang2`,
        // `direction`, `newLimit`) экран берёт из хвоста адреса через GamePreset.
        '/games/vocab-srs': (s) => VocabSrsScreen(state: s),
        '/games/semantic-sort': (s) => SemanticSortScreen(state: s),
        '/games/cloze': (s) => ClozeScreen(state: s),
        '/games/lexical-decision': (s) => LexicalDecisionScreen(state: s),
        '/games/story-recall': (s) => StoryRecallScreen(state: s),
        '/games/phonemic-fluency': (s) => PhonemicFluencyScreen(state: s),
        '/games/pseudoword-echo': (s) => PseudowordEchoScreen(state: s),
        '/games/phoneme-pairs': (s) => PhonemePairsScreen(state: s),
        '/games/chinese-tones': (s) => ChineseTonesScreen(state: s),
        '/games/dictation': (s) => DictationScreen(state: s),
        '/games/rhythm-pitch': (s) => RhythmPitchScreen(state: s),
        /*
         * Развилка «Слух» — на общем каркасе: над списком у неё в вебе ничего нет.
         */
        '/games/hearing-hub': (s) => HubScreen(
              state: s,
              hubRoute: '/games/hearing-hub',
              icon: Icons.hearing,
              gradient: const [Color(0xFF0D9488), Color(0xFF84CC16)],
              isNative: native.containsKey,
            ),
        /*
         * 🔴 «Слова» и «Языки» — с ЗАРЯДКОЙ РАЗДЕЛА над списком, как в вебе. До
         * 30.09.2026 они оставались в вебе целиком: запустить серию из натива было
         * нечем, и перехват отнял бы рабочую зарядку. Теперь шапка — мост к
         * веб-карточке (`warmup_bridge.dart`): подписи и число подходов берутся у
         * неё, запуск — её же `startPlaylist`.
         */
        // «Шахматы»: развилка с шахматной зарядкой-мостом в шапке (01.10.2026).
        '/games/chess-hub': (s) => chessHubScreen(state: s, isNative: native.containsKey),
        '/games/words-hub': (s) => HubScreen(
              state: s,
              hubRoute: '/games/words-hub',
              icon: Icons.text_fields,
              gradient: const [Color(0xFF8B5CF6), Color(0xFFEC4899)],
              header: const WarmupBridgeHeader(bridgeId: 'words', accent: Color(0xFF8B5CF6)),
              isNative: native.containsKey,
            ),
        '/games/languages-hub': (s) => HubScreen(
              state: s,
              hubRoute: '/games/languages-hub',
              icon: Icons.translate,
              gradient: const [Color(0xFF0891B2), Color(0xFFA855F7)],
              header: const WarmupBridgeHeader(bridgeId: 'languages', accent: Color(0xFF0891B2)),
              isNative: native.containsKey,
            ),
        /*
         * 🔴 РАЗВИЛКА «МНЕМОТЕХНИКИ» ПЕРЕХВАТЫВАЕТСЯ, ПОТОМУ ЧТО ЗА НЕЙ УЖЕ
         * НАТИВНО ЧЕТЫРЕ ЭКРАНА ИЗ ПЯТИ: «Дворец памяти», «Лица и имена»,
         * «Пары слов» и «Прочти эмоцию». Пятая — «Мнемоника» — ещё в вебе, и
         * `isNative` честно показывает это на карточке: открывать её будет
         * оболочка, а не хаб.
         *
         * ⚠️ Карточки берутся из `assets/hubs.json`, как у остальных развилок:
         * свой список в коде был бы вторым реестром рядом с `hubContents.ts`.
         */
        '/games/mnemonics-hub': (s) => HubScreen(
              state: s,
              hubRoute: '/games/mnemonics-hub',
              icon: Icons.link,
              gradient: const [Color(0xFFD946EF), Color(0xFFF59E0B)],
              isNative: native.containsKey,
            ),
      };

  /// ЗАМЕР: открыть ту же игру в НЫНЕШНЕЙ версии на том же устройстве.
  ///
  /// Перехват выключается флагом сборки, и приложение целиком остаётся веб-версией:
  ///   flutter run --dart-define=WEB_ONLY=true
  /// Без этого сравнить отклик двух версий на одном экране невозможно: перенесённая
  /// игра всегда открывается нативно, а замер на РАЗНЫХ играх сравнивал бы разное.
  static const bool webOnly = bool.fromEnvironment('WEB_ONLY');

  /// ЗАМЕР И ПРОВЕРКА РУКАМИ: открыть приложение сразу на нужном маршруте.
  ///
  /// Пустая строка — обычный запуск с главной. Иначе, например:
  ///   flutter run --dart-define=START_ROUTE=/games/stroop
  /// Нужно для замера отклика: обе версии открываются на ОДНОМ экране, без
  /// прохода по меню, который сам по себе ничего не проверяет.
  static const String startRoute = String.fromEnvironment('START_ROUTE');

  /// 🔴 ОТКРЫТЬ ЛЮБОЙ МАРШРУТ ПРИЛОЖЕНИЯ ИЗ НАТИВНОГО ЭКРАНА (добавлено 23.09.2026 разделом
  /// «Пространство» ради развилок). Перенесённый маршрут открывается нативно, НЕ перенесённый —
  /// в WebView, как и раньше.
  ///
  /// ⚠️ ЗАЧЕМ ЭТО ПОНАДОБИЛОСЬ. Развилка — это меню, и половина её карточек ведёт в игры, которые
  /// ещё в вебе: у «Пространства» перенесено пять карточек из девяти. Нативная развилка без
  /// такого хода была бы тупиком — человек нажал бы «Клоцки» и не попал никуда. Правок
  /// `game_shell.dart` при этом НОЛЬ: счёт каркаса держится, тронут только хост гибрида.
  static void Function(String route)? open;

  /// 🔴 ВЫПОЛНИТЬ JS В СТРАНИЦЕ ПОД НАТИВНЫМ ЭКРАНОМ И ВЕРНУТЬ РЕЗУЛЬТАТ (30.09.2026,
  /// раздел «Языки»). Нужен мосту зарядки: развилка рисуется нативно поверх
  /// веб-развилки, а серия запускается только там (`WarmupContext.startPlaylist`).
  /// Через этот ход шапка берёт у карточки подписи и зовёт запуск — см.
  /// `warmup_bridge.dart`. Снимается вместе с хостом, как [open].
  static Future<Object?> Function(String js)? runJs;

  /// Путь маршрута из любого вида ссылки: и `…/games/one-line.html`, и
  /// `file:///…/games/one-line`, и с якорем или запросом.
  static String? routeOf(String url) {
    if (webOnly) return null;
    final noHash = url.split('#').first;
    final qi = noHash.indexOf('?');
    final query = qi < 0 ? '' : noHash.substring(qi);
    var u = qi < 0 ? noHash : noHash.substring(0, qi);
    if (u.endsWith('.html')) u = u.substring(0, u.length - 5);
    for (final k in shell.keys) {
      if (u.endsWith(k)) return k;
    }
    final i = u.indexOf('/games/');
    if (i < 0) return null;
    final r = u.substring(i);
    /*
     * 🔴 СНАЧАЛА ИЩЕМ АДРЕС ВМЕСТЕ С ХВОСТОМ, И ТОЛЬКО ПОТОМ БЕЗ НЕГО.
     *
     * Часть игр — это РЕЖИМЫ одного экрана, и отличает их только хвост:
     * `/games/sudoku?mode=towers` — «Небоскрёбы», `?mode=unequal` — «Неравенства»,
     * у каждого своя мини-лестница и свой счётчик. Прежний разбор срезал хвост до
     * поиска, поэтому обе карточки развилки открывали бы ОБЫЧНУЮ судоку: человек
     * жмёт «Небоскрёбы» и получает не ту игру. Игры без режимов это не задевает —
     * для них ключа с хвостом в карте просто нет, и ответ прежний.
     */
    if (query.isNotEmpty && native.containsKey('$r$query')) return '$r$query';
    /*
     * ⚠️ И ТОТ ЖЕ ХВОСТ В ДРУГОМ НАПИСАНИИ. У четырёх головоломок в имени пробел,
     * веб-версия ходит на `?mode=Light%20Up`, но адрес доходит до нас и в
     * раскодированном виде — смотря кто его вернул: `location.href` или переход
     * документа. Одно написание в карте, оба — при разборе.
     */
    if (query.isNotEmpty) {
      // Only registered selectors identify a screen. Language, level and
      // warmup settings must not turn a mode link into the base game.
      try {
        final actual = Uri.splitQueryString(query.substring(1));
        String? best;
        var specificity = 0;
        for (final key in native.keys) {
          final separator = key.indexOf('?');
          if (separator < 0 || key.substring(0, separator) != r) continue;
          final selectors = Uri.splitQueryString(key.substring(separator + 1));
          if (selectors.length > specificity &&
              selectors.entries.every((e) => actual[e.key] == e.value)) {
            best = key;
            specificity = selectors.length;
          }
        }
        if (best != null) return best;
      } on FormatException {
        // Malformed query is not a reason to crash the navigation delegate.
      }
    }
    return native.containsKey(r) ? r : null;
  }

  /// Настройки шага из хвоста адреса: `?wu=1&diff=hard&trials=20`.
  ///
  /// 🔴 БЕЗ ЭТОГО ПЕРЕНОС ТЕРЯЕТ ЗАРЯДКУ ЦЕЛИКОМ. `routeOf` отвечает на вопрос «какой
  /// экран открыть», и хвост ему для этого чаще всего не нужен. Но в хвосте едут
  /// настройки шага зарядки — и признак `wu=1`, при котором лестница НЕ двигается
  /// (`useGamePreset.ts:22`, правило стоит в 53 веб-экранах). Нативные экраны хвоста
  /// не видели вовсе, и шаг зарядки молча менял личный уровень игрока.
  static Map<String, String> queryOf(String url) {
    final noHash = url.split('#').first;
    final q = noHash.indexOf('?');
    if (q < 0) return const {};
    return Uri.splitQueryString(noHash.substring(q + 1));
  }

  @override
  State<HybridApp> createState() => _HybridAppState();
}

/// Что делать с нативным экраном, когда страница сменила адрес.
enum RouteAction {
  /// Адрес тот же — ничего.
  keep,

  /// Страница ушла туда, где нативного экрана нет: снять открытый.
  close,

  /// Страница ушла на другую перенесённую игру: снять открытый и открыть новый.
  closeThenOpen,

  /// Ничего не открыто, адрес перенесённый: просто открыть.
  open,
}

/// Решение о судьбе нативного экрана — ОТДЕЛЬНО от самого съёма.
///
/// 🔴 Вынесено ради пробы. Дефект 24.09.2026 («зарядка перевела шаг, а нативный
/// экран остался лежать поверх») жил именно в этом решении, а не в рисовании.
/// Пока решение было вплетено в обработчик сообщения, проверить его можно было
/// только живым телефоном — то есть на деле никак, и оно доехало до людей.
/// Снимать ли настройки шага и отметку, когда закрылся экран [route].
///
/// 🔴 Только если поверх ещё не открыт следующий: страница, ушедшая вперёд,
/// открывает новый экран РАНЬШЕ, чем досрабатывает закрытие старого, — и старый
/// стёр бы настройки шага нового (живой прогон 30.09.2026, см. `_openNative`).
bool routeOwnsPreset(String? opened, String route) => opened == route;

RouteAction routeAction(String? opened, String? next) {
  if (opened == next) return RouteAction.keep;
  if (opened == null) return next == null ? RouteAction.keep : RouteAction.open;
  return next == null ? RouteAction.close : RouteAction.closeThenOpen;
}

class _HybridAppState extends State<HybridApp> {
  late final WebViewController _c;
  bool _loading = true;


  /// Экран сняли МЫ, потому что страница ушла вперёд, — а не человек кнопкой.
  final Set<Route<dynamic>> _pagesClosedByWeb = {};
  Route<dynamic>? _openedPage;

  /// Какой нативный экран сейчас открыт поверх страницы.
  ///
  /// ⚠️ Нужен из-за того, что перехват теперь идёт по СМЕНЕ АДРЕСА: страница
  /// может сообщить об одном и том же маршруте дважды (`replaceState` после
  /// `pushState` — обычное дело у роутера), и без этого поля поверх экрана
  /// открылся бы его же двойник.
  String? _openedRoute;
  final _marks = WebMarkTimer();

  /*
   * 🔴 ВКЛАДКИ — У ОБОЛОЧКИ (задачи 5136754e, 99628ecf; решение Дениса 07.10.2026).
   * Тело — две вкладки рядом (IndexedStack): страница в WebView и нативная «Игры». Полоса снизу —
   * нативная, по правилам `tabBar.ts` ([NativeTabs]); веб свою прячет (`__psyNativeTabs`).
   * Источник правды о том, где человек, — адрес страницы: оболочка уводит страницу на вкладку
   * тем же `router.replace`, что и веб-полоса, поэтому «назад» из веб-игры приходит на `/games`, и
   * эта смена адреса выбирает нативную вкладку, а не кладёт каталог поверх.
   */
  String _pagePath = '/';
  String? _nativeTab;
  bool _tabsReady = false;
  String _catalogQuery = '';
  CatalogFilter? _catalogFilter;
  int _catalogGen = 0;

  /// Адрес страницы сменился — где показывать человека: нативная вкладка или страница.
  /// Возвращает, была ли это нативная вкладка (тогда перехвату делать нечего).
  bool _onPagePath(String url) {
    final uri = Uri.tryParse(url);
    if (uri == null) return false;
    var path = uri.path;
    if (path.endsWith('.html')) path = path.substring(0, path.length - 5);
    if (path.endsWith('/index')) path = path.substring(0, path.length - 6);
    if (path.isEmpty) path = '/';
    final tab = NativeTabs.native.contains(path) || _bodyPages.contains(path) ? path : null;
    final search = tab == null ? null : uri.queryParameters['search'];
    final hubsOnly = tab == '/games' && uri.queryParameters['filter'] == 'hubs';
    if (!mounted) return tab != null;
    final before = _shownIndex();
    setState(() {
      _pagePath = path;
      _nativeTab = tab;
      // Поиск, начатый на главной (`catalogSearchRoute`, задача Кодекса d4a39beb9), доезжает в поле.
      if (search != null && search.trim().isNotEmpty) {
        _catalogQuery = search;
        _catalogFilter = null;
        _catalogGen++;
      }
      // «Все развилки ›» с Главной (b271f702): вкладка открывается с фильтром «только развилки».
      if (hubsOnly) {
        _catalogQuery = '';
        _catalogFilter = const CatalogFilter.hubs();
        _catalogGen++;
      }
    });
    _holdUntilPainted(before, path);
    return tab != null;
  }

  /*
   * 🔴 БЕЗ ПРЫЖКА С НАТИВНОГО ЭКРАНА НА СТРАНИЦУ (Денис 07.10.2026: «то веб-вью, то флаттер — перескакивает»).
   *
   * Замер на эмуляторе 07.10, Главная → «Питомец», запись экрана 20 кадров/с: после нажатия 2 кадра
   * показывали СТАРЫЙ кадр страницы (питомец с прошлого визита), 3 кадра — веб-Главную, и только потом
   * новый экран. Две причины:
   *   · страница под нативным экраном не рисовалась (IndexedStack её не показывает), и, открывшись,
   *     WebView отдавал последний кадр, снятый до ухода;
   *   · тело переключалось на страницу СРАЗУ, а веб рисует новый адрес на кадр-другой позже.
   * Поэтому страница теперь всегда стоит под нативным слоем и рисуется (слой — сверху, непрозрачный и
   * забирает касания), а уход с нативного экрана на страницу ждёт, пока она нарисует новый адрес:
   * скрипт в странице дожидается адреса и двух кадров и шлёт `painted`. Ответа нет за [_holdMax] —
   * открываем всё равно: прежний экран дольше держать хуже, чем мигнуть.
   */
  int? _holdIndex;
  int _holdGen = 0;
  Timer? _holdTimer;
  static const _holdMax = Duration(milliseconds: 700);

  /// Что тело показывает СЕЙЧАС: пока страница рисует новый адрес — прежний нативный экран.
  int _shownIndex() => _holdIndex ?? _bodyIndex();

  /// Тело ушло с нативного экрана [before] на страницу — держать его до `painted` от страницы.
  void _holdUntilPainted(int before, String path) {
    final next = _bodyIndex();
    if (next != 0 || before == 0) {
      if (_holdIndex != null) _release(_holdGen);
      return;
    }
    final gen = ++_holdGen;
    setState(() => _holdIndex = before);
    _holdTimer?.cancel();
    _holdTimer = Timer(_holdMax, () => _release(gen));
    unawaited(_c.runJavaScript(HybridApp.paintedScript(gen, path)).catchError((Object _) => _release(gen)));
  }

  void _release(Object? gen) {
    if (gen != _holdGen || _holdIndex == null || !mounted) return;
    _holdTimer?.cancel();
    setState(() => _holdIndex = null);
  }


  /// Нативные вкладки в порядке детей тела после страницы (индекс 0 — страница).
  static const _bodyTabs = [
    HomeScreen.route,
    '/games',
    StatsScreen.route,
    StreakCalendarScreen.route,
    AssessmentResultScreen.route,
    OnboardingScreen.route,
    SourcesScreen.route,
    CollectionScreen.route,
    AchievementsScreen.route,
    LeaguesScreen.route,
    FriendsScreen.route,
    ShopScreen.route,
    WhatsNewScreen.route,
    PetScreen.route,
  ];

  /// Экраны по модели веба, которые НЕ вкладки полосы: страница уходит на них своим переходом
  /// (`router.push`/`replace`), а тело показывает нативный рисунок. Полоса — по правилу веба
  /// (`tabBar.ts`): на календаре стоит, на итоге оценки её нет.
  static const _bodyPages = {
    StreakCalendarScreen.route,
    AssessmentResultScreen.route,
    OnboardingScreen.route,
    SourcesScreen.route,
    CollectionScreen.route,
    AchievementsScreen.route,
    LeaguesScreen.route,
    FriendsScreen.route,
    ShopScreen.route,
    WhatsNewScreen.route,
  };

  /// Что показывает тело: страницу (0) или нативную вкладку.
  ///
  /// ⚠️ Главная рисуется по модели страницы. Пока модели нет — экран ждёт со значком
  /// загрузки; не пришла за [_modelWait] (старая вложенная сборка, сбой страницы) — показываем саму
  /// страницу: веб-экран лучше пустого.
  int _bodyIndex() {
    final tab = _nativeTab;
    if (tab == null) return 0;
    final i = _bodyTabs.indexOf(tab) + 1;
    if (i == 0) return 0;
    if (!ScreenUi.routes.contains(tab) || ScreenUi.model(tab).value != null) return i;
    _modelTimers[tab] ??= Timer(_modelWait, () {
      if (mounted) setState(() => _modelGaveUp.add(tab));
    });
    return _modelGaveUp.contains(tab) ? 0 : i;
  }

  static const _modelWait = Duration(seconds: 6);
  final _modelTimers = <String, Timer>{};
  final _modelGaveUp = <String>{};

  void _onScreenModel() {
    if (!mounted) return;
    final came = {for (final r in _modelGaveUp) if (ScreenUi.model(r).value != null) r};
    if (came.isEmpty) return;
    setState(() => _modelGaveUp.removeAll(came));
  }

  /// Чип профиля на нативной Главной — нативный переключатель профилей (5b3513bd).
  void _openSwitcher() => openProfileSwitcher(context, widget.server.origin);

  /// Нажатие на нижнюю вкладку: тело переключается сразу, страница уводится `router.replace`.
  Future<void> _selectTab(String route) async {
    // Адрес может нести параметры вкладки (`/games?filter=hubs`) — вкладку выбирает путь, а параметры
    // разбирает тот же `_onPagePath`, что и смену адреса от страницы: тело переключается сразу.
    if (Uri.parse(route).hasQuery) {
      _onPagePath('${widget.server.origin}$route');
    } else {
      final before = _shownIndex();
      setState(() => _nativeTab = NativeTabs.native.contains(route) ? route : null);
      _holdUntilPainted(before, route);
    }
    final target = jsonEncode(route);
    final full = jsonEncode('${widget.server.origin}$route');
    await _c.runJavaScript('window.__psyReplace ? window.__psyReplace($target) : location.replace($full);');
  }

  /// Лист отзыва поверх всего, пока он открыт; null — закрыт.
  Route<void>? _feedbackRoute;

  /// Страница уже сказала «открыто» на этот лист: только после этого её «закрыто» закрывает лист.
  /// Иначе старая модель (`open: false`, пришедшая до `open`) захлопнула бы лист сразу.
  bool _feedbackSeenOpen = false;

  /// Форма отзыва — нативный лист по модели окна `#feedback` ОСНОВНОЙ страницы (задача c092cd47),
  /// откуда бы ни звали: из игры ([GameExit.feedback]) или кнопкой на нативной вкладке ([FeedbackFab]).
  /// Второго экземпляра страницы (`/feedback`) больше нет — с ним приходили «Что нового» поверх формы
  /// и закрытие игры сообщением Главной. Снимок — кадр нативного экрана ДО листа: страница под ним
  /// устарела; забирает его страница с нашего же сервера ([AssetServer.putShot]).
  Future<void> _openFeedback(String source) async {
    if (_feedbackRoute != null) return;
    final png = await FeedbackHost.snap();
    if (!mounted || _feedbackRoute != null) return;
    final shot = png == null ? null : widget.server.putShot(png);
    _showFeedback();
    await ScreenUi.act(FeedbackHost.route, 'open', [source, shot]);
  }

  void _showFeedback() {
    if (_feedbackRoute != null || !mounted) return;
    _feedbackSeenOpen = false;
    final r = FeedbackHost.sheetRoute();
    _feedbackRoute = r;
    Navigator.of(context).push(r).whenComplete(() {
      if (_feedbackRoute == r) _feedbackRoute = null;
    });
  }

  /// Модель окна: открыла страница (кнопка отзыва на веб-экране, окно правил) — показать лист;
  /// закрыла (после «спасибо», 3,2 с; с потерянной записью — 9 с) — убрать лист.
  void _onFeedbackModel() {
    final open = ScreenUi.model(FeedbackHost.route).value?['open'] == true;
    if (open) {
      _showFeedback();
      _feedbackSeenOpen = true;
      return;
    }
    final r = _feedbackRoute;
    if (_feedbackSeenOpen && r != null && r.isActive && mounted) Navigator.of(context).removeRoute(r);
  }

  /// Игра из нативного каталога: перенесённая — нативно поверх, остальная — страницей В ИСТОРИЮ
  /// (`router.push`), чтобы «назад» из неё вернул на вкладку «Игры».
  Future<void> _openFromCatalog(String route) async {
    final native = HybridApp.routeOf('${widget.server.origin}$route');
    if (native != null) {
      await _openNative(native, query: HybridApp.queryOf(route));
      return;
    }
    final target = jsonEncode(route);
    final full = jsonEncode('${widget.server.origin}$route');
    await _c.runJavaScript('window.__psyPush ? window.__psyPush($target) : location.assign($full);');
  }

  /// Сообщение от веб-половины. Кроме записи в общую память здесь одно особое
  /// действие: смена ЯЗЫКА должна доехать до нативных экранов сразу.
  ///
  /// ⚠️ Иначе получается тихое расхождение: человек переключил язык в настройках
  /// (они пока в вебе), веб-половина заговорила по-новому, а перенесённые экраны
  /// остались на старом словаре до перезапуска приложения — и это читается как
  /// «перевод сломан», хотя перевод на месте.
  Future<void> _fromWeb(String message) async {
    // 🔴 СМЕНА МАРШРУТА ВНУТРИ СТРАНИЦЫ — ЕДИНСТВЕННЫЙ РАБОЧИЙ ПЕРЕХВАТ.
    //
    // `onNavigationRequest` ниже ловит только настоящую загрузку документа, а
    // приложение ходит по экранам через History API, и WebView о таком переходе
    // не сообщает. Замер раздела «Зарядки» 23.09.2026 на симуляторе: перенесённые
    // экраны открывались ВЕБ-версиями, то есть перехват не работал ни разу.
    // Делегат оставлен: он нужен для внешних ссылок и первой загрузки.
    try {
      final m = jsonDecode(message);
      // Модель экрана зарядки, который рисуем мы (`warmup_screens.dart`).
      if (WarmupUi.accept(m)) return;
      // Ответ веб-питомца нативному гуляке (`walking_pet.dart`).
      if (PetBridge.accept(m)) return;
      // Модель главного экрана, который рисуем мы (`screen_ui.dart`, `hostScreens.ts`).
      if (ScreenUi.accept(m)) return;
      // Страница нарисовала новый адрес — прежний нативный экран можно снять (см. [_holdUntilPainted]).
      if (m is Map && m['op'] == 'painted') {
        _release(m['gen']);
        return;
      }
      if (m is Map && m['op'] == 'warmupStepDone') {
        unawaited(_warmupStepDone(Map<String, Object?>.from(m)));
        return;
      }
      if (m is Map && m['op'] == 'route') {
        final url = '${m['url']}';
        if (_onPagePath(url)) {
          // Страница пришла на нативную вкладку: экран поверх, если он был, уходит вместе с ней.
          if (_openedRoute != null) _closeNativeBecausePageMoved();
          return;
        }
        final route = HybridApp.routeOf(url);
        switch (routeAction(_openedRoute, route)) {
          case RouteAction.keep:
            break;
          case RouteAction.close:
            _closeNativeBecausePageMoved();
          case RouteAction.closeThenOpen:
            _closeNativeBecausePageMoved();
            _openNative(route!, query: HybridApp.queryOf(url));
          case RouteAction.open:
            _openNative(route!, query: HybridApp.queryOf(url));
        }
        return;
      }
    } catch (_) {
      // не наше сообщение — ниже разберёт общая память
    }
    final was = L.locale;
    await widget.state.applyFromWeb(message);
    // Веб сменил тему, профиль или надетый акцент — нативные экраны следом (app_look.dart).
    AppLook.refresh(widget.state);
    final now = L.resolve(widget.state.language);
    if (now != was) {
      await L.load(now);
      if (mounted) setState(() {});
    }
  }

  @override
  void initState() {
    super.initState();
    // Ступень-переход (level_transition.dart) открывает чужую игру по маршруту — экраны
    // знает только оболочка.
    LevelTransition.resolve = (url) {
      final route = HybridApp.routeOf(url);
      return route == null ? null : HybridApp.native[route];
    };
    // 🔴 ПРИЁМНИК ПАРТИЙ. Перенесённая игра не хранит партию сама — она отдаёт
    // результат сюда, а здесь он уходит в ТУ ЖЕ `saveSession` веб-половины,
    // которую зовёт непереносённая игра. Одна реализация на обе половины:
    // вторая разошлась бы с первой молча (см. SessionReport).
    //
    // ⚠️ Страница может быть ещё не готова — например, человек открыл нативный
    // экран сразу со старта. Веб-сторона на этот случай копит отчёты в очередь
    // и разбирает её, когда регистрирует приёмник; здесь просто отдаём.
    // Питомец в шапке нативных игр берёт кадры из вложенной веб-сборки —
    // они там уже лежат, класть их второй раз в ассеты Flutter значило бы
    // 4,2 МБ впустую.
    PetHost.state = widget.state;
    PetHost.origin = widget.server.origin;
    SessionReport.sink = (json) async {
      await _c.runJavaScript('window.__psySaveSession && window.__psySaveSession($json);');
    };
    /*
     * 🔴 «НА ГЛАВНУЮ» ИЗ ПАУЗЫ. Нативный экран про главную ничего не знает — её
     * рисует веб-половина внутри оболочки. Поэтому уход на главную делаем здесь:
     * снимаем нативный экран и уводим страницу в корень.
     *
     * ⚠️ Уводим именно `location.replace`, а не `history.back()`: назад вернуло бы в
     * ту же игру, из которой человек только что попросился уйти.
     */
    GameExit.home = () async {
      if (!mounted) return;
      final nav = Navigator.of(context);
      while (nav.canPop()) {
        nav.pop();
      }
      _openedRoute = null;
      await _c.runJavaScript("location.replace('${widget.server.origin}/');");
    };
    GameExit.feedback = () {
      if (!mounted) return;
      final route = Uri.parse(GameRules.currentRoute ?? '/games');
      final params = {...route.queryParameters, ...GamePreset.params};
      _openFeedback(route.replace(queryParameters: params.isEmpty ? null : params).toString());
    };
    _c = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..addJavaScriptChannel(
        SharedState.channel,
        onMessageReceived: (m) => _fromWeb(m.message),
      )
      ..addJavaScriptChannel(latencyChannel, onMessageReceived: (m) {
        final line = _marks.onMark(m.message);
        // ignore: avoid_print — прибор нарочно пишет в журнал устройства
        if (line != null) print(line);
      })
      ..setOnConsoleMessage((m) {
        // Замеры страницы (ПОКАЗ/ОТКЛИК) уходят в журнал устройства вместе со строками Flutter.
        if (tapLatencyProbe && (m.message.startsWith('ОТКЛИК') || m.message.startsWith('ПОКАЗ'))) {
          // ignore: avoid_print — прибор нарочно пишет в журнал устройства
          print(m.message);
        }
      })
      ..setNavigationDelegate(NavigationDelegate(
        onNavigationRequest: (req) {
          final route = HybridApp.routeOf(req.url);
          if (route == null) return NavigationDecision.navigate;
          // 🔴 ПЕРЕХВАТ. Веб-версию перенесённой игры не открываем никогда:
          // иначе человек увидел бы старый экран там, где уже есть новый, и
          // прогресс писался бы дважды разными путями.
          _openNative(route, query: HybridApp.queryOf(req.url));
          return NavigationDecision.prevent;
        },
        onPageStarted: (_) {
          _c.runJavaScript(widget.state.bootstrapJs());
          _c.runJavaScript(_hostWarmupJs());
        },
        onPageFinished: (url) {
          // Загрузка документа (первый адрес, `location.replace`) смену адреса через History API
          // не шлёт — вкладку определяем здесь.
          _onPagePath(url);
          _c.runJavaScript(widget.state.bootstrapJs());
          _c.runJavaScript(_hostWarmupJs());
          if (tapLatencyProbe) {
            _c.runJavaScript(webTapLatencyJs('Веб/страница'));
            _c.runJavaScript(webStimulusMarkJs());
          }
          if (mounted) setState(() => _loading = false);
        },
      ))
      // 🔴 КОРЕНЬ, А НЕ /index.html. Замер 23.09.2026: по адресу `/index.html`
      // приложение грузится целиком (связка на 29,7 МБ доезжает), но
      // маршрутизатор такого маршрута не знает и показывает «страница не
      // найдена» — в журнале это видно по запросу unmatched.png. Корень он
      // разбирает как главную.
      ..loadRequest(Uri.parse('${widget.server.origin}${HybridApp.startRoute}'));
    // 🔴 СМЕНИЛАСЬ ВЛОЖЕННАЯ СБОРКА — СБРАСЫВАЕМ КЭШ WebView.
    //
    // 📍 Отчёт Дениса 24.09.2026 (71a0c36e): после обновления «картинки пропали
    // — логотипы, и питомец в верхнем правом углу тоже», при нуле ошибок в
    // журнале. Адрес страницы у нас постоянный (127.0.0.1:47355 — он держит
    // корзину localStorage), поэтому WebView спокойно берёт из кэша СТАРУЮ
    // страницу, а она просит файлы со старыми хешами: в новой сборке их нет.
    //
    // ⚠️ Сбрасываем ТОЛЬКО кэш и только при смене отпечатка. `clearLocalStorage`
    // здесь звать нельзя ни в каком виде: на нём держится весь прогресс.
    unawaited(_dropStaleCache());
    if (NativeTabs.tabs.isNotEmpty) {
      _tabsReady = true;
    } else {
      unawaited(NativeTabs.load().then((_) {
        if (mounted) setState(() => _tabsReady = true);
      }).catchError((Object _) {
        // Нет выгрузки — полосы нет, страница работает как раньше.
      }));
    }
    if (!WebTheme.loaded) {
      // До загрузки палитра — значения веба по умолчанию; выгрузка лишь уточняет их.
      unawaited(WebTheme.load().then((_) {
        if (mounted) setState(() {});
      }).catchError((Object _) {}));
    }
    _pagePath = Uri.tryParse(HybridApp.startRoute)?.path ?? '/';
    HybridApp.open = _open;
    HybridApp.runJs = _runJs;
    WarmupUi.run = _runUi;
    SettingsScreen.webEval = _runJs;
    PetBridge.run = (js) => _c.runJavaScript(js);
    ScreenUi.run = (js) => _c.runJavaScript(js);
    for (final r in _bodyTabs) {
      ScreenUi.model(r).addListener(_onScreenModel);
    }
    ScreenUi.model(FeedbackHost.route).addListener(_onFeedbackModel);
    PetBridge.probe = _runJs;
    // Перенесённая игра по START_ROUTE: перехват на первой загрузке не срабатывает
    // (это не переход, а первый адрес), поэтому открываем нативный экран сами.
    final first = HybridApp.routeOf('${widget.server.origin}${HybridApp.startRoute}');
    if (first != null) {
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => _openNative(first, query: HybridApp.queryOf(HybridApp.startRoute)),
      );
    }
  }

  @override
  void dispose() {
    SessionReport.sink = null;
    GameExit.home = null;
    GameExit.feedback = null;
    PetBridge.run = null;
    ScreenUi.run = null;
    for (final r in _bodyTabs) {
      ScreenUi.model(r).removeListener(_onScreenModel);
    }
    ScreenUi.model(FeedbackHost.route).removeListener(_onFeedbackModel);
    for (final t in _modelTimers.values) {
      t.cancel();
    }
    _holdTimer?.cancel();
    PetBridge.probe = null;
    // Хук снимается вместе с хостом: оставленный, он звал бы мёртвый WebView.
    if (HybridApp.open == _open) HybridApp.open = null;
    if (HybridApp.runJs == _runJs) HybridApp.runJs = null;
    if (WarmupUi.run == _runUi) WarmupUi.run = null;
    if (SettingsScreen.webEval == _runJs) SettingsScreen.webEval = null;
    super.dispose();
  }

  Future<Object?> _runJs(String js) => _c.runJavaScriptReturningResult(js);
  Future<void> _runUi(String js) => _c.runJavaScript(js);

  /// Маршрут из нативного экрана: перенесённый — нативно, остальной — страницей в WebView.
  Future<void> _open(String route) async {
    final native = HybridApp.routeOf('${widget.server.origin}$route');
    if (native != null) {
      await _openNative(native, query: HybridApp.queryOf(route));
      return;
    }
    if (!mounted) return;
    // Возвращаемся к странице и уводим её на нужный адрес: нативные экраны поверх WebView
    // закрываются, иначе человек остался бы смотреть на развилку, под которой уже другая игра.
    Navigator.of(context).popUntil((r) => r.isFirst);
    await _c.loadRequest(Uri.parse('${widget.server.origin}$route'));
  }

  /*
   * 🔴 СТРАНИЦА УШЛА ВПЕРЁД — НАТИВНЫЙ ЭКРАН ОБЯЗАН УЙТИ С НЕЙ.
   *
   * Нашёл раздел «Сортировки» 24.09.2026 (задача a912f656), и дефект точный.
   * Зарядка после партии через две секунды переводит шаг сама
   * (`WarmupContext.advanceToNext`), а нативный экран оставался лежать поверх:
   * снимался он только действием человека, потому что `_openNative` ждал
   * `Navigator.push`. Человек видел ту же игру, и ни победа, ни поражение ничего
   * не двигали — под экраном зарядка уже была на следующем шаге.
   * Бьёт по всем перехваченным играм, то есть по зарядке целиком.
   *
   * ⚠️ И ЗНАНИЕ ОБ ЭТОМ В КОДЕ БЫЛО. Ниже стоит комментарий «страница могла уехать
   * сама (например, зарядка перевела шаг)» — а ветки поведения не было. Комментарий
   * не заменяет кода: вот ровно этот случай.
   */
  void _closeNativeBecausePageMoved() {
    final page = _openedPage;
    if (_openedRoute == null || !mounted || page == null || !page.isActive) return;
    // Возврата страницы назад быть не должно: она ушла вперёд НАМЕРЕННО, и
    // `history.back()` вернул бы человека в игру, из которой зарядка его вывела.
    _pagesClosedByWeb.add(page);
    final navigator = Navigator.of(context);
    // Pause and feedback are routes above the game, not the game itself.
    navigator.popUntil((candidate) => identical(candidate, page));
    navigator.removeRoute(page);
  }

  /*
   * 🔴 МЕЖДУ ДВУМЯ НАТИВНЫМИ ШАГАМИ ЗАРЯДКИ ПЕРЕХОД ВЕДЁТ ОБОЛОЧКА (решение Дениса
   * 01.10.2026: «зачем вебом скреплять переходы между двумя упражнениями? это
   * лишний глюк»). Раньше: партия → 2 с → веб-мост `/warmup-bridge` → 5 с → смена
   * адреса → перехват → «закрыть старый / открыть новый». Теперь веб, засчитав
   * нативную партию, шлёт `warmupStepDone` (`frontend/src/services/hostWarmup.ts`),
   * а оболочка показывает свой мост (`warmup_step_bridge.dart`) и сама открывает
   * следующую игру. Веб остаётся учётом: `goTo` двигает номер шага и ставит адрес
   * страницы на тот же шаг — для перехвата это «тот же экран» (`RouteAction.keep`).
   */

  /// Метка «поверх страницы нативный экран» (`window.__psyNativeOver`, задача 5f9d4ea0): пока она
  /// стоит, `saveSession` страницы принимает только партии оболочки — веб-копия игры под нативным
  /// экраном стартует сама (SDMT при `wu=1`) и сохранила бы партию, которую человек не играл
  /// (`frontend/src/services/hostSessions.ts`). Метка — номер открытия: снятие старого экрана не
  /// снимает метку следующего.
  String? _nativeOver;
  int _nativeOverSeq = 0;

  String _markNativeOver(String route) {
    final token = '${++_nativeOverSeq} $route';
    _nativeOver = token;
    unawaited(_c.runJavaScript('window.__psyNativeOver=${jsonEncode(token)};').catchError((Object _) {}));
    return token;
  }

  /// Снять метку — через 1,5 с: на «назад» веб-копия размонтируется и может сохранить недоигранное,
  /// это тоже фантом. Новый нативный экран за это время ставит свою метку, и старая её не трогает.
  void _unmarkNativeOver(String token) {
    if (_nativeOver == token) _nativeOver = null;
    unawaited(_c
        .runJavaScript('(function(t){setTimeout(function(){if(window.__psyNativeOver===t)window.__psyNativeOver=null;},1500);})'
            '(${jsonEncode(token)});')
        .catchError((Object _) {}));
  }

  /// Какие адреса оболочка рисует сама и на каком языке говорит человек — по этому
  /// веб решает, отдать ли переход между шагами зарядки оболочке.
  String _hostWarmupJs() {
    final routes = {
      for (final r in HybridApp.native.keys) r.split('?').first,
      ...HybridApp.shell.keys,
    }.toList()
      ..sort();
    return 'window.__psyHostNativeRoutes=${jsonEncode(routes)};'
        // Страница перезагрузилась под открытым нативным экраном — метка возвращается (5f9d4ea0).
        'window.__psyNativeOver=${jsonEncode(_nativeOver)};'
        'window.__psyHostLang=${jsonEncode(widget.state.language)};'
        // Полосой владеет оболочка — веб свою не рисует (`BottomTabBar.tsx`).
        'window.__psyNativeTabs=true;'
        // На этих вкладках гуляет питомец оболочки — веб своего прячет (`WalkingPet.tsx`).
        'window.__psyNativeTabRoutes=${jsonEncode(NativeTabs.native.toList())};'
        // Эти экраны рисуем по модели — веб-экран под нами отдаёт её (`hostScreens.ts`).
        'window.__psyHostScreens=${jsonEncode(ScreenUi.routes.toList())};';
  }

  Future<void> _loadStepInfo(ValueNotifier<WarmupStepInfo?> into) async {
    try {
      final raw = await _c.runJavaScriptReturningResult(
        'JSON.stringify(window.__psyWarmupHost && window.__psyWarmupHost.info ? window.__psyWarmupHost.info() : null)',
      );
      // WebKit отдаёт строку как есть, Android — ещё раз в кавычках (как в warmup_bridge.dart).
      Object? v = raw;
      for (var i = 0; i < 2 && v is String; i += 1) {
        v = jsonDecode(v);
      }
      into.value = WarmupStepInfo.fromJson(v);
    } catch (_) {
      // Нет ответа — полоска остаётся без номера, ⏭ работает.
    }
  }

  /// ⏭ нативного шага — туда же, куда веб-⏭: `skipCurrent` веба.
  Future<void> _skipNativeStep() async {
    _closeNativeBecausePageMoved();
    await _c.runJavaScript('window.__psyWarmupHost && window.__psyWarmupHost.skip && window.__psyWarmupHost.skip();');
  }

  /// Шаг зарядки, переход с которого оболочка уже ведёт или только что провела.
  int? _stepDoneFrom;
  DateTime? _stepDoneAt;

  Future<void> _warmupStepDone(Map<String, Object?> m) async {
    /*
     * 🔴 ОДИН ШАГ — ОДИН ПЕРЕХОД. 06.10.2026, 2.56.12 (отчёт 02d98918): после SDMT
     * пришли ДВА `warmupStepDone{fromIdx:2}` — партию сохранили и нативный экран, и
     * веб-копия игры под ним. Встали два моста; первый снялся пустым (`case null`),
     * закрыл уже открытый следующий шаг и остановил зарядку — человек на главной.
     * Веб теперь шлёт «готов» один раз (`WarmupContext`), а здесь — второй замок:
     * повтор того же шага в пределах минуты не новый переход. Минута — меньше
     * любого шага зарядки, поэтому новый заход того же номера она не съест.
     */
    final from = m['fromIdx'];
    final now = DateTime.now();
    if (from is num && from.toInt() == _stepDoneFrom &&
        _stepDoneAt != null && now.difference(_stepDoneAt!) < const Duration(minutes: 1)) {
      return;
    }
    if (from is num) {
      _stepDoneFrom = from.toInt();
      _stepDoneAt = now;
    }
    final done = WarmupStepDone.fromJson(m);
    final next = done == null ? null : HybridApp.routeOf('${widget.server.origin}${done.nextUrl}');
    // 🔴 ВЕБ ЖДЁТ ОТВЕТА: свой переход он в этом случае не планирует. Вести не можем
    // (экран уже закрыт, следующий шаг не наш) — возвращаем переход вебу.
    if (done == null || next == null || _openedRoute == null || !mounted) {
      if (from is num) {
        await _c.runJavaScript('window.__psyWarmupHost && window.__psyWarmupHost.advance(${from.toInt()});');
      }
      return;
    }
    // Игра успевает показать свой итог — как у веб-зарядки (2 с, вечером 3,5).
    final shown = _openedRoute;
    await Future<void>.delayed(Duration(milliseconds: done.evening ? 3500 : 2000));
    if (!mounted || _openedRoute != shown) {
      // Человек ушёл из игры сам, пока она показывала итог: переход — вебу.
      await _c.runJavaScript('window.__psyWarmupHost && window.__psyWarmupHost.advance(${done.fromIdx});');
      return;
    }
    final choice = await Navigator.of(context).push<WarmupBridgeChoice>(
      MaterialPageRoute(builder: (_) => WarmupStepBridge(done: done)),
    );
    if (!mounted) return;
    switch (choice) {
      case WarmupBridgeChoice.go:
        // Снять сыгранную игру и сразу открыть следующую — без страницы посередине.
        _closeNativeBecausePageMoved();
        unawaited(_openNative(
          next,
          query: HybridApp.queryOf(done.nextUrl),
          stepInfo: WarmupStepInfo(idx: done.fromIdx + 1, total: done.total, title: done.nextTitle, evening: done.evening),
        ));
        await _c.runJavaScript('window.__psyWarmupHost && window.__psyWarmupHost.goTo(${done.fromIdx + 1});');
      case WarmupBridgeChoice.skip:
        // Следующий шаг пропущен: страница сама уйдёт на шаг через один (или на итог),
        // а перехват откроет его, если он наш.
        _closeNativeBecausePageMoved();
        await _c.runJavaScript('window.__psyWarmupHost && window.__psyWarmupHost.goTo(${done.fromIdx + 2});');
      case WarmupBridgeChoice.stop:
      case null:
        _closeNativeBecausePageMoved();
        await _c.runJavaScript('window.__psyWarmupHost && window.__psyWarmupHost.stop();');
    }
  }

  /// Возвращает, ушёл ли человек с экрана САМ (назад) — а не страница увела его дальше и
  /// не выбор в развилке/каталоге открыл следующий экран. По этому признаку выбор
  /// открывается снова, когда человек вернулся из выбранной в нём игры.
  Future<bool> _openNative(
    String route, {
    Map<String, String> query = const {},
    WarmupStepInfo? stepInfo,
  }) async {
    final build = HybridApp.native[route] ?? HybridApp.shell[route];
    if (build == null) return false;
    _openedRoute = route;
    final over = _markNativeOver(route);
    // Настройки шага живут ровно столько, сколько открыт экран, — как
    // `useLocalSearchParams` в вебе. См. [GamePreset].
    GamePreset.set(query);
    // Адрес нужен каркасу, чтобы показать правило ИМЕННО этой игры.
    GameRules.currentRoute = route;
    // 🔴 ШАГ ЗАРЯДКИ — В РАМКЕ С ПОЛОСКОЙ «N/M · ⏭» (задача 63bccf96): веб рисует её в
    // своём каркасе, а нативный экран лежит поверх страницы. Номер шага знает веб —
    // спрашиваем; когда переход ведёт сама оболочка, он известен заранее.
    final step = GamePreset.isPreset ? ValueNotifier<WarmupStepInfo?>(stepInfo) : null;
    // Снимок ключей, которые веб читает при запуске: после нативных настроек сравним.
    final watchedBefore = _watchedSnapshot();
    if (step != null && stepInfo == null) unawaited(_loadStepInfo(step));
    final page = MaterialPageRoute<dynamic>(
        // «Заново» в паузе любой игры — пересоздание экрана в RestartScope (restart_scope.dart).
        builder: (_) => step == null
            ? RestartScope(builder: (_) => build(widget.state))
            : WarmupStepFrame(
                info: step,
                onSkip: _skipNativeStep,
                child: RestartScope(builder: (_) => build(widget.state)),
              ),
      );
    _openedPage = page;
    final result = await Navigator.of(context).push(page);
    // ⚠️ Отметку снимаем, ТОЛЬКО если она всё ещё наша: когда страница ушла вперёд,
    // поверх уже открыт следующий экран, и его отметку затирать нельзя.
    /*
     * 🔴 НАСТРОЙКИ ШАГА — ПОД ТЕМ ЖЕ УСЛОВИЕМ. Нашёл раздел «Языки» 30.09.2026
     * живым прогоном: развилка «Языки» → «Начать» зарядку → «Словарь» открылся
     * ЭКРАНОМ НАСТРОЕК вместо шага. Порядок: страница ушла вперёд → хост снял
     * развилку и СРАЗУ открыл «Словарь» с `wu=1` → продолжение этого метода для
     * развилки срабатывает микрозадачей позже и стирало `GamePreset` уже нового
     * экрана, а тот читает его после `await`. Бьёт по любой зарядке, где
     * нативный экран сменяется нативным.
     */
    if (identical(_openedPage, page)) {
      _openedPage = null;
      _openedRoute = null;
      GamePreset.clear();
    }
    _unmarkNativeOver(over);
    if (_openedPage == null && GameRules.currentRoute == route) GameRules.currentRoute = null;
    final closedByPage = _pagesClosedByWeb.remove(page);
    // 🔴 СТРАНИЦА ПОД НАМИ ОСТАЛАСЬ НА АДРЕСЕ ИГРЫ. Перехват срабатывает ПОСЛЕ
    // того, как роутер уже сменил адрес, — значит под нативным экраном веб-половина
    // стоит на той же игре. Не вернуть её назад — человек, закрыв нативный экран,
    // увидит веб-версию той же игры, то есть ровно то, что перехват и должен был
    // предотвратить.
    // ⚠️ Возврат делаем ТОЛЬКО если адрес всё ещё игровой: пока человек играл,
    // страница могла уехать сама (например, зарядка перевела шаг).
    /*
     * 🔴 ШАГ НАЗАД ДЕЛАЕМ, ТОЛЬКО ЕСЛИ НИКУДА НЕ ИДЁМ ДАЛЬШЕ.
     *
     * Найдено по отчёту Дениса 23.09.2026: «ни одна игра из хаба головоломок не
     * запускается, вылетает на главную». Развилка — нативный экран, и страница под
     * ней стоит на `/games/<раздел>-hub`. Мы делали `history.back()` (то есть уводили
     * страницу на главную) и СРАЗУ следом просили загрузить выбранную игру. Два
     * перехода в одном такте: `history.back()` в WebKit исполняется асинхронно и
     * прилетает ПОСЛЕ нашей загрузки, затирая её. Человек видит главную.
     *
     * Поэтому: выбрали карточку — идём сразу туда, шаг назад не нужен вовсе.
     */
    final goingOn = result is HubCardTap || closedByPage;
    /*
     * 🔴 НАТИВНЫЕ НАСТРОЙКИ ПОМЕНЯЛИ ТО, ЧТО ВЕБ ЧИТАЕТ ОДИН РАЗ ПРИ ЗАПУСКЕ.
     * Тема, язык, профиль, звук, питомец живут у веба в памяти контекстов
     * (`ThemeContext`, `feedback.ts`…): новый снимок в localStorage их не обновит, и
     * человек вернулся бы в старый вид. Поэтому страница уходит назад и
     * ПЕРЕЗАГРУЖАЕТСЯ — тогда снимок вливается до её кода (`bootstrapJs`).
     * ⚠️ Перезагрузка — по событию `popstate`, а не следом: `history.back()` в WebKit
     * асинхронный, и перезагрузка в том же такте застала бы страницу на старом адресе.
     */
    // `takeWebDirty` — после переноса кодом / восстановления копии: прогресс переписан целиком.
    final reloadWeb = (_watchedSnapshot() != watchedBefore) | SettingsScreen.takeWebDirty();
    if (mounted && !goingOn) {
      await _c.runJavaScript(reloadWeb
          ? "(function(){var d=false;function r(){if(d)return;d=true;location.reload();}"
              "if(String(location.pathname).indexOf('$route')>=0){window.addEventListener('popstate',r,{once:true});history.back();setTimeout(r,800);}else r();})();"
          : "if (String(location.pathname).indexOf('$route') >= 0) history.back();");
    } else if (mounted && reloadWeb && result is HubCardTap && HybridApp.native.containsKey(result.route)) {
      // Дальше откроется нативный экран, а страница под ним осталась бы в старом виде.
      await _c.runJavaScript('location.reload();');
    }
    // Вернулись из нативной игры — страница обязана перечитать прогресс,
    // иначе на карте уровней останется старое число.
    if (mounted) await _c.runJavaScript(widget.state.bootstrapJs());
    // Под игрой стояла Главная по модели — страница под ней фокуса не теряла и сама не
    // перечитает «Сегодня», монеты и рекомендации; просим (`refresh`, `app/index.tsx`).
    final tab = _nativeTab;
    if (mounted && tab != null && ScreenUi.routes.contains(tab)) await ScreenUi.act(tab, 'refresh');
    /*
     * 🔴 РАЗВИЛКА ВЕРНУЛА ВЫБРАННЫЙ МАРШРУТ. Перенесённую игру открываем
     * нативно, остальные — в веб-половине: хаб про это ничего не знает и знать
     * не должен, иначе он станет второй оболочкой.
     */
    if (!mounted || result is! HubCardTap) return !goingOn;
    final next = result.route;
    // Адрес карточки — как его пишет веб (`?mode=Light%20Up`); ключ карты ищем тем же
    // разбором, что и у перехвата страницы.
    final nativeNext = HybridApp.routeOf(next);
    if (nativeNext != null && (HybridApp.native.containsKey(nativeNext) || HybridApp.shell.containsKey(nativeNext))) {
      final cameBack = await _openNative(nativeNext, query: HybridApp.queryOf(next));
      /*
       * 🔴 ВЕРНУЛСЯ ИЗ ВЫБРАННОГО — СНОВА В ВЫБОР, НАТИВНЫЙ (задача f5025027).
       *
       * Страница под нами всё это время стояла на адресе выбора (`/games`, развилки), и
       * после закрытия игры человек видел ВЕБ-версию того же экрана: каталог без поиска,
       * развилку другим видом. Шаг «назад» отсюда не делаем — его сделает сам выбор, когда
       * человек закроет и его.
       */
      if (mounted && cameBack) return _openNative(route, query: query);
      return false;
    }
    await _c.loadRequest(Uri.parse('${widget.server.origin}$next'));
    return false;
  }

  String _watchedSnapshot() => [for (final k in SettingsScreen.watched) widget.state.get(k) ?? ''].join('\u0001');

  /// Сброс кэша при смене вложенной сборки — см. пояснение в `initState`.
  Future<void> _dropStaleCache() async {
    const key = 'psygames_embedded_build';
    final now = await widget.server.fingerprint();
    if (now.isEmpty) return;
    if (widget.state.get(key) == now) return;
    await _c.clearCache();
    await widget.state.set(key, now);
  }

  @override
  Widget build(BuildContext context) {
    final path = _nativeTab ?? _pagePath;
    final bar = _tabsReady && NativeTabs.barVisible(path);
    final shown = _shownIndex();
    final scaffold = Scaffold(
      // Полоса под часами и фон вкладки — `colors.background` веба, а не цвет семени Material.
      backgroundColor: WebTheme.of(context).background,
      body: SafeArea(
        bottom: !bar,
        child: Stack(
          fit: StackFit.expand,
          children: [
          // Страница — всегда под нативным слоем и всегда рисуется (см. [_holdUntilPainted]); чтец экрана
          // её не видит, пока она закрыта.
          ExcludeSemantics(
            excluding: shown != 0,
            child: Stack(
              children: [
                WebViewWidget(controller: _c),
                if (_loading) const Center(child: CircularProgressIndicator()),
              ],
            ),
          ),
          Offstage(
            offstage: shown == 0,
            // Слой непрозрачный и забирает касания целиком: страница под ним не должна ни
            // просвечивать, ни ловить нажатия мимо нативных кнопок.
            child: Listener(
              key: const ValueKey('native-cover'),
              behavior: HitTestBehavior.opaque,
              child: ColoredBox(
                color: WebTheme.of(context).background,
                child: IndexedStack(
          index: shown == 0 ? 0 : shown - 1,
          children: [
            // Главная по модели веба (7c88c0b8): страница под ней на «/» считает, мы рисуем.
            HomeAccent(
              color: WebTheme.accent(widget.state),
              child: HomeScreen(
                state: widget.state,
                origin: widget.server.origin,
                onOpen: _openFromCatalog,
                onTab: _selectTab,
                onSwitcher: _openSwitcher,
                active: shown == 1,
              ),
            ),
            // Вкладка «Игры» живёт рядом со страницей, а не поверх неё: поиск и фильтр
            // переживают уход на другую вкладку и игру (99628ecf, п. 6).
            if (_tabsReady)
              CatalogScreen(
                key: ValueKey('catalog-tab-$_catalogGen'),
                state: widget.state,
                embedded: true,
                initialQuery: _catalogQuery,
                initialFilter: _catalogFilter,
                onOpen: _openFromCatalog,
              )
            else
              const SizedBox.shrink(),
            // «Прогресс» по модели веба (6ff4a966): считает страница под ним на `/statistics`.
            StatsScreen(onTab: _selectTab),
            // Календарь серии (cd77367d) и итог оценки (455d71b1) — страницы, не вкладки.
            const StreakCalendarScreen(),
            const AssessmentResultScreen(),
            // Знакомство (a8aa91e0): подбор и обучение — страница, полосы нет (noBar веба).
            OnboardingScreen(origin: widget.server.origin),
            // Источники, коллекция, достижения, лиги (78165c68, 8111eea4, 56660caa, ac902ebf) — страницы по модели.
            const SourcesScreen(),
            const CollectionScreen(),
            const AchievementsScreen(),
            const LeaguesScreen(),
            // «Друзья» (7bb8035b) — страница по модели; сервер круга держит веб.
            const FriendsScreen(),
            // «Магазин» (9424da3a) — страница по модели; покупки и баланс держит веб.
            ShopScreen(origin: widget.server.origin),
            // «Что нового» (84df0687): список версий — модель веба, проверку обновлений делает оболочка.
            const WhatsNewScreen(),
            // «Питомец» (d1e147b0) — вкладка по модели веба; кадры — тем же PetFrames, что у гуляки.
            PetScreen(origin: widget.server.origin),
          ],
                ),
              ),
            ),
          ),
          ],
        ),
      ),
      bottomNavigationBar: bar
          ? NativeTabBar(
              active: NativeTabs.activeTab(path),
              onTap: _selectTab,
              accent: WebTheme.accent(widget.state),
            )
          : null,
    );
    // Кнопку отзыва на страницах рисует веб; на нативной вкладке страница скрыта вместе с ней —
    // кнопка оболочки встаёт на то же место окна.
    // ⚠️ Корень — всегда Stack (под постоянной обёрткой PopScope): смена корня между Scaffold и Stack
    // при переходе по вкладкам пересоздала бы WebView вместе со страницей.
    //
    // 🔴 СИСТЕМНАЯ «НАЗАД» ANDROID (живой замер на эмуляторе 07.10.2026: на календаре серии, «Прогрессе»
    // и любой странице она закрывала приложение целиком — обработчика не было ни здесь, ни в main).
    // Правило: на Главной — выход из приложения; на другой вкладке — на Главную; на странице — назад по
    // её истории тем же `goBackOrHome`, что у кнопки «назад» веба (`window.__psyBack`). Игры поверх —
    // свои маршруты Navigator, их «назад» сюда не доходит.
    final here = _nativeTab ?? _pagePath;
    return PopScope(
      canPop: here == '/',
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        if (NativeTabs.tabs.any((t) => t.route == here)) {
          unawaited(_selectTab('/'));
        } else {
          unawaited(_c.runJavaScript('window.__psyBack ? window.__psyBack() : history.back();'));
        }
      },
      child: Stack(children: [
      Positioned.fill(child: scaffold),
      // Питомец страницы скрыт вместе с ней — на нативной вкладке гуляет питомец оболочки
      // (облик и реплики — у веба, мостом `__psyPet`). Ниже кнопки отзыва, как `zIndex` веба.
      // На вкладке «Питомец» гуляки нет — питомец и так на экране (как `routeAllowed` веба).
      if (_nativeTab != null && _nativeTab != PetScreen.route && bar)
        WalkingPet(
          origin: widget.server.origin,
          lift: NativeTabs.height,
          accent: WebTheme.accent(widget.state),
          onOpenPet: () => _openFromCatalog('/pet'),
          onOpenRoute: _openFromCatalog,
        ),
      // Кнопка отзыва веба стоит везде, кроме формы отзыва, — с полосой и без (итог оценки).
      if (_nativeTab != null) FeedbackFab(state: widget.state, onOpen: () => _openFeedback(_nativeTab!)),
    ]),
    );
  }
}
