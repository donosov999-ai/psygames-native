import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    // Вибрация практик «Паузы» — плагин общего пакета practice_kit
    // (PracticeKitPlugin), регистрируется здесь же, вместе с остальными.
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
  }
}
