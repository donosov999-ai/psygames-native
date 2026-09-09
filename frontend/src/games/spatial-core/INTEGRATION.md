# Пространственные упражнения — что вносит заход-интегратор

Перенос из лаборатории `psygames-game-lab` выполнен 09.09.2026. Экран, ядро,
графика и пробы уже в дереве; ниже лежит ровно то, что правит ОБЩИЕ файлы и
поэтому едет отдельным заходом (иначе параллельные приёмки затирают друг друга).

## Что уже сделано

- `app/games/spatial-lab.tsx` — маршрут, разбор параметров, глушение вечера.
- `src/components/SpatialLab.tsx` — экран обоих упражнений на общем каркасе.
- `src/games/spatial-core/*` — ядро поворотов, генераторы, решатели, банк Twiddle.
- Ментальная ротация: 50 ступеней, фигуры 4–13 кубиков, `RotationShape`,
  ручное вращение XYZ в разборе (`RotationWorkbench`).
- Реестры проб: `undo-honesty`, `game-task-line`, `game-mode-switch`,
  `calm-hush-everywhere`, `screen-width-guard`, `game-shell-adoption`.

## Что вносит интегратор

### 1. `src/constants/games.ts` — две записи на один экран

Упражнения различаются параметром `mode`, экран один. Образец — «Пицца» и
«Торты» на `CakeSortScreen`.

```ts
{
  id: 'spatial_net',
  nameKey: 'spatialNet',
  descKey: 'spatialNetDesc',
  skillKey: 'skillSpatial',
  gradient: ['#38bdf8', '#6366f1'],
  icon: 'git-network',
  route: '/games/spatial-lab',
  category: 'logic',
},
{
  id: 'spatial_twiddle',
  nameKey: 'spatialTwiddle',
  descKey: 'spatialTwiddleDesc',
  skillKey: 'skillSpatial',
  gradient: ['#a78bfa', '#f472b6'],
  icon: 'sync-circle',
  route: '/games/spatial-lab',
  category: 'logic',
},
```

⚠️ `route` у обеих один. Если реестр требует уникальности маршрута, вносить
второй записью с `hideFromMenu` и `mergedInto`, как сделано у сортировок.

### 2. Словарь — четыре ключа на двенадцати языках

| ключ | ru | en |
|---|---|---|
| `spatialNet` | Сеть труб | Pipe Network |
| `spatialNetDesc` | Поверни трубы так, чтобы вода дошла до каждого конца | Rotate the pipes so water reaches every end |
| `spatialTwiddle` | Поворот чисел | Number Twist |
| `spatialTwiddleDesc` | Вращай блок 2×2 и расставь числа по порядку | Rotate a 2×2 block and put the numbers in order |

Остальные десять языков — транскреацией, не пословно.

### 3. Раздел и профили

Обе идут в раздел «Пространство» (`sudoku-hub` соседний по духу — головоломки).
В профилях — там же, где `mental_rotation`: это один домен.

### 4. Строка в `GAMES_REFERENCE.md`

Уже добавлена этим заходом — проверить, что описание не разошлось с каталогом.

## Чего в переносе НЕТ намеренно

- `app/spatial-warmup.tsx` и `startSpatialLab` в `WarmupContext` — локальный стенд
  приёмки Codex, работавший только на loopback. Это инструмент проверки, а не
  часть приложения; в публичном репозитории ему не место.
- `app/spatial-lab.tsx` (редирект со старой ссылки предпросмотра) — по той же причине.

## 09.09.2026 · где теперь стенды

`app/spatial-lab.tsx` (редирект со старой ссылки предпросмотра) и `app/spatial-warmup.tsx`
(стенд приёмки зарядки на loopback) перенесены в `src/games/spatial-core/dev/` — код сохранён,
маршрутов у них больше нет: гейт `onboarding-exit-visible` требует выход у каждого экрана
верхнего уровня, а стендам он не нужен. Вернуть стенд — скопировать файл обратно в `app/`.

## 09.09.2026 · каталог подготовлен, карточка ждёт стандарта

Внесено: словарь `spatialLab`, `spatialLabDesc`, `spatialLabIntroDesc`, `spatialNet`,
`spatialTwiddle` (ru/en + десять оверлеев), заголовок экрана из словаря, пиктограмма 160×160
(`gameThumbs`, `gameThumbAudit`). Карточка в `games.ts`, справка `helpMap` и профиль НЕ
внесены: гейт `game-standard` требует от игры каталога прогресс через `usePersistentLevel`,
тропинку `LevelProgressMap` на экране настроек, общий экран итога (`GameResult`/`LevelCleared`)
и уровень в `saveSession` — у `SpatialLab.tsx` свои сохранение и лестница (`localSpatial`,
«Пройдено n/50»), звёзды и серия при этом не пишутся. Исключение `NO_LADDER` не подходит: оно
для экранов, где измерять нечего, а здесь лестница есть.

Что вносит раздел «Пространство», когда подключит стандарт: карточка `spatial_lab` (одна, см.
ниже), `helpMap["/games/spatial-lab"]` = { nameKey spatialLab, skillKey skillSpatial, introKey
spatialLabIntroDesc }, `'spatial_lab'` в профиле рядом с `mental_rotation`, строку
`spatial-lab` убрать из `AWAITING_CATALOG` в `game-routes.test.ts`.

```ts
  {
    id: 'spatial_lab',
    nameKey: 'spatialLab',
    descKey: 'spatialLabDesc',
    skillKey: 'skillSpatial',
    gradient: ['#38bdf8', '#6366f1'],
    icon: 'git-network',
    route: '/games/spatial-lab',
    category: 'logic',
  },
```

⚠️ Хвост раздела: остальной текст `SpatialLab.tsx` (кнопки, подсказки, подписи уровней) —
русские литералы; в 12-язычном приложении экран пока говорит по-русски.
