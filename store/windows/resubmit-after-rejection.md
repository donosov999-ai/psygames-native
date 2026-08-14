# Повторная подача в Microsoft Store после отказа 13.08.2026

Автор: Denis Onosov (ODV999) · ⚠️ Информация конфиденциальная

## Что произошло

Заявку отклонили. Статус в Partner Center — **Attention needed**.
Издатель — Psy Games. Product ID в отчёте сертификации; здесь не приводится: репозиторий публичный.

Причина одна, дословно из отчёта:

> **10.2.9.4 Security — Package Submissions**
> Your win32 submission appears to be a game. Games are not accepted as MSI or EXE
> but are accepted as other app types.
> Tested devices: Dell Latitude 5490

Читается так: рецензент решил, что перед ним игра, а игру в Store нельзя подавать
установщиком `.msi` или `.exe`.

## Почему это упирается в наш движок

Tauri собирает ТОЛЬКО `.exe` (NSIS) и `.msi` (WiX) — это написано в их же
документации по публикации в Microsoft Store. Другого формата он не производит.
Значит выбор такой: либо мы не игра, либо нужен MSIX, которого Tauri не умеет.

## Что уже сделано (13.08.2026)

Переписаны тексты витрины так, чтобы приложение не выглядело игрой:

- **Название** `PsyGames: Brain Training` → **`Brain Tools: Cognitive Training`**
  (RU: `Brain Tools: когнитивный тренинг`).
  Слово Games уходит из названия ПРОДУКТА, но остаётся у ИЗДАТЕЛЯ — в карточке
  видно «Psy Games». Бренд не теряется.
- Из описаний убрано слово «game» / «игра» там, где мы называли так себя: было
  девять упоминаний в английском тексте. «Уровни в каждой игре» → «в каждом
  упражнении», «ЭТО НЕ ИГРУШКА» → «ЭТО НЕ РАЗВЛЕКАТЕЛЬНАЯ ГОЛОВОЛОМКА», «каталог
  игр» → «каталог упражнений» и так далее.
- Файлы: `listing-en.md`, `listing-ru.md`, `store-listing.csv`.

Поисковые запросы не трогали — там слова «game» и не было.

## Что должен сделать Денис в Partner Center

У меня туда доступа нет, эти шаги руками.

1. **Зарезервировать новое имя.** Product management → Manage app names →
   добавить `Brain Tools: Cognitive Training`. Поле Product name в витрине — это
   выпадающий список из зарезервированных имён, и пока имя не зарезервировано,
   выбрать его нельзя.
2. Открыть заявку → раздел **Properties**.
3. **Primary category** поставить **Education** (запасной вариант — Health + fitness).
   По описанию Microsoft: Education — «apps which help the user to learn a new skill
   or topic»; Health + fitness — «healthy living, recreational activities».
4. ⚠️ **ПРОВЕРИТЬ, МЕНЯЕТСЯ ЛИ ПОЛЕ ВООБЩЕ.** В документации Microsoft дословно:
   «If you publish the app in the Games category, you won't be able to pick a
   different category in a new submission». Запрет действует для ОПУБЛИКОВАННЫХ
   приложений; наше не опубликовано, его отклонили — значит поле должно быть живым.
   Если оно заблокировано, первый путь отпадает, см. «Если снова откажут».
5. **Заполнить «Notes for certification»** — там же в Properties, раздел Product
   declarations, 2000 символов. Готовый текст лежит в `notes-for-certification.md`.
   ⚠️ Это единственный прямой канал к живому рецензенту, и в прошлой заявке он
   оставался пустым: мы не дали человеку ничего, кроме картинок с плитками.
6. В витрине выбрать новое **Product name** из выпадающего списка.
7. Обновить тексты витрины из `listing-en.md` / `listing-ru.md` (или залить
   `store-listing.csv`).
8. Подать заново.

## Если снова откажут

Значит дело не в подаче, а в самом типе пакета. Тогда MSIX, и это уже работа:

- у Microsoft есть собственный **winapp CLI с инструкцией именно под Tauri** —
  добавляет package identity и пакует в MSIX;
- есть сторонний упаковщик `@choochmeque/tauri-windows-bundle`.

⚠️ Там ждёт вторая стена: в трекере Tauri висит баг, что чистый проект v2 не
проходит проверку WACK на Windows S Mode из-за обращений к `cmd.exe`
(tauri-apps/tauri#14935). То есть MSIX может не спасти сам по себе.

Третий путь, если возиться не хочется: не идти в Store вообще и раздавать `.exe`
с сайта, как сейчас с GitHub Releases.

## Чего НЕ меняли

- Бинарник, `productName` в `tauri.conf.json`, идентификатор `com.odv999.psygames`.
  Категория и название витрины — поля заявки, к сборке отношения не имеют.
- Название в Google Play и в самом приложении. Речь только о витрине Microsoft.
