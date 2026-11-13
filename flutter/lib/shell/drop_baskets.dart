import 'dart:math' as math;

import 'package:flutter/material.dart';

/// «ПЕРЕТАЩИ В КОРЗИНУ» — ОДИН КОМПОНЕНТ КАРКАСА (задача 2d300f4e, решение Дениса 13.11.2026).
///
/// Канон (`APP_CHROME_DESIGN_STANDARD_REF.md`, правило 11.11): элемент нескольких игр живёт в
/// `shell/`, игра отдаёт только данные. Здесь — ПОВЕДЕНИЕ перетаскивания; вид корзин и карточек
/// (плетёная корзина, бумажная карточка, коробка-образец) остаётся за игрой, он у каждой свой.
///
/// Поведение (взято у «Сортировки слов» после #496 и теперь одно на всех):
///  * карточка берётся СРАЗУ касанием — без задержки и без предварительного тапа;
///  * корзина под пальцем подсвечивается;
///  * отпустил мимо корзины — карточка возвращается, это не ответ и не ошибка;
///  * тап — запасной ввод: тап по карточке выбирает её, тап по корзине кладёт выбранную.
///    У игры с ОДНОЙ карточкой на экране ([DropBasketsScope.implicitItem]) выбирать не нужно:
///    тап по корзине кладёт текущую сразу;
///  * неверный ответ: карточка встряхивается и остаётся выбранной.
///
/// Отклик «верно / неверно» (вибрация, звук) сюда не входит: он придёт из общего компонента отклика
/// (задача 5d4d04bb), пока его нет — игра зовёт `AppHaptics.hit/miss` в своём `onAnswer`.
///
/// Схема: игра оборачивает поле в [DropBasketsScope], карточки — в [DropCard], корзины — в
/// [DropBasket]. Тип `I` — идентификатор карточки, `T` — идентификатор корзины.
class DropBasketsScope<I extends Object, T extends Object>
    extends StatefulWidget {
  const DropBasketsScope({
    super.key,
    required this.enabled,
    required this.isCorrect,
    required this.onAnswer,
    required this.child,
    this.canDrop,
    this.isLive,
    this.resetKey,
    this.implicitItem,
  });

  /// Принимается ли ввод (партия идёт, нет паузы, не конец).
  final bool enabled;

  /// Верна ли корзина [target] для карточки [item]: решает только встряску и выбор после ответа.
  final bool Function(I item, T target) isCorrect;

  /// Игра применяет ответ (счёт, ошибки, снять карточку с поля). Зовётся ровно один раз на ответ.
  final void Function(I item, T target) onAnswer;

  /// Можно ли ещё класть карточку: на поле и не разложена. Без него — можно любую.
  final bool Function(I item)? canDrop;

  /// Карточка ещё на поле. Если выбранной больше нет — выбор снимается.
  final bool Function(I item)? isLive;

  /// Меняется — выбор, перетаскивание и встряска сбрасываются (новая партия, рестарт).
  final Object? resetKey;

  /// Единственная карточка на экране: тап по корзине кладёт её без предварительного выбора.
  final I? implicitItem;

  final Widget child;

  @override
  State<DropBasketsScope<I, T>> createState() => DropBasketsState<I, T>();
}

/// То, что карточке нужно от поля: что выбрано, что тянут, какая карточка ответила неверно.
abstract class DropHost<I extends Object> {
  bool get enabled;
  I? get selected;
  I? get dragging;
  I? get wrong;
  int get wrongSerial;
  void select(I? item);
  void dragStarted(I item);
  void dragEnded();
}

class DropBasketsState<I extends Object, T extends Object>
    extends State<DropBasketsScope<I, T>>
    implements DropHost<I> {
  I? _selected;
  I? _dragging;
  I? _wrong;
  int _wrongSerial = 0;
  int _version = 0;

  @override
  bool get enabled => widget.enabled;
  @override
  I? get selected => _selected;
  @override
  I? get dragging => _dragging;
  @override
  I? get wrong => _wrong;
  @override
  int get wrongSerial => _wrongSerial;

  bool canDropItem(I item) =>
      widget.enabled && (widget.canDrop?.call(item) ?? true);

  /// Карточка, которую положит тап по корзине: выбранная, а у игры с одной карточкой — текущая.
  I? get tapItem => _selected ?? widget.implicitItem;

  @override
  void didUpdateWidget(DropBasketsScope<I, T> oldWidget) {
    super.didUpdateWidget(oldWidget);
    final sel = _selected;
    if (oldWidget.resetKey != widget.resetKey ||
        (sel != null && !(widget.isLive?.call(sel) ?? true))) {
      _selected = null;
      _dragging = null;
      _wrong = null;
    }
    _version++;
  }

  @override
  void select(I? item) {
    if (!widget.enabled) return;
    setState(() {
      _selected = item;
      _wrong = null;
      _version++;
    });
  }

  @override
  void dragStarted(I item) => setState(() {
    _dragging = item;
    _selected = item;
    _version++;
  });

  @override
  void dragEnded() {
    if (!mounted) return;
    setState(() {
      _dragging = null;
      _version++;
    });
  }

  /// Ответ: из перетаскивания или из тапа. Повторный ответ на ту же карточку отсекает [canDrop].
  void answer(I item, T target) {
    if (!canDropItem(item)) return;
    final wrong = !widget.isCorrect(item, target);
    widget.onAnswer(item, target);
    if (!mounted) return;
    setState(() {
      _selected = wrong ? item : null;
      _dragging = null;
      _wrong = wrong ? item : null;
      _wrongSerial++;
      _version++;
    });
  }

  @override
  Widget build(BuildContext context) =>
      _DropData<I>(host: this, version: _version, child: widget.child);
}

