import Flutter
import Foundation

public final class PhotoDiaryKitPlugin: NSObject, FlutterPlugin {
    public static func register(with registrar: FlutterPluginRegistrar) {
        registrar.addMethodCallDelegate(PhotoDiaryKitPlugin(), channel: FlutterMethodChannel(
            name: "com.odv999.photo_diary_kit/storage", binaryMessenger: registrar.messenger()))
    }

    public func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
        guard call.method == "directory" else { result(FlutterMethodNotImplemented); return }
        do { result(try Self.directory()) }
        catch { result(FlutterError(code: "diary_storage", message: "Private storage unavailable", details: nil)) }
    }

    private static func directory() throws -> String {
        let manager = FileManager.default
        let support = try manager.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                      appropriateFor: nil, create: true)
        var directory = support.appendingPathComponent("photo_diary", isDirectory: true)
        try manager.createDirectory(at: directory, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try directory.setResourceValues(values)
        try manager.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: directory.path)
        guard try directory.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup == true
        else { throw CocoaError(.fileWriteUnknown) }
        return directory.path
    }
}
