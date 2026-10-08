import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/pause/screen.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПЕРЕХВАТ ПЕРЕНЕСЁННЫХ ИГР.
///
/// Гибрид показывает нынешнее приложение целиком, но перенесённые игры обязан
/// открывать нативно. Если разбор ссылки промахнётся, человек получит СТАРЫЙ
/// экран там, где уже есть новый, — и прогресс поедет двумя путями сразу.
/// Ссылки приходят в разном виде: с расширением и без, с запросом и якорем.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('🔴 перенесённые игры узнаются во всех видах ссылок', () {
    const origin = 'http://127.0.0.1:54321';
    for (final url in [
      '$origin/games/one-line',
      '$origin/games/one-line.html',
      '$origin/games/one-line?level=4',
      '$origin/games/one-line.html#top',
      '$origin/games/dots-connect',
      '$origin/games/digit-span.html?mode=free',
      '$origin/games/corsi',
      '$origin/games/corsi.html?level=12',
      '$origin/games/n-back',
      '$origin/games/n-back.html?wu=1&diff=medium&mode=2-back',
      '$origin/games/picture-pairs',
      '$origin/games/picture-pairs.html?level=22',
      '$origin/games/listening-span',
      '$origin/games/listening-span.html?level=10',
      '$origin/games/schulte',
      '$origin/games/schulte.html?level=3',
      '$origin/games/reading-span',
      '$origin/games/reading-span.html?wu=1&setSize=4',
      '$origin/games/mahjong',
      '$origin/games/math-slider',
      '$origin/games/math-slider.html?level=21',
      '$origin/games/object-tracker',
      '$origin/games/object-tracker.html?level=7',
      '$origin/games/quick-count',
      '$origin/games/quick-count.html',
      '$origin/games/pattern',
      '$origin/games/pattern.html?level=9',
      '$origin/games/math-sprint',
      '$origin/games/math-sprint.html',
      '$origin/games/number-bonds',
      '$origin/games/number-bonds.html?level=4',
      '$origin/games/ospan',
      '$origin/games/ospan.html',
      '$origin/games/sdmt',
      '$origin/games/sdmt.html?level=7',
      '$origin/games/set-game',
      '$origin/games/set-game.html',
      '$origin/games/counter',
      '$origin/games/number-run',
      '$origin/games/number-run.html?level=4',
      '$origin/games/find-differences',
      '$origin/games/visual-search',
      '$origin/games/search-hub',
      '$origin/games/counting-hub',
      '$origin/games/find-differences.html?level=5',
      '$origin/games/stroop',
      '$origin/games/stroop.html?mode=ink',
      '$origin/games/flanker',
      '$origin/games/flanker.html?autostart=1',
      '$origin/games/simon',
      '$origin/games/sudoku',
      '$origin/games/sudoku.html?mode=levels',
      '$origin/games/go-no-go',
      '$origin/games/mental-rotation',
      '$origin/games/mental-rotation.html?level=12',
      '$origin/games/navigator',
      '$origin/games/navigator.html?level=9&mode=home-direction',
      '$origin/games/trail-making',
      '$origin/games/trail-making.html?mode=A&count=7',
      '$origin/games/spatial-span',
      '$origin/games/spatial-lab',
      '$origin/games/spatial-lab?mode=netslide',
      '$origin/games/spatial-hub',
      '$origin/games/spatial-lab.html?mode=sixteen&level=9',
      '$origin/games/goods-sort',
      '$origin/games/goods-sort.html?level=12',
      '$origin/games/water-sort',
      '$origin/games/ball-sort',
      '$origin/games/nut-sort.html?level=3',
      '$origin/games/cake-sort',
      '$origin/games/pizza-sort',
      '$origin/games/hanoi',
      '$origin/games/tower-london',
      '$origin/games/sorting-hub',
      '$origin/games/sudoku',
      '$origin/games/sudoku.html?mode=levels',
      '$origin/games/go-no-go',
      '$origin/games/choice-rt',
      '$origin/games/stop-signal',
      '$origin/games/posner',
      '$origin/games/stroop-emotional',
      '$origin/games/switching-task',
      '$origin/games/targets',
      '$origin/games/inhibition',
      '$origin/games/faces-names',
      '$origin/games/memory-palace',
      '$origin/games/mnemonics',
      '$origin/games/mnemonics?wu=1&mode=numbers&itemCount=8',
      '$origin/games/rmet',
      '$origin/games/ant',
      '$origin/games/attention-conflict',
      '$origin/games/iowa',
      '$origin/games/prl',
      '$origin/games/bart',
      '$origin/games/wcst',
      '$origin/games/cpt',
      '$origin/games/proofreading',
      '$origin/games/word-pairs',
      '$origin/games/vocab-srs',
      '$origin/games/vocab-srs.html',
      '$origin/games/vocab-srs?wu=1&targetLang=en&bilingual=1&lang2=es',
      '$origin/games/semantic-sort',
      '$origin/games/semantic-sort.html?wu=1&targetLang=en&rounds=8&cats=3',
      '$origin/games/cloze',
      '$origin/games/cloze.html?wu=1&targetLang=en&rounds=10&bilingual=1',
      '$origin/games/lexical-decision',
      '$origin/games/lexical-decision.html?wu=1&targetLang=es&trials=12&bilingual=1',
      '$origin/games/story-recall',
      '$origin/games/phonemic-fluency',
      '$origin/games/pseudoword-echo',
      '$origin/games/phoneme-pairs',
      '$origin/games/chinese-tones',
      '$origin/games/dictation',
      '$origin/games/dictation.html?wu=1&targetLang=en',
      '$origin/games/chinese-tones.html?wu=1',
      '$origin/games/phoneme-pairs.html?wu=1&targetLang=zh',
      '$origin/games/pseudoword-echo.html?wu=1&targetLang=es',
      '$origin/games/phonemic-fluency.html?wu=1&targetLang=en&duration=90',
      '$origin/games/story-recall.html?wu=1',
      '$origin/games/hearing-hub',
      '$origin/games/words-hub',
      '$origin/games/languages-hub',
      '$origin/games/mnemonics-hub',
      '$origin/games/span',
    ]) {
      expect(HybridApp.routeOf(url), isNotNull, reason: url);
    }
  });

  /// 🔴 Развилки «Слова» и «Языки» перехватываются ТОЛЬКО вместе с зарядкой
  /// раздела в шапке: без неё перехват молча отнял бы у человека рабочую серию.
  test('🔴 развилки со своей зарядкой перехватываются с мостом к ней в шапке', () {
    const origin = 'http://127.0.0.1:54321';
    for (final route in ['/games/words-hub', '/games/languages-hub']) {
      expect(HybridApp.routeOf('$origin$route'), route);
    }
    expect(HybridApp.routeOf('$origin/games/hearing-hub'), '/games/hearing-hub');
  });

  /// 🔴 НАСТРОЙКИ ШАГА СНИМАЕТ ТОЛЬКО ТОТ ЭКРАН, ЧЬИ ОНИ. Живой прогон 30.09.2026:
  /// развилка «Языки» → зарядка → «Словарь» открылся экраном настроек, потому что
  /// закрытие развилки досрабатывало ПОСЛЕ открытия «Словаря» и стирало его `wu=1`.
  test('🔴 закрытие старого экрана не стирает настройки шага нового', () {
    expect(routeOwnsPreset('/games/languages-hub', '/games/languages-hub'), isTrue,
        reason: 'поверх никого — свои настройки снимаются');
    expect(routeOwnsPreset('/games/vocab-srs', '/games/languages-hub'), isFalse,
        reason: 'страница ушла вперёд, открыт «Словарь» — его настройки не трогать');
  });

  /// ⚠️ Фрактал и ГЛУБОКИЙ фрактал — РАЗНЫЕ экраны. Перехват одного не должен утаскивать
  /// второй: он ещё в вебе, и подмена показала бы человеку другую игру.
  test('🔴 фрактал перехватывается, а глубокий фрактал остаётся в вебе', () {
    const origin = 'http://127.0.0.1:54321';
    expect(HybridApp.routeOf('$origin/games/sudoku-fractal'), '/games/sudoku-fractal');
    expect(HybridApp.routeOf('$origin/games/sudoku-fractal.html'), '/games/sudoku-fractal');
    expect(HybridApp.routeOf('$origin/games/sudoku-fractal?level=6'), '/games/sudoku-fractal');
    // ⚠️ Глубокий фрактал — ОТДЕЛЬНЫЙ экран и отдельный маршрут: перехват одного не
    // должен утаскивать второй, иначе человек увидит не ту игру.
    expect(HybridApp.routeOf('$origin/games/sudoku-fractal-deep'), '/games/sudoku-fractal-deep');
  });

  test('🔴 самурай перехватывается: и ссылкой, и файлом, и с якорем', () {
    for (final url in [
      'http://127.0.0.1:54321/games/sudoku-samurai',
      'http://127.0.0.1:54321/games/sudoku-samurai.html',
      'file:///assets/www/games/sudoku-samurai?level=3',
      'http://127.0.0.1:54321/games/sudoku-samurai#board',
    ]) {
      expect(HybridApp.routeOf(url), '/games/sudoku-samurai', reason: url);
    }
  });

  /// 🔴 РЕЖИМ ОТЛИЧАЕТСЯ ТОЛЬКО ХВОСТОМ АДРЕСА. Срезать его до поиска значит открыть
  /// «Небоскрёбы» обычной судоку — человек жмёт одно, получает другое.
  test('🔴 режимы судоку узнаются по хвосту адреса, а не теряются', () {
    const origin = 'http://127.0.0.1:54321';
    expect(HybridApp.routeOf('$origin/games/sudoku?mode=towers'), '/games/sudoku?mode=towers');
    expect(HybridApp.routeOf('$origin/games/sudoku?mode=unequal'), '/games/sudoku?mode=unequal');
    expect(HybridApp.routeOf('$origin/games/sudoku.html?mode=towers'), '/games/sudoku?mode=towers',
        reason: 'и в виде .html тоже');
    expect(HybridApp.routeOf('$origin/games/sudoku'), '/games/sudoku',
        reason: 'без хвоста — обычная судоку');
    expect(HybridApp.routeOf('$origin/games/sudoku?mode=killer'), '/games/sudoku?mode=killer');
    expect(HybridApp.routeOf('$origin/games/sudoku?mode=free'), '/games/sudoku?mode=free');
    for (final tail in ['mode=towers&lang=ru', 'lang=ru&mode=towers&level=3', 'wu=1&mode=towers']) {
      expect(HybridApp.routeOf('$origin/games/sudoku?$tail'), '/games/sudoku?mode=towers');
    }
    expect(HybridApp.routeOf('$origin/games/sudoku?mode=zigzag'), '/games/sudoku',
        reason: 'неизвестный режим ведёт на обычный экран, а не в никуда');
    // Игру без режимов хвост не задевает.
    expect(HybridApp.routeOf('$origin/games/one-line?autostart=1'), '/games/one-line');
  });

  test('🔴 развилки раздела открываются нативно', () {
    const origin = 'http://127.0.0.1:54321';
    expect(HybridApp.routeOf('$origin/games/sudoku-hub'), '/games/sudoku-hub');
    expect(HybridApp.routeOf('$origin/games/spatial-hub'), '/games/spatial-hub');
  });

  test('🔴 неперенесённые игры и прочие страницы остаются в вебе', () {
    const origin = 'http://127.0.0.1:54321';
    for (final url in [
      '$origin/',
      '$origin/index.html',
      '$origin/collection',
      '$origin/statistics',
      '$origin/games/one-liner',   // похожее имя — не наша игра
      '$origin/games/mental-rotation-lab',   // и это: лаборатория ещё в вебе
    ]) {
      expect(HybridApp.routeOf(url), isNull, reason: url);
    }
  });

  test('каждая перенесённая игра имеет свой построитель экрана', () {
    // ⚠️ ОДИН СПИСОК НА ВСЕХ, А НЕ ДВА expect ПОДРЯД: два набора рядом
    // означают, что кто-то проверяет устаревший, и проба краснеет на любой
    // следующей игре. Набор пересобирается из карты перехвата при вливании.
    expect(HybridApp.native.keys.toSet(), {
      // 🔴 Анаграммы — ЧЕТЫРЕ игры за одним адресом; голый адрес ведёт на
      // классику, как и на экране настройки. Все пять ключей появились одним
      // заходом: один ключ без хвоста накрыл бы все режимы разом.
      '/games/anagrams',
      '/games/anagrams?mode=all',
      '/games/anagrams?mode=classic',
      '/games/anagrams?mode=cross',
      '/games/anagrams?mode=square',
      // MindLab (30.09.2026): «Очередь зверей» и «Цвета и формы» — только нативные.
      '/games/animal-queue',
      '/games/ant',
      '/games/attention-conflict',
      // «Дыхание» слито в «Паузу»: тот же экран в режиме дыхания.
      '/games/breathing',
      // «Гимнастика для глаз» слита в «Паузу» тем же ходом.
      '/games/eye-gym',
      // 🔴 Сорок три адреса головоломок стоят здесь ПОИМЁННО, хотя карта их
      // генерирует. Это не дубль: генератор отвечает на «что собралось», а список
      // — на «что мы согласились перехватывать». Переименуют режим в реестре —
      // проба назовёт разницу, а не примет её молча.
      '/games/puzzles',
      '/games/puzzles?mode=Black%20Box',
      '/games/puzzles?mode=Bridges',
      '/games/puzzles?mode=Cube',
      '/games/puzzles?mode=Dominosa',
      '/games/puzzles?mode=Fifteen',
      '/games/puzzles?mode=Filling',
      '/games/puzzles?mode=Flip',
      '/games/puzzles?mode=Flood',
      '/games/puzzles?mode=Galaxies',
      '/games/puzzles?mode=Guess',
      '/games/puzzles?mode=Inertia',
      '/games/puzzles?mode=Keen',
      '/games/puzzles?mode=Light%20Up',
      '/games/puzzles?mode=Loopy',
      '/games/puzzles?mode=Magnets',
      '/games/puzzles?mode=Map',
      '/games/puzzles?mode=Mines',
      '/games/puzzles?mode=Mosaic',
      '/games/puzzles?mode=Net',
      '/games/puzzles?mode=Netslide',
      '/games/puzzles?mode=Palisade',
      '/games/puzzles?mode=Pattern',
      '/games/puzzles?mode=Pearl',
      '/games/puzzles?mode=Pegs',
      '/games/puzzles?mode=Range',
      '/games/puzzles?mode=Rectangles',
      '/games/puzzles?mode=Same%20Game',
      '/games/puzzles?mode=Signpost',
      '/games/puzzles?mode=Singles',
      '/games/puzzles?mode=Sixteen',
      '/games/puzzles?mode=Slant',
      '/games/puzzles?mode=Slide',
      '/games/puzzles?mode=Sokoban',
      '/games/puzzles?mode=Solo',
      '/games/puzzles?mode=Tents',
      '/games/puzzles?mode=Towers',
      '/games/puzzles?mode=Train%20Tracks',
      '/games/puzzles?mode=Twiddle',
      '/games/puzzles?mode=Undead',
      '/games/puzzles?mode=Unequal',
      '/games/puzzles?mode=Unruly',
      '/games/puzzles?mode=Untangle',
      '/games/ball-sort',
      '/games/bart',
      '/games/cake-sort',
      // «Доска в уме» — партия и серия нативно (01.10.2026).
      '/games/chess-blind',
      '/games/chess-hub',
      '/games/find-move',
      '/games/solitaire-chess',
      '/games/knights-queens',
      '/games/choice-rt',
      '/games/cpt',
      '/games/corsi',
      '/games/n-back',
      '/games/picture-pairs',
      '/games/listening-span',
      '/games/digit-span',
      '/games/dots-connect',
      '/games/counter',
      '/games/counting-hub',
      '/games/relaxation-hub',
      '/games/faces-names',
      '/games/find-differences',
      '/games/scholars-mate',
      '/games/search-hub',
      '/games/visual-search',
      '/games/flanker',
      '/games/go-no-go',
      '/games/goods-sort',
      '/games/hanoi',
      '/games/inhibition',
      '/games/iowa',
      '/games/kids-sort',
      // MindLab у координатора (задача f5034811): четыре игры только нативные.
      '/games/traffic-jam',
      '/games/monster-traits',
      '/games/kids-find',
      '/games/submarines',
      '/games/monster-traits?mode=missing',
      '/games/roll-and-bank',
      '/games/hidden-character',
      // Раннер «Поиска глазами» (5386c0e8) — только нативный.
      '/games/search-runner',
      '/games/mahjong',
      '/games/math-slider',
      '/games/math-sprint',
      '/games/memory-matrix',
      '/games/memory-palace',
      '/games/rmet',
      '/games/mnemonics',
      '/games/mnemonics-hub',
      '/games/span',
      '/games/word-pairs',
      '/games/vocab-srs',
      '/games/semantic-sort',
      '/games/cloze',
      '/games/lexical-decision',
      '/games/story-recall',
      '/games/phonemic-fluency',
      '/games/pseudoword-echo',
      '/games/phoneme-pairs',
      '/games/chinese-tones',
      '/games/dictation',
      '/games/rhythm-pitch',
      '/games/hearing-hub',
      '/games/words-hub',
      '/games/languages-hub',
      '/games/mental-rotation',
      '/games/navigator',
      '/games/number-bonds',
      // «Числовой забег» (задача 41845727): общее ядро дороги раннеров.
      '/games/number-run',
      '/games/nut-sort',
      '/games/object-tracker',
      '/games/one-line',
      '/games/ospan',
      '/games/pattern',
      // «Пауза / Зарядка» — хаб практик; набор приходит хвостом `?set=` через GamePreset.
      '/games/pause',
      '/games/posner',
      '/games/pizza-sort',
      '/games/prl',
      '/games/proofreading',
      '/games/quick-count',
      '/games/schulte',
      // Серия блоков Шульте — шаг зарядки `schulte-blocks` (задача 1b6338c1, 07.10.2026).
      '/games/schulte?series=1',
      '/games/reading-span',
      '/games/sdmt',
      '/games/set-game',
      '/games/simon',
      '/games/sorting-hub',
      '/games/spatial-hub',
      '/games/spatial-lab',
      '/games/spatial-span',
      '/games/stop-signal',
      '/games/stroop',
      '/games/stroop-emotional',
      '/games/switching-task',
      '/games/cats',
      '/games/sudoku',
      '/games/sudoku-hub',
      '/games/sudoku?mode=towers',
      '/games/sudoku?mode=unequal',
      // «Судоку для малышей» (4×4, звери) — только нативно, 01.10.2026.
      '/games/sudoku?mode=junior',
      '/games/sudoku?mode=killer',
      '/games/sudoku?mode=free',
      '/games/sudoku-fractal',
      '/games/sudoku-fractal-deep',
      '/games/sudoku-samurai',
      '/games/targets',
      '/games/tower-london',
      '/games/trail-making',
      '/games/water-sort',
      '/games/wcst',
    });
    for (final build in HybridApp.native.values) {
      expect(build, isNotNull);
    }
  });

  /*
   * 🔴 ГОЛОВОЛОМКИ: КАРТОЧКА РАЗВИЛКИ — И СРАЗУ НАТИВНЫЙ ЭКРАН.
   *
   * Перехват их адресов включён 23.09.2026, когда замер показал, что открываются
   * все 42 режима. Проверяем не «сколько ключей в карте» (это сверка карты с самой
   * собой), а то, что КАЖДАЯ карточка головоломок во всех тематических развилках (с 07.10.2026 «Головоломок» нет)
   * узнаётся разбором адреса. Разойдётся кодировка хвоста — проба назовёт карточку.
   */
  test('🔴 каждая карточка головоломок с развилки узнаётся разбором адреса', () {
    final hubs = jsonDecode(File('assets/hubs.json').readAsStringSync()) as Map<String, dynamic>;
    final cards = <String>[];
    for (final list in (hubs['hubs'] as Map<String, dynamic>).values) {
      for (final c in list as List<dynamic>) {
        final route = (c as Map<String, dynamic>)['route'] as String;
        if (route.startsWith('/games/puzzles') && !route.endsWith('-hub')) cards.add(route);
      }
    }
    expect(cards.length, greaterThanOrEqualTo(42), reason: 'карточек головоломок найдено ${cards.length}');
    final missed = <String>[];
    for (final route in cards) {
      if (HybridApp.routeOf('https://app.local$route') == null) missed.add(route);
      // Тот же адрес в раскодированном виде — так его отдаёт `location.href`.
      final decoded = Uri.decodeFull(route);
      if (HybridApp.routeOf('https://app.local$decoded') == null) missed.add('$decoded (раскодированный)');
    }
    expect(missed, isEmpty);
  });

  test('🔴 у анаграмм КАЖДЫЙ режим ведёт на свой экран, а не все на классику', () async {
    /*
     * 📍 За `/games/anagrams` стоят четыре разные игры. Пока в карте был бы один
     * ключ без хвоста, человек, выбравший кроссворд, получил бы классику — и ни
     * одна проба этого не увидела бы: маршрут-то открывается. Поэтому сверяется
     * не «узнаётся ли адрес», а КАКОЙ ЭКРАН за ним стоит.
     */
    SharedPreferences.setMockInitialValues({});
    final state = await SharedState.open();
    final cases = {
      '/games/anagrams': 'AnagramsScreen',
      '/games/anagrams?mode=classic': 'AnagramsScreen',
      '/games/anagrams?mode=all': 'AllWordsScreen',
      '/games/anagrams?mode=cross': 'CrosswordScreen',
      '/games/anagrams?mode=square': 'RingScreen',
    };
    cases.forEach((url, want) {
      final route = HybridApp.routeOf('https://psygames.app$url');
      expect(route, isNotNull, reason: '$url не узнан');
      final widget = HybridApp.native[route]!(state);
      expect(widget.runtimeType.toString(), want, reason: '$url открывает не тот экран');
    });

    // И ссылка из веба с языком в хвосте тоже попадает в свой режим.
    expect(HybridApp.routeOf('https://psygames.app/games/anagrams?lang=ru&mode=cross'),
        '/games/anagrams?mode=cross',
        reason: 'хвост с двумя параметрами не должен терять режим');
  });

  test('«Пауза» открывается нативно и с набором в хвосте адреса', () async {
    SharedPreferences.setMockInitialValues({});
    final state = await SharedState.open();
    for (final url in [
      'https://psygames.app/games/pause',
      'https://psygames.app/games/pause?set=breathing',
      'https://psygames.app/games/pause.html?set=eye-gym&wu=1',
    ]) {
      final route = HybridApp.routeOf(url);
      expect(route, '/games/pause', reason: url);
      expect(HybridApp.native[route]!(state).runtimeType.toString(), 'PauseScreen', reason: url);
    }
  });

  test('«Дыхание» открывается «Паузой» в режиме дыхания, с техникой в хвосте', () async {
    SharedPreferences.setMockInitialValues({});
    final state = await SharedState.open();
    for (final url in [
      'https://psygames.app/games/breathing',
      'https://psygames.app/games/breathing?tech=sigh&wu=1',
    ]) {
      final route = HybridApp.routeOf(url);
      expect(route, '/games/breathing', reason: url);
      final screen = HybridApp.native[route]!(state);
      expect(screen, isA<PauseScreen>(), reason: url);
      expect((screen as PauseScreen).flavor, PauseFlavor.breathing, reason: url);
    }
  });

  test('«Гимнастика для глаз» открывается «Паузой» в режиме глаз', () async {
    SharedPreferences.setMockInitialValues({});
    final state = await SharedState.open();
    for (final url in ['https://psygames.app/games/eye-gym', 'https://psygames.app/games/eye-gym?wu=1']) {
      final route = HybridApp.routeOf(url);
      expect(route, '/games/eye-gym', reason: url);
      final screen = HybridApp.native[route]!(state);
      expect((screen as PauseScreen).flavor, PauseFlavor.eyeGym, reason: url);
    }
  });
}
