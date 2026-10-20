package com.odv999.photo_diary_kit

import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.plugin.common.MethodChannel
import java.io.File

class PhotoDiaryKitPlugin : FlutterPlugin {
    private var channel: MethodChannel? = null

    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        channel = MethodChannel(binding.binaryMessenger, "com.odv999.photo_diary_kit/storage")
        channel?.setMethodCallHandler { call, result ->
            if (call.method != "directory") result.notImplemented()
            else try {
                val parent = binding.applicationContext.noBackupFilesDir.canonicalFile
                val directory = File(parent, "photo_diary").canonicalFile
                check(directory.parentFile == parent)
                check(directory.isDirectory || directory.mkdirs())
                result.success(directory.absolutePath)
            } catch (_: Exception) {
                result.error("diary_storage", "Private storage unavailable", null)
            }
        }
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        channel?.setMethodCallHandler(null)
        channel = null
    }
}
