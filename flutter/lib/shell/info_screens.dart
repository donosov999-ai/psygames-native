import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import 'feedback_fab.dart' show FabRules;
import 'ion_icon.dart';
import 'screen_ui.dart';
import 'shared_state.dart';
import 'sources_model.dart';
import 'web_theme.dart';

/// ЧЕТЫРЕ СТРАНИЦЫ ПО МОДЕЛИ ВЕБА: «Источники», «Коллекция», «Достижения», «Лиги»
/// (задачи 78165c68, 8111eea4, 56660caa, ac902ebf; правило 4e679f41).
///
/// Все четыре только показывают: лицензии, фигурки, достижения и лигу считает веб под оболочкой
/// (`app/sources.tsx`, `collection.tsx`, `achievements.tsx`, `leagues.tsx`), сюда приходят готовые
/// строки. Нажатия — действия веба: «назад», открыть ссылку, тап по фигурке. Размеры — из `styles`
/// каждого экрана.

typedef _M = Map<String, Object?>;
_M _map(Object? v) => v is Map ? Map<String, Object?>.from(v) : const {};
List<_M> _list(Object? v) => v is List ? [for (final x in v) _map(x)] : const [];
String _s(Object? v) => v == null ? '' : '$v';

/// Общий каркас страницы по модели: ждём модель, фон веба, умолчания текста веба. Им же пользуются
/// «Друзья» (`friends_screen.dart`).
class ModelPage extends StatefulWidget {
  const ModelPage({
    super.key,
    required this.route,
    required this.screenKey,
    required this.builder,
    this.safeTop = true,
    this.compute,
  });
  final String route;
  final String screenKey;
  final bool safeTop;
  final Widget Function(BuildContext context, Map<String, Object?> m) builder;

  /// 🔴 МОДЕЛЬ НА DART (задача d6a60b02, вариант Б): экран считает её сам и страницу не ждёт. Нет —
  /// модель приходит от веб-экрана под оболочкой ([ScreenUi]), как раньше.
  final Future<Map<String, Object?>> Function()? compute;

  @override
  State<ModelPage> createState() => _ModelPageState();
}

class _ModelPageState extends State<ModelPage> {
  Future<Map<String, Object?>>? _own;

  @override
  void initState() {
    super.initState();
    _own = widget.compute?.call();
  }

  Widget _page(BuildContext context, _M? m) => Material(
    key: ValueKey(widget.screenKey),
    color: WebTheme.of(context).background,
    child: m == null
        ? Center(child: CircularProgressIndicator(key: ValueKey('${widget.screenKey}-loading')))
        : WebTheme.textDefaults(context, SafeArea(top: widget.safeTop, bottom: false, child: widget.builder(context, m))),
  );

  @override
  Widget build(BuildContext context) {
    final own = _own;
    if (own != null) {
      return FutureBuilder<_M>(future: own, builder: (context, snap) => _page(context, snap.data));
    }
    return ValueListenableBuilder<_M?>(valueListenable: ScreenUi.model(widget.route), builder: (context, m, _) => _page(context, m));
  }
}

Widget circleBack(BuildContext context, String key, String label, String ion, VoidCallback onTap, {bool filled = true}) {
  final web = WebTheme.of(context);
  return Semantics(
    button: true,
    label: label,
    excludeSemantics: true,
    child: GestureDetector(
      key: ValueKey(key),
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(color: filled ? web.surface : null, shape: BoxShape.circle),
        child: Center(child: IonIcon(ion, size: 24, color: web.text)),
      ),
    ),
  );
}

// ── «Источники» ──────────────────────────────────────────────────────────────────────────────────

class SourcesScreen extends StatelessWidget {
  const SourcesScreen({super.key, this.state});
  static const route = '/sources';

  /// Есть — модель считается на Dart ([sourcesModelFor], вариант Б); нет — приходит от веба.
  final SharedState? state;

  /// Ссылка источника — во внешнем браузере, без веба. Пробы подменяют.
  static Future<void> Function(String url) openUrl = (url) async {
    try {
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    } catch (_) {/* браузера нет — молча, как `Linking.openURL(…).catch` веба */}
  };

