import 'dart:async';

import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';

import 'feedback_fab.dart' show FabRules;
import 'info_screens.dart' show ModelPage, circleBack;
import 'ion_icon.dart';
import 'l10n.dart';
import 'screen_ui.dart';
import 'shared_state.dart';
import 'update_check.dart';
import 'web_theme.dart';
import 'whats_new_model.dart';

/// «ЧТО НОВОГО»: полная модель на Dart из канонического архива WHATS_NEW.
///
/// Список версий — выгрузка `WHATS_NEW`, строки модели как у `app/whats-new.tsx`. «Проверить
/// обновления» делает оболочка тем же путём, что Настройки ([checkForUpdatesDialog]): у сайта нет
/// CORS для WebView. Размеры — из `styles` веб-экрана.
/// Со state — production native model; без state — совместимость с legacy WEB fixtures.
class WhatsNewScreen extends StatefulWidget {
  const WhatsNewScreen({super.key, this.state});
  static const route = '/whats-new';

  /// Production computes from bundled archive; absent state keeps legacy fixtures.
  final SharedState? state;

  /// Версия приложения для сравнения; пробы подменяют, экран берёт из пакета.
  static Future<String> Function() appVersion = () async =>
      (await PackageInfo.fromPlatform()).version;
  @visibleForTesting
  static Future<Map<String, Object?>> Function() loadArchive =
      WhatsNewData.load;

  @override
  State<WhatsNewScreen> createState() => _WhatsNewScreenState();
}

class _WhatsNewScreenState extends State<WhatsNewScreen> {
  bool _checking = false;
  Map<String, Object?>? _archive;
  String? _version;
  bool _loadFailed = false;
  int _loadGeneration = 0;
  Timer? _loadDeadline;

  @override
  void initState() {
    super.initState();
    widget.state?.writes.addListener(_changed);
    if (widget.state != null) _load();
  }

  @override
  void didUpdateWidget(WhatsNewScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.state != widget.state) {
      oldWidget.state?.writes.removeListener(_changed);
      widget.state?.writes.addListener(_changed);
      _loadGeneration++;
      _loadDeadline?.cancel();
      _loadDeadline = null;
      if (widget.state != null && _archive == null) _load();
    }
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  Future<void> _load() async {
    final generation = ++_loadGeneration;
    _loadFailed = false;
    _loadDeadline?.cancel();
    _loadDeadline = Timer(const Duration(seconds: 8), () {
      if (!mounted || generation != _loadGeneration) return;
      _loadDeadline = null;
      _loadGeneration++; // revoke late IO before exposing retry
      setState(() => _loadFailed = true);
    });
    try {
      // Both futures start together; neither IO failure can reveal a WEB page.
      final values = await Future.wait<Object>([
        WhatsNewScreen.loadArchive(),
        WhatsNewScreen.appVersion(),
      ]);
      if (!mounted || generation != _loadGeneration) return;
      if ((values[1] as String).trim().isEmpty) {
        throw const FormatException('Missing package version');
      }
      setState(() {
        _archive = values[0] as Map<String, Object?>;
        _version = values[1] as String;
      });
    } catch (_) {
      if (mounted && generation == _loadGeneration) {
        setState(() => _loadFailed = true);
      }
    } finally {
      if (generation == _loadGeneration) {
        _loadDeadline?.cancel();
        _loadDeadline = null;
      }
    }
  }

  @override
  void dispose() {
    _loadGeneration++;
    _loadDeadline?.cancel();
    _loadDeadline = null;
    widget.state?.writes.removeListener(_changed);
    super.dispose();
  }

  Future<void> _check() async {
    setState(() => _checking = true);
    final version = _version ?? await WhatsNewScreen.appVersion();
    if (!mounted) return;
    await checkForUpdatesDialog(
      context,
      version: version,
      downloadKey: 'whats-new-download',
      onFetched: () => mounted ? setState(() => _checking = false) : null,
    );
    if (mounted && _checking) setState(() => _checking = false);
  }

