import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';

import 'feedback_fab.dart' show FabRules;
import 'info_screens.dart' show ModelPage, circleBack;
import 'ion_icon.dart';
import 'screen_ui.dart';
import 'update_check.dart';
import 'web_theme.dart';

/// «ЧТО НОВОГО» ПО МОДЕЛИ ВЕБА (задача 84df0687; правило 4e679f41).
///
/// Список версий — записи `WHATS_NEW` веба на языке человека (`app/whats-new.tsx`). «Проверить
/// обновления» делает оболочка тем же путём, что Настройки ([checkForUpdatesDialog]): у сайта нет
/// CORS для WebView. Размеры — из `styles` веб-экрана.
class WhatsNewScreen extends StatefulWidget {
  const WhatsNewScreen({super.key});
  static const route = '/whats-new';

  /// Версия приложения для сравнения; пробы подменяют, экран берёт из пакета.
  static Future<String> Function() appVersion = () async => (await PackageInfo.fromPlatform()).version;

  @override
  State<WhatsNewScreen> createState() => _WhatsNewScreenState();
}

class _WhatsNewScreenState extends State<WhatsNewScreen> {
  bool _checking = false;

  Future<void> _check() async {
    setState(() => _checking = true);
    final version = await WhatsNewScreen.appVersion();
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
  Widget build(BuildContext context) => ModelPage(
    route: WhatsNewScreen.route,
    screenKey: 'whats-new-screen',
    builder: (context, m) {
      final web = WebTheme.of(context);
      final primary = cssColor(m['primary'], Theme.of(context).colorScheme.primary);
      final entries = [for (final e in (m['entries'] as List? ?? const [])) (e as Map).cast<String, Object?>()];
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
            child: Row(
              children: [
                circleBack(context, 'whats-new-back', _s(m['back']), _s(m['backIcon']), () => ScreenUi.act(WhatsNewScreen.route, 'back')),
                Expanded(
                  child: Text(
                    _s(m['title']),
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: web.text),
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
                  padding: EdgeInsets.fromLTRB(16, 16, 16, FabRules.clearance),
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
                            decoration: BoxDecoration(color: primary, borderRadius: BorderRadius.circular(16)),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              spacing: 8,
                              children: [
                                const IonIcon('refresh', size: 17, color: Colors.white),
                                Flexible(
                                  child: Text(
                                    _checking ? '…' : _s(m['check']),
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w800),
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
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Text(_s(e['version']), style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: web.text)),
                                    Text(_s(e['date']), style: TextStyle(fontSize: 12, color: web.textSecondary)),
                                  ],
                                ),
                              ),
                              for (final it in (e['items'] as List? ?? const []))
                                Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  spacing: 8,
                                  children: [
                                    Text('•', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w900, height: 18 / 13, color: primary)),
                                    Expanded(
                                      child: Text(_s(it), style: TextStyle(fontSize: 13, height: 18 / 13, color: web.text)),
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
}

String _s(Object? v) => v == null ? '' : '$v';
