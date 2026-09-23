import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../shell/aux_action.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'model.dart';

/// «Найди отличия» на общем каркасе: две почти одинаковые сцены, три раунда.
///
/// 🔴 НАЖАТИЕ ЛОВИТ СЦЕНА, А НЕ ФИГУРА. Раньше обработчик висел на самой фигуре,
/// и в мелкий треугольник было почти не попасть. Теперь ищется ближайший объект,
/// промах прощается до края плюс 16 точек.
class FindDifferencesScreen extends StatefulWidget {
  const FindDifferencesScreen({super.key, required this.state, this.rnd});

  final SharedState state;

  /// Только для проб: делает раздачу повторяемой.
  final Rng? rnd;

  @override
  State<FindDifferencesScreen> createState() => _FindDifferencesScreenState();
}

enum _Phase { playing, result }

/// Значки вместо тематических спрайтов веба: силуэты РАЗНЫЕ, иначе отличие
/// «по зверю» превращается в угадывание — та же причина, по которой в SDMT
/// огонь заменили на месяц.
const List<IconData> _sprites = [
  Icons.pets, Icons.cruelty_free, Icons.flutter_dash, Icons.bug_report,
  Icons.egg, Icons.set_meal, Icons.emoji_nature, Icons.catching_pokemon,
  Icons.spa, Icons.park, Icons.savings, Icons.rocket_launch,
];

class _FindDifferencesScreenState extends State<FindDifferencesScreen> {
  late LevelLadder _ladder;
  late Rng _rng;
  late FdParams _params;

  List<Shape> _left = const [];
  List<Shape> _right = const [];
  List<int> _diffIdx = const [];
  final Set<int> _found = {};
  int _round = 1;
  int _roundsWon = 0;
  double _left_ = 0;
  int _elapsedMs = 0;
  bool _won = false;
  bool _ready = false;
  _Phase _phase = _Phase.playing;
  Timer? _tick;
  Timer? _next;
  SceneSize _scene = const SceneSize(320, 240);

  @override
  void initState() {
    super.initState();
    _rng = widget.rnd ?? math.Random().nextDouble;
    _ladder = LevelLadder(gameId: 'find_differences', store: SharedLevelStore(widget.state), maxLevel: 999);
    _boot();
  }

  @override
  void dispose() {
    _tick?.cancel();
    _next?.cancel();
    super.dispose();
  }

  Future<void> _boot() async {
    await _ladder.load();
    if (!mounted) return;
    setState(() {
      _reset();
      _ready = true;
    });
  }

  void _reset() {
    _tick?.cancel();
    _next?.cancel();
    _params = levelParams(_ladder.level);
    _round = 1;
    _roundsWon = 0;
    _won = false;
    _phase = _Phase.playing;
    // ⚠️ РАЗДАЧА ЖДЁТ РАЗМЕРА ПОЛЯ. Раньше сцена раздавалась дважды: сперва на
    // размере по умолчанию, потом на настоящем, — и зерно тратилось вхолостую,
    // из-за чего партия у экрана и у пробы расходилась. Поймано пробой.
    _left = const [];
    _right = const [];
    _diffIdx = const [];
    _found.clear();
  }

  void _deal() {
    _tick?.cancel();
    _found.clear();
    // Сцена считается от РАЗМЕРА, который дал каркас: он приходит числом, и
    // объекты обязаны лечь внутрь него, а не «примерно».
    final scene = generateScene(_scene.width, _scene.height, _params.objectCount, _params.spriteAlphabet, _rng);
    final alt = withDifference(scene, _params.diffCount, _params.spriteAlphabet, _rng);
    _left = scene;
    _right = alt.shapes;
    _diffIdx = alt.diffIdx;
    _elapsedMs = 0;
    _left_ = _params.roundTimeSec.toDouble();
    _tick = Timer.periodic(const Duration(milliseconds: 100), (_) {
      if (!mounted) return;
      _elapsedMs += 100;
      setState(() => _left_ = math.max(0, _params.roundTimeSec - _elapsedMs / 1000));
      if (_left_ <= 0) _endRound(false);
    });
  }

  void _tap(double x, double y) {
    if (_phase != _Phase.playing) return;
    final idx = hitTest(_right, x, y);
    if (idx == null || _found.contains(idx) || !_diffIdx.contains(idx)) return;
    setState(() => _found.add(idx));
    if (_found.length == _diffIdx.length) _endRound(true);
  }

