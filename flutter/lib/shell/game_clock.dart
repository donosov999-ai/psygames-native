/// ИГРОВЫЕ ЧАСЫ И ТАЙМЕРЫ ПАРТИИ, КОТОРЫЕ СТОЯТ НА ПАУЗЕ — перенос веб-модуля
/// `frontend/src/services/gamePause.ts` (задача 430d1299, 30.09.2026).
///
/// 🔴 ЗАЧЕМ. Во Flutter пауза каркаса и разбор по шагам — СТРАНИЦЫ поверх игры, а игра
/// под ними живёт дальше: её `Timer` тикает, `DateTime.now()` идёт. Замер 30.09.2026 по
/// main: 64 нативные игры из 74 держат время на `Timer`/`DateTime.now`, и лишь одна
/// («Навигатор») проверяет, на экране ли она. Следствия, найденные разделами: показ пар
/// в «Парах слов» таял, пока человек читал паузу; время реакции включало паузу.
/// В вебе ровно это правило живёт в одном месте, и гейт `game-clock-discipline` запрещает
/// экранам настенные часы. Здесь — то же место для Flutter.
///
/// КАК ПОЛЬЗОВАТЬСЯ (построчная замена, форма та же, что у веба):
///     DateTime.now()                        →  gameNow()           (длительности партии)
///     Timer(d, fn)                          →  gameTimeout(d, fn)
///     Timer.periodic(d, (_) => fn())        →  gameInterval(d, fn)
///     t.cancel()                            →  t.cancel()          (у GameTimer тот же)
/// Для анимаций интерфейса (вспышка ответа, тряска) это не нужно — только для того, что
/// меняет партию: смена пробы, окно ответа, обратный отсчёт, замер времени.
///
/// КТО ДЕРЖИТ ПАУЗУ. Каркас сам: меню паузы (`GameShell._pause`), экран разбора
/// (`LessonPlayerScreen`) и уход приложения в фон (`installGameClockLifecycle`). Игре
/// звать `holdGame()` незачем — только если она открывает свой лист поверх партии.
library;

import 'dart:async';

import 'package:flutter/widgets.dart';

/// Источник настенного времени в мс. Меняют ТОЛЬКО пробы: у `testWidgets` время поддельное,
/// и часы партии обязаны идти вместе с ним, а не с настоящими часами машины.
@visibleForTesting
int Function() gameWallMs = () => DateTime.now().millisecondsSinceEpoch;

typedef GameHoldListener = void Function(bool held);

int _depth = 0;
int _pausedTotal = 0;
int? _pausedAt;
final _listeners = <GameHoldListener>{};

void _emit() {
  final held = _depth > 0;
  // Учёт простоя — здесь, а не в подписчиках: часы обязаны замереть, даже если ни одна
  // игра сейчас не открыта, иначе после возврата накопленная пауза потеряется (как в вебе).
  final now = gameWallMs();
  if (held) {
    _pausedAt ??= now;
  } else if (_pausedAt != null) {
    _pausedTotal += now - _pausedAt!;
    _pausedAt = null;
  }
  for (final l in _listeners.toList()) {
    try {
      l(held);
    } catch (_) {
      // Слушатель умер — остальным всё равно надо узнать о паузе.
    }
  }
}

/// Игра замирает. Возвращает функцию снятия — вызывать ровно один раз (повтор ничего не делает).
///
/// СЧЁТЧИК, А НЕ ФЛАГ: поверх паузы может открыться ещё что-то (правила из паузы, отзыв).
/// Часы идут снова, только когда снят последний.
VoidCallback holdGame() {
  _depth += 1;
  if (_depth == 1) _emit();
  var released = false;
  return () {
    if (released) return;
    released = true;
    _depth = _depth > 0 ? _depth - 1 : 0;
    if (_depth == 0) _emit();
  };
}

/// Идёт ли сейчас пауза.
bool isGameHeld() => _depth > 0;

/// Подписка на паузу. Возвращает отписку.
VoidCallback onGameHold(GameHoldListener l) {
  _listeners.add(l);
  return () => _listeners.remove(l);
}

