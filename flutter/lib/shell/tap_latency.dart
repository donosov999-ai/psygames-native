import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

/// ОТКЛИК НА КАСАНИЕ — ОДНОЙ МЕРКОЙ ДЛЯ ОБЕИХ ВЕРСИЙ.
///
/// 🔴 ЗАЧЕМ ОТДЕЛЬНЫЙ ПРИБОР. В реф-таблице переезда стоит «8,5 мс против 0,23 мс»
/// с честной оговоркой «стенды разные»: одно число снято в браузере, другое в
/// widget-пробе. Для игр раздела «Конфликт внимания» такая разница важна ПО
/// СУЩЕСТВУ: там меряется время реакции человека, и задержка самого приложения
/// уезжает прямо в результат человека. Поэтому нужна одна величина, снятая на
/// ОДНОМ устройстве и ОДНИМ драйвером нажатий.
///
/// ВЕЛИЧИНА: от отметки времени САМОГО СОБЫТИЯ КАСАНИЯ (её ставит система, а не
/// приложение) до кадра, в котором виден отклик. В обоих стеках это одно и то же:
///   · Flutter — `PointerDownEvent.timeStamp` → `currentSystemFrameTimeStamp`
///     ближайшего кадра (одна и та же шкала движка);
///   · нынешняя версия в WebView — `event.timeStamp` → метка `requestAnimationFrame`
///     (одна и та же шкала `performance.now()`), см. [webTapLatencyJs].
///
/// Прибор включается флагом сборки и в обычной сборке не существует:
///   flutter run --dart-define=TAP_LATENCY=true
const bool tapLatencyProbe = bool.fromEnvironment('TAP_LATENCY');

/// Строка замера в журнале. Один вид для обеих версий, чтобы разбирать одним грепом.
String tapLatencyLine(String where, double ms) =>
    'ОТКЛИК $where ${ms.toStringAsFixed(2)} мс';

/// ПОКАЗ СТИМУЛА: от решения показать до ближайшего кадра.
///
/// 🔴 ПОЧЕМУ ИМЕННО ЭТА ВЕЛИЧИНА ВАЖНА ДЛЯ ПРОБ НА РЕАКЦИЮ. Время реакции считается
/// от отметки показа стимула. Если кадр со стимулом появляется ПОЗЖЕ отметки, вся
/// разница уходит прямо в результат человека: записанное время больше настоящего на
/// эту задержку. У разностных мер (интерференция Струпа) постоянная часть сокращается,
/// но разброс задержки — нет.
///
/// Меряется одинаково в обеих версиях: от изменения состояния до колбэка ближайшего
/// кадра (Flutter — `addPostFrameCallback`, веб — `requestAnimationFrame`).
/// ⚠️ ДО ВТОРОГО КАДРОВОГО КОЛБЭКА, А НЕ ДО ПЕРВОГО. Первая редакция мерила до
/// `addPostFrameCallback` у Flutter и до `requestAnimationFrame` у страницы — и это
/// РАЗНЫЕ моменты: колбэк браузера срабатывает ДО отрисовки кадра, флаттеровский —
/// после построения. Замер 23.09.2026 дал 0,35 мс против 17,6 мс, то есть сравнение
/// разного под одним именем. Второй колбэк в обеих версиях означает одно: кадр со
/// стимулом уже отдан, идёт следующий.
void measureStimulusFrame(String where) {
  if (!tapLatencyProbe) return;
  final t0 = DateTime.now().microsecondsSinceEpoch;
  WidgetsBinding.instance.addPostFrameCallback((_) {
    // Второй кадр сам не придёт в неподвижном экране — просим его явно.
    WidgetsBinding.instance.scheduleFrame();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final ms = (DateTime.now().microsecondsSinceEpoch - t0) / 1000.0;
      // ignore: avoid_print — прибор нарочно пишет в журнал устройства
      print('ПОКАЗ $where ${ms.toStringAsFixed(2)} мс');
    });
  });
}

/// Обёртка вокруг органа ответа: ловит касание и меряет до ближайшего кадра.
///
/// Без флага возвращает ребёнка как есть — ни слушателя, ни кадровых колбэков.
class TapLatency extends StatelessWidget {
  const TapLatency({super.key, required this.where, required this.child});

  /// Чьё это нажатие: пишется в строку замера («Flutter/Струп»).
  final String where;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (!tapLatencyProbe) return child;
    return Listener(
      behavior: HitTestBehavior.translucent,
      onPointerDown: (e) {
        final tap = e.timeStamp;
        // Кадр, в котором отклик уже нарисован, — первый после обработки касания.
        SchedulerBinding.instance.addPostFrameCallback((_) {
          final frame = SchedulerBinding.instance.currentSystemFrameTimeStamp;
          final ms = (frame - tap).inMicroseconds / 1000.0;
          // ignore: avoid_print — прибор нарочно пишет в журнал устройства
          print(tapLatencyLine(where, ms));
        });
      },
      child: child,
    );
  }
}

/// ⚠️ ПОЧЕМУ У СТРАНИЦЫ ЧАСЫ БЕРУТСЯ СНАРУЖИ. Первая редакция считала разность внутри
/// страницы через `performance.now()`. Замер 23.09.2026 в WKWebView: 11 значений из 13
/// вышли ровно 0,00 мс, одно 1,00, одно 15,00 — WebKit огрубляет часы страницы до
/// миллисекунды, и величина в единицы миллисекунд там просто не видна. Поэтому страница
/// шлёт две ГОЛЫЕ метки каналом, а разность считают микросекундные часы Dart — те же, что
/// меряют нативный экран. Цена — задержка канала, одинаковая для обеих меток.
const String latencyChannel = 'PsyLatency';

/// Скрипт страницы: метки «стимул показан» и «ближайший кадр» уходят каналом наружу.
String webStimulusMarkJs() => '''
(function () {
  if (window.__psyMark) return;
  window.__psyMark = function (kind) {
    try { $latencyChannel.postMessage(kind); } catch (e) {}
  };
})();
''';

/// Разность между метками, пришедшими из страницы. Часы — Dart, как у нативного экрана.
class WebMarkTimer {
  int? _stim;

  /// Возвращает готовую строку замера, когда пара меток собрана.
  String? onMark(String kind) {
    final now = DateTime.now().microsecondsSinceEpoch;
    if (kind == 'stim') {
      _stim = now;
      return null;
    }
    final t0 = _stim;
    if (kind != 'frame' || t0 == null) return null;
    _stim = null;
    return 'ПОКАЗ Веб/Струп ${((now - t0) / 1000.0).toStringAsFixed(2)} мс';
  }
}

/// Тот же замер для страницы внутри WebView: от отметки касания до кадра.
///
/// ⚠️ `event.timeStamp` в WebKit — это `performance.now()` в момент события, то есть
/// та же шкала, что и метка `requestAnimationFrame`. Поэтому разность считается
/// внутри страницы, а наружу уходит уже готовое число: сравнивать часы двух
/// процессов не приходится.
String webTapLatencyJs(String where) => '''
(function () {
  if (window.__tapLatency) return;
  window.__tapLatency = true;
  document.addEventListener('pointerdown', function (e) {
    var t = e.timeStamp;
    requestAnimationFrame(function (frame) {
      console.log('ОТКЛИК $where ' + (frame - t).toFixed(2) + ' мс');
    });
  }, true);
})();
''';
