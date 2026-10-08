import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

import 'catalog_kit.dart';
import 'feedback_fab.dart' show FabRules;
import 'ion_icon.dart';
import 'screen_ui.dart';
import 'shared_state.dart';
import 'walking_pet.dart' show PetFrames, PetSpec;
import 'web_theme.dart';

/// ГЛАВНАЯ «/» НА FLUTTER — ПЕРЕНОС `frontend/app/index.tsx`, А НЕ НОВЫЙ РИСУНОК (задача 7c88c0b8).
///
/// 📍 Правило Дениса 4e679f41: перенос — технология, не дизайн; никакого «минималистичного списка»
/// вместо карточек. Рисунок, числа отступов и порядок блоков — веба (номера стилей — `index.tsx`,
/// `DailyGoalCard.tsx`, `StreakGoalSheet.tsx`, `CategorySections.tsx`). Данные — МОДЕЛЬ веба
/// (`services/homeModel.ts` → [ScreenUi]): веб-Главная стоит под оболочкой и считает всё сама;
/// здесь нет ни одного расчёта рекомендаций, заработка, серии или цели. Нажатия, меняющие данные
/// (цели, вызов дня, поиск, обновление), уходят обратно в веб ([ScreenUi.act]); переходы по адресам
/// делает оболочка ([onOpen], [onTab]).
class HomeScreen extends StatefulWidget {
  const HomeScreen({
    super.key,
    required this.state,
    required this.origin,
    required this.onOpen,
    required this.onTab,
    required this.onSwitcher,
    this.kit,
    this.active = true,
  });

  final SharedState state;

  /// Главная на экране, а не спрятана в теле оболочки рядом с другими экранами. Окно цели серии
  /// открывается только у видимой Главной (живой замер 07.10.2026: на свежей установке оно легло
  /// поверх нативного знакомства). `IndexedStack` скрытых детей не выключает, поэтому — флагом.
  final bool active;

  /// Сервер раздачи: картинки модели — адреса веб-сборки.
  final String origin;

  /// Открыть адрес поверх (как `router.push`).
  final ValueChanged<String> onOpen;

  /// Перейти на вкладку (как `router.replace`).
  final ValueChanged<String> onTab;

  /// Чип профиля — переключатель профилей.
  final VoidCallback onSwitcher;

  /// Каталог для «Любимых разделов»; нет — грузится сам.
  final CatalogKit? kit;

  static const route = '/';

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

typedef _M = Map<String, Object?>;

_M _map(Object? v) => v is Map ? Map<String, Object?>.from(v) : const {};
List<_M> _list(Object? v) => v is List ? [for (final x in v) _map(x)] : const [];
String _s(Object? v) => v == null ? '' : '$v';
double _d(Object? v, [double f = 0]) => v is num ? v.toDouble() : f;

class _HomeScreenState extends State<HomeScreen> {
  CatalogKit? _kit;
  bool _sheetOpen = false;

  @override
  void initState() {
    super.initState();
    _kit = widget.kit;
    if (_kit == null) {
      CatalogKit.load().then((k) {
        if (mounted) setState(() => _kit = k);
      }).catchError((Object _) {});
    }
    ScreenUi.model(HomeScreen.route).addListener(_onModel);
    WidgetsBinding.instance.addPostFrameCallback((_) => _onModel());
  }

  @override
  void dispose() {
    ScreenUi.model(HomeScreen.route).removeListener(_onModel);
    super.dispose();
  }

  bool get _onScreen => widget.active;

  @override
  void didUpdateWidget(HomeScreen old) {
    super.didUpdateWidget(old);
    if (old.active != widget.active) WidgetsBinding.instance.addPostFrameCallback((_) => _onModel());
  }

  void _act(String action, [List<Object?> args = const []]) => ScreenUi.act(HomeScreen.route, action, args);

  String _url(String u) => u.startsWith('http') ? u : '${widget.origin}$u';

