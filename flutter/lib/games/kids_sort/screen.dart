import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';

import '../../shell/aux_action.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/lesson.dart';
import '../../shell/lesson_player.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'model.dart';

/// ЭКРАН «ЦВЕТОВ И ФОРМ» — раздел «Сортировки», движок MindLab (решение Дениса
/// 30.09.2026: «добавляем, потом доработаем»).
///
/// Вверху карточка, внизу две коробки-образца: красный круг и синий квадрат.
/// Нажатие на коробку кладёт карточку туда; после каждого ответа — ✓ или ✗.
/// Сначала верно «по цвету», на середине серии правило молча меняется на «по
/// форме», как у движка: догадаться о смене ребёнок может только по ✗.
class KidsSortScreen extends StatefulWidget {
  const KidsSortScreen({super.key, required this.state, this.seed});

  final SharedState state;

  /// Зерно раздачи для проб; без него — случайная.
  final int? seed;

  @override
  State<KidsSortScreen> createState() => _KidsSortScreenState();
}

class _KidsSortScreenState extends State<KidsSortScreen> {
  late LevelLadder _ladder;
  late Random _rnd;
  KidsSortSession? _session;
  int _phase = 1;
  int _index = 0;
  bool? _lastOk;
  Timer? _flash;

  bool get _done => _session != null && _phase == 2 && _index >= _session!.nCards;

  KidsCard? get _card {
    final s = _session;
    if (s == null || _done) return null;
    return (_phase == 1 ? s.phase1 : s.phase2).cards[_index];
  }

  @override
  void initState() {
    super.initState();
    _rnd = Random(widget.seed);
    _ladder = LevelLadder(gameId: 'kids_sort', store: SharedLevelStore(widget.state));
    _boot();
  }

  @override
  void dispose() {
    _flash?.cancel();
    super.dispose();
  }

  Future<void> _boot() async {
    await _ladder.load();
    if (!mounted) return;
    setState(_deal);
  }

  void _deal() {
    _flash?.cancel();
    _session = KidsSortSession(_rnd, nCards: kidsCardsFor(_ladder.level));
    _phase = 1;
    _index = 0;
    _lastOk = null;
  }

  void _answer(int box) {
    final s = _session;
    final card = _card;
    if (s == null || card == null) return;
    final ok = s.answer(_phase, card, box);
    _flash?.cancel();
    setState(() {
      _lastOk = ok;
      _index += 1;
      // Смена правила молчит: вторая фаза начинается сразу за первой.
      if (_phase == 1 && _index >= s.nCards) {
        _phase = 2;
        _index = 0;
      }
    });
    _flash = Timer(const Duration(milliseconds: 600), () {
      if (mounted) setState(() => _lastOk = null);
    });
  }

  Future<void> _next() async {
    final s = _session;
    if (s == null) return;
    await _ladder.win(errors: s.errors);
    if (!mounted) return;
    setState(_deal);
  }

  void _restart() => setState(_deal);

  /// Звёзды по доле верных: вся серия без ошибок — три, до одной пятой ошибок — две.
  int _stars(KidsSortSession s) {
    if (s.errors == 0) return 3;
    return s.errors * 5 <= s.total ? 2 : 1;
  }

  /*
   * РАЗБОР — три шага словами на образцах, без чужой партии: как класть по
   * цвету, что правило может смениться без предупреждения и как это заметить
   * (✗ на карточке, которую только что клал верно), и что делать дальше.
   */
  Future<void> _openLesson() async {
    // Имя кончается на `Keys` — по нему сборщик словаря (embed-l10n.mjs) находит
    // ключи, которые зовутся не литералом `L.t('…')`.
    const lessonKeys = ['teachKidsSortRule', 'teachKidsSortSwitch', 'teachKidsSortShape'];
    final steps = [
      for (final k in lessonKeys) LessonStep(techniqueKey: k, text: L.t(k)),
    ];
    LessonUsed.mark();
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => LessonPlayerScreen(
        title: L.t('kidsSort'),
        steps: steps,
        board: (context, side, shown) => Center(
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (final t in kidsTargets)
                Padding(
                  padding: const EdgeInsets.all(8),
                  child: _CardFace(card: t, size: min(96, side / 3)),
                ),
            ],
          ),
        ),
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final s = _session;
    if (s == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final card = _card;
    final scheme = Theme.of(context).colorScheme;
    return GameShell(
      title: L.t('kidsSort'),
      onLesson: _openLesson,
      hud: [
        HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: L.t('errors'), value: '${s.errors}', icon: Icons.error_outline),
        HudItem(
          label: L.t('kidsSortCards'),
          value: '${(_phase - 1) * s.nCards + min(_index, s.nCards)}/${2 * s.nCards}',
          icon: Icons.style_outlined,
        ),
      ],
      field: (context, h) => Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          SizedBox(
            height: 40,
            child: _lastOk == null
                ? null
                : Text(
                    _lastOk! ? '✓' : '✗',
                    key: ValueKey('ks-feedback-${_lastOk! ? 'ok' : 'no'}'),
                    style: TextStyle(
                      fontSize: 32,
                      fontWeight: FontWeight.w700,
                      color: _lastOk! ? const Color(0xFF16A34A) : const Color(0xFFDC2626),
                    ),
                  ),
          ),
          if (card != null)
            _CardFace(key: const ValueKey('ks-card'), card: card, size: min(140, h * 0.3))
          else
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                '${L.t('errors')}: ${s.errors} · ${L.t('kidsSortPersev')}: ${s.perseverative}',
                key: const ValueKey('ks-summary'),
                style: Theme.of(context).textTheme.titleMedium,
                textAlign: TextAlign.center,
              ),
            ),
          const SizedBox(height: 32),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (var box = 0; box < kidsTargets.length; box += 1)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: InkWell(
                    key: ValueKey('ks-box-$box'),
                    borderRadius: BorderRadius.circular(16),
                    onTap: card == null ? null : () => _answer(box),
                    child: Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: scheme.outline, width: 2),
                      ),
                      child: _CardFace(card: kidsTargets[box], size: min(96, h * 0.2)),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
      auxRow: AuxBar(children: [
        AuxAction(icon: Icons.refresh, label: L.t('restart'), onPressed: _restart),
      ]),
      toolbar: _done
          ? Padding(
              padding: const EdgeInsets.all(12),
              child: FilledButton.icon(
                key: const ValueKey('ks-next'),
                onPressed: _next,
                icon: const Icon(Icons.arrow_forward),
                label: Text('${'★' * _stars(s)} · ${L.t('level')} ${_ladder.level + 1}'),
              ),
            )
          : null,
      pauseActions: [
        PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: _restart),
      ],
    );
  }
}

/// Карточка: фигура своего цвета; маленькая — вдвое меньше большой.
class _CardFace extends StatelessWidget {
  const _CardFace({super.key, required this.card, required this.size});

  final KidsCard card;
  final double size;

  @override
  Widget build(BuildContext context) {
    final color = card.color == KidsColor.red ? const Color(0xFFE11D48) : const Color(0xFF2563EB);
    final figure = card.size == KidsSize.big ? size * 0.8 : size * 0.45;
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Container(
        width: figure,
        height: figure,
        decoration: BoxDecoration(
          color: color,
          shape: card.shape == KidsShape.circle ? BoxShape.circle : BoxShape.rectangle,
          borderRadius: card.shape == KidsShape.square ? BorderRadius.circular(4) : null,
        ),
      ),
    );
  }
}
