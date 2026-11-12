/// «Числовой забег» — одна карточка активного задания и плавающий слот «операции в запасе» по
/// UI-референсу Кодекса v1.0 (06.11.2026): табло примера (ответы — на самих арках в 3D), точная
/// сумма с состоянием, шкала с курсором выбора, «запомни / повтори», цель стража, «×2 в запас».
/// Только показ состояния ядра: очков и правил здесь нет. Размеры — токены: карточка 64–96.
library;

import 'package:flutter/material.dart';

import '../../shell/js_compat.dart' show jsNum;
import '../../shell/l10n.dart';
import '../runner/road.dart';
import '../runner/rules.dart' show scaleValue;
import 'nr_material.dart';

String _num(double v) {
  final r = (v * 10).roundToDouble() / 10;
  return r < 0 ? '−${jsNum(-r)}' : '${jsNum(r)}';
}

/// Тёмно-коричневый текст на янтарной/кремовой табличке — от янтаря, не литерал.
final Color _brown = Color.lerp(Nr.amber, Colors.black, .62)!;

/// Карточка задания станции впереди; для обычной дороги — ничего.
class NumberRunTaskCard extends StatelessWidget {
  const NumberRunTaskCard({super.key, required this.row, required this.state, this.collected});
  final RoadRow row;
  final RoadState state;

  /// Сколько частей «ровно N» уже взято (считает [NumberRunReadout]).
  final double? collected;

  @override
  Widget build(BuildContext context) {
    final current = row.id == state.nextRow;

    if (row.kind == 'answer') {
      // Лист 01 «Арки с примером»: табло над арками; три ответа — на арках сцены.
      return NrCandy(key: const Key('nr-task-answer'), text: row.prompt ?? '', size: 28, height: 56, padding: 24, radius: 20);
    }

    final exact = row.exact;
    // Ряд «вспомни» в ядре тоже несёт «ровно N» (число знаков) — это память (веб: `exact && !recall`).
    if (exact != null && !row.recall) {
      final got = current ? (collected ?? 0) : 0.0;
      final target = exact.target;
      final label = '${_num(got)} / ${_num(target)}';
      final Widget state = got == target
          ? NrCandy(text: label, color: Nr.success, icon: Icons.check, size: 22, height: 44, minWidth: 120)
          : got > target
              ? Column(mainAxisSize: MainAxisSize.min, children: [
                  NrCandy(text: label, color: Colors.white, ink: Nr.red, rim: Nr.red, icon: Icons.error, size: 22, height: 44, minWidth: 120),
                  Transform.translate(offset: const Offset(0, -4), child: NrTab(L.t('numberRunOverflow'), ink: Nr.red)),
                ])
              : Column(mainAxisSize: MainAxisSize.min, children: [
                  NrCandy(text: label, color: Color.lerp(Nr.amber, Colors.black, .35)!, size: 22, height: 44, minWidth: 120),
                  Transform.translate(offset: const Offset(0, -4), child: NrTab(L.t('numberRunCollected'), ink: _brown)),
                ]);
      return Wrap(
        key: const Key('nr-task-exact'),
        alignment: WrapAlignment.center,
        crossAxisAlignment: WrapCrossAlignment.start,
        spacing: 10,
        runSpacing: 6,
        children: [
          NrCandy(
            text: L.t('numberRunExact').replaceAll('{n}', _num(target)).toUpperCase(),
            color: Nr.ivory,
            ink: _brown,
            rim: Nr.amber,
            size: 18,
            height: 44,
          ),
          KeyedSubtree(key: const Key('nr-exact-counter'), child: state),
        ],
      );
    }

    if (row.kind == 'scale') {
      return Column(key: const Key('nr-task-scale'), mainAxisSize: MainAxisSize.min, children: [
        NrCandy(text: row.prompt ?? '', size: 28, height: 56, padding: 24, radius: 20),
        const SizedBox(height: 6),
        _ScaleRuler(row: row, x: state.x),
      ]);
    }

    final show = row.show;
    if (show != null || row.recall) {
      // Сколько знаков вспомнить — цель ряда в ядре; вариантов на дороге больше (по три в полосе).
      final n = show?.symbols.length ?? (row.exact?.target.round() ?? row.items.length);
      final filled = row.recall && current ? state.collected.length.clamp(0, n) : 0;
      Widget tile({String? symbol, bool dot = false}) => Container(
            width: 52,
            height: 52,
            alignment: Alignment.center,
            decoration: symbol != null
                ? nrGloss(Nr.teal, radius: 11)
                : BoxDecoration(
                    color: Nr.ivory,
                    borderRadius: BorderRadius.circular(11),
                    border: Border.all(color: Nr.gold, width: 1.6),
                  ),
            child: symbol != null
                ? Text(symbol, style: nrText(26, Colors.white))
                : dot
                    ? const Icon(Icons.circle, size: 10, color: Nr.muted)
                    : Text('?', style: nrText(26, Nr.muted)),
          );
      return Wrap(
        key: Key(show != null ? 'nr-task-memorize' : 'nr-task-recall'),
        alignment: WrapAlignment.center,
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: 6,
        runSpacing: 6,
        children: [
          // Показ — знаки; «повтори» — образец скрыт, заполненные места — нейтральная точка (бриф 06.11).
          NrTab(show != null ? L.t('numberRunMemorizeShort') : L.t('numberRunRecallShort')),
          if (show != null)
            for (final s in show.symbols) tile(symbol: s)
          else ...[
            for (var i = 0; i < n; i++) tile(dot: i < filled),
            NrCandy(text: '$filled / $n', size: 18, height: 32, padding: 10, minWidth: 88),
          ],
        ],
      );
    }

    if (row.station == 'reserve') {
      return Wrap(
        key: const Key('nr-task-reserve'),
        alignment: WrapAlignment.center,
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: 8,
        runSpacing: 6,
        children: [
          NrOpTile(op: row.items.firstWhere((i) => i.reserve != null).reserve!, size: 40),
          NrCandy(text: L.t('numberRunReserveTake'), color: Nr.ivory, ink: Nr.navy, size: 18, height: 44),
        ],
      );
    }
    return const SizedBox.shrink();
  }
}