  /// Окно цели серии — поверх всего экрана с полосой, как `Modal` веба; открывается и закрывается моделью.
  void _onModel() {
    if (!mounted) return;
    final sheet = _map(ScreenUi.model(HomeScreen.route).value?['goalSheet']);
    if (sheet.isNotEmpty && !_sheetOpen && _onScreen) {
      _sheetOpen = true;
      showGeneralDialog<void>(
        context: context,
        barrierDismissible: false,
        barrierColor: const Color(0x8C000000),
        pageBuilder: (ctx, _, _) => _GoalSheet(origin: widget.origin, close: () => Navigator.of(ctx).pop(), act: _act),
      ).whenComplete(() => _sheetOpen = false);
    } else if ((sheet.isEmpty || !_onScreen) && _sheetOpen) {
      Navigator.of(context).maybePop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final web = WebTheme.of(context);
    return ValueListenableBuilder<_M?>(
      valueListenable: ScreenUi.model(HomeScreen.route),
      builder: (context, m, _) {
        if (m == null) {
          return ColoredBox(
            color: web.background,
            child: const Center(child: CircularProgressIndicator(key: ValueKey('home-loading'))),
          );
        }
        final bg = _map(m['background']);
        final toasts = _map(m['toasts']);
        return Material(
          key: const ValueKey('home-screen'),
          color: web.background,
          child: WebTheme.textDefaults(context, Stack(children: [
            if (bg['image'] != null)
              Positioned.fill(child: Image.network(_url(_s(bg['image'])), fit: BoxFit.cover, errorBuilder: (_, _, _) => const SizedBox())),
            // Налёт цветом темы (18 / 30 %) — показывает купленный цвет интерфейса.
            Positioned(
              top: 0, left: 0, right: 0, height: 260,
              child: IgnorePointer(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [cssColor(bg['tint']), const Color(0x00000000)],
                    ),
                  ),
                ),
              ),
            ),
            // Вуаль к низу поверх фото: до 45 % почти чисто, к низу не темнее D9.
            if (bg['veil'] != null)
              Positioned.fill(
                child: IgnorePointer(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        stops: const [0, 0.45, 1],
                        colors: [
                          const Color(0x00000000),
                          cssColor(bg['veil']).withAlpha(0x73),
                          cssColor(bg['veil']).withAlpha(0xD9),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            SafeArea(
              bottom: false,
              child: Column(children: [
                _Header(m: _map(m['header']), origin: widget.origin, onOpen: widget.onOpen, onSwitcher: widget.onSwitcher, act: _act),
                Expanded(
                  child: ListView(
                    key: const ValueKey('home-list'),
                    padding: EdgeInsets.fromLTRB(16, 0, 16, FabRules.clearance),
                    children: [
                      for (final b in _list(m['blocks'])) _block(context, b),
                    ],
                  ),
                ),
              ]),
            ),
            if (_map(toasts['streak']).isNotEmpty) _toast(76, _map(toasts['streak']), emoji: '🎁'),
            if (_map(toasts['wager']).isNotEmpty) _toast(122, _map(toasts['wager'])),
            if (_map(toasts['levelUp']).isNotEmpty) _levelUp(_map(toasts['levelUp'])),
          ])),
        );
      },
    );
  }

  Widget _toast(double top, _M t, {String? emoji}) => Positioned(
        top: top + MediaQuery.paddingOf(context).top,
        left: 0,
        right: 0,
        child: IgnorePointer(
          child: Center(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 9),
              decoration: BoxDecoration(color: cssColor(t['bg']), borderRadius: BorderRadius.circular(100)),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Text(emoji ?? _s(t['emoji']), style: const TextStyle(fontSize: 16)),
                const SizedBox(width: 6),
                Text(_s(t['text']),
                    style: TextStyle(color: cssColor(t['fg'], Colors.white), fontWeight: FontWeight.w800, fontSize: 14)),
              ]),
            ),
          ),
        ),
      );

  Widget _levelUp(_M t) => Positioned.fill(
        child: IgnorePointer(
          child: Center(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 34, vertical: 22),
              decoration: BoxDecoration(color: const Color(0xFFF59E0B), borderRadius: BorderRadius.circular(22)),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                const Text('⭐', style: TextStyle(fontSize: 40)),
                const SizedBox(height: 4),
                Text(_s(t['title']), style: const TextStyle(color: Color(0xFF3F2B00), fontWeight: FontWeight.w900, fontSize: 24)),
                const SizedBox(height: 4),
                Text(_s(t['sub']), style: const TextStyle(color: Color(0xFF3F2B00), fontWeight: FontWeight.w800, fontSize: 15)),
              ]),
            ),
          ),
        ),
      );

  Widget _block(BuildContext context, _M b) {
    switch (b['kind']) {
      case 'search':
        return _Search(b: b, act: _act);
      case 'ladder':
        return _Ladder(b: b);
      case 'chest':
        return _Chest(b: b, onOpen: widget.onOpen);
      case 'resume':
        return _Resume(b: b, onOpen: widget.onOpen);
      case 'goal':
        return _GoalCard(key: const ValueKey('home-goal'), b: b, act: _act);
      case 'today':
        return _Today(b: b, onOpen: widget.onOpen);
      case 'reco':
        return _HeroBlock(b: b, origin: widget.origin, onOpen: widget.onOpen, act: _act, ion: 'sparkles-outline', iconSize: 20, accent: null);
      case 'practices':
        return _HeroBlock(b: b, origin: widget.origin, onOpen: widget.onOpen, act: _act, ion: 'leaf-outline', iconSize: 19, accent: const Color(0xFF10B981));
      case 'favourites':
        return _Favourites(b: b, kit: _kit, state: widget.state, onOpen: widget.onOpen, onTab: widget.onTab);
      case 'allForks':
        return _AllForks(b: b, onTab: widget.onTab);
    }
    return const SizedBox.shrink();
  }
}

// ───────────────────────────── Шапка ─────────────────────────────

/// Полоса прогресса — дорожка во всю отведённую ширину и заливка слева долей [ratio].
/// ⚠️ Стек растянут (`StackFit.expand`): без этого он сжимался до заливки, и дорожка лиги
/// рисовалась отрезком в 20 точек вместо 104 (кадр 07.10).
Widget _progress(double ratio, Color track, Color fill, double h, double r) => ClipRRect(
      borderRadius: BorderRadius.circular(r),
      child: SizedBox(
        height: h,
        child: Stack(fit: StackFit.expand, children: [
          ColoredBox(color: track),
          FractionallySizedBox(alignment: Alignment.centerLeft, widthFactor: ratio.clamp(0, 1), child: ColoredBox(color: fill)),
        ]),
      ),
    );

/// Зона 44 при меньшем месте в строке — приём веба `minHeight: 44` + отрицательный отступ:
/// ребёнок рисуется [visible] в высоту, а строке отдаёт [layout].
Widget _tall({required double layout, required double visible, required Widget child}) =>
    _Overhang(overhang: (visible - layout) / 2, child: child);

/// Отрицательный вертикальный отступ (`marginVertical: -N` веба): ребёнок раскладывается в полную
/// высоту, родителю отдаёт её без [overhang] сверху и снизу и ловит нажатия во всей своей высоте.
class _Overhang extends SingleChildRenderObjectWidget {
  const _Overhang({required this.overhang, super.child});
  final double overhang;
  @override
  RenderObject createRenderObject(BuildContext context) => _RenderOverhang(overhang);
  @override
  void updateRenderObject(BuildContext context, _RenderOverhang renderObject) => renderObject.overhang = overhang;
}

class _RenderOverhang extends RenderShiftedBox {
  _RenderOverhang(this._overhang) : super(null);
  double _overhang;
  set overhang(double v) {
    if (v == _overhang) return;
    _overhang = v;
    markNeedsLayout();
  }

  @override
  void performLayout() {
    final c = child;
    if (c == null) {
      size = constraints.smallest;
      return;
    }
    c.layout(BoxConstraints(maxWidth: constraints.maxWidth), parentUsesSize: true);
    (c.parentData! as BoxParentData).offset = Offset(0, -_overhang);
    size = constraints.constrain(Size(c.size.width, (c.size.height - 2 * _overhang).clamp(0, double.infinity)));
  }

