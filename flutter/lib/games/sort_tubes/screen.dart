import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;

import '../../shell/aux_action.dart';
import '../../shell/game_shell.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'board.dart';
import 'model.dart';

/// ЭКРАН ДВИЖКА СОСУДОВ: «Переливалка», «Шарики», «Гайки».
///
/// 🔴 ОДИН ЭКРАН НА ТРИ ИГРЫ, КАК В ВЕБЕ. Различаются ключ лестницы, шкурка и
/// заголовок — всё остальное общее. Копии здесь быть не должно: три копии
/// шестисотстрочного экрана разъехались бы за неделю (в проекте это уже
/// случилось с двумя экранами судоку).
///
/// ⚠️ РЕШАТЕЛЬ И ГЕНЕРАТОР НЕ ПЕРЕНОСИЛИСЬ: уровни розданы живым TS и лежат в
/// `assets/levels/sort_tubes.json`. Поэтому нет подсказки — она в вебе считается
/// поиском по полю.
class SortTubesScreen extends StatefulWidget {
  const SortTubesScreen({
    super.key,
    required this.state,
    required this.gameId,
    required this.title,
    required this.skin,
  });

  final SharedState state;

  /// Ключ лестницы — ТОТ ЖЕ, что в вебе (`usePersistentLevel`): прогресс общий.
  final String gameId;
  final String title;
  final TubeSkin skin;

  @override
  State<SortTubesScreen> createState() => _SortTubesScreenState();
}

/// Снимок партии для отмены. Храним ПОЛОЖЕНИЯ, а не ходы: перелив меняет два
/// сосуда разом, а отъезд собранного — ещё и их номера; откатывать это обратной
/// операцией дороже и рискованнее, чем вернуть снимок.
class _Snapshot {
  const _Snapshot(this.field, this.hidden, this.moves, this.errors);
  final TubeField field;
  final Set<int> hidden;
  final int moves;
  final int errors;
}

class _SortTubesScreenState extends State<SortTubesScreen> {
  /// 🔴 СЛЕДУЮЩИЙ УРОВЕНЬ ЕДЕТ САМ (Денис 24.09.2026: «не переходит на
  /// следующий уровень сам»).
  ///
  /// Итог со звёздами показывается 1,4 секунды — столько, чтобы человек увидел
  /// оценку, — и партия продолжается. Кнопка остаётся для тех, кто не ждёт.
  ///
  /// ⚠️ Таймер гасится при уходе с экрана, отмене хода и «начать заново»:
  /// открытый таймер после размонтирования валит весь прогон проб молча.
  Timer? _autoNext;

  void _scheduleNext() {
    _autoNext?.cancel();
    _autoNext = Timer(const Duration(milliseconds: 1400), () {
      if (mounted && _won) _next();
    });
  }

  void _cancelNext() {
    _autoNext?.cancel();
    _autoNext = null;
  }

  TubeLevelSet? _set;
  List<PieceColor> _palette = const [];
  late LevelLadder _ladder;

