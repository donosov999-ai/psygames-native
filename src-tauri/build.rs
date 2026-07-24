fn main() {
    tauri_build::build();

    // Google Play: нативные .so обязаны поддерживать страницы памяти 16 КБ
    // (требование для Android 15+, targetSdk 35+; иначе на таких устройствах
    // приложение не установится / не запустится / упадёт). NDK r27 линкует
    // LOAD-сегменты на 4 КБ по умолчанию — флаг выравнивает их на 16 КБ.
    // ТОЛЬКО android: линкеры macOS (ld64) / Windows (link.exe) / iOS этот
    // GNU-флаг не понимают и сломались бы. cargo:rustc-link-arg применяется к
    // cdylib (libpsygames_lib.so) — именно его собирает android-таргет.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("android") {
        println!("cargo:rustc-link-arg=-Wl,-z,max-page-size=16384");
        println!("cargo:rustc-link-arg=-Wl,-z,common-page-size=16384");
    }
}
