# PsyGames — план публикации в Apple App Store

> Создан 16.07.2026 (после одобрения в Google Play). Пара к GOOGLE_PLAY_PLAN.md.
> Bundle ID: `com.psygames.app` (см. схему identifier'ов в GOOGLE_PLAY_PLAN.md §🧭).

## ✅ Уже готово в репо

| Что | Где |
|---|---|
| iOS bundle id `com.psygames.app` | `src-tauri/tauri.ios.conf.json` (platform-override; база `com.odv999.psygames` НЕ трогается) |
| Privacy Manifest | `src-tauri/PrivacyInfo.xcprivacy` — no tracking; ProductInteraction (not linked) для Supabase-синка сессий; required-reason: UserDefaults CA92.1, FileTimestamp C617.1. ⚠️ Перепроверить набор API при первом архиве в Xcode |
| Privacy Policy URL | https://psy-games.pro/privacy — живая, описывает локальные данные + анонимный Supabase-синк, без трекинга |
| Гайдлайн 3.1.1 (коды вне Apple запрещены) | `CODE_ENTRY_ENABLED = Platform.OS !== 'ios'` в `src/constants/profiles.ts` — на iOS скрыт ВЕСЬ ввод кода доступа (онбординг WelcomeModal, свитчер ProfileSwitcherModal, настройки settings); locked-профили показывают «🔒 Скоро» |
| UI без цен/подписок/внешней оплаты | сделано в v1.120.0 (`MONETIZATION_ENABLED=false`) — Apple anti-steering жёстче Google |
| Иконка 1024×1024 без альфа-канала | `store-assets/appstore/icon-1024-noalpha.png` |
| Скриншоты iPhone 6.7" (1290×2796) | `store-assets/appstore/iphone67-0{1..5}-*.png` (RU; сняты с web-сборки, DPR 3) |
| Удаление аккаунта (5.1.1(v)) | не требуется — аккаунтов/логина в приложении нет |

## ⏳ Что осталось (по порядку)

1. **Apple Developer Program** ($99/год) — регистрация, верификация (1–2 дня). — Денис
2. App Store Connect: создать приложение (bundle `com.psygames.app`), в
   Developer Portal — App ID + Distribution certificate + App Store
   provisioning profile.
3. **iOS CI-джоб** (по образцу android-джоба в build.yml): macos-раннер,
   `cargo tauri ios init` → скопировать `src-tauri/PrivacyInfo.xcprivacy`
   в gen/apple + добавить в Copy Bundle Resources (скриптом в джобе)
   → `cargo tauri ios build --export-method app-store` → подпись
   (сертификат+профиль в secrets, fastlane или xcodebuild) → upload
   в TestFlight (altool/asc-api-key).
4. Листинг: описания EN+RU (переиспользовать GOOGLE_PLAY_LISTING.md,
   ⚠️ смягчить мед-клеймы — «замедление старения», «клинический»,
   «CANTAB-grade» под гайдлайн 2.5.12), ключевые слова, категория
   Education / Health & Fitness.
5. App Privacy анкета в ASC = зеркало PrivacyInfo.xcprivacy:
   Product Interaction, not linked, no tracking.
6. Review notes: «всё бесплатно, логина нет, покупок нет».

## ⚠️ Известные риски ревью

- Мед/健康-клеймы в текстах листинга (2.5.12) — формулировать «тренировка
  когнитивных навыков», без обещаний терапии/замедления старения.
- «NZT-48» — отсылка к фильму Limitless; при придирке переименовать
  профиль в листинге (в приложении обычно не проверяют).
- Первый сабмит нового аккаунта часто получает 1 реджект — нормально,
  отвечать фактами в Resolution Center.
