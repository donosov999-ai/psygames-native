import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;

import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'model.dart';

/// «Словарь SRS» — первый экран раздела «Языки» на Flutter.
///
/// 🔴 ЗАЧЕМ ИМЕННО ЭТОТ ЭКРАН ПЕРВЫМ. Во-первых, он единственный в разделе не
/// трогает озвучку — а замена озвучки в Flutter ещё не выбрана. Во-вторых, ровно
/// на нём стоит 🔴-блокер с iOS (отчёт e0ad9f91, 18.09.2026): правая колонка
/// шапки и нижний ряд ответов уходили за край экрана, и партию нельзя было
/// закончить. Здесь этого класса беды нет по устройству каркаса: счётчики живут
/// в `Wrap` (переносятся, а не вылезают), название — в `Expanded` с многоточием,
/// а ряд ответов прибит снизу самим `GameShell`.
///
/// ⚠️ ЧЕГО ПОКА НЕТ (переносится следующим заходом, поэтому перехват маршрута
/// НЕ ВКЛЮЧЁН — человек по-прежнему открывает веб-версию со всеми режимами):
///   · ответ ПЕЧАТЬЮ (`typing`) — извлечение из памяти вместо узнавания;
///   · билингво — две колоды вперемешку с раскладкой по ряду чередования.
///
/// Правила и их сверка с живым TS — в `model.dart` и `test/vocab_srs_test.dart`.

/// Направление опроса: узнавание (L2 → родной) или припоминание (родной → L2).
enum VocabDirection { recognize, recall }

enum VocabPhase { config, playing, result }

/// Сколько новых слов за подход — те же четыре значения, что в веб-версии.
const List<int> vocabNewLimits = [5, 10, 20, 30];

/// Пауза перед следующей карточкой. На ошибке дольше: верный ответ надо успеть
/// прочитать, иначе ошибка ничему не учит (числа из веб-версии).
const int vocabNextDelayOkMs = 450;
const int vocabNextDelayWrongMs = 1100;

class VocabSrsScreen extends StatefulWidget {
  const VocabSrsScreen({
    super.key,
    required this.state,
    this.clock,
    this.vocabOverride,
    this.storeOverride,
    this.random,
  });

  final SharedState state;

  /// Часы партии. Не заданы — настоящие. Задаются пробой и замером.
  final int Function()? clock;

  /// Словарь мимо ассетов — только для проб.
  final List<VocabEntry>? vocabOverride;

  /// Колода мимо общей памяти — только для проб.
  final DeckStore? storeOverride;

  final double Function()? random;

  @override
  State<VocabSrsScreen> createState() => _VocabSrsScreenState();
}

class _VocabSrsScreenState extends State<VocabSrsScreen> {
  late LevelLadder _runs;
  List<VocabEntry>? _vocab;
  VocabSrs? _srs;

  VocabPhase _phase = VocabPhase.config;
  String _targetLang = 'es';
  int _newLimit = 10;
  VocabDirection _direction = VocabDirection.recognize;

  List<CardRef> _queue = [];
  int _idx = 0;
  List<String> _options = [];
  String? _picked;
  int _correct = 0;
  int _wrong = 0;
  int _shownAtMs = 0;
  Timer? _next;
  SrsStats? _stats;

  int get _now => (widget.clock ?? () => DateTime.now().millisecondsSinceEpoch)();

  /// Язык интерфейса — он же базовый язык колоды.
  ///
  /// Берётся готовым геттером моста, а не чтением ключа руками: язык веб-сторона
  /// держит под ГОЛЫМ `language`, без приставки `psygames_`, и мост возит его
  /// через поимённое исключение [SharedState.extraKeys]. Гейт
  /// `flutter/test/bridge_carries_every_web_key_test.dart` сторожит, что ни один
  /// ключ веб-стороны не остался за границей.
  String get _baseLang => widget.state.language;

  @override
  void initState() {
    super.initState();
    _runs = LevelLadder(gameId: 'vocab_srs', store: SharedLevelStore(widget.state));
    _boot();
  }

  @override
  void dispose() {
    _next?.cancel();
    super.dispose();
  }