  @override
  bool hitTest(BoxHitTestResult result, {required Offset position}) {
    if (position.dx < 0 || position.dx >= size.width || position.dy < -_overhang || position.dy >= size.height + _overhang) {
      return false;
    }
    if (hitTestChildren(result, position: position)) {
      result.add(BoxHitTestEntry(this, position));
      return true;
    }
    return false;
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.m, required this.origin, required this.onOpen, required this.onSwitcher, required this.act});
  final _M m;
  final String origin;
  final ValueChanged<String> onOpen;
  final VoidCallback onSwitcher;
  final void Function(String, [List<Object?>]) act;

  String _url(String u) => u.startsWith('http') ? u : '$origin$u';

  @override
  Widget build(BuildContext context) {
    final web = WebTheme.of(context);
    final accent = Theme.of(context).extension<_Accent>()?.color ?? Theme.of(context).colorScheme.primary;
    final chip = _map(m['chip']);
    final onPhoto = m['onPhoto'] == true;
    final labels = _map(m['labels']);
    final league = m['league'];
    final pet = PetSpec.fromJson(m['pet']);
    // Подпись на фото — тёмная со светлым ореолом (снимок неоднороден), без фото — textSecondary.
    TextStyle onBg(TextStyle s) => onPhoto
        ? s.copyWith(color: const Color(0xFF151A21), shadows: const [Shadow(color: Color(0xE6FFFFFF), blurRadius: 6)])
        : s.copyWith(color: web.textSecondary);
    return Container(
      key: const ValueKey('home-header'),
      constraints: const BoxConstraints(maxWidth: 1100),
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
          // Лого ужимается первым (flex 1), счётчики и питомец — нет.
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(right: 8),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Container(
                  key: const ValueKey('home-logo'),
                  constraints: const BoxConstraints(maxWidth: 190),
                  padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 5),
                  decoration: BoxDecoration(
                    color: cssColor(m['logoPlate']),
                    borderRadius: BorderRadius.circular(10),
                    boxShadow: const [BoxShadow(color: Color(0x1F000000), blurRadius: 4, offset: Offset(0, 1))],
                  ),
                  child: m['logo'] == null
                      ? const SizedBox(height: 40, width: 120)
                      : Image.network(_url(_s(m['logo'])), height: 40, fit: BoxFit.contain, semanticLabel: 'PsyGames',
                          errorBuilder: (_, _, _) => const SizedBox(height: 40, width: 120)),
                ),
              ),
            ),
          ),
          Column(crossAxisAlignment: CrossAxisAlignment.end, mainAxisSize: MainAxisSize.min, children: [
            Row(mainAxisSize: MainAxisSize.min, children: [
              _pill(
                key: const ValueKey('home-tokens'),
                onTap: () => onOpen('/shop'),
                bg: const Color(0x22FBBF24),
                border: const Color(0xFFF59E0B),
                padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 8),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  const Text('⭐', style: TextStyle(fontSize: 14)),
                  const SizedBox(width: 5),
                  Text('${m['tokens']}', style: TextStyle(color: web.text, fontWeight: FontWeight.w800, fontSize: 14)),
                  const SizedBox(width: 5),
                  Container(width: 1, height: 12, color: const Color(0x88F59E0B)),
                  const SizedBox(width: 5),
                  Text(_s(m['level']), style: const TextStyle(color: Color(0xFFB45309), fontWeight: FontWeight.w800, fontSize: 12)),
                  const SizedBox(width: 5),
                  const Text('🛍️', style: TextStyle(fontSize: 12)),
                ]),
              ),
              const SizedBox(width: 4),
              Semantics(
                button: true,
                label: _s(m['streakLabel']),
                child: _pill(
                  key: const ValueKey('home-streak'),
                  onTap: () => onOpen('/streak-calendar'),
                  bg: const Color(0x1CF97316),
                  border: const Color(0xFFF97316),
                  minWidth: 44,
                  layout: 34,
                  padding: const EdgeInsets.symmetric(horizontal: 7),
                  child: Text('🔥${m['streak']}', style: TextStyle(color: web.text, fontWeight: FontWeight.w900, fontSize: 13)),
                ),
              ),
            ]),
            const SizedBox(height: 3),
            Row(mainAxisSize: MainAxisSize.min, children: [
              _tap(
                key: const ValueKey('home-friends'),
                label: _s(m['friendsLabel']),
                onTap: () => onOpen('/friends'),
                child: SizedBox(width: 44, height: 22, child: IonIcon('people', size: 18, color: accent)),
              ),
              if (league is num) ...[
                const SizedBox(width: 8),
                _tap(
                  key: const ValueKey('home-league'),
                  label: _s(m['leaguesLabel']),
                  onTap: () => onOpen('/leagues'),
                  child: SizedBox(
                    width: 104,
                    height: 22,
                    child: Center(child: _progress(league.toDouble(), web.border, accent, 4, 2)),
                  ),
                ),
              ],
            ]),
          ]),
          const SizedBox(width: 2),
          _tap(
            key: const ValueKey('home-pet'),
            label: _s(m['petLabel']),
            onTap: () => onOpen('/pet'),
            child: SizedBox(
              width: 56,
              height: 36,
              child: OverflowBox(
                maxHeight: 56,
                child: pet == null ? const SizedBox(width: 48, height: 48) : PetFrames(spec: pet, size: 48, origin: origin, still: true),
              ),
            ),
          ),
        ]),
        const SizedBox(height: 6),
        Wrap(
          alignment: WrapAlignment.spaceBetween,
          crossAxisAlignment: WrapCrossAlignment.center,
          runSpacing: 6,
          children: [
            ConstrainedBox(
              constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width - 40 - 176),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                Semantics(
                  button: true,
                  child: _tall(
                    layout: 34,
                    visible: 44,
                    child: GestureDetector(
                    key: const ValueKey('home-profile-chip'),
                    behavior: HitTestBehavior.opaque,
                    onTap: onSwitcher,
                    child: Container(
                      constraints: const BoxConstraints(minHeight: 44),
                      padding: const EdgeInsets.symmetric(vertical: 5, horizontal: 10),
                      decoration: BoxDecoration(
                        color: cssColor(chip['bg']),
                        border: Border.all(color: cssColor(chip['border']), width: _d(chip['borderWidth'], 1.5)),
                        borderRadius: BorderRadius.circular(100),
                      ),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        if (chip['image'] != null)
                          ClipRRect(
                            borderRadius: BorderRadius.circular(6),
                            child: Image.network(_url(_s(chip['image'])), width: 20, height: 20, fit: BoxFit.cover,
                                errorBuilder: (_, _, _) => const SizedBox(width: 20, height: 20)),
                          )
                        else
                          Text(_s(chip['emoji']), style: const TextStyle(fontSize: 14)),
                        const SizedBox(width: 6),
                        Flexible(
                          child: Text(_s(chip['name']),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(color: web.text, fontWeight: FontWeight.w700, fontSize: 13)),
                        ),
                        const SizedBox(width: 6),
                        IonIcon('chevron-down', size: 14, color: web.text),
                      ]),
                    ),
                  ),
                  ),
                ),
                if (m['title'] != null)
                  Padding(
                    padding: const EdgeInsets.only(left: 2, top: 4),
                    child: Text(_s(m['title']), style: onBg(const TextStyle(fontSize: 11, fontWeight: FontWeight.w700))),
                  ),
              ]),
            ),
            Row(mainAxisSize: MainAxisSize.min, children: [
              _circle(context, key: 'achievements', ion: 'trophy', color: const Color(0xFFFBBF24), label: _s(labels['achievements']),
                  onTap: () => onOpen('/achievements'), badge: (m['achievements'] as num? ?? 0) > 0 ? '${m['achievements']}' : null),
              _circle(context, key: 'shop', ion: 'bag-handle', color: accent, label: _s(labels['shop']), onTap: () => onOpen('/shop')),
              _circle(context, key: 'statistics', ion: 'stats-chart', color: accent, label: _s(labels['statistics']), onTap: () => onOpen('/statistics')),
              _circle(context, key: 'settings', ion: 'settings-outline', color: web.text, label: _s(labels['settings']), onTap: () => onOpen('/settings')),
            ]),
          ],
        ),
        const SizedBox(height: 6),
        Text(_s(m['subtitle']),
            key: const ValueKey('home-subtitle'),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: onBg(const TextStyle(fontSize: 14, height: 19 / 14))),
        if (_map(m['update']).isNotEmpty)
          GestureDetector(
            key: const ValueKey('home-update'),
            onTap: () => act('update'),
            child: Container(
              margin: const EdgeInsets.only(top: 8),
              padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
              decoration: BoxDecoration(
                color: accent.withAlpha(0x22),
                border: Border.all(color: accent, width: 1.5),
                borderRadius: BorderRadius.circular(11),
              ),
              child: Row(children: [
                IonIcon('arrow-up-circle', size: 17, color: accent),
                const SizedBox(width: 7),
                Flexible(
                  child: Text(_s(_map(m['update'])['text']),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: accent, fontSize: 13, fontWeight: FontWeight.w800)),
                ),
              ]),
            ),
          ),
      ]),
    );
  }

  /// Плашка 44 в высоту при меньшем месте в строке ([layout]) — `minHeight: 44` + `marginVertical` веба.
  Widget _pill({Key? key, required VoidCallback onTap, required Color bg, required Color border, required EdgeInsets padding,
          double? minWidth, double layout = 30, required Widget child}) =>
      _tall(
        layout: layout,
        visible: 44,
        child: GestureDetector(
          key: key,
          behavior: HitTestBehavior.opaque,
          onTap: onTap,
          child: Container(
            constraints: BoxConstraints(minHeight: 44, minWidth: minWidth ?? 0),
            alignment: Alignment.center,
            padding: padding,
            decoration: BoxDecoration(color: bg, border: Border.all(color: border, width: 1.5), borderRadius: BorderRadius.circular(100)),
            child: child,
          ),
        ),
      );

  Widget _tap({required Key key, required String label, required VoidCallback onTap, required Widget child}) => Semantics(
        button: true,
        label: label,
        child: GestureDetector(key: key, behavior: HitTestBehavior.opaque, onTap: onTap, child: child),
      );

  /// 44×44 зона нажатия с кружком 36 внутри (`styles.iconButton` / `iconCircle`).
  Widget _circle(BuildContext context,
      {required String key, required String ion, required Color color, required String label, required VoidCallback onTap, String? badge}) {
    final web = WebTheme.of(context);
    return _tap(
      key: ValueKey('home-icon-$key'),
      label: label,
      onTap: onTap,
      child: SizedBox(
        width: 44,
        height: 44,
        child: Stack(alignment: Alignment.center, children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(color: web.surface, shape: BoxShape.circle),
            child: IonIcon(ion, size: 18, color: color),
          ),
          if (badge != null)
            Positioned(
              top: 0,
              right: 0,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                decoration: BoxDecoration(color: const Color(0xFFFBBF24), borderRadius: BorderRadius.circular(10)),
                child: Text(badge, style: const TextStyle(color: Colors.black, fontSize: 10, fontWeight: FontWeight.w900)),
              ),
            ),
        ]),
      ),
    );
  }
}