  @override
  Widget build(BuildContext context) => ModelPage(
    route: route,
    screenKey: 'sources-screen',
    compute: state == null ? null : () => sourcesModelFor(state!),
    // У веба корень без SafeAreaView, сверху свой отступ 56.
    safeTop: false,
    builder: (context, m) {
      final web = WebTheme.of(context);
      final primary = cssColor(m['primary'], Theme.of(context).colorScheme.primary); // цвет профиля веба
      final voices = _map(m['voices']);
      Widget card(List<Widget> children) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: web.surface,
          border: Border.all(color: web.border, width: 0.5),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
      );
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 56, 16, 12),
            child: Row(
              children: [
                circleBack(context, 'sources-back', _s(m['back']), 'arrow-back', () => ScreenUi.act(route, 'back')),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    _s(m['title']),
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: web.text),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: ListView(
              key: const ValueKey('sources-list'),
              padding: EdgeInsets.fromLTRB(16, 16, 16, FabRules.clearance),
              children: [
                Padding(
                  padding: const EdgeInsets.only(bottom: 4 + 12),
                  child: Text(
                    _s(m['intro']),
                    style: TextStyle(fontSize: 14, height: 20 / 14, color: web.textSecondary),
                  ),
                ),
                for (final c in _list(m['cards'])) ...[
                  card([
                    Text(
                      _s(c['name']),
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: web.text),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      _s(c['what']),
                      style: TextStyle(fontSize: 14, height: 19 / 14, color: web.textSecondary),
                    ),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 4,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Text(
                          _s(c['license']),
                          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: primary),
                        ),
                        if (c['credit'] != null)
                          Text(
                            '· ${c['credit']}',
                            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: web.textSecondary),
                          ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Semantics(
                      link: true,
                      label: _s(c['url']),
                      excludeSemantics: true,
                      child: GestureDetector(
                        key: ValueKey('sources-link-${c['name']}'),
                        behavior: HitTestBehavior.opaque,
                        onTap: () => state == null ? ScreenUi.act(route, 'open', [c['url']]) : openUrl(_s(c['url'])),
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(minHeight: 48),
                          child: Align(
                            alignment: AlignmentDirectional.centerStart,
                            child: Text(
                              _s(c['url']),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: primary),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ]),
                  const SizedBox(height: 12),
                ],
                card([
                  Text(
                    _s(voices['title']),
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: web.text),
                  ),
                  for (final r in _list(voices['rows'])) ...[
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 4,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Text(
                          _s(r['author']),
                          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: web.text),
                        ),
                        Text(
                          _s(r['license']),
                          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: primary),
                        ),
                        Text(
                          '· ${r['count']}',
                          style: TextStyle(fontSize: 14, height: 19 / 14, color: web.textSecondary),
                        ),
                      ],
                    ),
                  ],
                ]),
              ],
            ),
          ),
        ],
      );
    },
  );
}

// ── «Коллекция» ──────────────────────────────────────────────────────────────────────────────────

class CollectionScreen extends StatelessWidget {
  const CollectionScreen({super.key});
  static const route = '/collection';

