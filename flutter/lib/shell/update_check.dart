import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import 'app_update.dart';
import 'l10n.dart';

/// «ПРОВЕРИТЬ ОБНОВЛЕНИЯ» — ОДИН ПУТЬ ДЛЯ НАСТРОЕК И «ЧТО НОВОГО» (запрос Дениса, v1.151 веба).
///
/// Свежая версия → предложение уйти в магазин своей платформы; иначе — «у вас последняя» или «не
/// удалось проверить». Запрос — из Dart ([AppUpdate]): у сайта нет CORS для WebView, и проверка
/// страницы в гибриде всегда отвечала бы «не удалось». [onFetched] зовётся, когда ответ получен, —
/// экран гасит свой значок «…» до показа окна, как было в Настройках.
Future<void> checkForUpdatesDialog(
  BuildContext context, {
  required String version,
  String downloadKey = 'update-download',
  VoidCallback? onFetched,
}) async {
  Future<void> alert(String title, [String? body]) => showDialog<void>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text(title),
      content: body == null ? null : Text(body),
      actions: [TextButton(onPressed: () => Navigator.of(c).pop(), child: Text(L.t('close')))],
    ),
  );

  final latest = await AppUpdate.fetchLatest();
  if (!context.mounted) return;
  onFetched?.call();
  if (latest == null) {
    await alert(L.t('updCheckFailed'));
    return;
  }
  if (!AppUpdate.isNewer(latest, version)) {
    await alert('✓ ${L.t('updLatest')}', 'v$version');
    return;
  }
  final go = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text('${L.t('updAvailable')} v$latest'),
      content: Text(L.t('updAvailableBody')),
      actions: [
        TextButton(onPressed: () => Navigator.of(c).pop(false), child: Text(L.t('updLater'))),
        FilledButton(key: Key(downloadKey), onPressed: () => Navigator.of(c).pop(true), child: Text(L.t('updDownload'))),
      ],
    ),
  );
  if (go == true) {
    try {
      await launchUrl(Uri.parse(AppUpdate.storeUrl()), mode: LaunchMode.externalApplication);
    } catch (_) {}
  }
}
