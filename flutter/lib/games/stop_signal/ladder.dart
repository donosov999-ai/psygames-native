/// ЛЕСТНИЦА ЗАДЕРЖКИ И ОСИ УРОВНЯ — ДВЕ РАЗНЫЕ РУЧКИ, И ИХ НЕЛЬЗЯ ПУТАТЬ.
///
/// Перенесено из `frontend/src/games/stop-signal/core/{ladder,persist}.ts`.
///
/// 🔴 ГЛАВНОЕ ПРАВИЛО: ЗАДЕРЖКА ПРИНАДЛЕЖИТ ЛЕСТНИЦЕ, А НЕ УРОВНЮ. Когда
/// задержку назначал номер уровня, быстрый игрок тормозил успешно в одной пробе
/// из десяти, медленный — в девяти: у двух людей мерка была разная. Поэтому
/// параметры уровня про задержку не знают ничего, а её двигает `nextSsd` по
/// результату каждой стоп-пробы.
library;

import 'dart:convert';
import 'dart:math';

import 'ssrt.dart';

/// С чего начинается лестница у нового игрока. Руководство советует 300 мс;
/// взято 250, потому что окно ответа здесь короче лабораторного. Точка старта на
/// итог не влияет — лестница сходится туда же, — но влияет на число проб до схода.
const int ssdStartMs = 250;

/// Шаг 50 мс — канон. Мельче лестница не успевает сойтись за партию, крупнее —
/// теряет разрешение и скачет вокруг точки схождения.
const int ssdStepMs = 50;
const int ssdMinMs = 50;
const int ssdMaxMs = 700;

/// Доля стоп-проб. Константа, уровнем НЕ крутится: мера прохода — SSRT, а он
/// считается ИЗ доли, и поднять её значит сдвинуть саму измеряемую величину.
const double stopProb = 0.25;

/// Потолок лестницы уровней.
const int stopSignalMaxLevel = 15;

/// Сколько проб храним для замера. Лестница и пробы ПЕРЕЖИВАЮТ партию: за
/// три-пять стоп-проб одного захода лестница не доходит до точки схождения.
const int poolMaxTrials = 160;

/// Ключ хранилища — ТОТ ЖЕ, что у веб-версии: половины приложения делят одну
/// лестницу, иначе у человека их станет две с разными точками схождения.
const String ladderKey = 'psygames_stop_signal_ladder';

int clampSsd(num ms) => min(ssdMaxMs, max(ssdMinMs, ms.round()));

/// ОДИН ВВЕРХ / ОДИН ВНИЗ.
///
/// Удержался — задержка растёт, тормозить станет труднее. Сорвался — падает.
/// Такая лестница по построению сходится к доле удавшихся торможений ≈ 0,5 у
/// ЛЮБОГО игрока, и только из этой точки SSRT имеет смысл.
///
/// ⚠️ ШАГ ВНИЗ ДЕЛАЕТСЯ НА ЛЮБОМ ОТВЕТЕ В СТОП-ПРОБЕ, включая нажатие ДО показа
/// сигнала: иначе преждевременные нажатия тихо подтягивали бы лестницу вверх.
int nextSsd(int currentMs, bool inhibited) =>
    clampSsd(currentMs + (inhibited ? ssdStepMs : -ssdStepMs));

/// Параметры уровня. 🔴 НИ ОДНОГО ПОЛЯ ПРО ЗАДЕРЖКУ.
class StopSignalLevel {
  const StopSignalLevel({
    required this.trials,
    required this.stopProbability,
    required this.goWindowMs,
    required this.fixMinMs,
    required this.fixJitterMs,
    required this.interTrialMs,
  });

  final int trials;
  final double stopProbability;

  /// Окно ответа на GO. Ось сложности №1: 1400 → 700.
  final int goWindowMs;

  /// Минимальная пауза перед GO. Ось №2 (темп): 700 → 350.
  final int fixMinMs;

  /// Разброс паузы поверх минимума — чтобы момент GO нельзя было выучить: 700 → 280.
  final int fixJitterMs;

  /// Пауза после обратной связи до следующей пробы. Ось №3: 600 → 320.
  final int interTrialMs;

  static StopSignalLevel of(int level) {
    final step = max(0, min(14, level.round() - 1));
    return StopSignalLevel(
      trials: level <= 5 ? 12 : (level <= 10 ? 16 : 20),
      stopProbability: stopProb,
      goWindowMs: 1400 - step * 50,
      fixMinMs: 700 - step * 25,
      fixJitterMs: 700 - step * 30,
      interTrialMs: 600 - step * 20,
    );
  }
}

/// Состояние лестницы, переживающее партию.
class LadderState {
  const LadderState({required this.ssdMs, required this.trials});
  final int ssdMs;
  final List<StopSignalTrial> trials;
}

const LadderState emptyLadder = LadderState(ssdMs: ssdStartMs, trials: []);

/// Добавить пробы партии к накопленному окну, отрезав всё, что вышло за потолок.
List<StopSignalTrial> appendTrials(List<StopSignalTrial> pool, List<StopSignalTrial> run) {
  final merged = [...pool, ...run];
  return merged.length > poolMaxTrials
      ? merged.sublist(merged.length - poolMaxTrials)
      : merged;
}

/// Сколько стоп-проб в окне. Экран показывает это число, пока их не хватает на замер.
int countStopTrials(List<StopSignalTrial> pool) => pool.where((t) => t.isStop).length;

StopSignalTrial? _parseTrial(dynamic raw) {
  if (raw is! Map) return null;
  final win = raw['goWindowMs'];
  final window = win is num ? win.toDouble() : double.nan;
  if (!window.isFinite || window <= 0) return null;
  final rt = raw['rtMs'];
  final ssd = raw['ssdMs'];
  return StopSignalTrial(
    isStop: raw['isStop'] == true,
    ssdMs: ssd is num && ssd.isFinite ? ssd.round() : null,
    rtMs: rt is num && rt.isFinite ? rt.round() : null,
    goWindowMs: window.round(),
  );
}

/// Разбор сохранённого. ⚠️ Любая неожиданность — ПУСТАЯ лестница, без исключений
/// наружу: мусор в хранилище (обрывок JSON, чужая версия формата, отрицательная
/// задержка) не имеет права уронить экран посреди партии.
LadderState parseLadder(String? raw) {
  if (raw == null || raw.isEmpty) return emptyLadder;
  try {
    final data = jsonDecode(raw);
    if (data is! Map) return emptyLadder;
    final ssd = data['ssdMs'];
    final trials = <StopSignalTrial>[];
    final list = data['trials'];
    if (list is List) {
      for (final item in list) {
        final t = _parseTrial(item);
        if (t != null) trials.add(t);
      }
    }
    final clamped = ssd is num && ssd.isFinite ? clampSsd(ssd) : ssdStartMs;
    return LadderState(
      ssdMs: clamped,
      trials: trials.length > poolMaxTrials
          ? trials.sublist(trials.length - poolMaxTrials)
          : trials,
    );
  } catch (_) {
    return emptyLadder;
  }
}

String serializeLadder(LadderState state) => jsonEncode({
      'ssdMs': state.ssdMs,
      'trials': state.trials.map((t) => t.toJson()).toList(),
    });
