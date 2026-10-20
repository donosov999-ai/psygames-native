import 'dart:io';

import 'package:camera/camera.dart';
import 'package:permission_handler/permission_handler.dart';

import '../core/photo_diary.dart';

/// Permission requests and consent belong to setup UI, not the ringing alarm.
class FrontDiaryCamera extends DiaryCamera {
  FrontDiaryCamera({this.exposureSettle = const Duration(milliseconds: 450)});
  final Duration exposureSettle;
  CameraController? _controller;
  int _generation = 0;

  @override
  Future<DiaryFrame> capture() async {
    final generation = _generation;
    if (!await Permission.camera.isGranted) {
      throw const DiaryCaptureException('permission_denied');
    }
    final cameras = await availableCameras();
    if (generation != _generation) {
      throw const DiaryCaptureException('interrupted');
    }
    final front = cameras.where(
      (c) => c.lensDirection == CameraLensDirection.front,
    );
    if (front.isEmpty) throw const DiaryCaptureException('camera_unavailable');
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
      // Let automatic exposure adapt to the currently displayed light.
      await Future<void>.delayed(exposureSettle);
      if (generation != _generation) {
        throw const DiaryCaptureException('interrupted');
      }
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
