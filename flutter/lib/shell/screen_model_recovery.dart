import 'package:flutter/material.dart';

import 'l10n.dart';
import 'web_theme.dart';

/// Opaque native cover while a migrated screen waits for its remaining web model.
/// This is recovery UI, not a replacement model or a second accounting layer.
class ScreenModelRecovery extends StatelessWidget {
  const ScreenModelRecovery({
    super.key,
    required this.failed,
    required this.onRetry,
    required this.onHome,
  });

  final bool failed;
  final VoidCallback onRetry;
  final VoidCallback onHome;

  @override
  Widget build(BuildContext context) {
    final web = WebTheme.of(context);
    return Directionality(
      textDirection: L.locale == 'ar' ? TextDirection.rtl : TextDirection.ltr,
      child: Material(
        key: ValueKey(failed ? 'screen-model-error' : 'screen-model-wait'),
        color: web.background,
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (failed) ...[
                    Icon(Icons.error_outline, color: web.text, size: 40),
                    const SizedBox(height: 16),
                    Text(
                      L.t('nativeScreenModelFailed'),
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: web.text,
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      L.t('nativeScreenModelRetryHint'),
                      textAlign: TextAlign.center,
                      style: TextStyle(color: web.text),
                    ),
                    const SizedBox(height: 20),
                    FilledButton.icon(
                      key: const ValueKey('screen-model-retry'),
                      onPressed: onRetry,
                      icon: const Icon(Icons.refresh),
                      label: Text(L.t('retry')),
                    ),
                  ] else
                    const CircularProgressIndicator(),
                  const SizedBox(height: 12),
                  TextButton(
                    key: const ValueKey('screen-model-home'),
                    onPressed: onHome,
                    child: Text(L.t('goHome')),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