  TubeLevel? _level;
  TubeField? _field;
  Set<int> _hidden = {};
  int? _sel;
  int _moves = 0;
  int _errors = 0;
  bool _won = false;
  String? _refusal;
  Timer? _refusalTimer;
  final List<_Snapshot> _history = [];

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: widget.gameId, store: SharedLevelStore(widget.state));
    _boot();
  }

  @override
  void dispose() {
    _cancelNext();
    // ⚠️ Открытый таймер после ухода с экрана валит весь прогон проб молча —
    // записано в памяти раздела отдельным уроком.
    _refusalTimer?.cancel();
    super.dispose();
  }

  Future<void> _boot() async {
    final raw = await rootBundle.loadString('assets/levels/sort_tubes.json');
    await _ladder.load();
    if (!mounted) return;
    final j = jsonDecode(raw) as Map<String, dynamic>;
    setState(() {
      _palette = (j['palette'] as List)
          .map((e) => PieceColor.fromJson(e as Map<String, dynamic>))
          .toList();
      _set = TubeLevelSet.fromJsonString(raw);
      _start(_set!.byLevel(_ladder.level));
    });
  }

  void _start(TubeLevel level) {
    _level = level;
    _field = level.freshField();
    _hidden = {...level.hidden};
    _sel = null;
    _moves = 0;
    _errors = 0;
    _won = false;
    _refusal = null;
    _history.clear();
  }

  /// «Заново» возвращает ТУ ЖЕ доску, а не раздаёт новую.
  ///
  /// 📍 Отчёт Дениса 05.09.2026 голосом: «чтобы она не перемешивалась, а
  /// просто… заново». Головоломку перезапускают, когда зашли в тупик и хотят
  /// пройти ЭТУ доску иначе; новый расклад лишает такой возможности вовсе.
  void _restart() {
    _cancelNext();
    setState(() => _start(_level!));
  }

  Future<void> _next() async {
    await _ladder.win();
    if (!mounted) return;
    setState(() => _start(_set!.byLevel(_ladder.level)));
  }

  void _showRefusal(String? reason) {
    if (reason == null) return;
    _refusalTimer?.cancel();
    setState(() => _refusal = reason);
    _refusalTimer = Timer(const Duration(milliseconds: 1800), () {
      if (mounted) setState(() => _refusal = null);
    });
  }

  void _tap(int i) {
    if (_won) return;
    final field = _field!;
    setState(() {
      if (_sel == null) {
        if (field.tubes[i].isEmpty || !field.isOpen(i)) {
          _showRefusal(field.isOpen(i) ? 'пусто' : 'закрыт');
          return;
        }
        _sel = i;
        return;
      }
      if (_sel == i) {
        _sel = null;
        return;
      }
      final from = _sel!;
      _sel = null;
      _pour(from, i);
    });
  }

  /// Ход: перелив, затем отъезд собранного.
  ///
  /// ⚠️ ОТКАЗ НАЗЫВАЕТ ПРИЧИНУ, А НЕ МОЛЧИТ. Отчёт тестировщицы (44e6cd21): «не
  /// могу со второго шурупа снять гайки, никуда не хотят сходить, и так и сяк
  /// кликаю» — ход был запрещён правилами, а игра только снимала выбор.
  void _pour(int from, int to) {
    final field = _field!;
    final after = pour(field, from, to);
    if (after == null) {
      _errors += 1;
      _showRefusal(refusalReason(field, from, to));
      return;
    }
    _history.add(_Snapshot(field.copyWith(), {..._hidden}, _moves, _errors));
    _moves += 1;
    // Отъезд собранного живёт в игровом слое, а не внутри хода: собранный сосуд
    // инертен, и решателю его моделировать незачем (разбор в `pour`).
    final sealed = sealDone(after);
    _field = sealed.field;
    if (sealed.sealed > 0) _hidden = _shiftHidden(_hidden, after, sealed.field);
    _refusal = null;
    if (_field!.isSolved) {
      _won = true;
      _scheduleNext();
    }
  }

  /// Ключи скрытых слоёв после отъезда: номера сосудов СЪЕЗЖАЮТ.
  ///
  /// ⚠️ Ключ это `сосуд * 100 + глубина`. Увезли сосуд — у всех правее номер
  /// уменьшился на единицу, и невредимый ключ стал бы указывать на чужой слой.
  Set<int> _shiftHidden(Set<int> keys, TubeField before, TubeField after) {
    final drop = <int>[];
    for (var i = 0; i < before.length; i += 1) {
      if (before.tubes[i].isNotEmpty && before.isDone(i)) drop.add(i);
    }
    final out = <int>{};
    for (final key in keys) {
      final tube = key ~/ 100;
      final depth = key % 100;
      if (drop.contains(tube)) continue;   // сосуд уехал вместе со своей скрытостью
      var shifted = tube;
      for (final d in drop) {
        if (d < tube) shifted -= 1;
      }
      if (shifted < after.length) out.add(layerKey(shifted, depth));
    }
    return out;
  }

  void _undo() {
    _cancelNext();
    if (_history.isEmpty) return;
    final s = _history.removeLast();
    setState(() {
      _field = s.field;
      _hidden = s.hidden;
      _moves = s.moves;
      _errors = s.errors;
      _sel = null;
      _won = false;
      _refusal = null;
    });
  }

  /// Высота строки причины. Постоянная: см. разбор в `field`.
  static const double _captionH = 26;

  static const Map<String, String> _refusalText = {
    'полон': 'Сосуд полон — места нет',
    'другойЦвет': 'Наверху другой цвет',
    'безТолку': 'Толку нет: то же содержимое в другой посуде',
    'закрыт': 'Сосуд ещё закрыт — соберите цвет',
    'пусто': 'Сосуд пуст — брать нечего',
  };

  @override
  Widget build(BuildContext context) {
    final level = _level;
    final field = _field;
    if (level == null || field == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final collected = field.doneCount();
    final stars = starsFor(_moves, level.reference, level.level);

    return GameShell(
      title: widget.title,
      /*
       * 🔴 ВЫХОД ОТДЕЛЬНОЙ КНОПКОЙ, А НЕ ТОЛЬКО ЧЕРЕЗ ПАУЗУ.
       *
       * 📍 Денис 24.09.2026 на живой сборке: «выход через кнопку пауза».
       * Замер по коду: `GameShell` рисует «Назад» только если экран передал
       * `onBack`, а его не передавал НИ ОДИН из четырнадцати перенесённых
       * экранов — ни мои девять, ни чужие пять. То есть уйти из игры можно было
       * единственным способом: пауза → «Продолжить»… которого там нет.
       */
      onBack: () => Navigator.of(context).maybePop(),
      hud: [
        HudItem(label: 'Уровень', value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(
          label: 'Ходы',
          value: level.moveLimit > 0 ? '$_moves/${level.moveLimit}' : '$_moves',
          icon: Icons.swap_horiz,
        ),
        HudItem(label: 'Собрано', value: '$collected/${level.colors}', icon: Icons.task_alt),
      ],
      field: (context, h) => Column(
        children: [
          /*
           * 🔴 ПРИЧИНА ОТКАЗА ВИДНА ГЛАЗАМИ, А НЕ ТОЛЬКО СКРИНРИДЕРУ. Первая
           * редакция клала её в подпись служебной кнопки — а та рисуется
           * подсказкой при наведении, то есть на телефоне НЕ ВИДНА ВООБЩЕ. Это
           * ровно тот дефект, ради которого отказ и заводился: «не могу снять
           * гайки, и так и сяк кликаю».
           *
           * ⚠️ СТРОКА ДЕРЖИТ ПОСТОЯННУЮ ВЫСОТУ и ВЫЧИТАЕТСЯ ИЗ ПОЛЯ. Подмени
           * текст в лоб — и доска дёргалась бы на каждом отказе; не вычти —
           * сосуды вылезли бы за поле, которое дал каркас.
           */
          SizedBox(
            height: _captionH,
            child: Center(
              child: Text(
                _refusal == null
                    ? (level.hiddenLevel
                        ? 'Скрытый слой: «?» узнаётся ходом'
                        : 'Собери цвет в один сосуд')
                    : _refusalText[_refusal] ?? 'Так нельзя',
                key: const ValueKey('tubes-caption'),
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: _refusal == null ? FontWeight.w400 : FontWeight.w700,
                  color: _refusal == null ? const Color(0xFF8A8F98) : const Color(0xFFD9534F),
                ),
              ),
            ),
          ),
          Expanded(
            child: TubesField(
              field: field,
              fieldHeight: h - _captionH,
              skin: widget.skin,
              palette: _palette,
              hidden: _hidden,
              selected: _sel,
              onTapTube: _tap,
              onPourTo: (from, to) => setState(() {
                _sel = null;
                _pour(from, to);
              }),
            ),
          ),
        ],
      ),
      auxRow: AuxBar(children: [
        AuxAction(icon: Icons.undo, label: 'Отменить', onPressed: _history.isEmpty ? null : _undo),
        AuxAction(icon: Icons.refresh, label: 'Начать заново', onPressed: _restart),
      ]),
      toolbar: _won
          ? Padding(
              padding: const EdgeInsets.all(12),
              child: FilledButton.icon(
                onPressed: _next,
                icon: const Icon(Icons.arrow_forward),
                label: Text('Уровень взят · $stars★ — дальше'),
              ),
            )
          : null,
      pauseActions: [
        PauseAction(label: 'Начать заново', icon: Icons.refresh, onPressed: _restart),
        if (_history.isNotEmpty) PauseAction(label: 'Отменить ход', icon: Icons.undo, onPressed: _undo),
      ],
    );
  }
}