class _DropData<I extends Object> extends InheritedWidget {
  const _DropData({
    required this.host,
    required this.version,
    required super.child,
  });

  final DropHost<I> host;
  final int version;

  @override
  bool updateShouldNotify(_DropData<I> old) => version != old.version;
}

DropHost<I> _hostOf<I extends Object>(BuildContext context) {
  final data = context.dependOnInheritedWidgetOfExactType<_DropData<I>>();
  assert(
    data != null,
    'DropCard<$I>/DropBasket<$I, …> вне DropBasketsScope<$I, …>',
  );
  return data!.host;
}

/// Карточка: берётся сразу, тап выбирает, неверный ответ встряхивает.
class DropCard<I extends Object> extends StatelessWidget {
  const DropCard({
    super.key,
    required this.item,
    required this.label,
    required this.builder,
    this.feedbackWidth,
  });

  final I item;

  /// Подпись для чтеца экрана (слово, образец).
  final String label;

  /// Вид карточки; [selected] — выбрана тапом или тянется.
  final Widget Function(BuildContext context, bool selected) builder;

  /// Ширина карточки под пальцем. Не задана — карточка тянется своего размера.
  final double? feedbackWidth;

  @override
  Widget build(BuildContext context) {
    final host = _hostOf<I>(context);
    final reduced = MediaQuery.disableAnimationsOf(context);
    final selected = host.selected == item;
    final shake = host.wrong == item;
    Widget feedbackBody = builder(context, true);
    if (feedbackWidth != null) {
      feedbackBody = SizedBox(width: feedbackWidth, child: feedbackBody);
    }
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      child: Draggable<I>(
        data: item,
        // Берётся сразу: хват с задержкой 180 мс не брал слово быстрым свайпом (12.11.2026).
        maxSimultaneousDrags: host.enabled && host.dragging == null ? 1 : 0,
        onDragStarted: () => host.dragStarted(item),
        onDragEnd: (_) => host.dragEnded(),
        feedback: Material(
          type: MaterialType.transparency,
          child: Transform.rotate(
            angle: reduced ? 0 : -.04,
            child: feedbackBody,
          ),
        ),
        childWhenDragging: Opacity(
          opacity: .18,
          child: builder(context, selected),
        ),
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: host.enabled
              ? () => host.select(selected ? null : item)
              : null,
          child: TweenAnimationBuilder<double>(
            key: ValueKey('${item.hashCode}-${shake ? host.wrongSerial : 0}'),
            tween: Tween(begin: shake && !reduced ? 1 : 0, end: 0),
            duration: reduced
                ? Duration.zero
                : const Duration(milliseconds: 300),
            builder: (context, v, child) => Transform.translate(
              offset: Offset(math.sin(v * math.pi * 5) * v * 8, 0),
              child: child,
            ),
            child: AnimatedRotation(
              turns: selected && !reduced ? -.009 : 0,
              duration: reduced
                  ? Duration.zero
                  : const Duration(milliseconds: 140),
              child: builder(context, selected),
            ),
          ),
        ),
      ),
    );
  }
}

/// Корзина: принимает карточку, подсвечивается под пальцем, тап кладёт выбранную.
class DropBasket<I extends Object, T extends Object> extends StatelessWidget {
  const DropBasket({
    super.key,
    required this.target,
    required this.label,
    required this.builder,
    this.borderRadius = 20,
  });

  final T target;

  /// Подпись для чтеца экрана.
  final String label;

  /// Вид корзины; [highlighted] — над ней сейчас карточка под пальцем.
  final Widget Function(BuildContext context, bool highlighted) builder;

  final double borderRadius;

  @override
  Widget build(BuildContext context) {
    final host = _hostOf<I>(context) as DropBasketsState<I, T>;
    final reduced = MediaQuery.disableAnimationsOf(context);
    final item = host.tapItem;
    final radius = BorderRadius.circular(borderRadius);
    return DragTarget<I>(
      onWillAcceptWithDetails: (d) => host.canDropItem(d.data),
      onAcceptWithDetails: (d) => host.answer(d.data, target),
      builder: (context, candidates, rejected) => Semantics(
        button: true,
        enabled: host.enabled && item != null,
        label: label,
        child: InkWell(
          borderRadius: radius,
          onTap: host.enabled && item != null
              ? () => host.answer(item, target)
              : null,
          child: AnimatedContainer(
            duration: reduced
                ? Duration.zero
                : const Duration(milliseconds: 140),
            decoration: BoxDecoration(
              borderRadius: radius,
              color: candidates.isEmpty
                  ? Colors.transparent
                  : Theme.of(context).colorScheme.primary
                        .withValues(alpha: .16),
            ),
            child: builder(context, candidates.isNotEmpty),
          ),
        ),
      ),
    );
  }
}
