import Flutter
import UIKit
import CoreHaptics
import AudioToolbox

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "PracticeHaptics") {
      PracticeHapticsPlugin.register(with: registrar)
    }
  }
}

/// Вибросопровождение практик «Паузы» (канал pro.psygames/practiceHaptics).
/// Перенос из «Умного будильника»: мягкое удержание Кегеля и короткие сигналы
/// смены шага. Эффект конечный; уход приложения из активного состояния гасит его.
final class PracticeHapticsPlugin: NSObject, FlutterPlugin {
  private var engine: CHHapticEngine?
  private var player: CHHapticPatternPlayer?
  private var observer: NSObjectProtocol?
  /// Импульсы системного вибромотора (см. `buzz`). Снимается в `stop()`.
  private var pulse: Timer?

  static func register(with registrar: FlutterPluginRegistrar) {
    let plugin = PracticeHapticsPlugin()
    registrar.addMethodCallDelegate(plugin, channel: FlutterMethodChannel(
      name: "pro.psygames/practiceHaptics", binaryMessenger: registrar.messenger()))
    plugin.observer = NotificationCenter.default.addObserver(
      forName: UIApplication.willResignActiveNotification, object: nil, queue: .main
    ) { [weak plugin] _ in plugin?.stop() }
  }

  private func stop() {
    pulse?.invalidate()
    pulse = nil
    try? player?.stop(atTime: CHHapticTimeImmediate)
    player = nil
  }

  /// 🔴 СИСТЕМНАЯ ВИБРАЦИЯ — ОСНОВНОЙ КАНАЛ. Денис, 01.10.2026: «дребезжание при
  /// удержании в Кегеле не работает… у конкурентов всё работает». Core Haptics с
  /// силой 0,8 на телефоне не ощутился; приложения-конкуренты гудят классическим
  /// вибромотором (`kSystemSoundID_Vibrate`, ~0,4 с). Удержание — импульс каждые
  /// 0,5 с до конца шага («дребезжание»), смена шага — один или два импульса. Core
  /// Haptics остаётся вторым слоем. Таймер конечный и снимается в `stop()`. Тот же
  /// канал, что в «Умном будильнике» (b90f15be).
  private func buzz(continuous: Bool, duration: Double, count: Int) {
    AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)
    let interval = continuous ? 0.5 : 0.45
    let total = continuous ? max(0, Int((duration / interval).rounded(.down))) : max(0, count - 1)
    guard total > 0 else { return }
    var left = total
    pulse = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] t in
      guard UIApplication.shared.applicationState == .active, left > 0 else {
        t.invalidate()
        if self?.pulse === t { self?.pulse = nil }
        return
      }
      left -= 1
      AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)
    }
  }

  func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    let supported = CHHapticEngine.capabilitiesForHardware().supportsHaptics
    if call.method == "capabilities" {
      // Системный вибромотор есть у любого iPhone, даже где Core Haptics нет.
      let canVibrate = supported || UIDevice.current.userInterfaceIdiom == .phone
      result(["supported": canVibrate, "continuous": canVibrate]); return
    }
    if call.method == "stop" { stop(); result(nil); return }
    guard call.method == "play" else { result(FlutterMethodNotImplemented); return }
    stop()
    guard UIApplication.shared.applicationState == .active else {
      result(nil); return
    }
    let args = call.arguments as? [String: Any] ?? [:]
    let continuous = args["continuous"] as? Bool ?? false
    let duration = min(30, max(0.001, ((args["durationMs"] as? NSNumber)?.doubleValue ?? 60) / 1000))
    buzz(continuous: continuous, duration: duration,
         count: min(2, max(1, (args["count"] as? NSNumber)?.intValue ?? 1)))
    guard supported else { result(nil); return }
    // Ощутимо в руке: шкала до 1,0, по умолчанию 0,8 (Денис 01.10: при 0,25 «вибрации нет»).
    let intensity = Float(min(1.0, max(0.1, (args["strength"] as? NSNumber)?.doubleValue ?? 0.8)))
    // Резкость 0,15 давала мягкий гул, которого не слышно; удержание — плотный гул, сигнал — чёткий щелчок.
    let sharpness: Float = continuous ? 0.4 : 0.6
    do {
      if engine == nil {
        engine = try CHHapticEngine()
        engine?.playsHapticsOnly = true
        // Следующий шаг заведёт мотор снова; старое удержание не доигрывать.
        engine?.resetHandler = { [weak self] in
          DispatchQueue.main.async { self?.player = nil }
        }
      }
      try engine?.start()
      let params = [CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity),
                    CHHapticEventParameter(parameterID: .hapticSharpness, value: sharpness)]
      var events = [CHHapticEvent(
        eventType: continuous ? .hapticContinuous : .hapticTransient,
        parameters: params, relativeTime: 0, duration: continuous ? duration : 0)]
      if !continuous && (args["count"] as? NSNumber)?.intValue == 2 {
        events.append(CHHapticEvent(eventType: .hapticTransient, parameters: params, relativeTime: 0.16))
      }
      let pattern = try CHHapticPattern(events: events, parameters: [])
      player = try engine?.makePlayer(with: pattern)
      try player?.start(atTime: CHHapticTimeImmediate)
      result(nil)
    } catch {
      // Core Haptics отказал — гасим только его; системный вибромотор уже идёт.
      try? player?.stop(atTime: CHHapticTimeImmediate)
      player = nil
      result(nil)
    }
  }

  deinit {
    if let observer { NotificationCenter.default.removeObserver(observer) }
    stop()
  }
}