  Future<void> _boot() async {
    await _runs.load();
    final vocab = widget.vocabOverride ??
        [
          for (final e in jsonDecode(await rootBundle.loadString('assets/vocab/translation-vocab.json')) as List<dynamic>)
            (e as Map).map((k, v) => MapEntry('$k', '$v')),
        ];
    if (!mounted) return;
    setState(() {
      _vocab = vocab;
      // Изучаемый язык по умолчанию — как в веб-версии: англичанину испанский,
      // остальным английский.
      _targetLang = _baseLang == 'en' ? 'es' : 'en';
    });
    await _refreshStats();
  }

  List<String> get _langs {
    final v = _vocab;
    if (v == null || v.isEmpty) return const [];
    return [
      for (final k in v.first.keys)
        if (k != 'cat' && k != _baseLang) k,
    ];
  }

  VocabSrs _engine() => VocabSrs(
        vocab: _vocab ?? const [],
        baseLang: _baseLang,
        targetLang: _targetLang,
        store: widget.storeOverride ?? SharedDeckStore(widget.state),
        nowMs: () => _now,
        random: widget.random,
      );

  Future<void> _refreshStats() async {
    final s = await _engine().getStats();
    if (mounted) setState(() => _stats = s);
  }

  Future<void> _start() async {
    final srs = _engine();
    final q = await srs.buildQueue(_newLimit);
    final cards = [...q.due, ...q.fresh];
    if (!mounted) return;
    if (cards.isEmpty) {
      await _refreshStats();
      if (mounted) setState(() => _phase = VocabPhase.result);
      return;
    }
    setState(() {
      _srs = srs;
      _queue = cards;
      _idx = 0;
      _correct = 0;
      _wrong = 0;
      _picked = null;
      _phase = VocabPhase.playing;
      _options = _optionsFor(cards.first, q.pool);
      _pool = q.pool;
      _shownAtMs = _now;
    });
  }

  List<({String base, String target})> _pool = const [];

  List<String> _optionsFor(CardRef card, List<({String base, String target})> pool) {
    final right = _direction == VocabDirection.recognize ? card.base : card.target;
    final words = [for (final p in pool) _direction == VocabDirection.recognize ? p.base : p.target];
    return _engine().buildOptions(right, words);
  }

  Future<void> _pick(String option) async {
    if (_picked != null || _phase != VocabPhase.playing) return;
    final card = _queue[_idx];
    final right = _direction == VocabDirection.recognize ? card.base : card.target;
    final rt = _now - _shownAtMs;
    final correct = option == right;

    setState(() {
      _picked = option;
      if (correct) {
        _correct += 1;
      } else {
        _wrong += 1;
      }
    });

    await _srs!.gradeCard(card.id, gradeFromAnswer(correct: correct, rtMs: rt));

    var queue = _queue;
    if (!correct) {
      // Ошибка возвращает карточку через три позиции — один повторный заход в
      // рамках этой же партии, ровно как в веб-версии.
      queue = [..._queue];
      queue.insert(
        (_idx + vocabRetryOffset).clamp(0, queue.length),
        CardRef(id: card.id, base: card.base, target: card.target, isNew: card.isNew, lang: card.lang),
      );
      if (mounted) setState(() => _queue = queue);
    }

    _next?.cancel();
    _next = Timer(Duration(milliseconds: correct ? vocabNextDelayOkMs : vocabNextDelayWrongMs), () {
      if (!mounted) return;
      final next = _idx + 1;
      if (next >= queue.length) {
        _finish();
        return;
      }
      setState(() {
        _idx = next;
        _picked = null;
        _options = _optionsFor(queue[next], _pool);
        _shownAtMs = _now;
      });
    });
  }

  Future<void> _finish() async {
    _next?.cancel();
    // Подход доведён до конца — счётчик прохождений растёт. Это НЕ ступень
    // сложности: трудность здесь задаёт расписание повторов, а не мы.
    await _runs.win();
    await _refreshStats();
    if (mounted) setState(() => _phase = VocabPhase.result);
  }

