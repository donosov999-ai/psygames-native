// «Числовой забег» в 3D — перенос сцены веба `frontend/src/games/number-run/runner-scene.mjs` (VER 8) на
// движок flutter_scene (задача 84bcf2c9, Денис 05.11.2026: «вариант Б, настоящий 3D… механика была сложнее —
// трамплины, мостики и прочее, из веб-версии вытащить это»).
//
// ЛОГИКИ ЗДЕСЬ НЕТ: всё, что происходит, — ядро `runner/road.dart` (то же, что двигало плоскую дорогу).
// Сцена только рисует ряд курса так же, как `buildRow` веба, и ведёт кадр по состоянию ядра, как `render`:
// настил по полосам с провалами, мосты (доски, перила, стойки), трамплины, столб между стопками, стены
// операций, блоки с уроном, арки ответов с табло, шкала с флажком, знаки памяти, «ровно N», клетка финиша,
// «Страж» над горизонтом, финальная лестница стен, искры и всплывающие «+8 / −30» по событиям ядра.
//
// Цифры — выдавленные, из того же шрифта и с теми же параметрами, что в вебе: геометрию снимает
// `frontend/scripts/gen-runner-numerals-mesh.mjs` из three.js в `assets/number_run/numerals.json`.
//
// Где Flutter GPU нет (тесты, веб, старый телефон), экран рисует прежнюю плоскую дорогу — [Road3d.available].
import 'dart:async';
import 'dart:convert';
import 'dart:io' show Platform;
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart' hide Material;
import 'package:flutter/services.dart';
import 'package:flutter_scene/scene.dart';
import 'package:vector_math/vector_math.dart' as vm;

import '../runner/road.dart';
import '../../shell/js_compat.dart' show jsRound;
import '../../shell/game_clock.dart' show isGameHeld;
import 'screen.dart' show finaleBroken, finaleDistance, finaleWalls, finaleGap, finaleSpeed, pileOf, numberRunWater;
import 'visual_geometry.dart';

/// sRGB-цвет веба (0xRRGGBB) → линейный, как ждут материалы движка.
vm.Vector3 lin(int rgb) {
  double c(int v) {
    final s = v / 255;
    return s <= .04045 ? s / 12.92 : math.pow((s + .055) / 1.055, 2.4).toDouble();
  }

  return vm.Vector3(c(rgb >> 16 & 255), c(rgb >> 8 & 255), c(rgb & 255));
}

/// 24-bit scene palette -> opaque Canvas label color (one conversion).
Color _labelColor(int rgb) => Color(0xFF000000 | rgb);

// Константы и цвета — из runner-scene.mjs.
const double _lane = 2.4;
const int _bg = 0x57c7df, _sea = 0x18c4cf, _guardColor = 0x7c3aed, _partColor = 0xd97706;
const int _plusColor = 0x443bff, _minusColor = 0xff1839;
const Map<String, int> _wall = {'−': 0xff4d6d, '+': 0x4f7bff, '×': 0x9b6bff};
const List<int> _ladder = [
  0xffe14d, 0xf4e84a, 0xdcee52, 0xbcf05c, 0x98ec69, //
  0x78e27c, 0x5dd697, 0x4fcab4, 0x4cc0d1, 0x53b5ea,
];

String _num(double v) {
  final r = jsRound(v);
  final s = r == r.roundToDouble() ? r.toInt().abs().toString() : r.abs().toString();
  return r < 0 ? '−$s' : s;
}

vm.Quaternion _rot(double x, double y, double z) {
  final q = vm.Quaternion.identity();
  if (x != 0) q.setAxisAngle(vm.Vector3(1, 0, 0), x);
  if (y != 0) q.setAxisAngle(vm.Vector3(0, 1, 0), y);
  if (z != 0) q.setAxisAngle(vm.Vector3(0, 0, 1), z);
  return q;
}

// ── Цифры: выдавленные знаки из общего пула ────────────────────────────────────────────────────────

class _Glyph {
  _Glyph(this.face, this.side, this.width);
  final MeshGeometry face, side;
  final double width;
}

/// Перенос `createNumerals`: тринадцать знаков, общая геометрия, материалы по цвету (лицо и бок темнее).
class RunnerNumerals {
  RunnerNumerals._(this._glyphs);

  final Map<String, _Glyph> _glyphs;
  final Map<int, (Material, Material)> _materials = {};
  static final Expando<double> widthOf = Expando('numeralWidth');

  static Future<RunnerNumerals>? _loading;
  static Future<RunnerNumerals> load() => _loading ??= _load();

  static Future<RunnerNumerals> _load() async {
    final data = jsonDecode(await rootBundle.loadString('assets/number_run/numerals.json')) as Map<String, dynamic>;
    MeshGeometry part(Map<String, dynamic> p) {
      final pos = Float32List.fromList([for (final v in p['p'] as List) (v as num).toDouble()]);
      final nor = Float32List.fromList([for (final v in p['n'] as List) (v as num).toDouble()]);
      return MeshGeometry.fromArrays(positions: pos, normals: nor);
    }

    final glyphs = <String, _Glyph>{};
    (data['glyphs'] as Map<String, dynamic>).forEach((char, g) {
      final m = g as Map<String, dynamic>;
      glyphs[char] = _Glyph(
        part(m['face'] as Map<String, dynamic>),
        part(m['side'] as Map<String, dynamic>),
        (m['width'] as num).toDouble(),
      );
    });
    return RunnerNumerals._(glyphs);
  }

