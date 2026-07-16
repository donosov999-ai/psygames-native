# PsyGames — план публикации в Google Play

> Документ для Дениса. Создан 2026-07-16.
> Текущая версия: **1.120.0** | Package: `com.psygames.app`
> APK готов: [v1.120.0 Release](https://github.com/donosov999-ai/psygames-native/releases/tag/v1.120.0)

---

## Блокеры (без них сабмит невозможен)

### 🔴 AAB вместо APK
Google Play требует Android App Bundle (AAB) для всех новых приложений с авг. 2021.
Сейчас CI собирает только APK (`cargo tauri android build --apk`).

**Что сделать:** добавить в `build.yml` (в job `android`) шаг сборки AAB:
```bash
cargo tauri android build --aab
```
И добавить Upload artifact для `.aab` (ищи в `gen/android/app/build/outputs/bundle/release/*.aab`).

> 💡 APK можно использовать для **Internal testing** (Google иногда принимает), но для продакшена — только AAB.

### 🟡 Ассеты (нужны до заполнения Store Listing)

| Ассет | Требование | Статус | Что сделать |
|---|---|---|---|
| App Icon | 512×512 PNG (≤1024 KB) | ⚠️ Есть 1024×1024 | Уменьшить `icon.png` до 512×512 |
| Feature Graphic | 1024×500 JPG/PNG | ❌ Отсутствует | Создать (см. ниже) |
| Скриншоты телефона | 2–8 шт., соотношение ≤2:1 | ❌ Не подходят | Apple-скрины (1290×2796) имеют соотношение 2.17:1 — сделать новые |

**Требования к скриншотам:**
- Формат: JPG или 24-bit PNG (без alpha-канала)
- Рекомендуемый размер: **1080×1920** (9:16, портрет)
- Минимум: 320px на короткую сторону
- Максимум: 3840px на длинную сторону
- Соотношение сторон: **не более 2:1** (1290×2580 — граница, 1290×2796 — не проходит)

**Вариант быстрого решения:** обрезать существующие Apple-скрины с 1290×2796 до 1290×2580 (убрать 108px сверху и 108px снизу). Или взять новые скриншоты с Android-эмулятора (1080×1920).

**Feature Graphic 1024×500** — рекомендуется:
- Название и логотип приложения
- Один–два игровых экрана
- Короткий слоган (EN: «48 brain training games»)
- Тёмный фон (в стиле приложения)

---

## Шаги публикации (чеклист)

### 1. Аккаунт разработчика
- [ ] Открыть https://play.google.com/console
- [ ] Зарегистрировать аккаунт (Google-аккаунт, желательно не личный)
- [ ] Оплатить единоразовый взнос **$25** (Developer Registration Fee)
- [ ] Заполнить профиль разработчика (имя, email, адрес)

### 2. Создать приложение в Play Console
- [ ] Dashboard → «Create app»
- [ ] App name: `PsyGames`
- [ ] Default language: `English (United States)`
- [ ] App or Game: **Game**
- [ ] Free or Paid: **Free**
- [ ] Принять Developer Program Policies

### 3. Собрать AAB

**Вариант A — через CI (рекомендую):**
1. Изменить `build.yml` — добавить `--aab` (или сделать отдельный job)
2. Запустить CI → скачать `.aab` из артефактов

**Вариант B — локально:**
```bash
# Из корня репо, после expo export
cd src-tauri
cargo tauri android build --aab
# Артефакт: gen/android/app/build/outputs/bundle/release/app-release.aab
```

### 4. Internal Testing Track
- [ ] Releases → Testing → Internal testing → «Create new release»
- [ ] Загрузить `.aab`
- [ ] Добавить тестировщиков (свой email)
- [ ] Установить на реальный Android-телефон, проверить всё работает
- [ ] Убедиться, что нет крашей при запуске

### 5. Store Listing
- [ ] Перейти: Store presence → Main store listing
- [ ] Заполнить поля EN (см. `GOOGLE_PLAY_LISTING.md`, секция 1–5)
- [ ] Добавить локализацию RU: Store presence → Translations → «Russian»
- [ ] Загрузить App Icon 512×512
- [ ] Загрузить Feature Graphic 1024×500
- [ ] Загрузить телефонные скриншоты (min 2, лучше 5–6)
- [ ] Загрузить скриншоты планшета 7" и 10" (опционально, рекомендуется)

### 6. Content Rating (IARC)
- [ ] Policy → App content → Content rating → «Start questionnaire»
- [ ] Категория: **Games**
- [ ] Заполнить по ответам из `GOOGLE_PLAY_LISTING.md` (секция 7)
- [ ] Получить рейтинг (ожидается **Everyone / PEGI 3**)

### 7. Target Audience & Content
- [ ] Policy → App content → Target audience
- [ ] Выбрать: **13 and over** (есть Kids-профиль, но основная аудитория — взрослые)
- [ ] «Does your app target children?» → **No** (не Designed for Families)

### 8. App Access
- [ ] Policy → App content → App access
- [ ] Выбрать: **All or most features are accessible without special access**
- [ ] Описание для проверяющего: «Open the app — no login required. Tap any game to play.»

### 9. Data Safety
- [ ] Policy → App content → Data safety
- [ ] Заполнить по ответам из `GOOGLE_PLAY_LISTING.md` (секция 8)

### 10. Pricing & Distribution
- [ ] Monetization → Pricing → **Free**
- [ ] Countries/regions: All countries (или начать с RU/US)
- [ ] «Is this app primarily designed for children?» → **No**

### 11. Submit для Production
- [ ] Убедиться, что все разделы Play Console имеют зелёную галочку
- [ ] Production → «Create new release»
- [ ] Загрузить тот же `.aab` (что тестировали в Internal)
- [ ] Release notes (EN + RU) — из `GOOGLE_PLAY_LISTING.md` (секция 6)
- [ ] «Review release» → «Start rollout to Production»
- [ ] Ожидание ревью: **1–7 рабочих дней** (для нового аккаунта может дольше)

---

## После публикации
- [ ] Сохранить ссылку на страницу в Play Store
- [ ] Добавить кнопку «Google Play» на psy-games.pro/download
- [ ] Настроить Google Play Developer API для автоматических обновлений (опционально)
- [ ] Первое обновление: проверить, что AAB принимается без проблем с подписью

---

*Тексты для всех полей — в `GOOGLE_PLAY_LISTING.md`. Подпись APK и ключ — те же, что в CI (`ANDROID_KEYSTORE_BASE64` → `psygames-release.jks`).*