  @override
  Widget build(BuildContext context) {
    if (_vocab == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return GameShell(
      title: L.t('vocabSrs'),
      onBack: () => Navigator.of(context).maybePop(),
      hud: _phase == VocabPhase.playing
          ? [
              HudItem(label: L.t('language'), value: '${_baseLang.toUpperCase()}·$_targetLang', icon: Icons.translate),
              HudItem(label: L.t('round'), value: '${_idx + 1}/${_queue.length}', icon: Icons.numbers),
              HudItem(label: L.t('hud_correct'), value: '$_correct', icon: Icons.check),
              HudItem(label: L.t('hud_errors'), value: '$_wrong', icon: Icons.close),
            ]
          : const [],
      field: (context, h) => switch (_phase) {
        VocabPhase.config => _Config(
            height: h,
            langs: _langs,
            targetLang: _targetLang,
            newLimit: _newLimit,
            direction: _direction,
            stats: _stats,
            runs: _runs.level,
            onLang: (l) {
              setState(() => _targetLang = l);
              _refreshStats();
            },
            onLimit: (n) => setState(() => _newLimit = n),
            onDirection: (d) => setState(() => _direction = d),
            onStart: _start,
          ),
        VocabPhase.playing => _Card(
            height: h,
            card: _queue[_idx],
            direction: _direction,
            targetLang: _targetLang,
          ),
        VocabPhase.result => _Result(
            height: h,
            correct: _correct,
            wrong: _wrong,
            stats: _stats,
            onAgain: () => setState(() => _phase = VocabPhase.config),
          ),
      },
      toolbar: _phase == VocabPhase.playing
          ? _Options(
              options: _options,
              picked: _picked,
              right: _direction == VocabDirection.recognize ? _queue[_idx].base : _queue[_idx].target,
              onPick: _pick,
            )
          : null,
    );
  }
}

/// Колода поверх общей памяти: та же запись, что пишет веб-сторона.
class SharedDeckStore implements DeckStore {
  SharedDeckStore(this.state);
  final SharedState state;

  @override
  Future<String?> read(String key) async => state.get(key);

  @override
  Future<void> write(String key, String value) => state.set(key, value);
}

class _Config extends StatelessWidget {
  const _Config({
    required this.height,
    required this.langs,
    required this.targetLang,
    required this.newLimit,
    required this.direction,
    required this.stats,
    required this.runs,
    required this.onLang,
    required this.onLimit,
    required this.onDirection,
    required this.onStart,
  });

  final double height;
  final List<String> langs;
  final String targetLang;
  final int newLimit;
  final VocabDirection direction;
  final SrsStats? stats;
  final int runs;
  final void Function(String) onLang;
  final void Function(int) onLimit;
  final void Function(VocabDirection) onDirection;
  final VoidCallback onStart;

  @override
  Widget build(BuildContext context) {
    final s = stats;
    return SizedBox(
      height: height,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        children: [
          Text(L.t('vocabSrs'), style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 4),
          Text(L.t('vocabSrsDesc'), style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 4),
          // Та же строка, что в веб-версии: выучено / к повтору / своих.
          Text(
            s == null
                ? '…'
                : '${L.t('srsLearnedLabel')}: ${s.learned}/${s.totalWords} · '
                    '${L.t('srsDueLabel')}: ${s.dueNow} · ${L.t('srsOwnLabel')}: ${s.customCount}',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 16),

          // 🔴 ВЫПАДАЮЩАЯ СТРОКА, А НЕ СЕТКА ИЗ ОДИННАДЦАТИ КНОПОК.
          // В веб-версии выбор языка нарисован сеткой: 11 кнопок, 277 px, из-за
          // неё экран настроек уходит на полтора экрана вниз (замер 17.09.2026,
          // задача a0ae517f). Переносить эту беду в Flutter незачем — здесь она
          // чинится одной строкой.
          Text(L.t('language')),
          const SizedBox(height: 6),
          DropdownButtonFormField<String>(
            key: const Key('vocab-lang'),
            initialValue: langs.contains(targetLang) ? targetLang : null,
            decoration: const InputDecoration(border: OutlineInputBorder(), isDense: true),
            items: [for (final l in langs) DropdownMenuItem(value: l, child: Text(l.toUpperCase()))],
            onChanged: (v) => v == null ? null : onLang(v),
          ),
          const SizedBox(height: 16),

          Text(L.t('srsNewPerSession')),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            children: [
              for (final n in vocabNewLimits)
                ChoiceChip(
                  key: Key('vocab-limit-$n'),
                  label: Text('$n'),
                  selected: newLimit == n,
                  onSelected: (_) => onLimit(n),
                ),
            ],
          ),
          const SizedBox(height: 16),

          Text(L.t('srsDirection')),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            children: [
              ChoiceChip(
                key: const Key('vocab-dir-recognize'),
                label: Text(L.t('srsRecognize')),
                selected: direction == VocabDirection.recognize,
                onSelected: (_) => onDirection(VocabDirection.recognize),
              ),
              ChoiceChip(
                key: const Key('vocab-dir-recall'),
                label: Text(L.t('srsRecall')),
                selected: direction == VocabDirection.recall,
                onSelected: (_) => onDirection(VocabDirection.recall),
              ),
            ],
          ),
          const SizedBox(height: 24),
          FilledButton(
            key: const Key('vocab-start'),
            onPressed: onStart,
            child: Text(L.t('start')),
          ),
        ],
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.height, required this.card, required this.direction, required this.targetLang});

  final double height;
  final CardRef card;
  final VocabDirection direction;
  final String targetLang;

  @override
  Widget build(BuildContext context) {
    // Узнавание: показываем изучаемое слово, спрашиваем родное. Припоминание — наоборот.
    final shown = direction == VocabDirection.recognize ? card.target : card.base;
    // Подпись задания — та же, что в веб-версии, обоим направлениям (`vocabSrsHint`).
    final hint = L.t('vocabSrsHint');
    return SizedBox(
      height: height,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (card.isNew)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Chip(label: Text(L.t('srsNew')), visualDensity: VisualDensity.compact),
                ),
              Text(
                shown,
                key: const Key('vocab-word'),
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 38, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 12),
              Text(hint, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        ),
      ),
    );
  }
}

