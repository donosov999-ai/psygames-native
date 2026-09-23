import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/spatial_lab/board.dart';
import 'package:psygames_flutter/games/spatial_lab/deal.dart';
import 'package:psygames_flutter/games/spatial_lab/net.dart';
import 'package:psygames_flutter/games/spatial_lab/netslide.dart';
import 'package:psygames_flutter/games/spatial_lab/sixteen.dart';
import 'package:psygames_flutter/games/spatial_lab/twiddle.dart';

/// СВЕРКА ПЕРЕНОСА «ЛАБОРАТОРИИ» С ЖИВЫМ ЯДРОМ.
///
/// Эталоны выгружены прогоном самих модулей `spatial-core/*.mjs` (node исполняет их как есть —
/// это самый прямой прогон из возможных; скрипт выгрузки жил в черновиках сессии и в репозиторий
/// не клался) в `test/fixtures/spatial-lab-reference.json`.
///
/// 🔴 Сравниваются ЦЕЛЫЕ ПОЛЯ и ЦЕЛЫЕ РЕШЕНИЯ, а не отдельные числа: у четырёх упражнений один
/// поток случайности, и разойдись он на один бросок — совпали бы разве что размеры доски.
void main() {
  late Map<String, dynamic> ref;
  late LabBanks banks;

  setUpAll(() {
    ref =
        jsonDecode(File('test/fixtures/spatial-lab-reference.json').readAsStringSync())
            as Map<String, dynamic>;
    banks = LabBanks(
      twiddle: BankEntry.parse(
        jsonDecode(File('assets/spatial/twiddle-bank.json').readAsStringSync()) as List,
      ),
      sixteen: BankEntry.parse(
        jsonDecode(File('assets/spatial/sixteen-bank.json').readAsStringSync()) as List,
      ),
    );
  });

  /// Те же отпечатки, что в выгрузке: поле целиком и ход целиком.
  String b2s(Board b) =>
      '${b.width}x${b.height}:${b.cells.map((c) => '${c.id}.${c.turns}.${c.mask}').join('|')}';

  String c2s(Command c) {
    final block = c.kind == CommandKind.block;
    return '${c.kind.name}/${block ? '' : c.index}/${block ? c.row : ''}/'
        '${block ? c.col : ''}/${c.amount}';
  }

  List<String> cmds(List<Command> list) => [for (final c in list) c2s(c)];

  test('🔴 поток случайности ядра совпадает с TS до последнего знака', () {
    for (final raw in ref['rngStreams'] as List) {
      final e = raw as Map<String, dynamic>;
      final r = labRng(e['seed'] as int);
      for (final expected in e['values'] as List) {
        expect(r(), expected as double, reason: 'семя ${e['seed']}');
      }
    }
  });

  test('🔴 ход и его отмена: плитка, блок, строка, столбец — как в ядре', () {
    final cases = ref['applyCases'] as List;
    expect(cases.length, 10);
    for (final raw in cases) {
      final e = raw as Map<String, dynamic>;
      final parts = (e['command'] as String).split('/');
      final command = switch (parts[0]) {
        'tile' => Command.tile(int.parse(parts[1]), amount: int.parse(parts[4])),
        'block' => Command.block(
          row: int.parse(parts[2]),
          col: int.parse(parts[3]),
          // Размер и флаг поворота плиток в отпечаток не входят — берём их по имени случая.
          size: (e['name'] as String).contains('3×3') ? 3 : 2,
          orient: (e['name'] as String).contains('поворотом плиток'),
          amount: int.parse(parts[4]),
        ),
        'row' => Command.line(CommandKind.row, int.parse(parts[1]), amount: int.parse(parts[4])),
        _ => Command.line(CommandKind.column, int.parse(parts[1]), amount: int.parse(parts[4])),
      };
      final after = apply(board(4), command);
      expect(b2s(after), e['after'], reason: '${e['name']}: поле после хода');
      expect(b2s(apply(after, command.inverted)), e['undone'],
          reason: '${e['name']}: отмена возвращает поле ровно назад');
      expect(solved(after), e['solvedAfter'], reason: '${e['name']}: собрано?');
    }
  });

  test('🔴 перемешивание блоками: то же поле и то же решение', () {
    for (final raw in ref['scrambles'] as List) {
      final e = raw as Map<String, dynamic>;
      final s = scramble(e['seed'] as int, depth: e['depth'] as int);
      final at = 'семя ${e['seed']}, глубина ${e['depth']}';
      expect(b2s(s.initial), e['initial'], reason: '$at: поле');
      expect(cmds(s.solution), (e['solution'] as List).cast<String>(), reason: '$at: решение');
      expect(solved(replay(s.initial, s.solution)), isTrue,
          reason: '$at: решение обязано собирать поле');
      expect(e['solvedBySolution'], isTrue, reason: '$at: и в ядре тоже');
    }
  });

  test('🔴 «Сеть труб»: генератор, течь, связность и решение', () {
    for (final raw in ref['netPuzzles'] as List) {
      final e = raw as Map<String, dynamic>;
      final at = 'семя ${e['seed']}, ${e['width']}×${e['width']}, циклов ${e['cycles']}';
      final p = netPuzzle(
        e['seed'] as int,
        width: e['width'] as int,
        cycles: e['cycles'] as int,
      );
      expect(b2s(p.target), e['target'], reason: '$at: целевое поле');
      expect(b2s(p.initial), e['initial'], reason: '$at: перемешанное поле');
      final n = network(p.initial);
      expect(n.leaks, e['leaks'], reason: '$at: открытых концов');
      expect(n.connected.toList()..sort(), (e['connected'] as List).cast<int>(),
          reason: '$at: связная часть');
      expect(n.won, e['won'], reason: '$at: победа?');
      expect(cmds(p.solution), (e['solution'] as List).cast<String>(), reason: '$at: решение');
      expect(network(replay(p.initial, p.solution)).won, isTrue,
          reason: '$at: решение обязано чинить сеть');
      expect([for (final c in p.initial.cells) maskAt(c)], (e['masks'] as List).cast<int>(),
          reason: '$at: маски с учётом поворота');
    }
  });

  test('🔴 решатель сети: единственность и счёт раскладок — как в ядре', () {
    for (final raw in ref['netSolves'] as List) {
      final e = raw as Map<String, dynamic>;
      final at = 'семя ${e['seed']}, ${e['width']}×${e['width']}';
      final p = netPuzzle(e['seed'] as int, width: e['width'] as int);
      final t = solveNetwork(p.target);
      expect(t.unique, e['targetUnique'], reason: '$at: цель единственна?');
      expect(t.count, e['targetCount'], reason: '$at: раскладок у цели');
      expect(t.exhausted, e['targetExhausted'], reason: '$at: бюджет цели');
      final i = solveNetwork(p.initial);
      expect(i.unique, e['initialUnique'], reason: '$at: поле единственно?');
      expect(i.count, e['initialCount'], reason: '$at: раскладок у поля');
    }
  });

  test('🔴 ступени «Сети»: поле, решение, закреплённые и подсвеченные клетки', () {
    for (final raw in ref['netTasks'] as List) {
      final e = raw as Map<String, dynamic>;
      final at = 'Сеть L${e['level']} семя ${e['seed']}';
      final t = netLevel(e['level'] as int, e['seed'] as int);
      expect(b2s(t.initial), e['initial'], reason: '$at: поле');
      expect(cmds(t.solution), (e['solution'] as List).cast<String>(), reason: '$at: решение');
      expect(t.locked, (e['locked'] as List).cast<int>(), reason: '$at: закреплено');
      expect(t.highlighted, (e['highlighted'] as List).cast<int>(), reason: '$at: подсвечено');
      expect(network(replay(t.initial, t.solution)).won, isTrue,
          reason: '$at: решение обязано чинить сеть');
      final spec = netLevels[(e['level'] as int) - 1];
      final es = e['spec'] as Map<String, dynamic>;
      expect(spec.width, es['width'], reason: '$at: ширина ступени');
      expect(spec.cycles, es['cycles'], reason: '$at: циклы');
      expect(spec.affected, es['affected'], reason: '$at: участок');
      expect(spec.junctions, es['junctions'], reason: '$at: развилки');
      expect(spec.liveColour, es['liveColour'], reason: '$at: живой цвет');
    }
  });

  test('🔴 «Поворот чисел»: точная дистанция на 3×3, смещение на 4×4 и 5×5', () {
    for (final raw in ref['twiddleTasks'] as List) {
      final e = raw as Map<String, dynamic>;
      final at = 'Поворот L${e['level']} семя ${e['seed']}';
      final t = twiddleLevel(e['level'] as int, e['seed'] as int, banks.twiddle);
      expect(b2s(t.initial), e['initial'], reason: '$at: поле');
      expect(cmds(t.solution), (e['solution'] as List).cast<String>(), reason: '$at: решение');
      expect(t.minimumMoves, e['minimumMoves'], reason: '$at: точный минимум');
      expect(t.lowerBound, e['lowerBound'], reason: '$at: нижняя оценка');
      expect(t.guide == null ? null : c2s(t.guide!), e['guide'], reason: '$at: подсказка');
      expect(twiddleDisplacement(t.initial), e['displacement'], reason: '$at: смещение');
      expect(solved(replay(t.initial, t.solution)), isTrue,
          reason: '$at: решение обязано собирать поле');
    }
  });

  test('🔴 «Сдвиг чисел»: банк 3×3, смещение и нижняя оценка', () {
    for (final raw in ref['sixteenTasks'] as List) {
      final e = raw as Map<String, dynamic>;
      final at = 'Сдвиг L${e['level']} семя ${e['seed']}';
      final t = sixteenLevel(e['level'] as int, e['seed'] as int, banks.sixteen);
      expect(b2s(t.initial), e['initial'], reason: '$at: поле');
      expect(cmds(t.solution), (e['solution'] as List).cast<String>(), reason: '$at: решение');
      expect(t.minimumMoves, e['minimumMoves'], reason: '$at: точный минимум');
      expect(t.lowerBound, e['lowerBound'], reason: '$at: нижняя оценка');
      expect(t.guide == null ? null : c2s(t.guide!), e['guide'], reason: '$at: подсказка');
      final d = sixteenDisplacement(t.initial);
      expect(d.total, e['total'], reason: '$at: суммарный сдвиг');
      expect(d.lowerBound, e['bound'], reason: '$at: оценка ходов');
      expect(solved(replay(t.initial, t.solution)), isTrue,
          reason: '$at: решение обязано собирать поле');
    }
  });

  test('🔴 «Сеть со сдвигом»: источник едет вместе со строкой', () {
    for (final raw in ref['netslideTasks'] as List) {
      final e = raw as Map<String, dynamic>;
      final at = 'Сеть со сдвигом L${e['level']} семя ${e['seed']}';
      final t = netslideLevel(e['level'] as int, e['seed'] as int);
      expect(b2s(t.initial), e['initial'], reason: '$at: поле');
      expect(cmds(t.solution), (e['solution'] as List).cast<String>(), reason: '$at: решение');
      expect(t.guide == null ? null : c2s(t.guide!), e['guide'], reason: '$at: подсказка');
      expect(sourceAt(t.initial), e['source'], reason: '$at: где источник');
      expect(netslideWon(t.initial), e['wonBefore'], reason: '$at: поле не собрано заранее');
      expect(netslideWon(replay(t.initial, t.solution)), isTrue,
          reason: '$at: решение обязано связать сеть');
    }
  });

  test('🔴 раздача: то же поле и тот же выбор на старте у всех четырёх упражнений', () {
    for (final raw in ref['deals'] as List) {
      final e = raw as Map<String, dynamic>;
      final mode = LabMode.values.byName(e['mode'] as String);
      final at = '${e['mode']} L${e['level']}';
      final d = createDeal(mode, 2718, level: e['level'] as int, banks: banks);
      expect(d.selection, e['selection'], reason: '$at: выбор на старте');
      expect(b2s(d.state.initial), e['initial'], reason: '$at: поле');
      expect(labWon(mode, d.state.initial), isFalse, reason: '$at: раздача не собрана заранее');
    }
  });

  test('🔴 лестницы всех четырёх упражнений — ступень за ступенью', () {
    final specs = ref['specs'] as Map<String, dynamic>;

    final net = specs['net'] as List;
    expect(netLevels.length, net.length);
    for (var i = 0; i < net.length; i++) {
      final e = net[i] as Map<String, dynamic>;
      expect(netLevels[i].width, e['width'], reason: 'Сеть L${e['level']}: ширина');
      expect(netLevels[i].cycles, e['cycles'], reason: 'Сеть L${e['level']}: циклы');
      expect(netLevels[i].affected, e['affected'], reason: 'Сеть L${e['level']}: участок');
      expect(netLevels[i].junctions, e['junctions'], reason: 'Сеть L${e['level']}: развилки');
      expect(netLevels[i].liveColour, e['liveColour'], reason: 'Сеть L${e['level']}: цвет');
    }

    final tw = specs['twiddle'] as List;
    expect(twiddleLevels.length, tw.length);
    for (var i = 0; i < tw.length; i++) {
      final e = tw[i] as Map<String, dynamic>;
      expect(twiddleLevels[i].width, e['width'], reason: 'Поворот L${e['level']}: ширина');
      expect(twiddleLevels[i].distance, e['distance'], reason: 'Поворот L${e['level']}: дистанция');
      expect(twiddleLevels[i].displacement, e['displacement'],
          reason: 'Поворот L${e['level']}: смещение');
      expect(twiddleLevels[i].liveColour, e['liveColour'], reason: 'Поворот L${e['level']}: цвет');
    }

    final six = specs['sixteen'] as List;
    expect(sixteenLevels.length, six.length);
    for (var i = 0; i < six.length; i++) {
      final e = six[i] as Map<String, dynamic>;
      expect(sixteenLevels[i].width, e['width'], reason: 'Сдвиг L${e['level']}: ширина');
      expect(sixteenLevels[i].distance, e['distance'], reason: 'Сдвиг L${e['level']}: дистанция');
      expect(sixteenLevels[i].displacement, e['displacement'],
          reason: 'Сдвиг L${e['level']}: смещение');
      expect(sixteenLevels[i].guide, e['guide'], reason: 'Сдвиг L${e['level']}: подсказка');
    }

    final ns = specs['netslide'] as List;
    expect(netslideLevels.length, ns.length);
    for (var i = 0; i < ns.length; i++) {
      final e = ns[i] as Map<String, dynamic>;
      expect(netslideLevels[i].width, e['width'], reason: 'Сеть со сдвигом L${e['level']}: ширина');
      expect(netslideLevels[i].shifts, e['shifts'], reason: 'Сеть со сдвигом L${e['level']}: сдвиги');
      expect(netslideLevels[i].guide, e['guide'],
          reason: 'Сеть со сдвигом L${e['level']}: подсказка');
    }
  });

  test('🔴 отмена и повтор возвращают партию ровно туда, где она была', () {
    final deal = createDeal(LabMode.twiddle, 42, level: 15, banks: banks);
    final s = deal.state;
    final before = b2s(s.present);
    s.commit(const Command.block(row: 1, col: 1, amount: 1));
    s.commit(const Command.block(row: 0, col: 2, amount: -1));
    final after = b2s(s.present);
    s.undo();
    s.undo();
    expect(b2s(s.present), before, reason: 'две отмены — исходное поле');
    expect(s.past, isEmpty);
    s.redo();
    s.redo();
    expect(b2s(s.present), after, reason: 'два повтора — снова то же поле');
    expect(s.future, isEmpty);
    // Новый ход после отмены стирает будущее: иначе «повторить» вернёт ход, которого не было.
    s.undo();
    s.commit(const Command.block(row: 0, col: 0, amount: 1));
    expect(s.future, isEmpty);
  });
}