  (Material, Material) _material(int rgb) => _materials.putIfAbsent(rgb, () {
    final c = lin(rgb);
    final front = PhysicallyBasedMaterial()
      ..baseColorFactor = vm.Vector4(c.x, c.y, c.z, 1)
      ..roughnessFactor = .32
      ..metallicFactor = .12;
    final s = lin(rgb) * .6;
    final side = PhysicallyBasedMaterial()
      ..baseColorFactor = vm.Vector4(s.x, s.y, s.z, 1)
      ..roughnessFactor = .42
      ..metallicFactor = .12;
    return (front, side);
  });

  /// Число как группа знаков по центру; ширина — [widthOf] (как `userData.width` в вебе).
  Node make(String text, int rgb) {
    final normalized = text.replaceAll('−', '-').replaceAll('×', 'x');
    final group = Node();
    final (front, side) = _material(rgb);
    var x = 0.0;
    final children = <Node>[];
    for (final ch in normalized.split('')) {
      final g = _glyphs[ch];
      if (g == null) continue;
      final n = Node()
        ..addMesh(Mesh(g.face, front))
        ..addMesh(Mesh(g.side, side))
        ..position = vm.Vector3(x, 0, 0);
      children.add(n);
      x += g.width + .07;
    }
    final width = math.max(.1, x - .07);
    for (final n in children) {
      n.position = n.position..x -= width / 2;
      group.add(n);
    }
    widthOf[group] = width;
    return group;
  }
}

// ── Подписи: картинка на квадрате, всегда лицом к камере (как Sprite веба) ──────────────────────────

class _LabelSpec {
  const _LabelSpec({this.ink = 0xffffff, this.background, this.font = 125, this.pile});
  final int ink;
  final int? background;
  final double font;

  /// Кучка «рамки десяти» вместо цифры: (десятков, единиц) и цвет плашки.
  final (int, int, int)? pile;

  String key(String text) => '$text|$ink|$background|$font|$pile';
}

class _Labels {
  final Map<String, Future<Texture2D>> _cache = {};
  static final Expando<Sprite> spriteOf = Expando('labelSprite');

  Future<Texture2D> _texture(String text, _LabelSpec s) => _cache.putIfAbsent(s.key(text), () async {
    const w = 512, h = 256;
    final rec = ui.PictureRecorder();
    final c = Canvas(rec);
    // Мир отражён по X (см. [_Road3dState._world]) — квадрат подписи тоже; картинку рисуем зеркально.
    c
      ..translate(w.toDouble(), 0)
      ..scale(-1, 1);
    final pile = s.pile;
    if (pile != null) {
      _drawPile(c, pile.$1, pile.$2, _labelColor(pile.$3));
    } else {
      if (s.background != null) {
        c.drawRRect(RRect.fromLTRBR(5, 7, 507, 249, const Radius.circular(36)), Paint()..color = _labelColor(s.background!));
      }
      TextPainter painter(Paint? foreground, Color? color, [List<Shadow>? shadows]) => TextPainter(
        text: TextSpan(
          text: text,
          style: TextStyle(
            fontSize: s.font,
            fontWeight: FontWeight.w800,
            foreground: foreground,
            color: color,
            shadows: shadows,
            height: 1,
          ),
        ),
        textDirection: TextDirection.ltr,
        maxLines: 1,
      )..layout();
      var fill = painter(null, _labelColor(s.ink));
      final k = fill.width > 480 ? 480 / fill.width : 1.0;
      c.save();
      c.translate(256, 136);
      c.scale(k);
      final o = Offset(-fill.width / 2, -fill.height / 2);
      if (s.background == null) {
        // Без плашки — обводка и свечение, как у подписей стен в вебе.
        painter(null, Colors.transparent, const [Shadow(color: Color(0xFFAC8BFF), blurRadius: 28)]).paint(c, o);
        painter(
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = 9
            ..color = const Color(0xFF332255),
          null,
        ).paint(c, o);
      }
      fill.paint(c, o);
      c.restore();
    }
    final img = await rec.endRecording().toImage(w, h);
    return Texture2D.fromImage(img);
  });

  static void _drawPile(Canvas canvas, int tens, int ones, Color color) {
    // Тот же рисунок, что у плоской дороги (`RoadPainter._pile`), крупно: рамки десяти на плашке.
    const cell = 34.0, gap = 9.0, frameGap = 22.0, pad = 26.0;
    const frameW = 2 * cell + gap, frameH = 5 * cell + 4 * gap;
    final frames = tens + (ones > 0 ? 1 : 0);
    final w = math.min(500.0, 2 * pad + frames * frameW + (frames - 1) * frameGap);
    final k = w / (2 * pad + frames * frameW + (frames - 1) * frameGap);
    canvas.save();
    canvas.translate(256 - w / 2, 128 - (frameH + 2 * pad) * k / 2);
    canvas.scale(k);
    final rect = Rect.fromLTWH(0, 0, w / k, frameH + 2 * pad);
    canvas.drawRRect(RRect.fromRectAndRadius(rect, const Radius.circular(40)), Paint()..color = color);
    final full = Paint()..color = Colors.white;
    final empty = Paint()
      ..color = Colors.white.withValues(alpha: .6)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 5;
    for (var f = 0; f < frames; f++) {
      final left = pad + f * (frameW + frameGap);
      final filled = f < tens ? 10 : ones;
      for (var i = 0; i < 10; i++) {
        final r = Rect.fromLTWH(left + (i % 2) * (cell + gap), pad + (i ~/ 2) * (cell + gap), cell, cell);
        if (i < filled) {
          canvas.drawRect(r, full);
        } else {
          canvas.drawRect(r.deflate(3), empty);
        }
      }
    }
    canvas.restore();
  }