  @override
  Widget build(BuildContext context) => ModelPage(
    route: route,
    screenKey: 'collection-screen',
    builder: (context, m) {
      final web = WebTheme.of(context);
      final primary = cssColor(m['primary'], Theme.of(context).colorScheme.primary); // цвет профиля веба
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Выход закреплён сверху и не прокручивается (как `onboarding-exit-visible` веба).
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            decoration: BoxDecoration(
              border: Border(bottom: BorderSide(color: web.border, width: 0.5)),
            ),
            child: Row(
              children: [
                circleBack(context, 'collection-exit', _s(m['back']), 'arrow-back', () => ScreenUi.act(route, 'back'), filled: false),
                Expanded(
                  child: Text(
                    _s(m['title']),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: web.text),
                  ),
                ),
                const SizedBox(width: 48),
              ],
            ),
          ),
          Expanded(
            child: ListView(
              key: const ValueKey('collection-list'),
              padding: EdgeInsets.fromLTRB(12, 12, 12, FabRules.clearance),
              children: [
                Text(
                  _s(m['sub']),
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 13, color: web.textSecondary),
                ),
                if (m['hint'] != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    _s(m['hint']),
                    key: const ValueKey('collection-hint'),
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 13, color: primary),
                  ),
                ],
                const SizedBox(height: 12),
                Wrap(
                  alignment: WrapAlignment.center,
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    for (final (i, f) in _list(m['figures']).indexed)
                      Semantics(
                        button: true,
                        label: _s(f['a11y']),
                        excludeSemantics: true,
                        child: GestureDetector(
                          key: ValueKey('collection-figure-$i'),
                          onTap: () => ScreenUi.act(route, 'tap', [i]),
                          child: Opacity(
                            opacity: f['owned'] == true ? 1 : 0.55,
                            child: Container(
                              width: 104,
                              constraints: const BoxConstraints(minHeight: 120),
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 10),
                              decoration: BoxDecoration(
                                color: web.surface,
                                border: Border.all(color: f['owned'] == true ? primary : web.border, width: 1.5),
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Opacity(
                                    opacity: f['owned'] == true ? 1 : 0.35,
                                    child: Text(_s(f['face']), style: const TextStyle(fontSize: 38)),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    _s(f['name']),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: web.text),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    _s(f['price']),
                                    maxLines: f['owned'] == true ? 1 : 2,
                                    overflow: TextOverflow.ellipsis,
                                    textAlign: TextAlign.center,
                                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: web.textSecondary),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ],
      );
    },
  );
}

// ── «Достижения» ─────────────────────────────────────────────────────────────────────────────────

class AchievementsScreen extends StatelessWidget {
  const AchievementsScreen({super.key});
  static const route = '/achievements';
  static const _gold = Color(0xFFFBBF24);