/// Цвет акцента профиля (`colors.primary` веба) — ставит оболочка темой, иначе цвет темы Material.
class _Accent extends ThemeExtension<_Accent> {
  const _Accent(this.color);
  final Color color;
  @override
  _Accent copyWith({Color? color}) => _Accent(color ?? this.color);
  @override
  _Accent lerp(_Accent? other, double t) => other ?? this;
}

/// Акцент профиля для Главной — поставь над [HomeScreen] (оболочка: `WebTheme.accent(state)`).
class HomeAccent extends StatelessWidget {
  const HomeAccent({super.key, required this.color, required this.child});
  final Color color;
  final Widget child;
  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Theme(data: t.copyWith(extensions: [...t.extensions.values.where((e) => e is! _Accent), _Accent(color)]), child: child);
  }
}

Color _accentOf(BuildContext context) => Theme.of(context).extension<_Accent>()?.color ?? Theme.of(context).colorScheme.primary;

// ───────────────────────────── Лента ─────────────────────────────

/// Заголовок секции ленты (`styles.sectionHeader`): черта 4×18, значок, название 17/700.
Widget _sectionHeader(BuildContext context, {Color? dot, String? ion, double iconSize = 19, required String title, Widget? trailing}) {
  final web = WebTheme.of(context);
  return Padding(
    padding: const EdgeInsets.only(left: 4, bottom: 12),
    child: Row(children: [
      if (dot != null) ...[
        Container(width: 4, height: 18, decoration: BoxDecoration(color: dot, borderRadius: BorderRadius.circular(2))),
        const SizedBox(width: 8),
      ],
      if (ion != null) ...[IonIcon(ion, size: iconSize, color: dot), const SizedBox(width: 8)],
      Expanded(child: Text(title, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: web.text))),
      ?trailing,
    ]),
  );
}

class _Search extends StatefulWidget {
  const _Search({required this.b, required this.act});
  final _M b;
  final void Function(String, [List<Object?>]) act;
  @override
  State<_Search> createState() => _SearchState();
}

class _SearchState extends State<_Search> {
  final _c = TextEditingController();
  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  void _go() => widget.act('search', [_c.text]);

  @override
  Widget build(BuildContext context) {
    final web = WebTheme.of(context);
    // `HomeCatalogSearch.tsx`: поле 48 и кнопка 44 «Игры · Фильтр», зазор 8, снизу 16.
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        TextField(
          key: const ValueKey('home-search'),
          controller: _c,
          style: WebTheme.fieldText(context),
          textInputAction: TextInputAction.search,
          onSubmitted: (_) => _go(),
          decoration: WebTheme.field(context, hint: _s(widget.b['placeholder'])),
        ),
        const SizedBox(height: 8),
        GestureDetector(
          key: const ValueKey('home-search-open'),
          onTap: _go,
          child: Container(
            constraints: const BoxConstraints(minHeight: 44),
            alignment: Alignment.center,
            decoration: BoxDecoration(color: web.surface, borderRadius: BorderRadius.circular(12)),
            child: Text(_s(widget.b['button']), style: TextStyle(color: _accentOf(context), fontWeight: FontWeight.w700, fontSize: 14)),
          ),
        ),
      ]),
    );
  }
}

