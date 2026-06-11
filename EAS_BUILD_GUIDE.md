# PsyGames — нативная сборка iOS через EAS (путь Б)

> Все команды — из папки `frontend/` (там `app.json` + `package.json` + `eas.json`).
> Bundle ID уже зафиксирован: **`com.psygames.app`** (в `app.json` → `ios.bundleIdentifier`).
> Supabase-ключи захардкожены в `src/services/supabase.ts` (RLS-защищены) → **env в сборку не нужен**.

---

## Два независимых пути

| Путь | Зачем | Apple-аккаунт нужен? | Деньги |
|---|---|---|---|
| **A. Скрины** | снять скриншоты для App Store | ❌ нет | ❌ бесплатно |
| **B. Стор-бинарь** | загрузить .ipa в App Store Connect | ✅ да (Сергей) | EAS free-tier хватает |

Путь A можно делать **прямо сейчас**, не дожидаясь Сергея.

---

## ПУТЬ A — скриншоты (без Apple, бесплатно)

Нужны для листинга: **6.7" iPhone, 1290×2796 px**, мин. 3, лучше 5-6 (спека экранов — в `APPSTORE_LISTING.md` §10).

### Вариант 1 — локально через Xcode (быстрее всего, рекомендую)
Требует: **Xcode** установлен (App Store → Xcode) + CocoaPods (`sudo gem install cocoapods` или через brew).
```bash
cd frontend
npx expo run:ios          # prebuild + сборка + запуск в iOS Simulator
```
- Запустится симулятор. Выбрать модель **iPhone 16 Pro Max** (это 6.7", 1290×2796) — меню симулятора *File → Open Simulator → iPhone 16 Pro Max*.
- Скрин в симуляторе: **Cmd+S** (сохраняется на Рабочий стол, точное разрешение устройства).
- Никакого Apple-аккаунта/Expo-аккаунта для симулятора не требуется.

### Вариант 2 — облачная сборка EAS (если Xcode нет/не хочется локально)
Требует: **бесплатный Expo-аккаунт** (expo.dev).
```bash
cd frontend
npx eas login             # вход в Expo-аккаунт (создать на expo.dev, бесплатно)
npx eas init              # привяжет проект, впишет extra.eas.projectId в app.json
npx eas build -p ios --profile preview   # собирает .app для симулятора (без подписи Apple)
```
- По окончании EAS даст ссылку на `.tar.gz` с `.app`. Распаковать → перетащить `.app` в открытый iOS Simulator (iPhone 16 Pro Max) → приложение установится → снимать скрины (Cmd+S).

---

## ПУТЬ B — стор-бинарь (нужен Apple-аккаунт Сергея)

```bash
cd frontend
npx eas login                                  # Expo-аккаунт (можно тот же)
npx eas init                                   # если ещё не делали в пути A
npx eas build -p ios --profile production       # ⬇️ тут EAS спросит Apple-логин
```
На шаге production EAS попросит войти в **Apple-аккаунт Сергея** и сам создаст/привяжет
сертификаты и provisioning-профиль (managed credentials — проще всего). Готовый **.ipa** —
по ссылке от EAS.

### Загрузка в App Store Connect
1. Сначала заполнить плейсхолдеры в `frontend/eas.json` → блок `submit.production.ios`:
   - `appleId` — email Apple-аккаунта Сергея
   - `ascAppId` — числовой ID записи приложения (появится после создания App в ASC)
   - `appleTeamId` — 10-символьный Team ID
2. Потом:
```bash
npx eas submit -p ios --profile production
```
Загрузит последний production-билд в ASC → дальше Сергей жмёт *Submit for Review* в вебе.

---

## Что нужно от Сергея (credentials)

| Что | Где взять | Для чего |
|---|---|---|
| **Apple ID (email)** | его dev-аккаунт | вход EAS на шаге production + `eas submit` |
| **Apple Team ID** (10 симв.) | developer.apple.com → Membership | `eas.json` → `appleTeamId` |
| **App-specific password** | appleid.apple.com → Sign-In & Security → App-Specific Passwords | чтобы EAS вошёл без 2FA-ручного |
| *(или вместо пароля)* **ASC API Key** | App Store Connect → Users and Access → Integrations → App Store Connect API → ключ `.p8` + Key ID + Issuer ID | рекомендуется для авто-сабмита (надёжнее пароля) |
| **ASC App ID** (число) | появляется после создания записи App в ASC (из `APPSTORE_LISTING.md`) | `eas.json` → `ascAppId` |
| **Identifier зарегистрирован** | developer.apple.com → Identifiers → `com.psygames.app` (Explicit) **+ галка capability «Push Notifications»** | без него production-сборка не подпишется. Push-capability: локальные напоминания её НЕ требуют, но включить сразу = не перевыпускать provisioning потом под Фазу 2 (remote). Безвредно для билда, который пуши не шлёт |
| **APNs Auth Key (.p8)** | developer.apple.com → Keys → «Apple Push Notifications service (APNs)» → создать ключ | ⚠️ ТОЛЬКО Фаза 2 (удалённые пуши/рассылки). Залить в EAS (или EAS создаст сам при `eas credentials`). Для локальных напоминаний (Фаза 1) НЕ нужен |

---

## ⚠️ Решения до сабмита

1. **iPad?** В `app.json` сейчас `ios.supportsTablet: true` → App Store потребует **ещё и iPad-скрины** (12.9", 2048×2732). Если хотим **iPhone-only** (меньше работы со скринами, быстрее старт) — поставить `supportsTablet: false`. Решение Дениса.
2. **buildNumber** — стартует с `1` (в `app.json`), production-профиль авто-инкрементит при каждой сборке (`autoIncrement: true`). Маркетинговая версия (1.24.3) тянется из `app.json` (`appVersionSource: "local"`).
3. **IAP / монетизация** — на free-этапе НЕ включаем (коды выключены, все профили открыты). Когда добавим платное — только Apple IAP (guideline 3.1.1), отдельный шаг.

---
*Создано для подготовки нативного iOS-релиза. Bundle ID: com.psygames.app. Обновлять при изменении флоу.*
