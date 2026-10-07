import Flutter
import UIKit
import CoreHaptics
import AudioToolbox
import AVFoundation

/// Вибрация практик — общая для PsyGames и «Умного будильника» (пакет practice_kit).
/// Основной канал — системный вибромотор (`kSystemSoundID_Vibrate`), Core Haptics —
/// вторым слоем. Удержание — импульсы до конца шага, пауза и потеря активности гасят.
public final class PracticeKitPlugin: NSObject, FlutterPlugin {
  private var engine: CHHapticEngine?
  private var player: CHHapticPatternPlayer?
  private var observer: NSObjectProtocol?
  /// Импульсы системного вибромотора (см. `buzz`). Снимается в `stop()`.
  private var pulse: Timer?

  public static func register(with registrar: FlutterPluginRegistrar) {
    let plugin = PracticeKitPlugin()
    registrar.addMethodCallDelegate(plugin, channel: FlutterMethodChannel(
      name: "pro.psygames.practice_kit/haptics", binaryMessenger: registrar.messenger()))
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

  /// 🔴 СИСТЕМНАЯ ВИБРАЦИЯ — ОСНОВНОЙ КАНАЛ. Денис, 01.10.2026, на 0.4.3 (31):
  /// «дребезжание при удержании в Кегеле не работает… у конкурентов всё работает».
  /// Core Haptics с силой 0,8 на телефоне не ощутился; приложения-конкуренты
  /// гудят классическим вибромотором (`kSystemSoundID_Vibrate`, ~0,4 с). Удержание —
  /// импульс каждые 0,5 с до конца шага («дребезжание»), смена шага — один или два
  /// импульса. Core Haptics остаётся вторым слоем поверх. Таймер конечный и
  /// снимается в `stop()`: пауза, выход, потеря активности его гасят.
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

  public func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    let supported = CHHapticEngine.capabilitiesForHardware().supportsHaptics
    if call.method == "capabilities" {
      // Системный вибромотор есть у любого iPhone, даже где Core Haptics нет.
      let canVibrate = supported || UIDevice.current.userInterfaceIdiom == .phone
      let session = AVAudioSession.sharedInstance()
      // Для отчёта «вибрации нет»: категория аудиосессии и разрешена ли вибрация
      // при записи — запись (метка голосом, крик) глушит системную вибрацию.
      result(["supported": canVibrate, "continuous": canVibrate, "coreHaptics": supported,
              "audioCategory": session.category.rawValue,
              "hapticsDuringRecording": session.allowHapticsAndSystemSoundsDuringRecording])
      return
    }
    if call.method == "stop" { stop(); result(nil); return }
    guard call.method == "play" else { result(FlutterMethodNotImplemented); return }
    stop()
    guard UIApplication.shared.applicationState == .active else {
      result(nil); return
    }
    // iOS глушит вибрацию и системные звуки, пока аудиосессия в режиме записи
    // (метка голосом, крик оставляют её такой). Разрешаем явно — дёшево и без
    // побочных эффектов для звука.
    try? AVAudioSession.sharedInstance().setAllowHapticsAndSystemSoundsDuringRecording(true)
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
        // A later step may start the engine again; never replay a stale hold.
        engine?.resetHandler = { [weak self] in
          DispatchQueue.main.async { self?.player = nil }
        }
      }
      try engine?.start()
      let event = CHHapticEvent(
        eventType: continuous ? .hapticContinuous : .hapticTransient,
        parameters: [CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity),
                     CHHapticEventParameter(parameterID: .hapticSharpness, value: sharpness)],
        relativeTime: 0, duration: continuous ? duration : 0)
      let count = continuous ? 1 : min(2, max(1, (args["count"] as? NSNumber)?.intValue ?? 1))
      var events = [event]
      if count == 2 {
        events.append(CHHapticEvent(eventType: .hapticTransient,
          parameters: [CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity),
                       CHHapticEventParameter(parameterID: .hapticSharpness, value: sharpness)],
          relativeTime: 0.16))
      }
      let pattern = try CHHapticPattern(events: events, parameters: [])
      player = try engine?.makePlayer(with: pattern)
      try player?.start(atTime: CHHapticTimeImmediate)
      result(nil)
    } catch {
      // Core Haptics отказал — гасим только его; системный вибромотор (`buzz`) уже
      // идёт и обязан доиграть, иначе на таком телефоне вибрации не было бы вовсе.
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