class _Ladder extends StatelessWidget {
  const _Ladder({required this.b});
  final _M b;
  @override
  Widget build(BuildContext context) {
    final web = WebTheme.of(context);
    return Container(
      key: const ValueKey('home-ladder'),
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: web.surface,
        border: Border.all(color: web.border, width: 0.5),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(children: [
        IonIcon('lock-closed', size: 16, color: web.textSecondary),
        const SizedBox(width: 8),
        Flexible(
          child: Text(_s(b['text']),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: web.textSecondary)),
        ),
      ]),
    );
  }
}

class _Chest extends StatelessWidget {
  const _Chest({required this.b, required this.onOpen});
  final _M b;
  final ValueChanged<String> onOpen;
  @override
  Widget build(BuildContext context) {
    final web = WebTheme.of(context);
    return Semantics(
      button: true,
      label: _s(b['label']),
      child: GestureDetector(
        key: const ValueKey('home-chest'),
        behavior: HitTestBehavior.opaque,
        onTap: () => onOpen('/collection'),
        child: Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: web.surface,
            border: Border.all(color: web.border, width: 0.5),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Row(children: [
            Text(_s(b['face']), style: const TextStyle(fontSize: 22)),
            const SizedBox(width: 10),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(_s(b['text']),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: web.textSecondary)),
                const SizedBox(height: 6),
                _progress(_d(b['ratio']), web.border, _accentOf(context), 5, 3),
              ]),
            ),
            const SizedBox(width: 10),
            IonIcon('chevron-forward', size: 18, color: web.textSecondary),
          ]),
        ),
      ),
    );
  }
}

class _Resume extends StatelessWidget {
  const _Resume({required this.b, required this.onOpen});
  final _M b;
  final ValueChanged<String> onOpen;
  @override
  Widget build(BuildContext context) {
    final web = WebTheme.of(context);
    final g = [for (final c in (b['gradient'] as List? ?? const [])) cssColor(c)];
    final first = g.isEmpty ? _accentOf(context) : g.first;
    return Semantics(
      button: true,
      label: _s(b['label']),
      child: GestureDetector(
        key: const ValueKey('home-resume'),
        behavior: HitTestBehavior.opaque,
        onTap: () => onOpen(_s(b['href'])),
        child: Container(
          constraints: const BoxConstraints(minHeight: 68),
          margin: const EdgeInsets.only(bottom: 14),
          padding: const EdgeInsets.all(11),
          decoration: BoxDecoration(color: web.surface, border: Border.all(color: first, width: 1.5), borderRadius: BorderRadius.circular(16)),
          child: Row(children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                gradient: g.length >= 2 ? LinearGradient(colors: g, begin: Alignment.topLeft, end: Alignment.bottomRight) : null,
                color: g.length >= 2 ? null : first,
                borderRadius: BorderRadius.circular(13),
              ),
              child: IonIcon('play', size: 22, color: Colors.white),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(_s(b['title']), maxLines: 2, overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: web.text)),
                const SizedBox(height: 3),
                Text(_s(b['sub']), maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: web.textSecondary)),
              ]),
            ),
            const SizedBox(width: 12),
            IonIcon('chevron-forward', size: 22, color: first),
          ]),
        ),
      ),
    );
  }
}

/// «Цель дня» — `DailyGoalCard.tsx`: свёрнутый вопрос, форма, итог. Раскрытие и черновик — здесь,
/// решения (сохранить, закрыть, отметить исход) — у веба.
class _GoalCard extends StatefulWidget {
  const _GoalCard({super.key, required this.b, required this.act});
  final _M b;
  final void Function(String, [List<Object?>]) act;
  @override
  State<_GoalCard> createState() => _GoalCardState();
}

class _GoalCardState extends State<_GoalCard> {
  bool _open = false;
  final _draft = TextEditingController();
  static const _accent = Color(0xFF0EA5E9);