/// Шкала: равные расстояния — равные интервалы; курсор — выбор (где сейчас число), не ответ.
class _ScaleRuler extends StatelessWidget {
  const _ScaleRuler({required this.row, required this.x});
  final RoadRow row;
  final double x;

  @override
  Widget build(BuildContext context) {
    final value = scaleValue(row.min, row.max, x);
    return SizedBox(
      key: const Key('nr-scale-ruler'),
      height: 50,
      child: CustomPaint(
        size: const Size(double.infinity, 50),
        painter: _RulerPainter(row: row, cursor: (value - row.min) / (row.max - row.min)),
      ),
    );
  }
}

class _RulerPainter extends CustomPainter {
  _RulerPainter({required this.row, required this.cursor});
  final RoadRow row;
  final double cursor;

  @override
  void paint(Canvas canvas, Size size) {
    const pad = 18.0, top = 12.0;
    final rect = Rect.fromLTRB(0, top, size.width, size.height);
    final r = RRect.fromRectAndRadius(rect, const Radius.circular(19));
    canvas.drawRRect(r.shift(const Offset(0, 2)), Paint()..color = Colors.black.withValues(alpha: .25));
    canvas.drawRRect(r, Paint()..shader = nrGloss(Nr.navy).gradient!.createShader(rect));
    canvas.drawRRect(
        r,
        Paint()
          ..color = Nr.gold
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2);
    double xOf(double v) => pad + (v - row.min) / (row.max - row.min) * (size.width - 2 * pad);
    final tick = Paint()
      ..color = Colors.white
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round;
    final every = row.ticks.length <= 6 ? 1 : 2;
    for (var i = 0; i < row.ticks.length; i++) {
      final v = row.ticks[i];
      final major = i % every == 0 || i == row.ticks.length - 1;
      canvas.drawLine(Offset(xOf(v), top + 6), Offset(xOf(v), top + (major ? 18 : 13)), tick);
      if (!major) continue;
      final tp = TextPainter(text: TextSpan(text: _num(v), style: nrText(12, Colors.white)), textDirection: TextDirection.ltr)
        ..layout();
      tp.paint(canvas, Offset((xOf(v) - tp.width / 2).clamp(4, size.width - tp.width - 4), top + 19));
    }
    final cx = pad + cursor.clamp(0.0, 1.0) * (size.width - 2 * pad);
    final tri = Path()
      ..moveTo(cx - 9, 0)
      ..lineTo(cx + 9, 0)
      ..lineTo(cx, top + 7)
      ..close();
    canvas.drawPath(tri, Paint()..color = Nr.ivory);
    canvas.drawPath(
        tri,
        Paint()
          ..color = Nr.gold
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.5);
  }

