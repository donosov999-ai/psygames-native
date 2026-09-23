/// ВРЕМЯ ТОРМОЖЕНИЯ (SSRT) МЕТОДОМ ИНТЕГРАЦИИ — главное число «Стоп-сигнала».
///
/// Перенесено из `frontend/src/games/stop-signal/core/ssrt.ts` со сверкой по
/// эталону `test/fixtures/stopsignal-reference.json`.
///
/// 🔴 ЧИСЛО НЕ ВЫДАЁТСЯ, КОГДА УСЛОВИЯ ПРИМЕНИМОСТИ НЕ ВЫПОЛНЕНЫ, и вместо него
/// называется ПРИЧИНА. Руководство (Verbruggen et al., 2019, eLife) прямо
/// запрещает считать SSRT, когда доля сорванных торможений далеко от половины,
/// когда стоп-проб мало, когда пропусков GO много или когда нарушена модель
/// гонки. Ноль или «примерно» вместо отказа были бы числом, которому нельзя
/// верить, — а им потом меряют человека.
library;

import 'dart:math';

/// Одна проба партии — ровно то, что нужно расчёту, и ничего сверх.
class StopSignalTrial {
  const StopSignalTrial({
    required this.isStop,
    required this.ssdMs,
    required this.rtMs,
    required this.goWindowMs,
  });

  /// Стоп-проба (был или должен был быть сигнал «стоп») либо обычная GO-проба.
  final bool isStop;

  /// Задержка стоп-сигнала НА ЭТОЙ пробе. У GO-проб её нет.
  /// ⚠️ Пишется даже тогда, когда человек нажал раньше, чем сигнал показался:
  /// ступень лестницы всё равно была назначена и в среднюю задержку входит.
  final int? ssdMs;

  /// Время реакции от появления GO. Пусто — не нажал вовсе.
  final int? rtMs;

  /// Окно ответа этой пробы. Им ЗАМЕЩАЕТСЯ пропуск GO: по методике пропуск
  /// получает максимальное время реакции, а максимум здесь — это и есть окно.
  final int goWindowMs;

  Map<String, dynamic> toJson() => {
        'isStop': isStop,
        'ssdMs': ssdMs,
        'rtMs': rtMs,
        'goWindowMs': goWindowMs,
      };
}

/// Почему числу нельзя верить. Пусто — верить можно.
enum SsrtDoubt {
  noStopTrials,
  tooFewStopTrials,
  noGoResponses,
  tooManyOmissions,
  pRespondOffTarget,
  raceModelViolated,
}

class SsrtEstimate {
  const SsrtEstimate({
    required this.ssrtMs,
    required this.trustworthy,
    required this.doubt,
    required this.pRespond,
    required this.pInhibit,
    required this.meanSsdMs,
    required this.meanGoRtMs,
    required this.meanFailedStopRtMs,
    required this.nthGoRtMs,
    required this.goTrials,
    required this.goOmissions,
    required this.stopTrials,
    required this.failedStops,
  });

  /// Метод назван в самом числе — чтобы сохранённую партию нельзя было спутать.
  String get method => 'integration';

  /// Само время торможения в мс. Пусто = условия применимости не выполнены.
  final int? ssrtMs;
  final bool trustworthy;
  final SsrtDoubt? doubt;

  /// p(respond | signal) — доля стоп-проб, где торможение СОРВАЛОСЬ.
  final double pRespond;

  /// Доля удавшихся торможений — та самая половина, к которой сходится лестница.
  final double pInhibit;
  final int meanSsdMs;
  final int meanGoRtMs;
  final int meanFailedStopRtMs;

  /// n-я по скорости реакция GO — то, из чего вычитается задержка.
  final int? nthGoRtMs;
  final int goTrials;
  final int goOmissions;
  final int stopTrials;
  final int failedStops;
}

/// Границы, за которыми руководство прямо запрещает оценивать SSRT.
const double pRespondMin = 0.25;
const double pRespondMax = 0.75;