  @override
  void initState() {
    super.initState();
    _draft.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _draft.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final web = WebTheme.of(context);
    final tx = _map(widget.b['texts']);
    String t(String k) => _s(tx[k]);
    final state = widget.b['state'];
    final canSave = _draft.text.trim().isNotEmpty;
    Widget primary(String text, Color bg, Color fg, VoidCallback? onTap, Key key) => GestureDetector(
          key: key,
          onTap: onTap,
          child: Container(
            constraints: const BoxConstraints(minHeight: 44),
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10)),
            child: Text(text, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: fg)),
          ),
        );
    Widget ghost(String text, VoidCallback onTap, Key key) => GestureDetector(
          key: key,
          onTap: onTap,
          child: Container(
            constraints: const BoxConstraints(minHeight: 44),
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: BoxDecoration(border: Border.all(color: web.border), borderRadius: BorderRadius.circular(10)),
            child: Text(text, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: web.textSecondary)),
          ),
        );
    final ask = TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: web.text);
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: web.surface, border: Border.all(color: web.border), borderRadius: BorderRadius.circular(14)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(width: 4, height: 18, decoration: BoxDecoration(color: _accent, borderRadius: BorderRadius.circular(2))),
          const SizedBox(width: 8),
          IonIcon('flag-outline', size: 18, color: _accent),
          const SizedBox(width: 8),
          Expanded(
            child: Text(t('dayGoalTitle'), maxLines: 1, overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: web.text)),
          ),
          Semantics(
            button: true,
            label: t('dayGoalCloseA11y'),
            child: GestureDetector(
              key: const ValueKey('goal-close'),
              behavior: HitTestBehavior.opaque,
              onTap: () => widget.act('goalDismiss'),
              child: SizedBox(width: 34, height: 18, child: OverflowBox(maxWidth: 44, maxHeight: 44, child: IonIcon('close', size: 17, color: web.textSecondary))),
            ),
          ),
        ]),
        const SizedBox(height: 6),
        if (state == 'ask' && !_open)
          GestureDetector(
            key: const ValueKey('goal-expand'),
            behavior: HitTestBehavior.opaque,
            onTap: () => setState(() => _open = true),
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 44),
              child: Row(children: [
                Expanded(child: Text(t('dayGoalAsk'), maxLines: 1, overflow: TextOverflow.ellipsis, style: ask)),
                const SizedBox(width: 8),
                Text(t('dayGoalSave'), style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: _accent)),
                const SizedBox(width: 8),
                IonIcon('chevron-forward', size: 16, color: _accent),
              ]),
            ),
          ),
        if (state == 'ask' && _open) ...[
          Text(t('dayGoalAsk'), style: ask),
          const SizedBox(height: 6),
          Text(t('dayGoalAskHint'), style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, height: 16 / 12, color: web.textSecondary)),
          const SizedBox(height: 6),
          TextField(
            key: const ValueKey('goal-input'),
            controller: _draft,
            maxLength: (widget.b['maxLen'] as num?)?.toInt(),
            style: TextStyle(fontSize: 14, color: web.text),
            decoration: InputDecoration(
              counterText: '',
              hintText: t('dayGoalPlaceholder'),
              hintStyle: TextStyle(color: web.textSecondary),
              isDense: true,
              filled: true,
              fillColor: web.card,
              constraints: const BoxConstraints(minHeight: 42),
              contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: web.border)),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: web.border)),
            ),
          ),
          const SizedBox(height: 6),
          Wrap(spacing: 8, runSpacing: 8, children: [
            primary(t('dayGoalSave'), canSave ? _accent : web.border, canSave ? Colors.white : web.textSecondary, () {
              if (!canSave) return;
              widget.act('goalSave', [_draft.text]);
              _draft.clear();
            }, const ValueKey('goal-save')),
            ghost(t('notNow'), () => widget.act('goalDismiss'), const ValueKey('goal-later')),
          ]),
          const SizedBox(height: 10),
          Text(t('dayGoalExamplesTitle'), style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: web.textSecondary)),
          for (final e in (widget.b['examples'] as List? ?? const []))
            Text(_s(e), maxLines: 2, overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, height: 17 / 12, color: web.textSecondary)),
        ],
        if (state != 'ask') ...[
          Text(t('dayGoalTodayLine'), style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: web.textSecondary)),
          const SizedBox(height: 6),
          Text(_s(widget.b['goalText']), maxLines: 3, overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, height: 21 / 16, color: web.text)),
          const SizedBox(height: 6),
          Text((widget.b['roundsToday'] as num? ?? 0) > 0 ? t('rounds') : t('dayGoalRoundsNone'),
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: web.textSecondary)),
        ],
        if (state == 'review') ...[
          const SizedBox(height: 6),
          Text(t('dayGoalReview'), style: ask),
          const SizedBox(height: 6),
          Wrap(spacing: 8, runSpacing: 8, children: [
            primary(t('dayGoalYes'), const Color(0xFF22C55E), cssColor(tx['yesFg'], Colors.white),
                () => widget.act('goalOutcome', ['done']), const ValueKey('goal-yes')),
            ghost(t('dayGoalNo'), () => widget.act('goalOutcome', ['not_today']), const ValueKey('goal-no')),
          ]),
        ],
        if (state == 'closed') ...[
          const SizedBox(height: 6),
          Text(t(widget.b['outcome'] == 'done' ? 'dayGoalDoneNote' : 'dayGoalMissedNote'),
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, height: 18 / 13, color: web.textSecondary)),
          if (widget.b['outcome'] == 'done')
            (widget.b['reward'] as num? ?? 0) > 0
                ? Text(t('rewardNote'), style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, height: 19 / 14, color: Color(0xFFB45309)))
                : Text(t('dayGoalRewardNeedsRound'),
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, height: 18 / 13, color: web.textSecondary)),
        ],
      ]),
    );
  }
}

class _Today extends StatelessWidget {
  const _Today({required this.b, required this.onOpen});
  final _M b;
  final ValueChanged<String> onOpen;
  @override
  Widget build(BuildContext context) {
    final web = WebTheme.of(context);
    const amber = Color(0xFFF59E0B);
    final rows = _list(b['rows']);
    return Semantics(
      button: true,
      label: _s(b['title']),
      child: GestureDetector(
        key: const ValueKey('home-today'),
        behavior: HitTestBehavior.opaque,
        onTap: () => onOpen('/statistics'),
        child: Container(
          margin: const EdgeInsets.only(bottom: 14),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(color: web.surface, border: Border.all(color: web.border), borderRadius: BorderRadius.circular(16)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              Container(width: 4, height: 18, decoration: BoxDecoration(color: amber, borderRadius: BorderRadius.circular(2))),
              const SizedBox(width: 8),
              IonIcon('today-outline', size: 19, color: amber),
              const SizedBox(width: 8),
              Expanded(child: Text(_s(b['title']), style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: web.text))),
              Semantics(
                button: true,
                label: _s(b['totalLabel']),
                // `todayTotalBtn`: 44 в высоту, строке отдаёт 20 (marginVertical −12).
                child: _tall(
                  layout: 20,
                  visible: 44,
                  child: GestureDetector(
                  key: const ValueKey('home-today-total'),
                  behavior: HitTestBehavior.opaque,
                  onTap: () => onOpen('/shop'),
                  child: Container(
                    constraints: const BoxConstraints(minHeight: 44),
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                    decoration: BoxDecoration(
                      color: const Color(0x22FBBF24),
                      border: Border.all(color: amber, width: 1.5),
                      borderRadius: BorderRadius.circular(100),
                    ),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      Text('+${b['total']} ⭐', style: const TextStyle(color: Color(0xFFB45309), fontWeight: FontWeight.w900, fontSize: 14)),
                      const SizedBox(width: 3),
                      IonIcon('chevron-forward', size: 13, color: const Color(0xFFB45309)),
                    ]),
                  ),
                ),
                ),
              ),
            ]),
            const SizedBox(height: 6),
            if (b['empty'] != null)
              Text(_s(b['empty']), style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, height: 17 / 12.5, color: web.textSecondary)),
            for (final r in rows)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(children: [
                  Expanded(
                    child: Text(_s(r['name']), maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: web.text)),
                  ),
                  const SizedBox(width: 8),
                  Flexible(
                    child: Text(_s(r['rounds']), maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: web.textSecondary)),
                  ),
                  if (r['doubled'] == true) ...[
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                      decoration: BoxDecoration(color: const Color(0xFFFBBF24), borderRadius: BorderRadius.circular(999)),
                      child: const Text('×2', style: TextStyle(color: Color(0xFF3F2B00), fontSize: 11, fontWeight: FontWeight.w900)),
                    ),
                  ],
                  const SizedBox(width: 8),
                  ConstrainedBox(
                    constraints: const BoxConstraints(minWidth: 34),
                    child: Text('+${r['gain']}', textAlign: TextAlign.right,
                        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: web.text)),
                  ),
                ]),
              ),
            if (b['more'] != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(_s(b['more']), textAlign: TextAlign.right, style: TextStyle(fontSize: 12, color: web.textSecondary)),
              ),
            if (b['streakNote'] != null)
              Text(_s(b['streakNote']),
                  style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, height: 17 / 12.5, color: web.textSecondary)),
          ]),
        ),
      ),
    );
  }
}

