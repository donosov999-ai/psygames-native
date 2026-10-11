import 'dart:async';
import 'dart:io';

import 'package:camera_platform_interface/camera_platform_interface.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:photo_diary_kit/photo_diary_kit.dart';

class FrontFake extends CameraPlatform {
  FrontFake(this.path);
  final String path;
  bool frontAvailable = true;
  bool? audio;
  FlashMode? flash;
  String? chosen;
  int disposals = 0;
  final errors = StreamController<CameraErrorEvent>();
  @override
  Future<List<CameraDescription>> availableCameras() async => [
    const CameraDescription(
      name: 'rear',
      lensDirection: CameraLensDirection.back,
      sensorOrientation: 90,
    ),
    if (frontAvailable)
      const CameraDescription(
        name: 'front',
        lensDirection: CameraLensDirection.front,
        sensorOrientation: 90,
      ),
  ];
  @override
  Stream<DeviceOrientationChangedEvent> onDeviceOrientationChanged() =>
      const Stream.empty();
  @override
  Future<int> createCameraWithSettings(
    CameraDescription description,
    MediaSettings mediaSettings,
  ) async {
    chosen = description.name;
    audio = mediaSettings.enableAudio;
    return 1;
  }

  @override
  Stream<CameraInitializedEvent> onCameraInitialized(int cameraId) =>
      Stream.value(
        const CameraInitializedEvent(
          1,
          640,
          480,
          ExposureMode.auto,
          false,
          FocusMode.auto,
          false,
        ),
      );
  @override
  Stream<CameraErrorEvent> onCameraError(int cameraId) => errors.stream;
  @override
  Future<void> initializeCamera(
    int cameraId, {
    ImageFormatGroup imageFormatGroup = ImageFormatGroup.unknown,
  }) async {}
  @override
  Future<void> setFlashMode(int cameraId, FlashMode mode) async {
    flash = mode;
  }

  @override
  Future<XFile> takePicture(int cameraId) async => XFile(path);
  @override
  Future<void> dispose(int cameraId) async {
    disposals++;
    errors.add(CameraErrorEvent(cameraId, 'disposed'));
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const permissions = MethodChannel('flutter.baseflow.com/permissions/methods');
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  late Directory temp;
  late FrontFake fake;
  late CameraPlatform original;
  var authorized = true;
  final permissionMethods = <String>[];
  setUp(() async {
    original = CameraPlatform.instance;
    temp = await Directory.systemTemp.createTemp('diary-camera-test-');
    final photo = File('${temp.path}/temporary.jpg');
    await photo.writeAsBytes([1, 2, 3]);
    fake = FrontFake(photo.path);
    CameraPlatform.instance = fake;
    authorized = true;
    permissionMethods.clear();
    messenger.setMockMethodCallHandler(permissions, (call) async {
      permissionMethods.add(call.method);
      expect(call.method, 'checkPermissionStatus');
      return authorized ? 1 : 0;
    });
  });
  tearDown(() async {
    CameraPlatform.instance = original;
    messenger.setMockMethodCallHandler(permissions, null);
    unawaited(fake.errors.close());
    await temp.delete(recursive: true);
  });
  test(
    'front only, flash off, microphone off, temp deleted and camera released',
    () async {
      final frame = await FrontDiaryCamera().capture();
      expect(frame.bytes, [1, 2, 3]);
      expect(frame.takenAtMs, greaterThan(0));
      expect(fake.chosen, 'front');
      expect(fake.audio, false);
      expect(fake.flash, FlashMode.off);
      expect(fake.disposals, 1);
      expect(await File(fake.path).exists(), false);
      expect(permissionMethods, ['checkPermissionStatus']);
    },
  );
  test('denied permission never prompts or opens any camera', () async {
    authorized = false;
    await expectLater(FrontDiaryCamera().capture(), throwsStateError);
    expect(fake.chosen, isNull);
    expect(permissionMethods, ['checkPermissionStatus']);
  });
  test('no front camera never substitutes rear camera', () async {
    fake.frontAvailable = false;
    await expectLater(FrontDiaryCamera().capture(), throwsStateError);
    expect(fake.chosen, isNull);
  });
}
