import 'dart:async';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';

/// Explicit setup only; this route must never be pushed by a ringing alarm.
/// Preview is transient: this widget does not take or save any photograph.
class DiaryCameraSetup extends StatefulWidget {
  const DiaryCameraSetup({
    super.key,
    this.english = false,
    required this.privacyWrapper,
  });
  final bool english;

  /// Host must suppress screenshots/report capture while this route is mounted.
  final Widget Function(Widget child) privacyWrapper;
  @override
  State<DiaryCameraSetup> createState() => _DiaryCameraSetupState();
}

class _DiaryCameraSetupState extends State<DiaryCameraSetup>
    with WidgetsBindingObserver {
  CameraController? _camera;
  bool _opening = false;
  int _generation = 0;
  String? _error;
  String tr(String ru, String en) => widget.english ? en : ru;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  Future<void> _close() async {
    _generation++;
    final camera = _camera;
    _camera = null;
    if (camera != null) {
      try {
        await camera.dispose();
      } catch (_) {}
    }
  }

  Future<void> _open() async {
    if (_opening) return;
    setState(() {
      _opening = true;
      _error = null;
    });
    final generation = _generation;
    CameraController? candidate;
    bool current() => mounted && generation == _generation;
    try {
      final permission = await Permission.camera.request();
      if (!current()) return;
      if (!permission.isGranted) throw StateError('permission');
      final list = await availableCameras().timeout(const Duration(seconds: 3));
      if (!current()) return;
      final front = list.where(
        (c) => c.lensDirection == CameraLensDirection.front,
      );
      if (front.isEmpty) throw StateError('front');
      candidate = CameraController(
        front.first,
        ResolutionPreset.medium,
        enableAudio: false,
      );
      _camera = candidate;
      await candidate.initialize().timeout(const Duration(seconds: 5));
      if (!current()) return;
      await candidate.setFlashMode(FlashMode.off);
    } catch (_) {
      await _close();
      if (mounted) {
        _error = tr(
          'Камера недоступна. Можно продолжать без фото. Проверьте разрешение камеры в настройках телефона.',
          'Camera unavailable. You can continue without photos. Check camera permission in phone settings.',
        );
      }
    } finally {
      if (!current() && identical(_camera, candidate)) await _close();
      if (mounted) setState(() => _opening = false);
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.hidden ||
        state == AppLifecycleState.detached) {
      unawaited(_close());
      if (mounted) setState(() {});
    }
    // Resume never opens the camera or requests permission automatically.
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_close());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.privacyWrapper(
    Scaffold(
      appBar: AppBar(title: Text(tr('Настройка камеры', 'Camera setup'))),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            tr(
              'Поставьте телефон так, чтобы лицо было видно. Это только превью: снимки не сохраняются. Закройте этот экран перед занятием.',
              'Position the phone so your face is visible. This is a preview only: no photos are saved. Close this screen before a session.',
            ),
          ),
          const SizedBox(height: 16),
          if (_camera?.value.isInitialized == true)
            AspectRatio(
              aspectRatio: _camera!.value.aspectRatio,
              child: CameraPreview(_camera!),
            )
          else
            SizedBox(
              height: 220,
              child: Center(
                child: _opening
                    ? const CircularProgressIndicator()
                    : const Icon(Icons.camera_front, size: 48),
              ),
            ),
          if (_error != null)
            Text(_error!, key: const Key('diary-camera-error')),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: _opening || _camera != null ? null : _open,
            icon: const Icon(Icons.camera_front),
            label: Text(tr('Открыть фронтальную камеру', 'Open front camera')),
          ),
          TextButton(
            onPressed: () async {
              final ready = _camera?.value.isInitialized == true;
              try {
                await _close().timeout(const Duration(seconds: 1));
              } catch (_) {}
              if (context.mounted) Navigator.pop(context, ready);
            },
            child: Text(
              tr(
                'Готово / продолжить без фото',
                'Done / continue without photos',
              ),
            ),
          ),
        ],
      ),
    ),
  );
}