  /// Узел с подписью. Пока картинка не готова, квадрат прозрачный — никакого белого мигания.
  Node node(String text, _LabelSpec spec, {double w = 2.1, double h = 1.1}) {
    final sprite = Sprite(width: w, height: h, color: vm.Vector4(1, 1, 1, 0));
    final n = Node(mesh: sprite.mesh);
    spriteOf[n] = sprite;
    set(n, text, spec);
    return n;
  }

  /// Новая надпись на той же подписи (всплывающие «+8», счётчик «3 / 10»).
  void set(Node n, String text, _LabelSpec spec, {double alpha = 1}) {
    final sprite = spriteOf[n]!;
    _texture(text, spec).then((t) {
      sprite.material.colorTexture = t;
      sprite.color = vm.Vector4(1, 1, 1, alpha);
    });
  }
}

// ── Сцена ──────────────────────────────────────────────────────────────────────────────────────────

class _RowArt {
  _RowArt(this.row, this.root, this.items);
  final RoadRow row;
  final Node root, items;
  final Map<int, Node> pickups = {};
  final Map<int, Node> lanes = {};
  Node? flag;
}

class _Spark {
  double life = 0, x = 0, y = -60, z = 0, vx = 0, vy = 0, vz = 0;
  vm.Vector4 color = vm.Vector4(1, 1, 1, 1);
}

class _Popup {
  _Popup(this.node);
  final Node node;
  double life = 0;
  double y = 2.2;
}

/// Трёхмерная дорога. Ядро ведёт экран, сцена смотрит на его состояние каждый кадр.
class Road3d extends StatefulWidget {
  const Road3d({super.key, required this.course, required this.state, this.finaleT = 0, required this.fallback, this.screenReadouts = false});

  /// The actual game supplies fixed, unfogged exact/guardian readouts. The
  /// standalone scene keeps its old labels; never duplicate both counters.
  final bool screenReadouts;

  final RoadCourse course;
  final RoadState state;

  /// Время финала (с) — ведёт его экран, как адаптер веба.
  final double finaleT;

  /// Что рисовать, если 3D не поднялось: прежняя плоская дорога.
  final Widget fallback;

  /// Есть ли где рисовать: Flutter GPU на iOS и Android; в тестах и вебе — нет.
  static bool get available {
    if (kIsWeb) return false;
    if (_failed) return false;
    if (Platform.environment.containsKey('FLUTTER_TEST')) return false;
    return Platform.isIOS || Platform.isAndroid;
  }

  static bool _failed = false;

  @override
  State<Road3d> createState() => _Road3dState();
}

class _Road3dState extends State<Road3d> {
  Size _viewport = const Size(390, 600);
  final scene = Scene();

  /// Весь мир — под этим узлом с X = −1: у flutter_scene ось X смотрит в другую сторону, чем у three.js,
  /// и без отражения цифры шли зеркально, а полоса +1 оказывалась слева (кадр стенда 06.11).
  final Node _world = Node()..scale = vm.Vector3(-1, 1, 1);
  final _labels = _Labels();
  RunnerNumerals? _numerals;
  bool _ready = false;
  bool _broken = false;

  late final Node _hero = Node();
  Node? _digit;
  double? _lastNumber;
  late Node _startPlatform;
  final Map<int, _RowArt> _rows = {};
  RoadCourse? _course;
  double _visualScale = 1, _compactScale = 1, _time = 0, _bump = 0;
  int _seenEvents = 0;
  Node? _guard;
  _Finale? _finale;
  late Node _counter;
  String _partText = '';
  final List<_Popup> _popups = [];
  final List<_Spark> _sparks = List.generate(280, (_) => _Spark());
  int _sparkNext = 0;
  late BillboardGeometry _sparkGeometry;
  final _rng = math.Random(7);
  bool _reduced = false;

  final Map<String, MeshGeometry> _boxes = {};
  final Map<int, Material> _mats = {};

  Mesh _box(double w, double h, double d, int rgb, {double rough = .35, double metal = .18}) {
    final g = _boxes.putIfAbsent('$w|$h|$d', () => CuboidGeometry(vm.Vector3(w, h, d)));
    final m = _mats.putIfAbsent(rgb * 1000 + (rough * 100).round() + (metal * 10).round(), () {
      final c = lin(rgb);
      return PhysicallyBasedMaterial()
        ..baseColorFactor = vm.Vector4(c.x, c.y, c.z, 1)
        ..roughnessFactor = rough
        ..metallicFactor = metal;
    });
    return Mesh(g, m);
  }