/// ИГРОВЫЕ ЧАСЫ, мс: то же настенное время, но во время паузы они стоят.
///
/// ⚠️ ОБА КОНЦА ЗАМЕРА — НА ОДНИХ ЧАСАХ. `gameNow() - старт_по_DateTime` смешивает шкалы
/// и после первой же паузы даёт ерунду. Часы монотонные: назад не идут, лишь стоят.
/// Одно чтение настенных часов на вызов: два чтения сдвигали веб-часы на 1 мс под нагрузкой.
int gameNow() {
  final now = gameWallMs();
  final held = _pausedTotal + (_pausedAt != null ? now - _pausedAt! : 0);
  return now - held;
}

/// Сколько всего простояли на паузе, мс — для отладки и проб.
int heldTotalMs() => _pausedTotal + (_pausedAt != null ? gameWallMs() - _pausedAt! : 0);

/// Таймер партии. `cancel()` — как у `Timer`; повторный вызов ничего не делает.
class GameTimer {
  GameTimer._(Duration period, this._fn, this._repeat)
      : _period = period.isNegative ? 0 : period.inMilliseconds {
    _due = gameNow() + _period;
    _off = onGameHold((held) => held ? _disarm() : _arm());
    _arm();
  }

  final int _period;
  final VoidCallback _fn;
  final bool _repeat;
  late int _due;
  Timer? _timer;
  VoidCallback? _off;
  bool _done = false;

  /// Снят ли таймер (сработал однократный или позвали `cancel`).
  bool get isActive => !_done;

  void _disarm() {
    _timer?.cancel();
    _timer = null;
  }

  void _arm() {
    _disarm();
    if (_done || isGameHeld()) return;
    final wait = _due - gameNow();
    _timer = Timer(Duration(milliseconds: wait > 0 ? wait : 0), _fire);
  }

  void _fire() {
    _timer = null;
    if (_done || isGameHeld()) return;
    // Сработал раньше срока по игровым часам (пауза пришлась между постановкой и
    // срабатыванием) — не стреляем, ждём остаток.
    if (gameNow() < _due) {
      _arm();
      return;
    }
    if (_repeat) {
      // Сетка тиков — от срока, а не от момента срабатывания: медленный кадр не сдвигает её.
      _due += _period > 0 ? _period : 1;
      _arm();
    } else {
      cancel();
    }
    _fn();
  }

  void cancel() {
    if (_done) return;
    _done = true;
    _disarm();
    _off?.call();
    _off = null;
  }
}

/// Как `Timer(d, fn)`, но на паузе стоит и после неё дожидается остатка.
GameTimer gameTimeout(Duration d, VoidCallback fn) => GameTimer._(d, fn, false);

/// Как `Timer.periodic`, но на паузе стоит.
GameTimer gameInterval(Duration d, VoidCallback fn) => GameTimer._(d, fn, true);

/// Держать паузу, пока экран виден: для страниц ПОВЕРХ игры (пауза, разбор, свой лист).
/// Удержание ставится при вставке в дерево и снимается при уходе из него.
class GameHoldScope extends StatefulWidget {
  const GameHoldScope({super.key, required this.child});
  final Widget child;

  @override
  State<GameHoldScope> createState() => _GameHoldScopeState();
}

class _GameHoldScopeState extends State<GameHoldScope> {
  // ⚠️ НЕ `late final … = holdGame()`: такое поле вычисляется лениво, при первом чтении,
  // то есть только в dispose — пауза не держала бы часы вовсе (поймала проба 30.09).
  VoidCallback? _release;

  @override
  void initState() {
    super.initState();
    _release = holdGame();
  }

  @override
  void dispose() {
    _release?.call();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

AppLifecycleListener? _lifecycle;
VoidCallback? _backgroundRelease;

/// Приложение ушло в фон — часы партии стоят (веб: вкладка скрыта). Ставит каркас один раз
/// при старте; повторный вызов ничего не делает.
void installGameClockLifecycle() {
  if (_lifecycle != null) return;
  _lifecycle = AppLifecycleListener(onStateChange: (s) {
    final away = s == AppLifecycleState.hidden || s == AppLifecycleState.paused;
    if (away && _backgroundRelease == null) {
      _backgroundRelease = holdGame();
    } else if (!away && s == AppLifecycleState.resumed && _backgroundRelease != null) {
      _backgroundRelease!();
      _backgroundRelease = null;
    }
  });
}

/// Сброс часов — только для проб: в приложении не звать.
@visibleForTesting
void resetGameClock() {
  _depth = 0;
  _pausedTotal = 0;
  _pausedAt = null;
  _listeners.clear();
  _backgroundRelease = null;
}