class _Result extends StatelessWidget {
  const _Result({
    required this.height,
    required this.correct,
    required this.wrong,
    required this.stats,
    required this.onAgain,
  });

  final double height;
  final int correct;
  final int wrong;
  final SrsStats? stats;
  final VoidCallback onAgain;

  @override
  Widget build(BuildContext context) {
    final s = stats;
    return SizedBox(
      height: height,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                correct + wrong == 0 ? L.t('srsAllDone') : L.t('resultsTitle'),
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              if (correct + wrong > 0)
                Text('${L.t('hud_correct')}: $correct · ${L.t('hud_errors')}: $wrong'),
              if (s != null) ...[
                const SizedBox(height: 4),
                Text('${L.t('srsLearnedLabel')}: ${s.learned}/${s.totalWords}',
                    style: Theme.of(context).textTheme.bodySmall),
                Text(
                  // Прочерк честнее нуля: ноль читался бы как «повторять прямо сейчас».
                  '${L.t('srsNextDue')}: ${s.nextDueAt == null ? '—' : _when(s.nextDueAt!)}',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
              const SizedBox(height: 20),
              FilledButton(key: const Key('vocab-again'), onPressed: onAgain, child: Text(L.t('retry'))),
            ],
          ),
        ),
      ),
    );
  }

  static String _when(int ms) {
    final d = DateTime.fromMillisecondsSinceEpoch(ms);
    return '${d.day.toString().padLeft(2, '0')}.${d.month.toString().padLeft(2, '0')}';
  }
}

class _Options extends StatelessWidget {
  const _Options({required this.options, required this.picked, required this.right, required this.onPick});

  final List<String> options;
  final String? picked;
  final String right;
  final void Function(String) onPick;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final o in options)
            SizedBox(
              // Две колонки на любой ширине: считаем от ширины САМОЙ полосы, а не
              // от окна, — иначе на узком экране колонка уезжает за край (ровно
              // та беда, с которой пришёл отчёт e0ad9f91 на веб-версии).
              width: (MediaQuery.sizeOf(context).width - 24 - 8) / 2,
              height: 56,
              child: FilledButton(
                key: Key('vocab-option-$o'),
                onPressed: picked == null ? () => onPick(o) : null,
                style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  backgroundColor: picked == null
                      ? null
                      : o == right
                          ? const Color(0xFF22C55E)
                          : o == picked
                              ? const Color(0xFFEF4444)
                              : scheme.surfaceContainerHighest,
                ),
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Text(o, maxLines: 2, textAlign: TextAlign.center),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
