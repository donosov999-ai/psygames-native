import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'shared_state.dart';

/// Экран для игр, которые ЕЩЁ НЕ ПЕРЕНЕСЕНЫ: их показывает нынешняя сборка
/// внутри WebView, а снаружи остаётся Flutter.
///
/// Это и есть «заслонка», без которой переезд по частям невозможен: 94 игры
/// одновременно не переносятся, а приложение обязано работать целиком каждый день.
///
/// Границу держит [SharedState]: снимок общей памяти вливается в страницу ДО её
/// кода, а каждая запись страницы возвращается сюда каналом и ложится на диск.
class WebGameScreen extends StatefulWidget {
  const WebGameScreen({
    super.key,
    required this.title,
    required this.url,
    required this.state,
    this.onBridgeMessage,
  });

  final String title;
  final String url;
  final SharedState state;

  /// Зовётся на каждое сообщение из страницы: true — записано, false — отвергнуто.
  final void Function(String raw, bool applied)? onBridgeMessage;

  @override
  State<WebGameScreen> createState() => _WebGameScreenState();
}

class _WebGameScreenState extends State<WebGameScreen> {
  late final WebViewController _c;
  bool _loading = true;
  int _fromWeb = 0;

  @override
  void initState() {
    super.initState();
    _c = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..addJavaScriptChannel(
        SharedState.channel,
        onMessageReceived: (m) async {
          final ok = await widget.state.applyFromWeb(m.message);
          if (ok && mounted) setState(() => _fromWeb += 1);
          widget.onBridgeMessage?.call(m.message, ok);
        },
      )
      ..setNavigationDelegate(NavigationDelegate(
        // ⚠️ Скрипт вливается на СТАРТЕ страницы, а не в конце: если снимок ляжет
        // после того, как приложение прочитало localStorage, человек увидит чужой
        // прогресс, и починится это только перезаходом.
        onPageStarted: (_) => _c.runJavaScript(widget.state.bootstrapJs()),
        onPageFinished: (_) {
          _c.runJavaScript(widget.state.bootstrapJs());
          if (mounted) setState(() => _loading = false);
        },
      ))
      ..loadRequest(Uri.parse(widget.url));
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: Text(widget.title),
          bottom: _loading
              ? const PreferredSize(
                  preferredSize: Size.fromHeight(2), child: LinearProgressIndicator(minHeight: 2))
              : null,
          actions: [
            if (_fromWeb > 0)
              Padding(
                padding: const EdgeInsets.only(right: 12),
                child: Center(
                  child: Text('↔ $_fromWeb',
                      style: Theme.of(context).textTheme.labelMedium,
                      semanticsLabel: 'записей пришло из веб-части: $_fromWeb'),
                ),
              ),
          ],
        ),
        body: WebViewWidget(controller: _c),
      );
}
