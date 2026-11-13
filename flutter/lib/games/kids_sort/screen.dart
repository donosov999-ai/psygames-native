import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';

import '../../shell/app_haptics.dart';
import '../../shell/aux_action.dart';
import '../../shell/drop_baskets.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/lesson.dart';
import '../../shell/lesson_player.dart';
import '../../shell/level_ladder.dart';
import '../../shell/level_rules.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'model.dart';

/// ЭКРАН «ЦВЕТОВ И ФОРМ» — раздел «Сортировки», движок MindLab (решение Дениса
/// 30.09.2026: «добавляем, потом доработаем»).
///
/// Вверху карточка, внизу две коробки-образца: красный круг и синий квадрат.
/// Карточку перетаскивают в коробку (режим по умолчанию) или нажимают на коробку — тогда карточка
/// ложится туда сама; режим выбирается в паузе и запоминается ([KidsInputMode], общий компонент
/// `shell/drop_baskets.dart`, задача 2d300f4e). После каждого ответа — ✓ или ✗.
/// Сначала верно «по цвету», потом правило молча меняется на «по форме», с пятой
/// ступени — и обратно: догадаться о смене ребёнок может только по ✗.
///
/// 🔴 СЕРИЯ ЗАСЧИТЫВАЕТСЯ НЕ ВСЕГДА (доработка 02.10.2026, задача e95b7e2f). Прежде любая
/// досмотренная серия поднимала ступень, и ребёнок, раскладывавший всё по цвету, уходил к
/// сменам правила, которых не замечал. Теперь ступень растёт, если в каждой фазе не больше
/// ошибок, чем позволяет критерий пробы ([KidsSortSession.passed]); иначе — провал, и
/// третий подряд опускает ступень.
/// Ключ памяти способа ответа: у каждого профиля свой — ребёнку удобнее перетаскивать, взрослому нажимать.
String kidsInputKey(SharedState state) => '${SharedState.prefix}kids_sort_input_${state.activeProfile}';

/// Перетаскивание — режим по умолчанию; выбор человека (`tap`) запоминается.
bool kidsDragMode(SharedState state) => state.get(kidsInputKey(state)) != 'tap';

class KidsSortScreen extends StatefulWidget {
  const KidsSortScreen({super.key, required this.state, this.seed});

  final SharedState state;

  /// Зерно раздачи для проб; без него — случайная.
  final int? seed;

  @override
  State<KidsSortScreen> createState() => _KidsSortScreenState();
}

class _KidsSortScreenState extends State<KidsSortScreen> {
  /// Отклик хода — через общий выключатель «Вибрация» (образец «Матрицы памяти», задача 792432f8).
  late final AppHaptics _haptics = AppHaptics(widget.state);
  late LevelLadder _ladder;
  late Random _rnd;
  KidsSortSession? _session;
  int _phase = 1;
  int _index = 0;
  bool? _lastOk;
  Timer? _flash;
  bool _finishing = false;

  /// Способ ответа: перетаскивать карточку (по умолчанию) или нажимать на коробку.
  late bool _drag = kidsDragMode(widget.state);

  bool get _done => _session != null && _phase == _session!.phases.length && _index >= _session!.nCards;

  /// Идентификатор карточки на столе: фаза и номер — разные карточки не путаются при перетаскивании.
  int get _cardId => _phase * 1000 + _index;

  KidsCard? get _card {
    final s = _session;
    if (s == null || _done) return null;
    return s.phases[_phase - 1].cards[_index];
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
    _session = KidsSortSession(
      _rnd,
      nCards: kidsCardsFor(_ladder.level),
      phases: kidsPhasesFor(_ladder.level),
    );
    _phase = 1;
    _index = 0;
    _lastOk = null;
    _finishing = false;
  }

  void _answer(int box) {
    final s = _session;
    final card = _card;
    if (s == null || card == null) return;
    final ok = s.answer(_phase, card, box);
    ok ? _haptics.hit() : _haptics.miss();
    _flash?.cancel();
    setState(() {
      _lastOk = ok;
      _index += 1;
      // Смена правила молчит: следующая фаза начинается сразу за прошлой.
      if (_phase < s.phases.length && _index >= s.nCards) {
        _phase += 1;
        _index = 0;
      }
    });
    _flash = Timer(const Duration(milliseconds: 600), () {
      if (mounted) setState(() => _lastOk = null);
    });
  }

  Future<void> _next() async {
    final s = _session;
    if (s == null || !_done || _finishing) return;
    _finishing = true;
    _flash?.cancel();
    if (s.passed) {
      await _ladder.win(errors: s.errors);
    } else {
      await _ladder.fail(errors: s.errors);
    }
    if (!mounted || !identical(_session, s)) return;
    setState(_deal);
  }

  void _restart() => setState(_deal);

