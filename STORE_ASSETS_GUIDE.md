# Store Assets & Listings — Руководство для разработчика

> Документ описывает предлагаемую структуру хранения стор-материалов (тексты, картинки)
> и требования к ассетам для каждой платформы.
> **Что делать** — решение за командой, это только предложения.

---

## Текущая ситуация

| Путь | Что там |
|---|---|
| `store/play-listing-{lang}.md` | 12 файлов с текстами для Google Play |
| `store-assets/appstore/` | Иконка + 5 скринов для App Store |
| `APPSTORE_LISTING.md` (корень) | Старый листинг App Store (дублирует?) |
| `GOOGLE_PLAY_LISTING.md` (корень) | Старый листинг Google Play (дублирует?) |

Проблемы: картинки Google Play не хранятся в репо, Windows Store материалов нет,
структура не масштабируется при добавлении новых сторов.

---

## Предлагаемая структура

```
store/
  google-play/
    listing-ar.md          ← переименовать из play-listing-ar.md
    listing-de.md
    listing-en.md
    ... (12 файлов)
    assets/
      icon-512.png         ← 512×512, PNG без альфа
      feature-graphic.png  ← 1024×500, JPG/PNG
      screenshots/
        phone-01.png       ← минимум 2, макс 8; мин 320px, макс 3840px
        phone-02.png       ← рекомендуем 1080×1920 (портрет) или 1920×1080 (ландшафт)
        phone-03.png
        tablet-01.png      ← (опц.) 7" или 10" планшет
  windows/
    listing-en.md          ← тексты для Microsoft Store
    listing-ru.md
    ... (нужные языки)
    assets/
      icon-300.png         ← 300×300, PNG
      screenshots/
        screen-01.png      ← 1366×768 минимум, рекомендуем 2560×1440 (16:9)
        screen-02.png
        ... (макс 10)
      store-logos/
        logo-358x173.png   ← Store logo (опц., но желательно)
  appstore/                ← переименовать из store-assets/appstore/
    icon-1024.png
    screenshots/
      iphone67-01.png
      ...
```

**Что переместить:**
- `store/play-listing-*.md` → `store/google-play/listing-*.md` (переименовать)
- `store-assets/appstore/` → `store/appstore/` (перенести)
- `GOOGLE_PLAY_LISTING.md` и `APPSTORE_LISTING.md` из корня — решить, нужны ли, или удалить как устаревшие

**Важно:** при переименовании/переносе `store/play-listing-*.md` нужно обновить
путь в `.github/scripts/update_listings.js` (сейчас он читает `store/play-listing-{lang}.md`).

---

## Требования к ассетам — Google Play

### Тексты (`store/google-play/listing-{lang}.md`)
Текущий формат (три блока кода) работает — скрипт сам парсит title / short / full.

| Поле | Лимит |
|---|---|
| Название (title) | 30 символов |
| Краткое описание | 80 символов |
| Полное описание | 4000 символов |

### Картинки
| Ассет | Размер | Формат | Обязательно |
|---|---|---|---|
| Иконка | 512×512 | PNG, без альфа | Да |
| Feature Graphic | 1024×500 | JPG или PNG | Да (нужен для публикации) |
| Скриншот телефона | мин 320px на меньшей стороне, макс 3840px | JPG или PNG | Мин 2 штуки |
| Скриншот планшета | то же | JPG или PNG | Нет |

Рекомендуемый размер скринов: **1080×1920** (портрет) или **1920×1080** (ландшафт).
Соотношение сторон должно быть от 16:9 до 9:16 (включительно).

---

## Требования к ассетам — Microsoft Store (Windows)

### Тексты (`store/windows/listing-{lang}.md`)
Можно взять за основу тексты Google Play — смысл тот же, но:
- Microsoft Store не разделяет short/full, есть одно **Description** (до 10 000 символов)
- Дополнительно есть поле **Features** — список из 5–20 пунктов (одна строка = один фич)
- Поле **Search terms** — до 7 ключевых слов (каждое до 40 символов)

Предлагаемый формат файла:

```markdown
## Title

PsyGames: Brain Training

## Description

...полный текст до 10 000 символов...

## Features

- 60+ cognitive mini-games
- 12 profiles: memory, attention, logic...
- Offline mode

## Search terms

brain training, memory, cognitive games, focus, attention
```

### Картинки
| Ассет | Размер | Формат | Обязательно |
|---|---|---|---|
| Screenshots | мин 1366×768, рек. **2560×1440** | PNG или JPG | Да, мин 1 штука |
| Store Logo | 300×300 | PNG | Рекомендуется |
| Store Logo (wide) | 1920×1080 | PNG | Нет |
| Hero art | 1920×1080 | PNG | Нет (используется в рекомендациях Store) |

Скрины должны быть 16:9. Так как PsyGames — десктопное приложение (Tauri),
скрины надо делать на Windows: `Win + PrtScn` или Snipping Tool.
Оптимально: 2560×1440 (2K) или 1920×1080 (Full HD).

---

## Сколько языков делать для Windows Store

Microsoft Store поддерживает ~100 языков, но обязателен хотя бы **один** из:
`en-US`, `en-GB`, `en-AU`, `en-CA`, `en-IN`.

**Рекомендация:** начать с `en` и `ru`, потом постепенно добавлять остальные 10 языков
по мере готовности — приоритет: `de`, `fr`, `es`, `ja`, `ko`, `pt`, `zh`.

---

## Workflow обновления (как это работает сейчас для Google Play)

1. Денис правит `store/google-play/listing-{lang}.md` → коммитит и пушит в ветку `main`
2. GitHub Actions видит изменение файла → запускает `update-listings.yml`
3. Скрипт `.github/scripts/update_listings.js` парсит MD и загружает текст через Google Play API

Для Windows Store можно сделать аналогичный воркфлоу (`update-listings-windows.yml`)
после того, как будет настроен Microsoft Store API.

---

*Документ составлен: Claude Sonnet 4.6, 2026-08-12. Предложения — не обязательные инструкции.*
