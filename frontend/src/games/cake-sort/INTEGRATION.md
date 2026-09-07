# «Пицца» · что осталось внести в общие файлы

VER 1 · 07.09.2026 · раздел «Сортировки» (`SPEC_CHAT_SORTING.md`).

Экран `app/games/pizza-sort.tsx` — тонкий маршрут: он вызывает тот же
`CakeSortScreen`, что и «Торты», со своей шкуркой и своим `gameId`. Арт
(`assets/images/pizza_tops/*`, `assets/images/pizza_boards/*`), правила игры,
лестница уровней и гейты уже в репозитории и работают по адресу
`/games/pizza-sort`.

Здесь — ровно то, чего этот заход трогать не мог: **общие файлы каталога,
словаря и профилей**. Их правит один заход-интегратор, разом, иначе несколько
параллельных правок одного массива затирают друг друга молча.

Пока карточка не заведена, экран числится в `AWAITING_CATALOG` в
`src/__tests__/game-routes.test.ts` — строку оттуда убрать в тот же заход, что
заведёт карточку (за этим следит проверка «ожидание каталога не протухло»).

---

## 1. Каталог — `src/constants/games.ts`

Вставить сразу ПОСЛЕ карточки `cake_sort` (она же образец: пицца ходит той же
семьёй и тем же хабом):

```ts
  {
    id: 'pizza_sort',
    nameKey: 'pizzaSort',
    descKey: 'pizzaSortDesc',
    skillKey: 'skillPlanning',
    gradient: ['#ef4444', '#f59e0b'],
    icon: 'pizza',
    route: '/games/pizza-sort',
    category: 'logic',
    hideFromMenu: true,
    mergedInto: 'sorting_group',
  },
```

🔴 **`id` обязан быть `pizza_sort`, буква в букву.** Этим ключом экран уже пишет
уровень (`psygames_pizza_sort_level_<профиль>`), звёзды, недоигранную партию и
`game_type` в истории сессий — код лежит в `app/games/pizza-sort.tsx` и в гейте
`cake-wedge-is-a-cake` («сохранённый уровень пиццы не берётся у тортов»).
Поменяешь id — потеряется весь прогресс, а гейт покраснеет.

⚠️ `hideFromMenu` + `mergedInto: 'sorting_group'` — как у всех пяти сортировок:
в общем меню карточки нет, игра доступна из хаба «Сортировки»
(`/games/sorting-hub`).

⚠️ Градиент красный → янтарный взят от пиццы, а не от торта: у `cake_sort`
розовый `#f472b6 → #f59e0b`, и две одинаковые плашки в одном хабе не различить.

## 2. Словарь — `src/contexts/LanguageContext.tsx`

Имя игры `pizzaSort` **уже заведено** на всех двенадцати языках (оно нужно
заголовку экрана). Не хватает только описания. Добавить рядом с
`cakeSortDesc`:

```ts
  pizzaSortDesc: { ru: 'Собирайте круг из шести одинаковых кусков', en: 'Gather a circle of six matching slices' },
```

и такую же строку в десять файлов `src/contexts/translations/*.ts` рядом с
`cakeSortDesc` — текст у пиццы и тортов совпадает дословно: правило игры одно,
разная только еда.

## 3. Профили — где игра доступна

Пицца ходит там же, где «Торты»: везде, где в наборе профиля есть `cake_sort`,
рядом должен встать `pizza_sort`. Отдельной настройки у неё нет.

## 4. Что проверить после правки

```bash
npx jest src/__tests__/game-routes src/__tests__/games-registry-covers-all \
         src/__tests__/game-task-line src/__tests__/undo-honesty \
         src/__tests__/cake src/__tests__/i18n-coverage
```

- `game-routes` — убрать `pizza-sort` из `AWAITING_CATALOG`, иначе проверка
  «ожидание каталога не протухло» покраснеет: запись, дожившая до появления игры
  в каталоге, валит прогон намеренно.
- `undo-honesty` — запись уже стоит (`WITH_UNDO`, «тот же экран и та же отмена,
  что у тортов»), трогать не надо.
