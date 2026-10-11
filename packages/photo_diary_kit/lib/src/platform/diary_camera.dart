import 'dart:io';

import 'package:camera/camera.dart';
import 'package:permission_handler/permission_handler.dart';

import '../core/photo_diary.dart';

/// Permission requests and consent belong to setup UI, not the ringing alarm.
class FrontDiaryCamera extends DiaryCamera {
  CameraController? _controller;
  int _generation = 0;

  @override
  Future<DiaryFrame> capture() async {
    final generation = _generation;
    if (!await Permission.camera.isGranted) {
      throw StateError('Camera not authorized');
    }
    final cameras = await availableCameras();
    if (generation != _generation) throw StateError('Capture cancelled');
    final front = cameras.where(
      (c) => c.lensDirection == CameraLensDirection.front,
    );
    if (front.isEmpty) throw StateError('Front camera unavailable');
    final controller = CameraController(
      front.first,
      ResolutionPreset.medium,
      enableAudio: false,
    );
    _controller = controller;
    XFile? temporary;
    try {
      await controller.initialize();
      if (generation != _generation) throw StateError('Capture cancelled');
      await controller.setFlashMode(FlashMode.off);
      temporary = await controller.takePicture();
      final taken = DateTime.now().millisecondsSinceEpoch;
      final bytes = await temporary.readAsBytes();
      if (generation != _generation) throw StateError('Capture cancelled');
      return DiaryFrame(bytes, taken);
    } finally {
      if (temporary != null) {
        final file = File(temporary.path);
        if (await file.exists()) await file.delete();
      }
      if (identical(_controller, controller)) {
        _controller = null;
        await controller.dispose();
      }
    }
  }

  @override
  Future<void> cancel() async {
    _generation++;
    final controller = _controller;
    _controller = null;
    if (controller != null) await controller.dispose();
  }
}
