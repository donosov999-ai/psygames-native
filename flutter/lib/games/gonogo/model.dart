import 'dart:math';

/// «Жми и держись» (проба go/no-go) — четвёртая игра раздела «Конфликт внимания»
/// на Flutter.
///
/// Правила перенесены из `frontend/app/games/go-no-go.tsx`. Эталон выгружен
/// прогоном живого TS в `test/fixtures/gonogo-reference.json`.
///
/// 🔴 ДОЛЯ ЗАПРЕТНЫХ ПРОБ ЗАМОРОЖЕНА И ОСЬЮ СЛОЖНОСТИ НЕ ЯВЛЯЕТСЯ. Мера пробы —
/// ошибки торможения (нажатия на no-go), и рост доли запретных их просто ДОБАВЛЯЕТ,
/// не делая задачу труднее: чем чаще запрет, тем слабее преобладающая реакция,
/// которую проба и должна ловить. Сложность растёт окном ответа, темпом подачи и
/// объёмом партии.
enum GoNoGoStim { go, nogo }

/// Доля запретных проб. Канон: 25 % (в ходу 80/20 и 75/25; взята верхняя ради
/// числа запретных проб на короткой партии — 6 из 24 на L1 против 4,8).
const double nogoProb = 0.25;

/// Потолок лестницы: на нём три формулы упираются в свои полы РАЗОМ
/// (окно 550 мс, пауза 280 мс, разброс паузы 180 мс).
const int gonogoMaxLevel = 15;

/// 🔴 ЧТО ДЕЛАТЬ СО СТИМУЛОМ — ОДНА ФУНКЦИЯ НА ИГРУ И НА РАЗБОР.
///
/// Правило в одну строку: на GO нажимаем, на NO-GO держимся. Партия считает по
/// нему (`respond` и `closeTrial`), разбор показывает его же.
bool gonogoShouldPress(GoNoGoStim s) => s == GoNoGoStim.go;

/// Стимул пробы. ⚠️ Сравнение строгое: розыгрыш ровно 0,25 даёт GO — строка есть
/// в эталоне, и нестрогое сравнение покраснит перенос.
GoNoGoStim pickStim(double Function() rnd) => rnd() < nogoProb ? GoNoGoStim.nogo : GoNoGoStim.go;

/// Что задаёт уровень: объём, окно ответа и темп подачи.
class GoNoGoLevel {
  const GoNoGoLevel({
    required this.trials,
    required this.windowMs,
    required this.itiMinMs,
    required this.itiJitterMs,
  });

  /// Проб в партии: 24 → 32 → 40.
  final int trials;

  /// Окно ответа, мс: 1100 на L1 → 550 на L15.
  final int windowMs;

  /// Наименьшая межпробная пауза, мс: 600 → 280.
  final int itiMinMs;

  /// Разброс паузы, мс: 400 → 180.
  final int itiJitterMs;

  static GoNoGoLevel of(int level) {
    final l = level;
    return GoNoGoLevel(
      trials: l <= 5 ? 24 : (l <= 10 ? 32 : 40),
      windowMs: max(550, 1100 - (l - 1) * 40),
      itiMinMs: max(280, 600 - (l - 1) * 24),
      itiJitterMs: max(180, 400 - (l - 1) * 16),
    );
  }
}

/// Исход пробы для экрана: попадание, ложная тревога, пропуск, верное удержание.
enum GoNoGoOutcome { hit, falseAlarm, miss, correctRejection }

/// Партия: раздаёт пробы, держит окно ответа и считает ЧЕТЫРЕ исхода.
///
/// 🔴 ЧЕТЫРЕ, А НЕ ДВА. «Верно/неверно» здесь недостаточно: пропуск цели (miss) и
/// нажатие на запрет (ложная тревога) — разные механизмы, и в записи партии они
/// лежат раздельно. Точность считается по всем четырём.
///
/// ⚠️ Часы передаются снаружи (`nowMs`): проба играет партию на поддельных часах.
class GoNoGoGame {
  GoNoGoGame({required this.level, Random? rnd, int Function()? nowMs, int? trialsOverride})
      : params = GoNoGoLevel.of(level),
        _rnd = rnd ?? Random(),
        _now = nowMs ?? (() => DateTime.now().millisecondsSinceEpoch),
        trialsTotal = trialsOverride ?? GoNoGoLevel.of(level).trials;

  final int level;
  final GoNoGoLevel params;
  final int trialsTotal;
  final Random _rnd;
  final int Function() _now;

  int round = 0;
  int hits = 0;
  int misses = 0;
  int falseAlarms = 0;
  int correctRejections = 0;
  final List<int> rts = [];

  GoNoGoStim? stimulus;

  /// Межпробная пауза после текущей пробы, мс.
  int itiMs = 600;
  bool _answered = true;
  int _stimAt = 0;
  int _startedAt = 0;

  double _next() => _rnd.nextDouble();

  bool get finished => round >= trialsTotal && _answered;

  void begin() => _startedAt = _now();

  /// Следующая проба. Очередь случайных: стимул — при показе, пауза — при закрытии
  /// пробы, как в веб-версии (там `Math.random()` для паузы вызывается в конце окна).
  bool nextTrial() {
    if (round >= trialsTotal) return false;
    round += 1;
    stimulus = pickStim(_next);
    _answered = false;
    _stimAt = _now();
    return true;
  }

  /// Нажатие человека.
  GoNoGoOutcome? respond() {
    final s = stimulus;
    if (s == null || _answered) return null;
    _answered = true;
    final rt = _now() - _stimAt;
    if (s == GoNoGoStim.go) {
      hits += 1;
      rts.add(rt);
      return GoNoGoOutcome.hit;
    }
    falseAlarms += 1;
    return GoNoGoOutcome.falseAlarm;
  }

  /// Окно вышло без нажатия: на GO это пропуск, на NO-GO — верное удержание.
  GoNoGoOutcome closeTrial() {
    final s = stimulus;
    GoNoGoOutcome outcome;
    if (_answered) {
      outcome = s == GoNoGoStim.go ? GoNoGoOutcome.hit : GoNoGoOutcome.falseAlarm;
    } else {
      _answered = true;
      if (s == GoNoGoStim.go) {
        misses += 1;
        outcome = GoNoGoOutcome.miss;
      } else {
        correctRejections += 1;
        outcome = GoNoGoOutcome.correctRejection;
      }
    }
    stimulus = null;
    itiMs = params.itiMinMs + (_next() * params.itiJitterMs).floor();
    return outcome;
  }

  int get total => hits + misses + falseAlarms + correctRejections;

  /// Точность по ВСЕМ пробам: верное нажатие и верное удержание — оба верны.
  double get accuracy => total == 0 ? 0 : (hits + correctRejections) / total;

  /// Среднее время реакции по нажатиям на GO. Пусто, когда их не было.
  int? get meanRtMs {
    if (rts.isEmpty) return null;
    return (rts.reduce((a, b) => a + b) / rts.length).round();
  }

  /// Очки — формулой веб-версии: попадание +10, ложная тревога −10.
  /// ⚠️ Пропуск очков не отнимает, и это не упущение: партия и так теряет его +10.
  int get score => hits * 10 - falseAlarms * 10;

  double get elapsedSeconds => (_now() - _startedAt) / 1000.0;
}