  @override
  Widget build(BuildContext context) => ModelPage(
    route: route,
    screenKey: 'achievements-screen',
    builder: (context, m) {
      final web = WebTheme.of(context);
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
            child: Row(
              children: [
                circleBack(
                  context,
                  'achievements-back',
                  _s(m['back']),
                  m['rtl'] == true ? 'arrow-forward' : 'arrow-back',
                  () => ScreenUi.act(route, 'back'),
                ),
                Expanded(
                  child: Text(
                    _s(m['title']),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: web.text),
                  ),
                ),
                const SizedBox(width: 44),
              ],
            ),
          ),
          Expanded(
            child: Align(
              alignment: Alignment.topCenter,
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 720),
                child: ListView(
                  key: const ValueKey('achievements-list'),
                  padding: EdgeInsets.fromLTRB(16, 16, 16, FabRules.clearance),
                  children: [
                    for (final sec in _list(m['sections'])) ...[
                      Padding(
                        padding: const EdgeInsets.only(left: 4, bottom: 10),
                        child: Text(
                          _s(sec['title']),
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: web.text),
                        ),
                      ),
                      Wrap(spacing: 8, runSpacing: 8, children: [for (final a in _list(sec['cards'])) _card(context, a)]),
                      const SizedBox(height: 18),
                    ],
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Text(
                        _s(m['footer']),
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 12, fontStyle: FontStyle.italic, color: web.textSecondary),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      );
    },
  );

  Widget _card(BuildContext context, _M a) {
    final web = WebTheme.of(context);
    final on = a['unlocked'] == true;
    return Opacity(
      key: ValueKey('achievement-${a['id']}'),
      opacity: on ? 1 : 0.4,
      child: Container(
        width: 145,
        constraints: const BoxConstraints(minHeight: 130),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: web.surface,
          border: Border.all(color: on ? _gold : web.border, width: 2),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          children: [
            Opacity(
              opacity: on ? 1 : 0.5,
              child: Text(_s(a['emoji']), style: const TextStyle(fontSize: 32)),
            ),
            const SizedBox(height: 4),
            Text(
              _s(a['name']),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: web.text),
            ),
            const SizedBox(height: 4),
            Text(
              _s(a['desc']),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 10, height: 13 / 10, color: web.textSecondary),
            ),
            if (a['date'] != null)
              Padding(
                padding: const EdgeInsets.only(top: 4 + 4),
                child: Text(
                  _s(a['date']),
                  style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: _gold),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

// ── «Лиги» ───────────────────────────────────────────────────────────────────────────────────────

class LeaguesScreen extends StatelessWidget {
  const LeaguesScreen({super.key});
  static const route = '/leagues';

  @override
  Widget build(BuildContext context) => ModelPage(
    route: route,
    screenKey: 'leagues-screen',
    builder: (context, m) {
      final web = WebTheme.of(context);
      final primary = cssColor(m['primary'], Theme.of(context).colorScheme.primary);
      final card = _map(m['card']);
      final frames = _list(m['frames']);
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(
              children: [
                circleBack(context, 'leagues-back', _s(m['back']), _s(m['backIcon']), () => ScreenUi.act(route, 'back'), filled: false),
                Expanded(
                  child: Text(
                    _s(m['title']),
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: web.text),
                  ),
                ),
                const SizedBox(width: 48),
              ],
            ),
          ),
          Expanded(
            child: ListView(
              key: const ValueKey('leagues-list'),
              padding: EdgeInsets.fromLTRB(16, 16, 16, FabRules.clearance),
              children: [
                Container(
                  key: const ValueKey('leagues-card'),
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: web.surface,
                    border: Border.all(color: web.border),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Column(
                    children: [
                      Text(
                        _s(card['label']).toUpperCase(),
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 12.5, letterSpacing: 0.4, color: web.textSecondary),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        _s(card['pts']),
                        style: TextStyle(
                          fontSize: 40,
                          fontWeight: FontWeight.w900,
                          color: web.text,
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        _s(card['rank']),
                        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: web.textSecondary),
                      ),
                      const SizedBox(height: 2 + 2),
                      Text(
                        _s(card['toNext']),
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 13, color: web.textSecondary),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 10),
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Text(
                    _s(m['hint']),
                    style: TextStyle(fontSize: 13, height: 19 / 13, color: web.textSecondary),
                  ),
                ),
                for (final l in _list(m['leagues'])) ...[
                  const SizedBox(height: 10),
                  Semantics(
                    label: _s(l['a11y']),
                    excludeSemantics: true,
                    container: true,
                    child: Opacity(
                      key: ValueKey('league-${l['id']}'),
                      opacity: l['reached'] == true ? 1 : 0.55,
                      child: Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: web.surface,
                          border: Border.all(color: l['here'] == true ? primary : web.border, width: l['here'] == true ? 2 : 1),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(
                          children: [
                            IonIcon(
                              l['reached'] == true ? 'shield-checkmark' : 'lock-closed-outline',
                              size: 22,
                              color: l['here'] == true ? primary : web.textSecondary,
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    _s(l['name']),
                                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: web.text),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(_s(l['sub']), style: TextStyle(fontSize: 12.5, color: web.textSecondary)),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
                if (frames.isNotEmpty) ...[
                  const SizedBox(height: 10 + 14),
                  Text(
                    _s(m['framesTitle']),
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: web.text),
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final f in frames)
                        Container(
                          key: ValueKey('league-frame-${f['id']}'),
                          padding: const EdgeInsets.symmetric(vertical: 7, horizontal: 12),
                          decoration: BoxDecoration(
                            color: web.surface,
                            border: Border.all(color: web.border),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IonIcon('ribbon-outline', size: 18, color: primary),
                              const SizedBox(width: 6),
                              Text(
                                _s(f['name']),
                                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: web.text),
                              ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ],
                if (m['empty'] != null) ...[
                  const SizedBox(height: 10),
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Text(
                      _s(m['empty']),
                      style: TextStyle(fontSize: 13, height: 19 / 13, color: web.textSecondary),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      );
    },
  );
}
