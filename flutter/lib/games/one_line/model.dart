import 'dart:convert';

/// «Одна линия» — граф и правила обхода. Второй экран пилота.
///
/// Уровни, как и у «Соедини точки», выпускает нынешний генератор проекта
/// (frontend/src/games/one-line/core/generator.ts) и кладёт в
/// assets/levels/one_line.json вместе с эталонным маршрутом.
///
/// Правило игры: провести ОДНУ непрерывную линию, пройдя каждое ребро ровно
/// столько раз, сколько оно позволяет, и не отрывая пальца. Ребро бывает трёх
/// видов: обычное (один проход), двойное (два прохода) и одностороннее
/// (один проход и только в свою сторону).
class Vertex {
  const Vertex({required this.id, required this.x, required this.y});
  final String id;
  final double x;
  final double y;

  factory Vertex.fromJson(Map<String, dynamic> j) => Vertex(
        id: j['id'] as String,
        x: (j['x'] as num).toDouble(),
        y: (j['y'] as num).toDouble(),
      );
}

class Edge {
  const Edge({required this.id, required this.a, required this.b, required this.kind});
  final String id;
  final String a;
  final String b;

  /// 'single' | 'double' | 'oneway'
  final String kind;

  int get passes => kind == 'double' ? 2 : 1;
  bool get oneWay => kind == 'oneway';

  factory Edge.fromJson(Map<String, dynamic> j) => Edge(
        id: j['id'] as String,
        a: j['a'] as String,
        b: j['b'] as String,
        kind: (j['kind'] as String?) ?? 'single',
      );
}

class OneLineLevel {
  OneLineLevel({
    required this.level,
    required this.vertices,
    required this.edges,
    required this.startHint,
    required this.solutionEdgeIds,
    required this.solutionVertexIds,
  });

  final int level;
  final List<Vertex> vertices;
  final List<Edge> edges;
  final String? startHint;
  final List<String> solutionEdgeIds;

  /// Вершины маршрута по порядку. Первая из них — откуда эталон начинает линию:
  /// у обычного ребра начать можно с любого конца, и без этой вершины правило
  /// начала пришлось бы угадывать (8 уровней из 30 не сходились).
  final List<String> solutionVertexIds;

  factory OneLineLevel.fromJson(Map<String, dynamic> j) {
    final sol = j['solution'] as Map<String, dynamic>?;
    return OneLineLevel(
      level: j['level'] as int,
      vertices: (j['vertices'] as List).map((v) => Vertex.fromJson(v as Map<String, dynamic>)).toList(),
      edges: (j['edges'] as List).map((e) => Edge.fromJson(e as Map<String, dynamic>)).toList(),
      startHint: j['startHintVertexId'] as String?,
      solutionEdgeIds:
          ((sol?['edgeIds'] as List?) ?? const []).map((e) => e as String).toList(),
      solutionVertexIds:
          ((sol?['vertexIds'] as List?) ?? const []).map((e) => e as String).toList(),
    );
  }

  /// Сколько проходов надо сделать всего — столько шагов и будет в маршруте.
  int get totalPasses => edges.fold(0, (a, e) => a + e.passes);

  Vertex vertexById(String id) => vertices.firstWhere((v) => v.id == id);
  Edge edgeById(String id) => edges.firstWhere((e) => e.id == id);
}

class OneLineLevelSet {
  OneLineLevelSet(this.levels);
  final List<OneLineLevel> levels;

  factory OneLineLevelSet.fromJsonString(String s) => OneLineLevelSet(
        ((jsonDecode(s) as Map<String, dynamic>)['levels'] as List)
            .map((l) => OneLineLevel.fromJson(l as Map<String, dynamic>))
            .toList(),
      );

  OneLineLevel byLevel(int level) => levels[(level - 1).clamp(0, levels.length - 1)];
}

/// Партия: где сейчас палец и какие рёбра уже пройдены.
class OneLineGame {
  OneLineGame(this.level);

  final OneLineLevel level;

  /// Сколько раз пройдено каждое ребро.
  final Map<String, int> used = {};

  /// Пройденные рёбра по порядку — для отмены и для отрисовки.
  final List<String> trail = [];

  String? current;

  /// Линия начинается с вершины, которую выбрал человек (или эталон).
  void startAt(String vertexId) {
    reset();
    current = vertexId;
  }

  /// Можно ли пойти по ребру из текущей вершины.
  bool canWalk(Edge e, {String? from}) {
    final at = from ?? current;
    if (at == null) return false;
    if ((used[e.id] ?? 0) >= e.passes) return false;
    if (e.oneWay) return e.a == at;
    return e.a == at || e.b == at;
  }

  /// Пойти по ребру. Возвращает false, если ход запрещён правилами.
  bool walk(String edgeId) {
    final e = level.edgeById(edgeId);
    if (current == null || !canWalk(e)) return false;
    final at = current!;
    used[e.id] = (used[e.id] ?? 0) + 1;
    trail.add(e.id);
    current = e.a == at ? e.b : e.a;
    return true;
  }

  /// Шаг назад: линия стирается с конца, как карандашом.
  void undo() {
    if (trail.isEmpty) return;
    final id = trail.removeLast();
    final e = level.edgeById(id);
    used[id] = (used[id] ?? 1) - 1;
    if ((used[id] ?? 0) <= 0) used.remove(id);
    if (trail.isEmpty) {
      current = null;
      return;
    }
    // Вершина, в которой линия оказалась после предыдущего шага.
    final prev = level.edgeById(trail.last);
    final before = current == e.a ? e.b : e.a;
    current = before == prev.a ? prev.a : (before == prev.b ? prev.b : before);
  }

  void reset() {
    used.clear();
    trail.clear();
    current = null;
  }

  int get passesDone => used.values.fold(0, (a, b) => a + b);

  bool get isWon => passesDone == level.totalPasses;

  /// Проверка эталонного маршрута из данных: он обязан выигрывать уровень.
  static bool solutionWins(OneLineLevel level) {
    final g = OneLineGame(level);
    if (level.solutionVertexIds.isEmpty) return false;
    g.startAt(level.solutionVertexIds.first);
    for (final id in level.solutionEdgeIds) {
      if (!g.walk(id)) return false;
    }
    return g.isWon;
  }
}