  void _setDrag(bool drag) {
    if (drag == _drag) return;
    setState(() => _drag = drag);
    widget.state.set(kidsInputKey(widget.state), drag ? 'drag' : 'tap');
  }

  /*
   * РАЗБОР — три шага словами на образцах, без чужой партии: как класть по
   * цвету, что правило может смениться без предупреждения и как это заметить
   * (✗ на карточке, которую только что клал верно), и что делать дальше.
   */
  Future<void> _openLesson() async {
    // Имя кончается на `Keys` — по нему сборщик словаря (embed-l10n.mjs) находит
    // ключи, которые зовутся не литералом `L.t('…')`.
    const lessonKeys = ['teachKidsSortRule', 'teachKidsSortSwitch', 'teachKidsSortShape', 'teachKidsSortAgain'];
    // Четвёртый шаг — про то, что правило возвращается: он нужен, только когда смен больше одной.
    final keys = kidsPhasesFor(_ladder.level) > 2 ? lessonKeys : lessonKeys.take(3);
    final steps = [
      for (final k in keys) LessonStep(techniqueKey: k, text: L.t(k)),
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
      levelRule: LevelRuleSpot(
        gameId: 'kids_sort',
        level: _ladder.level,
        state: widget.state,
        calm: (_phase == 1 && _index == 0) || _done,
      ),
      hud: [
        HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: L.t('errors'), value: '${s.errors}', icon: Icons.error_outline),
        HudItem(
          label: L.t('kidsSortCards'),
          value: '${(_phase - 1) * s.nCards + min(_index, s.nCards)}/${s.phases.length * s.nCards}',
          icon: Icons.style_outlined,
        ),
      ],
      field: (context, h) => DropBasketsScope<int, int>(
        // Ответ принимается, пока на столе есть карточка; карточка одна, поэтому тап по коробке
        // кладёт её сразу (implicitItem), а перетащить можно ту же самую.
        enabled: card != null,
        resetKey: s,
        implicitItem: card == null ? null : _cardId,
        canDrop: (id) => card != null && id == _cardId,
        isLive: (id) => card != null && id == _cardId,
        isCorrect: (id, box) => card != null && s.phases[_phase - 1].check(card, box),
        onAnswer: (id, box) => _answer(box),
        child: Column(
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
            _drag
                ? DropCard<int>(
                    key: const ValueKey('ks-card'),
                    item: _cardId,
                    label: L.t('kidsSort'),
                    feedbackWidth: min(140, h * 0.3),
                    builder: (context, selected) => _CardFace(card: card, size: min(140, h * 0.3), selected: selected),
                  )
                : _CardFace(key: const ValueKey('ks-card'), card: card, size: min(140, h * 0.3))
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
                  child: DropBasket<int, int>(
                    key: ValueKey('ks-box-$box'),
                    target: box,
                    label: '',
                    borderRadius: 16,
                    builder: (context, highlighted) => Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: highlighted ? scheme.primary : scheme.outline,
                          width: highlighted ? 3 : 2,
                        ),
                      ),
                      child: _CardFace(card: kidsTargets[box], size: min(96, h * 0.2)),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
      ),
      auxRow: AuxBar(children: [
        AuxAction(inPause: true, icon: Icons.refresh, label: L.t('restart'), onPressed: _restart),
      ]),
      toolbar: _done
          ? Padding(
              padding: const EdgeInsets.all(12),
              child: FilledButton.icon(
                key: const ValueKey('ks-next'),
                onPressed: _next,
                icon: const Icon(Icons.arrow_forward),
                label: Text('${'★' * s.stars} · ${L.t('level')} ${s.passed ? _ladder.level + 1 : _ladder.level}'),
              ),
            )
          : null,
      pauseActions: [
        PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: _restart),
        // «Режим: Перетаскивать · Нажимать» — выбор из двух, каркас кладёт их рядом сегментами.
        PauseAction(
          label: L.t('dropModeDrag'),
          icon: _drag ? Icons.radio_button_checked : Icons.radio_button_unchecked,
          onPressed: () => _setDrag(true),
        ),
        PauseAction(
          label: L.t('dropModeTap'),
          icon: _drag ? Icons.radio_button_unchecked : Icons.radio_button_checked,
          onPressed: () => _setDrag(false),
        ),
      ],
    );
  }
}

/// Карточка: фигура своего цвета; маленькая — вдвое меньше большой.
class _CardFace extends StatelessWidget {
  const _CardFace({super.key, required this.card, required this.size, this.selected = false});

  final KidsCard card;
  final double size;

  /// Карточка выбрана (взята пальцем или нажата): рамка, как у слов в «Сортировке слов».
  final bool selected;

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
        border: selected ? Border.all(color: Theme.of(context).colorScheme.primary, width: 3) : null,
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
