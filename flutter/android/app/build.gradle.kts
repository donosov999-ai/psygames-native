plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "pro.psygames.psygames_flutter"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // 🔴 ИДЕНТИФИКАТОР — БОЕВОЙ, А НЕ ШАБЛОННЫЙ. Гибрид обязан встать ВМЕСТО
        // прежнего приложения, а не рядом вторым значком: Google Play различает
        // приложения по applicationId, и другой id — это другое приложение,
        // другой контейнер и потерянная история.
        //
        // Замер 25.09.2026 живым запросом к Google Play (androidpublisher v3,
        // edits + tracks): пакет `com.psygames.app` — production v2.54.24,
        // versionCode 2054024. Пакет `com.odv999.psygames`, записанный в
        // src-tauri/tauri.conf.json, в консоли НЕ СУЩЕСТВУЕТ: 404 Package not found.
        // Правду про идентификатор спрашивать у Play, а не у конфига в репозитории.
        applicationId = "com.psygames.app"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion

        // 🔴 НОМЕР СБОРКИ ПО СХЕМЕ СТАРОЙ ЛИНИИ, ИНАЧЕ PLAY ОТКАЖЕТ.
        // `flutter.versionCode` — это число после «+» в pubspec (у гибрида 31),
        // а в Play уже принят 2054024. Play берёт только СТРОГО БОЛЬШИЙ номер,
        // поэтому 31 был бы отклонён, и выглядело бы это как поломка выкладки.
        // Схема прежней линии: major*1_000_000 + minor*1_000 + patch
        // (2.54.24 → 2054024, 2.56.0 → 2056000). Продолжаем её.
        versionName = flutter.versionName
        versionCode = run {
            val parts = flutter.versionName.split(".")
            if (parts.size < 3) {
                throw GradleException(
                    "версия '${flutter.versionName}' не вида X.Y.Z — номер сборки не посчитать")
            }
            val major = parts[0].toInt()
            val minor = parts[1].toInt()
            val patch = parts[2].split("+", "-")[0].toInt()
            major * 1_000_000 + minor * 1_000 + patch
        }
    }

    // 🔴 ПОДПИСЬ — ТЕМ ЖЕ КЛЮЧОМ, ЧТО У ЖИВОГО ВЫПУСКА.
    // Обновление поверх установленного приложения Android принимает, только если
    // подпись совпадает; чужой ключ даёт INSTALL_FAILED_UPDATE_INCOMPATIBLE, а Play
    // не примет загрузку вовсе. Имена переменных — те же, что у старой линии
    // в .github/workflows/build.yml, чтобы не заводить секреты репозитория заново.
    signingConfigs {
        create("release") {
            val storePath = System.getenv("ANDROID_KEYSTORE_PATH")
            if (storePath != null && file(storePath).exists()) {
                storeFile = file(storePath)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            // ⚠️ Без ключа (сборка на своей машине) остаётся отладочная подпись,
            // иначе `flutter run --release` локально перестал бы работать.
            // Такую сборку в Play нести НЕЛЬЗЯ — она не встанет поверх живой.
            signingConfig = if (System.getenv("ANDROID_KEYSTORE_PATH") != null) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