/// Меньше двенадцати стоп-проб — это не замер: доля сорванных торможений при
/// пяти пробах принимает шесть значений, и порядковая статистика прыгает через
/// сотню миллисекунд от одной пробы.
const int minStopTrials = 12;

/// Доля пропущенных GO, выше которой оценка смещается вниз ощутимо.
const double maxOmissionRate = 0.1;

double _mean(List<int> xs) => xs.isEmpty ? 0 : xs.reduce((a, b) => a + b) / xs.length;

/// Оценка SSRT методом интеграции по набору проб.
///
/// ⚠️ Функция чистая и не знает ни про экран, ни про уровень: те же пробы — то же
/// число. Ровно поэтому её можно предъявить модельному игроку с ЗАДАННЫМ временем
/// торможения и проверить, что оно восстанавливается.
SsrtEstimate estimateSsrt(List<StopSignalTrial> trials) {
  final go = trials.where((t) => !t.isStop).toList();
  final stop = trials.where((t) => t.isStop).toList();

  // Пропуск GO участвует в расчёте как САМЫЙ МЕДЛЕННЫЙ ответ — так предписывает
  // методика. Выбросить его значило бы укоротить распределение справа и занизить
  // порядковую статистику, то есть занизить SSRT молча.
  final goRts = go.map((t) => t.rtMs ?? t.goWindowMs).toList()..sort();
  final goOmissions = go.where((t) => t.rtMs == null).length;
  final pressedGoRts = go.where((t) => t.rtMs != null).map((t) => t.rtMs!).toList();

  final failed = stop.where((t) => t.rtMs != null).toList();
  final pRespond = stop.isEmpty ? 0.0 : failed.length / stop.length;
  final meanSsd = _mean(stop.map((t) => t.ssdMs ?? 0).toList());

  // n = сколько самых быстрых GO-ответов «проиграли бы» торможению.
  final nRaw = (goRts.length * pRespond).round();
  final n = goRts.isEmpty ? 0 : min(goRts.length, max(1, nRaw));
  final nthGoRtMs = n > 0 ? goRts[n - 1] : null;

  final meanGoRt = _mean(pressedGoRts);
  final meanFailedStopRt = _mean(failed.map((t) => t.rtMs!).toList());
  final omissionRate = go.isEmpty ? 0.0 : goOmissions / go.length;

  // Порядок проверок — от «нечего считать» к «считать можно, но смещённо».
  SsrtDoubt? doubt;
  if (stop.isEmpty) {
    doubt = SsrtDoubt.noStopTrials;
  } else if (stop.length < minStopTrials) {
    doubt = SsrtDoubt.tooFewStopTrials;
  } else if (goRts.isEmpty) {
    doubt = SsrtDoubt.noGoResponses;
  } else if (omissionRate > maxOmissionRate) {
    doubt = SsrtDoubt.tooManyOmissions;
  } else if (pRespond < pRespondMin || pRespond > pRespondMax) {
    doubt = SsrtDoubt.pRespondOffTarget;
  } else if (failed.isNotEmpty && pressedGoRts.isNotEmpty && meanFailedStopRt > meanGoRt) {
    doubt = SsrtDoubt.raceModelViolated;
  }

  final ssrt = nthGoRtMs == null ? null : (nthGoRtMs - meanSsd).round();

  return SsrtEstimate(
    ssrtMs: doubt == null ? ssrt : null,
    trustworthy: doubt == null,
    doubt: doubt,
    pRespond: pRespond,
    pInhibit: stop.isEmpty ? 0 : 1 - pRespond,
    meanSsdMs: meanSsd.round(),
    meanGoRtMs: meanGoRt.round(),
    meanFailedStopRtMs: meanFailedStopRt.round(),
    nthGoRtMs: nthGoRtMs,
    goTrials: go.length,
    goOmissions: goOmissions,
    stopTrials: stop.length,
    failedStops: failed.length,
  );
}