/// Карточки рядами по [columns], каждая строка — одной высоты (`alignItems: stretch` веба).
/// Неполная последняя строка — той же ширины колонок, а не растянутая. Колонок не больше, чем
/// карточек: две карточки «Рекомендуем» — по половине ряда, как `flex: 1` веба, а не по трети.
Widget _heroGrid(List<Widget> cards, {required int columns}) => _heroRows(cards, columns.clamp(1, cards.isEmpty ? 1 : cards.length));

Widget _heroRows(List<Widget> cards, int columns) => Column(
  children: [
    for (var r = 0; r < cards.length; r += columns) ...[
      if (r > 0) const SizedBox(height: 10),
      IntrinsicHeight(
        child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          for (var i = r; i < r + columns; i++) ...[
            if (i > r) const SizedBox(width: 10),
            Expanded(child: i < cards.length ? cards[i] : const SizedBox.shrink()),
          ],
        ]),
      ),
    ],
  ],
);

/// «Рекомендуем сегодня» и «Практики дня» — ряд из трёх карточек на градиенте (`styles.hero*`).
class _HeroBlock extends StatelessWidget {
  /// Масштаб системного шрифта, с которого карточки идут в две колонки.
  static const largeText = 1.1;

  const _HeroBlock({
    required this.b, required this.origin, required this.onOpen, required this.act,
    required this.ion, required this.iconSize, required this.accent,
  });
  final _M b;
  final String origin;
  final ValueChanged<String> onOpen;
  final void Function(String, [List<Object?>]) act;
  final String ion;
  final double iconSize;
  final Color? accent;

  @override
  Widget build(BuildContext context) {
    final web = WebTheme.of(context);
    final color = accent ?? _accentOf(context);
    final cards = _list(b['cards']);
    final hint = b['hint'];
    return Padding(
      key: ValueKey('home-${b['kind']}'),
      padding: EdgeInsets.only(bottom: hint != null ? 14 : 0),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        _sectionHeader(context, dot: color, ion: ion, iconSize: iconSize, title: _s(b['title'])),
        // `recoBlock` веба: зазор 6 между детьми, у подсказки `marginTop: -2` → 4 после заголовка, 6 до ряда.
        if (hint != null) ...[
          const SizedBox(height: 4),
          Text(_s(hint), maxLines: 2, overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: web.textSecondary)),
          const SizedBox(height: 6),
        ],
        // 🔴 КРУПНЫЙ СИСТЕМНЫЙ ШРИФТ — ДВЕ КОЛОНКИ, А НЕ ТРИ (отчёты 316f0438, a7318e1e; задача a0d262ce).
        // Кадр 07.10 нативной Главной, EN, 390 pt: при ×1,3 «Daily challen…», «CHOO…»; при ×1,5 —
        // «Schulte: Attenti…», «STA…», «Daily ch allenge». Колонка в треть экрана не вмещает слово.
        // Порог 1,1: уже при шаге Android «Large» (×1,15) кнопка рвётся посреди слова («CHOOS|E»).
        Padding(
          padding: const EdgeInsets.only(bottom: 22),
          child: _heroGrid(
            [for (final c in cards) _HeroCard(c: c, origin: origin, onOpen: onOpen, act: act)],
            columns: MediaQuery.textScalerOf(context).scale(14) / 14 > _HeroBlock.largeText ? 2 : 3,
          ),
        ),
      ]),
    );
  }
}

class _HeroCard extends StatelessWidget {
  const _HeroCard({required this.c, required this.origin, required this.onOpen, required this.act});
  final _M c;
  final String origin;
  final ValueChanged<String> onOpen;
  final void Function(String, [List<Object?>]) act;

  @override
  Widget build(BuildContext context) {
    final look = _map(c['look']);
    final fg = cssColor(look['fg'], Colors.white);
    final soft = cssColor(look['soft'], Colors.white70);
    final g = [for (final x in (c['gradient'] as List? ?? const [])) cssColor(x)];
    final icon = _map(c['icon']);
    final cta = _map(c['cta']);
    final veil = look['veil'];
    final image = icon['image'];
    return Semantics(
      button: true,
      label: _s(c['label']),
      child: GestureDetector(
        key: ValueKey('home-card-${c['id']}'),
        behavior: HitTestBehavior.opaque,
        onTap: () => c['action'] == 'challenge' ? act('challenge') : onOpen(_s(c['href'])),
        child: Container(
          constraints: const BoxConstraints(minHeight: 150),
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            gradient: g.length >= 2 ? LinearGradient(colors: g, begin: Alignment.topLeft, end: Alignment.bottomRight) : null,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Stack(children: [
            if (veil != null) Positioned.fill(child: ColoredBox(color: cssColor(veil))),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  if (image != null)
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: Image.network(image.toString().startsWith('http') ? '$image' : '$origin$image',
                          width: 30, height: 30, errorBuilder: (_, _, _) => const SizedBox(width: 30, height: 30)),
                    )
                  else
                    IonIcon(_s(icon['ion']), size: _d(icon['size'], 26), color: fg),
                  const Spacer(),
                  if (c['chip'] != null)
                    Container(
                      constraints: const BoxConstraints(minHeight: 48, minWidth: 22),
                      alignment: Alignment.center,
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(color: cssColor(c['chipBg']), borderRadius: BorderRadius.circular(16)),
                      child: Text(_s(c['chip']), style: TextStyle(color: fg, fontWeight: FontWeight.w900, fontSize: 10)),
                    ),
                ]),
                const SizedBox(height: 6),
                ConstrainedBox(
                  constraints: const BoxConstraints(minHeight: 34),
                  child: Text(_s(c['title']), maxLines: 2, overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: fg, fontSize: 14, fontWeight: FontWeight.w900, letterSpacing: 1)),
                ),
                const SizedBox(height: 6),
                Text(_s(c['sub']), maxLines: 3, overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: soft, fontSize: 11, fontWeight: FontWeight.w600)),
                const SizedBox(height: 10),
                Container(
                  constraints: const BoxConstraints(minHeight: 48),
                  padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 8),
                  decoration: BoxDecoration(color: cssColor(cta['bg']), borderRadius: BorderRadius.circular(16)),
                  child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                    IonIcon(_s(cta['ion']), size: 14, color: cssColor(cta['fg'], fg)),
                    const SizedBox(width: 4),
                    // Без предела строк — как `heroCtaText` веба: подпись переносится, а не режется («CHOO…»).
                    Flexible(
                      child: Text(_s(cta['text']), textAlign: TextAlign.center,
                          style: TextStyle(color: cssColor(cta['fg'], fg), fontWeight: FontWeight.w900, fontSize: 11, letterSpacing: 1)),
                    ),
                  ]),
                ),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}