  Node _boxNode(
    double w,
    double h,
    double d,
    int rgb,
    double x,
    double y,
    double z, {
    vm.Quaternion? rotation,
    double rough = .35,
    double metal = .18,
  }) {
    final n = Node(
      mesh: _box(w, h, d, rgb, rough: rough, metal: metal),
    )..position = vm.Vector3(x, y, z);
    if (rotation != null) n.rotation = rotation;
    return n;
  }

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    try {
      await Scene.initializeStaticResources();
      _numerals = await RunnerNumerals.load();
    } catch (e) {
      Road3d._failed = true;
      if (mounted) setState(() => _broken = true);
      return;
    }
    // Небо и туман — цвет фона веба: дальняя дорога растворяется в нём (Fog 28…68).
    scene.skybox = Skybox(
      GradientSkySource()
        ..zenithColor = lin(0x8fdcf0)
        ..horizonColor = lin(_bg)
        ..groundColor = lin(_sea),
    );
    scene.fog
      ..enabled = true
      ..mode = FogMode.linear
      ..start = 28
      ..end = 68
      ..color = lin(_bg);
    scene.directionalLight = DirectionalLight(direction: vm.Vector3(8, -14, -9)..normalize(), intensity: 2.2, castsShadow: true);
    scene.add(_world);
    _world.add(_boxNode(160, .1, 160, _sea, 0, -6, -30));
    _startPlatform = _boxNode(7.2, .35, 18, 0xdce1ef, 0, -.22, 0);
    _world.add(_startPlatform);
    _world.add(_hero);
    // Искры и осколки — один пул квадратиков-билбордов на всю сцену, как пул точек веба.
    _sparkGeometry = BillboardGeometry(capacity: _sparks.length);
    _world.add(Node(mesh: Mesh(_sparkGeometry, SpriteMaterial()))..frustumCulled = false);
    for (var i = 0; i < (widget.screenReadouts ? 1 : 6); i++) {
      final n = _labels.node(' ', const _LabelSpec(font: 140), w: 1.7, h: .85)..visible = false;
      _world.add(n);
      _popups.add(_Popup(n));
    }
    _counter = _labels.node(' ', const _LabelSpec(background: 0x78350f, font: 120), w: 1.9, h: .8)..visible = false;
    _world.add(_counter);
    _load(widget.course);
    _frame(0);
    if (mounted) setState(() => _ready = true);
  }

  void _load(RoadCourse course) {
    for (final r in _rows.values) {
      _world.remove(r.root);
    }
    _rows.clear();
    if (_finale != null) _world.remove(_finale!.root);
    _finale = null;
    if (_guard != null) _world.remove(_guard!);
    _guard = null;
    _course = course;
    _lastNumber = null;
    _visualScale = numberScale(course.start);
    _seenEvents = 0;
    _bump = 0;
    // «Страж» виден весь уровень: огромное число над горизонтом — столько нужно набрать к финишу.
    final boss = course.finale?.boss;
    if (boss != null) {
      final g = _numerals!.make(_num(boss), _guardColor);
      final s = math.min(2.6, 7 / RunnerNumerals.widthOf[g]!);
      g
        ..scale = vm.Vector3.all(s)
        ..position = vm.Vector3(0, 3.2, -52);
      _world.add(g);
      _guard = g;
    }
  }

  // ── Ряд — перенос buildRow ──────────────────────────────────────────────────────────────────────

  _RowArt _buildRow(RoadCourse course, RoadRow row) {
    final root = Node(), group = Node();
    root.add(group);
    final art = _RowArt(row, root, group);
    final previous = row.id > 0 ? course.rows[row.id - 1] : null;
    final length = row.z - (previous?.z ?? 0), span = row.span;
    for (var i = 0; i < 3; i++) {
      final lx = (i - 1) * _lane;
      final hole = span > 0 && row.penalties.length == 3 && row.penalties[i] > 0;
      final deckLength = length - (hole ? span : 0), middle = (length + (hole ? span : 0)) / 2;
      if (deckLength > 0) root.add(_boxNode(_lane, .55, deckLength, row.id.isOdd ? 0xf4f5fa : 0xe3e8ef, lx, -.32, middle));
      if (span > 0 && !hole) {
        for (final dx in const [-1.13, 1.13]) {
          root.add(_boxNode(.09, .12, span, 0xffb345, lx + dx, .7, span / 2));
          for (var z = .3; z < span; z += 2) {
            root.add(_boxNode(.09, .8, .09, 0x456aa1, lx + dx, .3, z));
          }
        }
        if (row.terrain == 'bridge') {
          for (var z = .3; z < span; z += .65) {
            root.add(_boxNode(2.2, .035, .38, 0xc3a780, lx, -.02, z));
          }
        }
      }
    }
    final show = row.show;
    if (row.kind == 'pickups' && show != null) {
      // Знак показа: не собирается и не сталкивается — висит над дорогой, пока ряд впереди.
      for (var i = 0; i < show.symbols.length; i++) {
        group.add(
          _labels.node(show.symbols[i], const _LabelSpec(background: 0x0f766e, font: 190), w: 1.7, h: 1.7)
            ..position = vm.Vector3(0, 2.7, -show.dzs[i]),
        );
      }
    }
    if (row.kind == 'pickups' && row.recall) {
      for (var i = 0; i < row.items.length; i++) {
        final it = row.items[i];
        final n = _labels.node(it.symbol ?? '', const _LabelSpec(background: 0x134e4a, font: 180), w: 1.35, h: 1.35)
          ..position = vm.Vector3(it.x * _lane, .85, -(it.dz ?? 0));
        art.pickups[i] = n;
        group.add(n);
      }
    } else if (row.kind == 'pickups') {
      for (var i = 0; i < row.items.length; i++) {
        final it = row.items[i];
        final color = it.part ? _partColor : (it.value < 0 ? _minusColor : _plusColor);
        final pile = pileOf(course, row, i);
        final Node n;
        if (pile != null) {
          // Кучка «рамки десяти» (нативная ось с L22): стоит плашкой там же, где стояла бы цифра.
          final frames = pile.$1 + (pile.$2 > 0 ? 1 : 0);
          final w = math.min(2.3, .55 + frames * .42);
          n = _labels.node(
            '',
            _LabelSpec(pile: (pile.$1, pile.$2, color)),
            w: w * 2,
            h: w,
          )..position = vm.Vector3(it.x * _lane, .7, -(it.dz ?? 0));
        } else if (it.reserve != null) {
          // «×2» в запас: фиолетовая операция — тот же цвет, что у стены «×» (веб WALL['×']).
          n = _numerals!.make(it.reserve!, _wall['×']!);
          n
            ..scale = vm.Vector3.all(math.min(1.2, 1.7 / RunnerNumerals.widthOf[n]!))
            ..position = vm.Vector3(it.x * _lane, .08, -(it.dz ?? 0));
        } else {
          n = _numerals!.make(_num(it.value), color);
          final width = RunnerNumerals.widthOf[n]!, half = it.half ?? .18;
          // Ширина числа — по его логической ширине: стопка в полдороги, большое красное через всю дорогу.
          final scale = half >= 1
              ? math.min(2.7, 5.6 / width)
              : half >= .5
              ? math.min(1.2, 1.6 / width)
              : math.min(.98, 1.03 / width);
          n
            ..scale = vm.Vector3.all(scale)
            ..position = vm.Vector3(it.x * _lane, .08, -(it.dz ?? 0));
        }
        art.pickups[i] = n;
        group.add(n);
      }
    } else if (row.kind == 'answer') {
      for (var i = 0; i < row.options.length; i++) {
        // Арка ответа: въезд в неё и есть ответ. Пример — на табло над тремя арками.
        final lane = Node()..position = vm.Vector3((i - 1) * _lane, 0, 0);
        for (final x in const [-1.05, 1.05]) {
          lane.add(_boxNode(.14, 2.6, .14, 0x3b82f6, x, 1.3, 0));
        }
        lane.add(_boxNode(2.24, .16, .16, 0x3b82f6, 0, 2.55, 0));
        final v = row.options[i];
        lane.add(
          _labels.node(v is num ? _num(v.toDouble()) : '$v', const _LabelSpec(background: 0x1e3a8a, font: 130), w: 1.9, h: .95)
            ..position = vm.Vector3(0, 1.7, 0),
        );
        art.lanes[i - 1] = lane;
        group.add(lane);
      }
      // Табло примера — в карточке HUD (UI09: «текст не растворяется в тумане»); на арках — ответы.
    } else if (row.kind == 'scale') {
      double toX(double v) => ((v - row.min) / (row.max - row.min) * 2 - 1) * _lane;
      group.add(_boxNode(2 * _lane + .5, .07, .26, 0xe0e7ff, 0, .06, 0));
      final every = row.ticks.length <= 6 ? 1 : 2;
      for (var i = 0; i < row.ticks.length; i++) {
        final v = row.ticks[i];
        group.add(_boxNode(.06, .03, .62, 0x312e81, toX(v), .1, 0));
        if (i % every == 0 || i == row.ticks.length - 1) {
          group.add(
            _labels.node(_num((v * 10).roundToDouble() / 10), const _LabelSpec(background: 0x312e81, font: 120), w: 1.25, h: .62)
              ..position = vm.Vector3(toX(v), .75, .2),
          );
        }
      }
      for (final x in const [-(_lane + .35), _lane + .35]) {
        group.add(_boxNode(.16, 3.2, .16, 0x6366f1, x, 1.6, 0));
      }
      group.add(_boxNode(2 * _lane + .86, .16, .16, 0x6366f1, 0, 3.15, 0));
      // Вопрос шкалы — в карточке HUD, второй копии в сцене нет.
      // Флажок верного ответа — в корне ряда: ворота после проезда гаснут, а флажок остаётся.
      final flag = _boxNode(.12, 1.6, .12, 0x22c55e, toX(row.answer), .8, .05)..visible = false;
      art.flag = flag;
      root.add(flag);
    } else if (row.kind == 'operation' && course.mode == 'journey') {
      for (var i = 0; i < row.options.length; i++) {
        // Стена во всю полосу: цвет — знак операции, надпись — сама операция. Проезд разбивает только твою.
        final op = '${row.options[i]}';
        final lane = Node()..position = vm.Vector3((i - 1) * _lane, 0, 0);
        lane.add(_boxNode(2.3, 1.95, .34, _wall[op.isEmpty ? '' : op[0]] ?? _wall['×']!, 0, .97, 0, rough: .42, metal: .05));
        lane.add(_labels.node(op, const _LabelSpec(font: 150), w: 2.15, h: 1.08)..position = vm.Vector3(0, 1.02, .32));
        art.lanes[i - 1] = lane;
        group.add(lane);
      }
    } else if (row.kind == 'operation') {
      for (var i = 0; i < row.options.length; i++) {
        final op = '${row.options[i]}';
        final lane = Node()..position = vm.Vector3((i - 1) * _lane, 0, 0);
        if (op != '→') {
          final number = _numerals!.make(op.startsWith('+') ? op.substring(1) : op, op.startsWith('−') ? _minusColor : _plusColor);
          number
            ..scale = vm.Vector3.all(math.min(1.05, 1.8 / RunnerNumerals.widthOf[number]!))
            ..position = vm.Vector3(0, .1, 0);
          lane.add(number);
        } else {
          lane.add(_boxNode(.6, .025, .12, 0x90a2c6, 0, -.02, 0));
        }
        group.add(lane);
      }
    } else if (row.kind == 'obstacle') {
      for (var i = 0; i < row.penalties.length; i++) {
        final damage = row.penalties[i];
        final lane = Node()..position = vm.Vector3((i - 1) * _lane, 0, 0);
        if (row.span > 0) {
          if (damage > 0) {
            for (final x in const [-.75, 0.0, .75]) {
              lane.add(_boxNode(.36, .025, .12, 0xdf5473, x, .01, row.span + .15));
            }
          }
        } else if (damage > 0) {
          lane.add(_boxNode(2.08, 1.15, 1.45, 0xa63c51, 0, .52, 0));
          for (final x in const [-.64, 0.0, .64]) {
            lane.add(_boxNode(.16, 1.08, .045, 0xffb18b, x, .55, .75, rotation: _rot(0, 0, -.45)));
          }
          lane.add(_boxNode(2.15, .12, 1.5, 0xf28b7d, 0, 1.13, 0));
          lane.add(
            _labels.node('−${_num(damage)}', const _LabelSpec(background: 0x742e40, ink: 0xffe7d7, font: 120), w: 1.85, h: .95)
              ..position = vm.Vector3(0, 1.52, .1),
          );
        } else {
          lane.add(_boxNode(1.85, .025, 1.55, 0x44615e, 0, -.02, 0));
        }
        group.add(lane);
      }
    } else if (row.checkpoint || row.kind == 'gate') {
      // Последняя черта — финиш: клетка в два ряда. Промежуточные — одна строка.
      final bands = row.id == course.rows.length - 1 ? 2 : 1;
      for (var r = 0; r < bands; r++) {
        for (var i = 0; i < 12; i++) {
          group.add(_boxNode(.6, .025, .8, (i + r).isOdd ? 0x202839 : 0xffffff, -3.3 + i * .6, .015 + r * .001, -r * .8));
        }
      }
    }
    // «= N» — в карточке HUD («Собери ровно N» со счётчиком), второй копии в сцене нет (UI-реф 06.11).
    final d = row.divider;
    if (d != null) {
      // Столб делит дорогу на время стопок: сторона выбрана там, где он начинается.
      final len = d.toDz - d.fromDz, z = -(d.fromDz + d.toDz) / 2;
      root.add(_boxNode(.24, 1.7, len, 0x6a45ff, 0, .8, z));
      root.add(_boxNode(.26, .1, len, 0x9d86ff, 0, 1.68, z));
    }
    final j = row.jump;
    if (j != null) {
      final ramp = Node()..position = vm.Vector3(j.lane * _lane, 0, j.launchOffset);
      ramp.add(_boxNode(2.2, .23, 2.5, 0x93ef13, 0, .12, 0, rotation: _rot(-.18, 0, 0)));
      for (final z in const [-.65, .35]) {
        for (final sign in const [-1.0, 1.0]) {
          ramp.add(_boxNode(.16, .035, .75, 0xffffff, sign * .22, .4, z, rotation: _rot(0, sign * .65, 0)));
        }
      }
      ramp.add(_labels.node('▲▲', const _LabelSpec(background: 0x45780c, font: 110), w: 1.3, h: .65)..position = vm.Vector3(0, 1, 0));
      root.add(ramp);
    }
    _world.add(root);
    return art;
  }

  void _syncRows(RoadCourse course, int nextRow) {
    // Один пройденный настил и шесть рядов впереди, не все 168.
    final drop = [
      for (final id in _rows.keys)
        if (id < nextRow - 1 || id >= nextRow + 6) id,
    ];
    for (final id in drop) {
      _world.remove(_rows.remove(id)!.root);
    }
    for (var i = math.max(0, nextRow - 1); i < math.min(course.rows.length, nextRow + 6); i++) {
      _rows.putIfAbsent(i, () => _buildRow(course, course.rows[i]));
    }
  }

  _Finale _buildFinale(RoadCourse course) {
    final root = Node(), walls = finaleWalls(course), boss = course.finale?.boss != null;
    final total = finaleGap * (walls.length + 1) + 40;
    root.add(_boxNode(7.2, .55, total, 0xeef1f7, 0, -.32, -total / 2));
    final slabs = <Node>[];
    for (var i = 0; i < walls.length; i++) {
      final g = Node()..position = vm.Vector3(0, 0, -finaleGap * (i + 1));
      g.add(_boxNode(7.1, boss ? 3.4 : 2.3, boss ? 1.2 : .8, boss ? _guardColor : _ladder[i % _ladder.length], 0, boss ? 1.7 : 1.15, 0));
      g.add(
        _labels.node(_num(walls[i]), const _LabelSpec(font: 170), w: boss ? 4.8 : 3.8, h: boss ? 2.4 : 1.9)
          ..position = vm.Vector3(0, boss ? 1.8 : 1.25, boss ? 1.3 : 1.0),
      );
      root.add(g);
      slabs.add(g);
    }
    _world.add(root);
    return _Finale(root, slabs);
  }

  // ── Эффекты ────────────────────────────────────────────────────────────────────────────────────

  void _burst(double x, double y, double z, int rgb, int count, {double spread = 3.2, double lift = 4, double drift = 0}) {
    if (_reduced) return;
    final c = lin(rgb);
    for (var n = 0; n < count; n++) {
      final p = _sparks[_sparkNext];
      _sparkNext = (_sparkNext + 1) % _sparks.length;
      final a = _rng.nextDouble() * math.pi * 2;
      p
        ..life = .45 + _rng.nextDouble() * .45
        ..vx = math.cos(a) * spread * _rng.nextDouble()
        ..vz = math.sin(a) * spread * _rng.nextDouble() + drift
        ..vy = lift * (.4 + _rng.nextDouble())
        ..x = x
        ..y = y
        ..z = z;
      final shade = .75 + _rng.nextDouble() * .25;
      p.color = vm.Vector4(c.x * shade, c.y * shade, c.z * shade, 1);
    }
  }

  void _stepSparks(double dt) {
    var count = 0;
    for (final p in _sparks) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vy -= 9 * dt;
      p.x += p.vx * dt;
      p.y = math.max(-.2, p.y + p.vy * dt);
      p.z += p.vz * dt;
      if (p.life <= 0) continue;
      _sparkGeometry.setInstance(count++, center: vm.Vector3(p.x, p.y, p.z), width: .15, height: .15, color: p.color);
    }
    _sparkGeometry.commit(count);
  }

  void _popup(String text, int ink, double x) {
    final p = _popups.reduce((a, b) => a.life <= b.life ? a : b);
    _labels.set(p.node, text, _LabelSpec(ink: ink, font: 140));
    p
      ..life = .8
      ..y = 2.2;
    p.node
      ..visible = true
      ..position = vm.Vector3(x, 2.2, 0);
  }

  void _stepPopups(double dt) {
    for (final p in _popups) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.y += dt * 1.6;
      p.node.position = vm.Vector3(p.node.position.x, p.y, 0);
      final sprite = _Labels.spriteOf[p.node];
      if (sprite != null && sprite.material.colorTexture != null) {
        sprite.color = vm.Vector4(1, 1, 1, (p.life / .3).clamp(0, 1).toDouble());
      }
      if (p.life <= 0) p.node.visible = false;
    }
  }

  /// События ядра, случившиеся с прошлого кадра, — в искры и подписи. Смысл — из события, не из картинки.
  void _react(RoadCourse course, RoadState s) {
    if (s.events.length < _seenEvents) _seenEvents = 0;
    final hx = s.x * _lane;
    final lift = jumpHeight(s);
    for (final e in s.events.skip(_seenEvents)) {
      final d = e.data;
      final id = e.id;
      final lane = e.lane ?? 0;
      double n(String k) => (d[k] as num?)?.toDouble() ?? 0;
      switch (e.type) {
        case 'pickup':
          final row = id == null ? null : course.rows[id];
          final value = n('value');
          if (d['part'] == true && row != null && row.recall) {
            final it = row.items[d['item'] as int];
            _popup(it.symbol ?? '', it.value > 0 ? 0xbbf7d0 : 0xffd6dc, hx);
            _burst(hx, .9, 0, it.value > 0 ? 0x14b8a6 : 0xff2d55, 8, spread: 2.4, lift: 3.2);
          } else if (d['part'] == true) {
            _popup(_num(value), 0xfde68a, hx);
            _burst(hx, .9, 0, _partColor, 6, spread: 2.4, lift: 3.2);
          } else {
            final good = value > 0;
            _popup('${good ? '+' : '−'}${_num(value.abs())}', good ? 0xdfe6ff : 0xffd6dc, hx);
            _burst(hx, .9 + lift, 0, good ? 0x5b6cff : 0xff2d55, good ? 6 : 12, spread: 2.4, lift: 3.2);
          }
        case 'answer':
          _rows[id]?.lanes[lane]?.visible = false;
          final ok = d['ok'] == true;
          _popup('${ok ? '✓ +' : '✗ −'}${_num((n('after') - n('before')).abs())}', ok ? 0xbbf7d0 : 0xffd6dc, lane * _lane);
          _burst(lane * _lane, 1.4, 0, ok ? 0x22c55e : 0xff2d55, 26, spread: 4, lift: 5, drift: 6);
        case 'scale':
          _rows[id]?.flag?.visible = true;
          final delta = n('delta');
          _popup(
            delta > 0 ? '✓ +${_num(delta)}' : (delta < 0 ? '✗ −${_num(-delta)}' : '≈ 0'),
            delta > 0 ? 0xbbf7d0 : (delta < 0 ? 0xffd6dc : 0xe0e7ff),
            n('x') * _lane,
          );
          _burst(n('x') * _lane, 1, 0, delta > 0 ? 0x22c55e : (delta < 0 ? 0xff2d55 : 0x818cf8), 24, spread: 4, lift: 5, drift: 6);
        case 'pickups':
          final exact = d['exact'];
          if (exact is Map) {
            final delta = (exact['delta'] as num).toDouble();
            final ok = delta > 0;
            _popup('${ok ? '✓ +' : '≠ −'}${_num(delta.abs())}', ok ? 0xbbf7d0 : 0xffd6dc, hx);
            _burst(hx, 1.2, 0, ok ? 0x22c55e : 0xff2d55, ok ? 30 : 16, spread: 4, lift: 5);
          }
        case 'operation':
          _rows[id]?.lanes[lane]?.visible = false;
          final op = '${d['operation']}';
          _popup(op, op.startsWith('−') ? 0xffd6dc : 0xdfe6ff, lane * _lane);
          _burst(lane * _lane, 1, 0, _wall[op.isEmpty ? '' : op[0]] ?? _wall['×']!, 26, spread: 4, lift: 5, drift: 6);
        case 'reserve':
          final op = '${d['op']}';
          if (d['action'] == 'pick') {
            _popup(op, 0xd0acff, hx);
            _burst(hx, 1, 0, _wall['×']!, 14, spread: 2.4, lift: 3.2);
          } else {
            _popup('$op → ${_num(n('after'))}', 0xd0acff, hx);
            _burst(hx, 1.4, 0, _wall['×']!, 40, spread: 4.5, lift: 6);
          }
        case 'obstacle':
          final damage = n('damage');
          if (damage > 0) {
            _popup('−${_num(damage)}', 0xffd6dc, lane * _lane);
            _burst(lane * _lane, .8, 0, 0xa63c51, 26, spread: 4, lift: 4.5, drift: 6);
          }
      }
    }
    _seenEvents = s.events.length;
  }

  // ── Кадр — перенос render(state, time, finaleT) ───────────────────────────────────────────────

  void _frame(double dt) {
    if (isGameHeld()) dt = 0;
    final course = widget.course;
    final s = widget.state;
    if (!identical(course, _course)) _load(course);
    _time += dt;
    final sum = jsRound(s.sum).toDouble();
    if (_lastNumber != sum) {
      if (_digit != null) _hero.remove(_digit!);
      _digit = _numerals!.make(_num(sum), sum < 0 ? _minusColor : _plusColor);
      _hero.add(_digit!);
      _lastNumber = sum;
    }
    final won = s.status == RoadStatus.won && course.finale != null;
    final moving = (s.status == RoadStatus.running || won) && !isGameHeld();
    final finaleT = widget.finaleT;
    // Финал: число едет дальше по лестнице стен, пока пробивает.
    final along = won ? math.min(finaleDistance(course, s.sum), finaleT * finaleSpeed) : 0.0;
    final view = s.z + along;
    // В финале число съезжает на середину: четырёхзначное у края полосы уходило за край экрана.
    final hx = s.x * _lane * (won ? math.max(0, 1 - finaleT / .5) : 1);
    final hy = jumpHeight(s);
    final target = numberScale(s.sum);
    _visualScale = _reduced ? target : _visualScale + (target - _visualScale) * (1 - math.exp(-dt * 8));
    final size = 1.12 * _visualScale * _compactScale;
    final dw = RunnerNumerals.widthOf[_digit!]!;
    final fitted = fitRunnerNumeral(_viewport, width: dw, requested: size, laneX: hx, jump: hy);
    _digit!
      ..scale = vm.Vector3(fitted, fitted, math.min(fitted, .6))
      ..position = vm.Vector3(0, .08 + (!_reduced && moving ? math.sin(_time * 3) * .025 : 0), 0);

    _syncRows(course, s.nextRow);
    _react(course, s);
    for (final art in _rows.values) {
      final row = art.row;
      art.root
        ..position = vm.Vector3(0, 0, view - row.z)
        ..visible = row.z - view < 90;
      art.items.visible = row.id >= s.nextRow || (row.kind == 'operation' && course.mode == 'journey');
      if (row.kind == 'pickups') {
        art.pickups.forEach((i, node) => node.visible = row.id != s.nextRow || !s.collected.contains(i));
      }
    }
    // Над числом — сколько частей уже взято в воротах «ровно N», пока их ряд впереди.
    final exactRow = s.nextRow < course.rows.length && course.rows[s.nextRow].exact != null ? course.rows[s.nextRow] : null;
    var text = '';
    if (exactRow != null && s.collected.isNotEmpty) {
      final got = s.collected.fold<double>(0, (a, i) => a + (exactRow.items[i].part ? exactRow.items[i].value : 0));
      text = '${_num(got)} / ${_num(exactRow.exact!.target)}';
    }
    if (text != _partText) {
      _partText = text;
      if (text.isNotEmpty) _labels.set(_counter, text, const _LabelSpec(background: 0x78350f, ink: 0xfef3c7, font: 120));
      _counter.visible = text.isNotEmpty && !widget.screenReadouts;
    }
    _counter.position = vm.Vector3(hx, 2.9 + hy, 0);
    // Пока впереди станция, страж прячется: крупная строка станции ложилась на его число.
    final stationAhead = course.rows.skip(s.nextRow).take(3).any((r) => (r.station != null || r.exact != null) && r.z - view <= 70);
    final g = _guard;
    if (g != null) {
      g.visible = !widget.screenReadouts && course.length - view >= 100 && !won && !stationAhead;
      g.position = vm.Vector3(0, 3.2 + (!_reduced ? math.sin(_time * 1.5) * .2 : 0), -52);
    }
    if (course.finale != null && _finale == null && course.length - view < 100) _finale = _buildFinale(course);
    final f = _finale;
    if (f != null) {
      f.root.position = vm.Vector3(0, 0, view - course.length);
      final broken = won ? finaleBroken(course, s.sum) : 0;
      final boss = course.finale?.boss != null;
      for (var i = 0; i < f.slabs.length; i++) {
        final slab = f.slabs[i];
        if (slab.visible && i < broken && along >= finaleGap * (i + 1) - .9) {
          slab.visible = false;
          _burst(0, 1.2, -.6, boss ? _guardColor : _ladder[i % _ladder.length], boss ? 60 : 30, spread: 5, lift: 6, drift: finaleSpeed);
        }
      }
      if (won && broken < f.slabs.length && along >= finaleDistance(course, s.sum) && _bump == 0) _bump = .001;
    }
    var hz = 0.0;
    if (_bump > 0) {
      _bump += dt;
      hz = !_reduced && _bump < .45 ? -math.sin(_bump / .45 * math.pi) * .35 : 0;
    }
    _hero.position = vm.Vector3(hx, hy, hz);
    if (moving && dt > 0) {
      _stepSparks(dt);
      _stepPopups(dt);
    }
    _startPlatform
      ..position = vm.Vector3(0, -.22, view + 9)
      ..visible = view < 24;
  }

  @override
  Widget build(BuildContext context) {
    if (_broken) return widget.fallback;
    _reduced = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    return LayoutBuilder(
      builder: (context, c) {
        final w = c.maxWidth, h = c.maxHeight;
        _viewport = Size(w, h);
        _compactScale = h < 360 ? 1.35 : 1;
        if (!_ready) return ColoredBox(key: const Key('nr-road-3d-loading'), color: numberRunWater, child: const SizedBox.expand());
        // Высокий портретный экран — шире угол, чтобы три полосы выбора читались целиком (как в вебе).
        // Сверх веба: на очень высоком экране (iPhone, Android 9:20) трёхзначное число на крайней полосе
      // уходило за край (кадр стенда 06.11) — угол расширяется, пока в кадр не входят ±4,8 единицы
      // на глубине числа (12,9 по оси взгляда): вся дорога 7,2 и край числа на полосе ±1 с запасом.
      final fov = runnerFov(_viewport);
        return SceneView(
          scene,
          key: const Key('nr-road-3d'),
          camera: PerspectiveCamera(fovRadiansY: fov, position: vm.Vector3(0, 8.2, 11), target: vm.Vector3(0, 0, -10)),
          onTick: (_, dt) => _frame(math.max(0, math.min(.1, dt))),
        );
      },
    );
  }
}

class _Finale {
  _Finale(this.root, this.slabs);
  final Node root;
  final List<Node> slabs;
}