  @override
  bool shouldRepaint(_RulerPainter old) => old.cursor != cursor || old.row != row;
}

/// Цель стража (лист 02): щит и «СТРАЖ · 515». «Твоё число» — уже само число на дороге;
/// нехватку не считаем (флаг guardianDeficitHint выключен, бриф 06.11).
class NumberRunGuardGoal extends StatelessWidget {
  const NumberRunGuardGoal({super.key, required this.guard, required this.value});
  final double guard, value;

  @override
  Widget build(BuildContext context) => Row(key: const Key('nr-guard-goal'), mainAxisSize: MainAxisSize.min, children: [
        NrShield(size: 44, passed: value >= guard),
        const SizedBox(width: 6),
        Flexible(
          child: KeyedSubtree(
            key: const Key('nr-guard-target'),
            child: NrCandy(text: '${L.t('numberRunGuard')} · ${_num(guard)}'.toUpperCase(), size: 22, height: 44),
          ),
        ),
      ]);
}

/// Плитка операции «×2» (фиолетовая — преобразование, лист 02).
class NrOpTile extends StatelessWidget {
  const NrOpTile({super.key, required this.op, this.size = 56});
  final String op;
  final double size;

  @override
  Widget build(BuildContext context) => Container(
        width: size * 1.2,
        height: size,
        alignment: Alignment.center,
        decoration: nrGloss(Nr.violet, radius: size * .26).copyWith(
          boxShadow: [BoxShadow(color: Nr.violet.withValues(alpha: .55), blurRadius: 10)],
        ),
        child: Text(op, style: nrText(size * .48, Colors.white)),
      );
}

/// Кнопка-конфета действия (фиолетовая; без действия — серая и не принимает нажатий).
class NrActionButton extends StatelessWidget {
  const NrActionButton({super.key, required this.label, required this.onPressed, this.height = 44, this.secondary = false});
  final String label;
  final VoidCallback? onPressed;
  final double height;
  final bool secondary;

  @override
  Widget build(BuildContext context) {
    final on = onPressed != null;
    final fill = !on ? Nr.disabledSurface : (secondary ? Nr.ivory : Nr.violet);
    final ink = !on ? Nr.disabledText : (secondary ? Nr.navy : Colors.white);
    return Semantics(
      button: true,
      enabled: on,
      label: label,
      excludeSemantics: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onPressed,
        child: Container(
          constraints: BoxConstraints(minHeight: height < 48 ? 48 : height, minWidth: 48),
          alignment: Alignment.center,
          child: Container(
            height: height,
            padding: const EdgeInsets.symmetric(horizontal: 18),
            alignment: Alignment.center,
            decoration: nrGloss(fill, rim: on ? Nr.gold : null, radius: height / 2, shadow: on),
            child: Text(label.toUpperCase(), style: nrText(16, ink)),
          ),
        ),
      ),
    );
  }
}

/// Плавающий слот «операция в запасе» (UI16, 72×72; действие h48): пусто → «×2 в запасе» →
/// израсходовано. «Применить» — только с полным слотом и на бегу; повтор ядро игнорирует само.
class NumberRunReserveSlot extends StatelessWidget {
  const NumberRunReserveSlot({super.key, required this.state, required this.running, required this.onApply});
  final RoadState state;
  final bool running;
  final VoidCallback onApply;

  @override
  Widget build(BuildContext context) {
    final op = state.reserve;
    final used = op == null && state.reserveUsed > 0;
    final caption = op != null
        ? L.t('numberRunReserveReady')
        : used
            ? L.t('numberRunReserveUsed')
            : L.t('puzzleSecondEmpty');
    return Semantics(
      container: true,
      label: '${L.t('numberRunReserve')}: $caption${op != null ? ' $op' : ''}',
      child: Column(key: const Key('nr-reserve-slot'), mainAxisSize: MainAxisSize.min, children: [
        if (op != null) NrOpTile(op: op, size: 60) else const NrDashedBox(size: 72),
        Transform.translate(offset: const Offset(0, -6), child: NrTab(caption)),
        NrActionButton(
          key: const Key('nr-reserve-apply'),
          label: L.t('apply'),
          height: 44,
          onPressed: op != null && running ? onApply : null,
        ),
      ]),
    );
  }
}