  @override
  Widget build(BuildContext context) {
    final state = widget.state;
    if (state != null && _loadFailed) {
      return Directionality(
        textDirection: L.locale == 'ar' ? TextDirection.rtl : TextDirection.ltr,
        child: Material(
          key: const ValueKey('whats-new-load-error'),
          color: WebTheme.of(context).background,
          child: SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      L.t('nativeScreenModelFailed'),
                      textAlign: TextAlign.center,
                    ),
                    TextButton(
                      key: const ValueKey('whats-new-load-retry'),
                      onPressed: () {
                        setState(() => _loadFailed = false);
                        _load();
                      },
                      child: Text(L.t('retry')),
                    ),
                    TextButton(
                      onPressed: () =>
                          ScreenUi.act(WhatsNewScreen.route, 'back'),
                      child: Text(L.t('a11yBack')),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
    }
    final own = state == null || _archive == null || _version == null
        ? null
        : whatsNewModel(
            _archive!,
            version: _version!,
            primary:
                '#${(WebTheme.accent(state).toARGB32() & 0xFFFFFF).toRadixString(16).padLeft(6, '0')}',
          );
    final page = ModelPage(
      route: WhatsNewScreen.route,
      screenKey: 'whats-new-screen',
      own: state == null
          ? null
          : AlwaysStoppedAnimation<Map<String, Object?>?>(own),
      builder: (context, m) {
        final web = WebTheme.of(context);
        final primary = cssColor(
          m['primary'],
          Theme.of(context).colorScheme.primary,
        );
        final entries = [
          for (final e in (m['entries'] as List? ?? const []))
            (e as Map).cast<String, Object?>(),
        ];
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
              child: Row(
                children: [
                  circleBack(
                    context,
                    'whats-new-back',
                    _s(m['back']),
                    _s(m['backIcon']),
                    () => ScreenUi.act(WhatsNewScreen.route, 'back'),
                  ),
                  Expanded(
                    child: Text(
                      _s(m['title']),
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: web.text,
                      ),
                    ),
                  ),
                  const SizedBox(width: 44),
                ],
              ),
            ),
            Expanded(
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 560),
                  child: ListView(
                    key: const ValueKey('whats-new-list'),
                    padding: EdgeInsets.fromLTRB(
                      16,
                      16,
                      16,
                      FabRules.clearance,
                    ),
                    children: [
                      Semantics(
                        button: true,
                        enabled: !_checking,
                        child: GestureDetector(
                          key: const ValueKey('whats-new-check'),
                          behavior: HitTestBehavior.opaque,
                          onTap: _checking ? null : _check,
                          child: Opacity(
                            opacity: _checking ? 0.6 : 1,
                            child: Container(
                              constraints: const BoxConstraints(minHeight: 48),
                              padding: const EdgeInsets.symmetric(vertical: 13),
                              decoration: BoxDecoration(
                                color: primary,
                                borderRadius: BorderRadius.circular(16),
                              ),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                spacing: 8,
                                children: [
                                  const IonIcon(
                                    'refresh',
                                    size: 17,
                                    color: Colors.white,
                                  ),
                                  Flexible(
                                    child: Text(
                                      _checking ? '…' : _s(m['check']),
                                      textAlign: TextAlign.center,
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 14,
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                      for (final e in entries)
                        Padding(
                          padding: const EdgeInsets.only(top: 12),
                          child: Container(
                            key: ValueKey('whats-new-${e['version']}'),
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: web.surface,
                              border: Border.all(color: web.border),
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              spacing: 6,
                              children: [
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 4),
                                  child: Row(
                                    mainAxisAlignment:
                                        MainAxisAlignment.spaceBetween,
                                    children: [
                                      Flexible(
                                        child: Text(
                                          _s(e['version']),
                                          style: TextStyle(
                                            fontSize: 15,
                                            fontWeight: FontWeight.w800,
                                            color: web.text,
                                          ),
                                        ),
                                      ),
                                      Flexible(
                                        child: Text(
                                          _s(e['date']),
                                          textAlign: TextAlign.end,
                                          style: TextStyle(
                                            fontSize: 12,
                                            color: web.textSecondary,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                for (final it
                                    in (e['items'] as List? ?? const []))
                                  Row(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    spacing: 8,
                                    children: [
                                      Text(
                                        '•',
                                        style: TextStyle(
                                          fontSize: 13,
                                          fontWeight: FontWeight.w900,
                                          height: 18 / 13,
                                          color: primary,
                                        ),
                                      ),
                                      Expanded(
                                        child: Text(
                                          _s(it),
                                          style: TextStyle(
                                            fontSize: 13,
                                            height: 18 / 13,
                                            color: web.text,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                              ],
                            ),
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
    return state == null
        ? page
        : Directionality(
            textDirection: L.locale == 'ar'
                ? TextDirection.rtl
                : TextDirection.ltr,
            child: page,
          );
  }
}

String _s(Object? v) => v == null ? '' : '$v';