  void _endRound(bool cleared) {
    _tick?.cancel();
    if (cleared) _roundsWon += 1;
    _next?.cancel();
    _next = Timer(const Duration(milliseconds: 700), () async {
      if (!mounted) return;
      if (_round >= _params.rounds) {
        // Уровень берётся, только если закрыты ВСЕ раунды: недобор — не проход.
        final passed = _roundsWon >= _params.rounds;
        if (passed) {
          await _ladder.win();
        } else {
          await _ladder.fail();
        }
        if (!mounted) return;
        setState(() {
          _won = passed;
          _phase = _Phase.result;
        });
        return;
      }
      setState(() {
        _round += 1;
        _deal();
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    return GameShell(
      title: L.t('findDiff'),
      hud: [
        HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: L.t('personalBest'), value: '${_ladder.best}', icon: Icons.emoji_events_outlined),
        HudItem(label: L.t('round'), value: '$_round/${_params.rounds}', icon: Icons.repeat),
        HudItem(label: L.t('label_found'), value: '${_found.length}/${_diffIdx.length}', icon: Icons.search),
        HudItem(label: L.t('time'), value: '${_left_.ceil()}', icon: Icons.timer_outlined),
      ],
      field: (context, h) => LayoutBuilder(builder: (context, c) {
        final s = sceneSize(c.maxWidth, h);
        // Размер сцены нужен раздаче: пересобираем, если каркас дал другое поле.
        if (s.width != _scene.width || s.height != _scene.height) {
          _scene = s;
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted && _left.isEmpty) setState(_deal);
          });
        }
        if (_left.isEmpty) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted && _left.isEmpty) setState(_deal);
          });
          return const SizedBox.shrink();
        }
        return Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            // ⚠️ ВЫСОТА ПОДСКАЗКИ ЗАФИКСИРОВАНА, И ЭТО ЧАСТЬ БЮДЖЕТА. Бюджет сцены
            // считает `sceneSize` из чисел «подсказка 16 + зазоры», и если строка
            // окажется выше своих шестнадцати, колонка переполнится — ровно это
            // поймала проба раскладки (8 точек).
            SizedBox(
              height: 16,
              child: Text(
                L.t('findDiffDesc'),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
            const SizedBox(height: 12),
            _Scene(key: const Key('сцена-лево'), shapes: _left, size: s, found: const {}, onTap: null),
            const SizedBox(height: 18),
            _Scene(key: const Key('сцена-право'), shapes: _right, size: s, found: _found, onTap: _tap),
          ]),
        );
      }),
      auxRow: AuxBar(children: [
        AuxAction(icon: Icons.refresh, label: L.t('restart'), onPressed: () => setState(_reset)),
      ]),
      toolbar: _phase == _Phase.result
          ? Padding(
              padding: const EdgeInsets.all(12),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Text(
                  '${_won ? L.t('nextLabel') : L.t('retry')} · ${L.t('round')} $_roundsWon/${_params.rounds}',
                  key: const Key('итог'),
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 8),
                FilledButton.icon(
                  key: const Key('дальше'),
                  onPressed: () => setState(_reset),
                  icon: Icon(_won ? Icons.arrow_forward : Icons.refresh),
                  label: Text(_won ? L.t('nextLabel') : L.t('retry')),
                ),
              ]),
            )
          : null,
      pauseActions: [
        PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: () => setState(_reset)),
      ],
    );
  }
}

/// Одна сцена. Нажатие ловит контейнер по координате — см. `hitTest`.
class _Scene extends StatelessWidget {
  const _Scene({super.key, required this.shapes, required this.size, required this.found, this.onTap});

  final List<Shape> shapes;
  final SceneSize size;
  final Set<int> found;
  final void Function(double, double)? onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: onTap == null ? null : (d) => onTap!(d.localPosition.dx, d.localPosition.dy),
      child: Container(
        width: size.width,
        height: size.height,
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest,
          border: Border.all(color: scheme.outlineVariant, width: 2),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Stack(children: [
          for (var i = 0; i < shapes.length; i += 1)
            // Ключа у объекта нет намеренно: пробы нажимают ПО КООРДИНАТЕ, как
            // палец, а ключ с интерполяцией ещё и считался бы зашитым текстом.
            Positioned(
              left: shapes[i].x - shapes[i].size / 2,
              top: shapes[i].y - shapes[i].size / 2,
              child: Transform.rotate(
                angle: shapes[i].rot * math.pi / 180,
                child: Container(
                  width: shapes[i].size,
                  height: shapes[i].size,
                  decoration: found.contains(i)
                      ? BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(color: const Color(0xFF22C55E), width: 3),
                        )
                      : null,
                  child: Icon(
                    _sprites[shapes[i].sprite % _sprites.length],
                    size: shapes[i].size * 0.8,
                    color: scheme.primary,
                  ),
                ),
              ),
            ),
        ]),
      ),
    );
  }
}
