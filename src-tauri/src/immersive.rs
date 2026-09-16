// psygames-immersive-native · VER 1 · 16.09.2026
//! Полноэкранный режим игры: убрать системные полосы телефона на время партии.
//!
//! 🔴 ЗАЧЕМ. Денис 16.09.2026, про «Числовой забег»: «надо добавить и продумать
//! управление полноэкранным режимом». Дорогу чат «Поиска» уже растянул на весь
//! WebView (69 % → 90 % экрана), но выше и ниже неё остаются полосы ОС: часы,
//! батарея, навигация Android, полоска «домой» на iPhone. Из WebView их не
//! убрать — это окно и контроллер вида, то есть нативный слой.
//!
//! КАК УПРАВЛЯЕТСЯ — решает фронт (`src/hooks/useImmersive.ts`): полосы уходят,
//! пока идёт партия, и возвращаются на паузе, на карточке итога и при выходе.
//! Здесь только исполнитель одной команды `set_immersive(on)`, без состояния.
//!
//! ⚠️ ВЫТАЩИТЬ ПОЛОСЫ ЧЕЛОВЕК МОЖЕТ ВСЕГДА, И ЭТО НАРОЧНО:
//!   · Android — «липкий» режим: свайп от края показывает полосы на пару секунд
//!     поверх игры, раскладку это не двигает;
//!   · iPhone — строка состояния скрыта, полоска «домой» гаснет, а жест «домой»
//!     отложен: первый свайп снизу только подсвечивает полоску, второй уводит.
//!     Руль у забега внизу, и случайный выход из игры свайпом там дорого стоит.
//!
//! Настольные сборки: ничего не делаем. Там окно, а не телефон, и разворот на
//! весь монитор посреди партии был бы сюрпризом.

#[tauri::command]
pub fn set_immersive(webview_window: tauri::WebviewWindow, on: bool) -> Result<(), String> {
    #[cfg(any(target_os = "ios", target_os = "android"))]
    {
        webview_window
            .with_webview(move |w| {
                #[cfg(target_os = "ios")]
                // SAFETY: контроллер вида окна tao живёт, пока живо окно; вызов идёт
                // в главном потоке — with_webview исполняет замыкание в цикле событий.
                unsafe {
                    ios::apply(w.view_controller(), on)
                };
                #[cfg(target_os = "android")]
                w.jni_handle().exec(move |env, activity, _webview| {
                    // Ошибку JNI наружу не несём: полосы — удобство, а не условие игры.
                    let _ = android::apply(env, activity, on);
                });
            })
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(any(target_os = "ios", target_os = "android")))]
    {
        let _ = (webview_window, on);
    }
    Ok(())
}

#[cfg(target_os = "ios")]
mod ios {
    use objc2::msg_send;
    use objc2::runtime::{AnyObject, Bool};

    /// `UIRectEdgeBottom`. Откладываем только нижний край: свайп сверху — шторка
    /// уведомлений, её человек ждёт мгновенно и игре она не мешает.
    const UI_RECT_EDGE_BOTTOM: usize = 1 << 2;

    /// ⚠️ Сеттеры объявлены у класса контроллера вида tao
    /// (`tao/src/platform_impl/ios/view.rs`, `add_property!`): они пишут ivar и сами
    /// зовут `setNeedsStatusBarAppearanceUpdate` / `setNeedsUpdateOf…`. UIKit спрашивает
    /// контроллер, потому что `UIViewControllerBasedStatusBarAppearance` в Info.plist
    /// не задан — по умолчанию это YES.
    pub unsafe fn apply(view_controller: *mut std::ffi::c_void, on: bool) {
        let vc = view_controller as *mut AnyObject;
        if vc.is_null() {
            return;
        }
        let _: () = msg_send![vc, setPrefersStatusBarHidden: Bool::new(on)];
        let _: () = msg_send![vc, setPrefersHomeIndicatorAutoHidden: Bool::new(on)];
        let edges: usize = if on { UI_RECT_EDGE_BOTTOM } else { 0 };
        let _: () = msg_send![vc, setPreferredScreenEdgesDeferringSystemGestures: edges];
    }
}

#[cfg(target_os = "android")]
mod android {
    use jni::objects::{JObject, JValue};
    use jni::JNIEnv;
    use std::sync::atomic::{AtomicI32, Ordering};

    /// `WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE` (API 30).
    const BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE: i32 = 2;

    /// Флаги `View.SYSTEM_UI_FLAG_*` для Android 9–10, где контроллера полос ещё нет.
    const IMMERSIVE_STICKY: i32 = 0x1000;
    const HIDE_NAVIGATION: i32 = 0x2;
    const FULLSCREEN: i32 = 0x4;

    /// Что стояло на окне ДО полноэкранного режима (только Android 9–10).
    /// ⚠️ Возвращаем ровно это, а не «обычные» флаги: раскладка от края до края
    /// у приложения задаётся в MainActivity (патч в build.yml), и чужие флаги при
    /// выходе из партии сдвинули бы весь экран. −1 = режим не включён.
    static SAVED_UI_FLAGS: AtomicI32 = AtomicI32::new(-1);

    pub fn apply(env: &mut JNIEnv, activity: &JObject, on: bool) -> jni::errors::Result<()> {
        if activity.is_null() {
            return Ok(());
        }
        let window = env
            .call_method(activity, "getWindow", "()Landroid/view/Window;", &[])?
            .l()?;
        let sdk = env
            .get_static_field("android/os/Build$VERSION", "SDK_INT", "I")?
            .i()?;

        if sdk >= 30 {
            let controller = env
                .call_method(
                    &window,
                    "getInsetsController",
                    "()Landroid/view/WindowInsetsController;",
                    &[],
                )?
                .l()?;
            if controller.is_null() {
                return Ok(());
            }
            let bars = env
                .call_static_method("android/view/WindowInsets$Type", "systemBars", "()I", &[])?
                .i()?;
            if on {
                env.call_method(
                    &controller,
                    "setSystemBarsBehavior",
                    "(I)V",
                    &[JValue::Int(BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE)],
                )?;
                env.call_method(&controller, "hide", "(I)V", &[JValue::Int(bars)])?;
            } else {
                env.call_method(&controller, "show", "(I)V", &[JValue::Int(bars)])?;
            }
            return Ok(());
        }

        let decor = env
            .call_method(&window, "getDecorView", "()Landroid/view/View;", &[])?
            .l()?;
        if on {
            let current = env
                .call_method(&decor, "getSystemUiVisibility", "()I", &[])?
                .i()?;
            // Второе «включить» подряд не должно запомнить уже спрятанное как исходное.
            let _ = SAVED_UI_FLAGS.compare_exchange(-1, current, Ordering::SeqCst, Ordering::SeqCst);
            let flags = current | IMMERSIVE_STICKY | HIDE_NAVIGATION | FULLSCREEN;
            env.call_method(&decor, "setSystemUiVisibility", "(I)V", &[JValue::Int(flags)])?;
        } else {
            let saved = SAVED_UI_FLAGS.swap(-1, Ordering::SeqCst);
            if saved >= 0 {
                env.call_method(&decor, "setSystemUiVisibility", "(I)V", &[JValue::Int(saved)])?;
            }
        }
        Ok(())
    }
}