/// «Любимые разделы» — `CategorySections rows={1}`: тем же [CatalogKit], что вкладка «Игры».
class _Favourites extends StatelessWidget {
  const _Favourites({required this.b, required this.kit, required this.state, required this.onOpen, required this.onTab});
  final _M b;
  final CatalogKit? kit;
  final SharedState state;
  final ValueChanged<String> onOpen;
  final ValueChanged<String> onTab;

  @override
  Widget build(BuildContext context) {
    final k = kit;
    if (k == null) return const SizedBox.shrink();
    final accent = _accentOf(context);
    final hubCount = k.visible(state).hubCount;
    return Column(key: const ValueKey('home-favourites'), crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _sectionHeader(
        context,
        title: _s(b['title']),
        trailing: GestureDetector(
          key: const ValueKey('home-all-games'),
          onTap: () => onTab('/games'),
          child: Text(_s(b['allLabel']), style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: accent)),
        ),
      ),
      for (final s in _list(b['sections']))
        if (k.category(_s(s['category'])) case final cat?)
          Padding(
            padding: const EdgeInsets.only(bottom: 24),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              CatalogKit.sectionHeader(context, cat, (s['total'] as num? ?? 0).toInt(), key: ValueKey('home-section-${cat.id}')),
              CatalogKit.grid(context, [
                for (final r in (s['routes'] as List? ?? const []))
                  if (k.byRoute('$r') case final g?) (_) => k.tile(state, g, hubCount: hubCount, onTap: () => onOpen(g.route)),
              ]),
              if (s['more'] != null)
                GestureDetector(
                  key: ValueKey('home-more-${cat.id}'),
                  behavior: HitTestBehavior.opaque,
                  onTap: () => onTab('/games'),
                  child: Container(
                    constraints: const BoxConstraints(minHeight: 44),
                    alignment: Alignment.centerLeft,
                    padding: const EdgeInsets.only(left: 4, top: 6),
                    child: Text(_s(s['more']), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: accent)),
                  ),
                ),
            ]),
          ),
    ]);
  }
}

/// Окно цели серии — `StreakGoalSheet.tsx`: питомец с репликой, три срока, факт о сегодняшнем дне, «Не сейчас».
class _GoalSheet extends StatelessWidget {
  const _GoalSheet({required this.origin, required this.close, required this.act});
  final String origin;
  final VoidCallback close;
  final void Function(String, [List<Object?>]) act;

  @override
  Widget build(BuildContext context) {
    final web = WebTheme.of(context);
    return ValueListenableBuilder<_M?>(
      valueListenable: ScreenUi.model(HomeScreen.route),
      builder: (context, m, _) {
        final s = _map(m?['goalSheet']);
        if (s.isEmpty) return const SizedBox.shrink();
        final pet = PetSpec.fromJson(s['pet']);
        final accent = _accentOf(context);
        return Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Material(
              key: const ValueKey('goal-sheet'),
              color: web.surface,
              borderRadius: BorderRadius.circular(18),
              child: Container(
                constraints: const BoxConstraints(maxWidth: 440),
                padding: const EdgeInsets.all(20),
                child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                    if (pet != null) PetFrames(spec: pet, size: 64, origin: origin, still: true),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
                        decoration: BoxDecoration(
                          color: web.surface,
                          border: Border.all(color: web.border),
                          borderRadius: const BorderRadius.only(
                            topLeft: Radius.circular(13), topRight: Radius.circular(13),
                            bottomRight: Radius.circular(13), bottomLeft: Radius.circular(4),
                          ),
                        ),
                        child: Text(_s(s['line']), style: TextStyle(fontSize: 14, height: 19 / 14, color: web.text)),
                      ),
                    ),
                  ]),
                  const SizedBox(height: 14),
                  for (final o in _list(s['options'])) ...[
                    GestureDetector(
                      key: ValueKey('goal-option-${o['days']}'),
                      onTap: () {
                        close();
                        act('goalPick', [o['days']]);
                      },
                      child: Container(
                        constraints: const BoxConstraints(minHeight: 56),
                        alignment: Alignment.centerLeft,
                        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 16),
                        decoration: BoxDecoration(
                          border: Border.all(color: o['chosen'] == true ? accent : web.border, width: o['chosen'] == true ? 2 : 1),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                          Text(_s(o['text']),
                              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: o['chosen'] == true ? accent : web.text)),
                          if (o['why'] != null)
                            Padding(
                              padding: const EdgeInsets.only(top: 3),
                              child: Text(_s(o['why']), style: TextStyle(fontSize: 12.5, height: 17 / 12.5, color: web.textSecondary)),
                            ),
                        ]),
                      ),
                    ),
                    const SizedBox(height: 10),
                  ],
                  Text(_s(s['today']), textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 12.5, height: 17 / 12.5, color: web.textSecondary)),
                  GestureDetector(
                    key: const ValueKey('goal-skip'),
                    onTap: () {
                      close();
                      act('goalSkip');
                    },
                    child: Container(
                      constraints: const BoxConstraints(minHeight: 48),
                      alignment: Alignment.center,
                      child: Text(_s(s['skip']), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: web.textSecondary)),
                    ),
                  ),
                ]),
              ),
            ),
          ),
        );
      },
    );
  }
}

/// «Все развилки ›» внизу Главной (решение Дениса 07.10.2026, b271f702) — `allForks` веба: по центру,
/// цветом профиля, 15/700, высота нажатия 48. Ведёт на вкладку «Игры» с фильтром «только развилки».
class _AllForks extends StatelessWidget {
  const _AllForks({required this.b, required this.onTab});
  final _M b;
  final ValueChanged<String> onTab;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Center(
          child: Semantics(
            button: true,
            child: GestureDetector(
              key: const ValueKey('home-all-forks'),
              behavior: HitTestBehavior.opaque,
              onTap: () => onTab(_s(b['href'])),
              child: Container(
                constraints: const BoxConstraints(minHeight: 48),
                padding: const EdgeInsets.symmetric(horizontal: 16),
                alignment: Alignment.center,
                child: Text(_s(b['label']), style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: _accentOf(context))),
              ),
            ),
          ),
        ),
      );
}
