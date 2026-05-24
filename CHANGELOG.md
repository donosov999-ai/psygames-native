# Changelog

All notable changes to PsyGames Native (Mac/Win/Android/Web).

Following [Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`
- **MAJOR** — breaking changes (incompatible UX/data)
- **MINOR** — new features (backward-compatible)
- **PATCH** — bug fixes, content updates, small UX tweaks

To create a release: bump version in `tauri.conf.json` + `frontend/package.json`
+ `frontend/app.json` → commit → `git tag vX.Y.Z` → `git push --tags`.
CI's `release` job will attach all 4 artifacts (Mac/Win .exe/.msi/Android)
to a GitHub Release automatically.

---

## [1.13.0] — 2026-05-24

### Backlog аудита — 6 точечных фиксов премиум-позиционирования

#### 1. 🎓 Студенты ЕГЭ → **Студенты PRO** (расширение аудитории)
- Узко-российское «ЕГЭ» → международный pool: ЕГЭ + ОГЭ + GMAT + GRE + IELTS + TOEFL + SAT + MBA-prep
- `display_name`: «Студенты ЕГЭ» → **«Студенты PRO»**
- `audience`: «10-11 классы, репетиторы» → «ЕГЭ · GMAT · GRE · IELTS · TOEFL · SAT · MBA-prep»
- `sales_hook`: «100 баллов ЕГЭ» → **«GMAT 3.5 часа без падения концентрации. ЕГЭ 100 баллов. Марафон экзамена.»**
- `sales_hook_source`: Sala & Gobet, 2017, *Educational Research Review* (d=0.30 transfer effect)
- ID `'students'` сохранён → master-код `EGE-NZT-2026` работает

#### 2. 📖 Скорочтение → **Скорочтение PRO** (без привязки к одной школе)
- Школа Васильевой (Екб) убрана из main-копирайта (sales_hook + audience), осталась как ОДНО из упоминаний в long_description
- `display_name`: «Скорочтение» → **«Скорочтение PRO»**
- `audience`: «Ученики курсов скорочтения, репетиторы» → «Школы скорочтения · репетиторы · топ-менеджеры»
- `sales_hook`: убрана «Дополнение к методике школы Васильевой (Екб)» → **«Удержание прочитанного +40%»**
- ID `'vasilyeva'` сохранён → master-код `READING-NZT-2026` работает

#### 3. 👩 Женщины → **🌸 Микро-релакс** (нейтральное название, не отсекает B2B)
- Gender-locked название убирает мужских HR-покупателей, медбратьев, продажников
- `display_name`: «Женщины» → **«Микро-релакс»**
- `emoji`: 👩 → **🌸**
- `person`: «Женщина» → «Релакс»
- `audience`: «Женщины 25-55» → **«Все · преим. женщины 25-55, мамы, HR, педагоги»**
- Те же 9 игр (Memory Match, Find the Difference, Hidden Object, Sudoku) — engagement-driven mix
- ID `'women'` сохранён → master-код `WOMEN-NZT-2026` работает

#### 4. 🎁 FREE как **TRIAL** бейдж (визуальное отделение от платных)
- Новое поле в ProfileDef: `tier?: 'trial' | 'paid' | 'owner'`
- FREE.tier = 'trial', ODV999.tier = 'owner'
- В ProfileSwitcherModal: tier-based бейдж
  - 🎁 TRIAL · FREE (зелёный, для FREE)
  - 🔒 OWNER · ЛИЧНО (серый, для ODV999)
  - (для paid — обычный price-badge)
- `display_name`: «Free (без подписки)» → **«FREE Trial»**
- `description`: уточнение что это TRIAL-funnel

#### 5. «48+» → **«48 валидированных парадигм»** (B2B-копирайт)
- Personal-section остался «48+ когнитивных тренажёров» (consumer-friendly)
- B2B / Corporate-section: **«48 валидированных нейропсихологических парадигм»**
- Settings UI footer: «v1.13.0 · 48 валидированных парадигм»

#### 6. Меньше эмодзи в Corporate Pack (формальный деловой стиль)
- 🏢 B2B · Corporate → **Corporate / B2B** (без эмодзи)
- «Пакет для команды / компании» → **«Корпоративная подписка»**
- «🏢 Запросить корп-предложение» → **«Запросить коммерческое предложение»**
- Telegram pre-fill: убраны эмодзи, формальное «Добрый день, Денис» вместо «Привет»
- Добавлено: «договор оферты или индивидуальный · акты, счёт-фактуры · onboarding-сессия»

### Также
- Корп-блок теперь явно показывает экономию **«−80% vs Personal × 50»** (49 900 vs 49 500 × 50 = 2 475 000 ₽ — но это псих-якорь, фактически Personal не умеет такого масштаба)
- На landing profiles.html у Students PRO добавлен научный источник (Sala & Gobet 2017)

### Settings UI
- Footer: `PsyGames v1.13.0 · 48 валидированных парадигм`

---

## [1.12.0] — 2026-05-24

### Added — Premium-upgrade pack (4 точечных фикса по аудиту)

#### 1. Sales-хуки с научными источниками (`sales_hook_source`)
Премиум-аудитория (врачи, учёные) проверяет источники — без них хуки
с цифрами выглядят как маркетинг-ложь. Добавлено поле в `ProfileDef`
и заполнено для 5 профилей реальными ссылками:

| Профиль | Источник |
|---|---|
| ♟ Шахматист | Burgoyne et al., 2016, *Intelligence* — meta-analysis chess+cognition |
| 📖 Скорочтение | Edwards et al., 2005, *J Gerontol* — UFOV training (22-35% visual span) |
| 💊 NZT-48 | Jaeggi et al., 2008, *PNAS* — Dual N-back fluid intelligence transfer |
| ⚡ Реакция ПРО | Roenker et al., 2003, *Human Factors* — -31% driving errors |
| 👴 50+ | ACTIVE trial — Rebok et al., 2014, *JAMA Intern Med* — 10+ years effect |

Источники отображаются мелким курсивом под хуком («📚 ...») в детальной
модалке (приложение) и под хуками карточек профилей (лендинг profiles.html).

#### 2. Corporate Pack (B2B-tier — премиум-якорь)
По наблюдению Дениса: «бизнес-аудитория не верит в всё за 4990 ₽».
Добавлен tier дороже на порядок — это даёт «якорь дороговизны».

- **🏢 Corporate Pack — 49 900 ₽/год** (до 50 кодов разблокировки)
- ≈ 998 ₽/сотрудник · б/н оплата · договор · инвойс
- Включает: dashboard для HR · отчёт по сотрудникам · приоритет в техподдержке · кастомные мастер-коды с серийным префиксом
- Pre-filled Telegram-заявка: компания, кол-во сотрудников, нужные профили, контакт для договора

Константы: `CORPORATE_PACK_PRICE = 49900`, `CORPORATE_PACK_MAX_CODES = 50`.

В UI: новая карточка в switcher modal (после bundle) + отдельная секция
на лендинге profiles.html (тёмно-серая премиум-карточка с золотыми
акцентами).

#### 3. Замена «игры» → «тренажёры» (премиум-копирайт)
Слово «игра» воспринимается как casual. Премиум-продукт = «тренажёр»
/ «упражнение» / «парадигма».

Заменено в:
- `settings.tsx`: «9 игр каждый» → «9 тренажёров каждый», «Все 48 игр» → «Все 48 тренажёров»
- `WelcomeModal.tsx`: «9 базовых игр» → «9 базовых тренажёров»
- `ProfileSwitcherModal.tsx`: «N игр в этом профиле» → «N тренажёров в этом профиле»
- `profiles.html`: «9 игр в этом профиле» → «9 тренажёров в этом профиле»
- Settings UI footer: «v1.12.0 · 48+ тренажёров»

Слово «игра» оставлено там где это нативный термин («Игра завершена»).

#### 4. CTA «Спросить» → «Получить консультацию» / «Консультация»
Casual «спросить» заменено на premium «консультация»:
- `ProfileSwitcherModal.tsx`: «Задать вопрос в Telegram» → «Получить консультацию в Telegram»
- `profiles.html`: «💬 Спросить» → «💬 Консультация»

### Pricing-rationale (для документации)
- Personal subscription 490-990 ₽/год — массовый рынок
- Bundle 4990 ₽/год — экономия 27%, апселл
- **Corporate Pack 49 900 ₽/год — премиум-якорь** (×10 от Bundle)
- Соотношение Personal:Corporate = 1:50 (выглядит логично — 1 человек vs команда 50)
- Без Corporate-якоря 4990 ₽ выглядело как «дёшево для несерьёзных»

### Settings UI
- Footer: `PsyGames v1.12.0 · 48+ тренажёров`

---

## [1.11.0] — 2026-05-24

### Changed — 🚗 Водители → ⚡ Реакция ПРО (premium-rebranding)
По замечанию Дениса: профиль «Водители» размывал премиум-бренд PsyGames
(блю-коллар позиционирование в каталоге где средний tier 990₽).

**Изменения:**
- emoji: 🚗 → **⚡**
- display_name: «Водители» → **«Реакция ПРО»**
- person: «Водитель» → «Pro»
- color: `#3b82f6` (синий) → `#f97316` (оранжевый)
- audience: «Автошколы, корп, таксопарки» → **«Пилоты · хирурги ·
  диспетчеры · военные · pro-водители»**
- sales_hook: «-30% ошибок реакции» → **«Решения за секунды. Цена
  ошибки = жизнь.»**
- price_year: **790 → 990 ₽/год** (премиум-tier)
- Те же 9 игр (CPT, Choice RT, Visual Search и т.д.) — они одинаково
  релевантны для всех профессий с секундной точностью под стрессом
- **ID профиля 'drivers' СОХРАНЁН** — backward-compat: master-код
  `DRIVE-NZT-2026` продолжает работать, сохранённые prefs пользователей
  не ломаются. Только display-уровень изменён.

### Updated — Bundle pricing
- Старая сумма по отдельности: 6 410 ₽ (drivers был 790)
- Новая сумма по отдельности: **6 810 ₽** (drivers стал 990)
- Bundle всё ещё **4 990 ₽** → экономия теперь **27%** (была 22%)

### Marketing copy: 48 → 48+ (с учётом модификаций)
По замечанию Дениса: «с учётом модификаторов мы можем писать 48+».
Это честнее — у нас:
- 48 файлов-парадигм
- Шульте × 5 модификаций × 2 colors = 10 комбо
- Attention Conflict × 4 sub-games (Stroop/Stroop-Em/Flanker/Simon)
- Span Group × 3 sub (Corsi/Spatial/Digit)
- Inhibition × 2 sub (Go/No-Go + Stop-Signal)
- Каждая × 3 уровня сложности → ~100 уникальных режимов

Места обновлены:
- WelcomeModal hero: «48+ когнитивных тренажёров (NZT-48 · десятки
  модификаций)»
- Settings UI footer: «v1.11.0 · 48+ игр»
- download.html: hero, meta description, og description, cats_sub
- profiles.html: hero, meta

### Settings UI
- Footer: `PsyGames v1.11.0 · 48+ игр`

---

## [1.10.0] — 2026-05-24

### Added — Шульте: обратное направление (5 модификаций вместо 3)
По замечанию Дениса: «Шульте — сколько модификаций? цифры вперёд/назад,
буквы алфавит вперёд/назад, параллельно цифры+буквы». Не было backward.

**Было (3 модификации):**
- Цифры вперёд (1→25)
- Буквы вперёд (А→Я / A→Z)
- Параллельно (Шульте-Горбов: 1-А-2-Б-3-В)

**Стало (5 модификаций):**
- 🔢 Цифры **1→25** (forward)
- 🔢 Цифры **25→1** (backward — НОВОЕ)
- 🔤 Буквы **А→Я / A→Z** (forward)
- 🔤 Буквы **Я→А / Z→A** (backward — НОВОЕ)
- 🔀 Параллельно **1-А-2-Б-3-В** (Schulte-Gorbov)

Плюс colorMode toggle (фоновые цвета ячеек как визуальный шум) — даёт
×2 любой вариант. Итого реально **10 комбинаций**.

В UI добавлен toggle «Направление: 1→25 / 25→1» (показывается только для
numbers и letters, для mixed скрыт). Backward режим: пояснение «мозг
привычно ищет по возрастанию — обратный сложнее».

Mode сохраняется в Supabase как `numbers_forward_bw`, `letters_backward_color`
и т.д. для аналитики прогресса по каждой модификации отдельно.

### Improved — N-back: подробное intro с примером
По замечанию Дениса: «Н-бэк надо более подробное описание сделать, я сам
всё ещё не понимаю как играть».

**Было:** «Запоминайте последовательность вспышек на сетке. Когда текущая
вспышка совпадает с той, что была N шагов назад, нажмите MATCH.»
→ Академически правильно, но не объясняет как реально играть.

**Стало:** Структурированный intro с:
1. **🧠 Почему важно** — единственный научно валидированный тренажёр WM
   (Jaeggi et al., 2008, transfer-эффект на IQ)
2. **📋 Как играть** — пошаговая инструкция (4 буллета)
3. **🎯 Пример при N=2** — конкретная цепочка из 4 шагов с показом
   когда жать MATCH и когда нет
4. **💡 Стратегия для новичков** — начать с N=1, ритм важнее запоминания,
   не пытаться помнить все шаги, скользящее окно

Также обновлены короткие тексты: `nBackDesc` (описание на карточке) и
`nBackHint` (подсказка во время игры).

### Settings UI
- Footer: `PsyGames v1.10.0 · 48 игр`

---

## [1.9.1] — 2026-05-24

### Refactor — Simon merged into attention_conflict hub
- По замечанию Дениса: у нас в коде уже есть **`attention_conflict.tsx`** —
  агрегатор для парадигм interference resolution (Stroop + Stroop-Emotional
  + Flanker). Simon — концептуально 4-я парадигма того же кластера
  (пространственный конфликт). Создавать ему ОТДЕЛЬНУЮ карточку в основном
  меню = плодить дубли.
- **Изменения:**
  - `games.ts`: Simon получил `hideFromMenu: true`
  - `attention-conflict.tsx`: добавлен Simon как 4-я sub-game-карточка
    (Цвет vs Слово / vs Эмоция / vs Бока / **vs Позиция**)
  - Файл `simon.tsx` остался — игра запускается через переход из hub
  - Counts остаются: **48 игр в каталоге** (физически), 40 видимых в меню
    (было 39 + simon в hub).
- Симметрия с другими merge-парадигмами (`inhibition` объединяет go_no_go
  + stop_signal, `span_group` — corsi/spatial_span/digit_span).

### Added — Quick i18n RU/EN for profiles.html via Google Translate widget
- profiles.html был 0% i18n (download.html был с нативным data-i18n).
  Это плохо для не-русскоязычных посетителей.
- Решение: динамический load Google Translate widget + кнопки RU/EN
  в шапке (sticky). Качество ~90% от ручного перевода, но включается
  **за 5 минут** вместо «неделя ручной локализации 1000 строк».
- **Поведение:**
  - Browser language ≠ ru → автоматически предлагает EN при первом заходе
  - localStorage запоминает выбор пользователя
  - URL ?lang=en — форсирует EN (полезно для расшаривания ссылки)
  - Хардкодим список языков: en, es, fr, de, zh-CN, ja, ko, ar, tr, pl, uk
  - Прячем navigation banner от Google (визуальный шум)
- TODO для будущего: переписать на нативный data-i18n + dict
  (как download.html) если будет ~1000+ EN-посетителей/мес.

### Settings UI
- Footer: `PsyGames v1.9.1 · 48 игр`

---

## [1.9.0] — 2026-05-24

### Added — 48-я игра: Simon Task 🎉
- Создана новая игра `/games/simon` (action category, skillInhibition).
- **Зачем:** число игр стало 48 — точно как **NZT-48** (отсылка к фильму
  Limitless, в честь которого назван флагманский профиль). Маркетинговая
  согласованность: «NZT-48 = 48 игр».
- Парадигма: цветной квадрат появляется СЛЕВА или СПРАВА от центра экрана.
  Жми ЛЕВУЮ кнопку если СИНИЙ, ПРАВУЮ если КРАСНЫЙ (правило по цвету).
  Когда позиция стимула совпадает с правильной стороной ответа = легко
  (congruent), не совпадает = медленнее (incongruent).
- **Simon Effect** = mean(RT_incongruent) − mean(RT_congruent) — измеряет
  силу автоматического пространственного отвлечения. Меньше = лучше
  inhibitory control.
- Источник: Simon JR (1969) — классическая нейропсихологическая парадигма.
- Отличие от других inhibition-игр в каталоге:
  - **Flanker** — конфликт от соседних стрелок (визуальный)
  - **Stroop** — семантический конфликт (значение слова vs цвет шрифта)
  - **Simon** — пространственный конфликт (позиция стимула vs нужный ответ)
- Уровни сложности: easy (40% incongruent), medium (55%), hard (70%).
- Сохраняет в Supabase: `mean_rt`, `simon_effect_ms`.

### Updated
- Все упоминания «47 игр / 47 trainers / all 47» → «48»:
  - `profiles.ts` (ODV999 description / long_description / sales_hook)
  - `settings.tsx` (детальная модалка)
  - `ProfileSwitcherModal.tsx`
  - `WelcomeModal.tsx` («48 когнитивных тренажёров (NZT-48!)»)
  - `download.html` + `profiles.html` (meta, hero, stats, footer, catalog tab)
- Разбивка категорий: 12 памяти · 7 внимания · 14 логики · **15** скорости
  (action) = 48.
- Settings UI footer: «PsyGames v1.9.0 · 48 игр».
- `profiles.html` каталог получил карточку Simon с пометкой «48-я игра!».

### Не сделано
- Simon НЕ добавлен в allowed_games тематических профилей (chess/kids/...).
  Доступен только через ODV999 (all games). Решение — не ломать
  тематические балансы; если профиль явно выиграет от Simon (Execs,
  Drivers — инхибиция) — добавим точечно в отдельном патче.

---

## [1.8.0] — 2026-05-24

### Added — MVP Monetization (годовая подписка через Telegram)
- **Цены** добавлены к 9 платным тематическим профилям:
  - 🧒 Дети · 👩 Женщины · 🎓 Студенты ЕГЭ — **490 ₽/год** (массовая impulse)
  - ♟ Шахматист · 📖 Скорочтение — **690 ₽/год** (узкие ниши)
  - 🚗 Водители — **790 ₽/год** (B2B — автошколы/таксопарки)
  - 💊 NZT-48 · 👴 50+ · 💼 Execs — **990 ₽/год** (премиум-аудитория)
- **Пакет «Все 9 тематических»** — `BUNDLE_ALL_THEMED_PRICE = 4990 ₽/год`
  (экономия 22% vs сумма по отдельности).
- 🎁 FREE остаётся бесплатным навсегда. 🛠 ODV999 не продаётся (только лично).

### ProfileDef — новые поля
- `price_year?: number` — годовая цена в рублях
- `price_year_old?: number` — опциональная зачёркнутая старая цена (для скидок)
- Helpers: `isForSale(p)`, `formatPrice(rub)`

### UX — Switcher Modal (v1.7.0 → v1.8.0)
- На каждой locked-карточке профиля появился зелёный **ценник**
  (например «990₽/год»). FREE имеет жёлтый бейдж «бесплатно».
- В детальной модалке теперь БОЛЬШОЙ ценник с разбивкой:
  - «Годовая подписка» — заголовок
  - «990 ₽ /год» — крупно
  - «≈ 83₽/мес · код на 365 дней» — поясняющий
  - Зелёная кнопка **«🛒 Оформить за 990 ₽»** → Telegram pre-fill
- Под детальным CTA — две вспомогательные кнопки:
  - «🔑 У меня уже есть код — ввести»
  - «💬 Задать вопрос в Telegram» (для тех кто хочет спросить, а не покупать)
- Внизу switcher'a — **bundle-CTA с градиентом** orange→yellow:
  «📦 Все 9 тематических · ~~6410₽~~ **4990₽**/год · 🛒 Оформить пакет»
- Telegram pre-fill заявки на покупку содержит: профиль, цену, срок,
  способы оплаты (карта/СБП/крипто), поле «для меня / для (кого)».

### Landing (profiles.html)
- На каждой profile-card добавлен **ценник** (зелёный блок с ценой) +
  кнопка «🛒 Оформить за X ₽» + «💬 Спросить».
- Новая секция «💸 Сколько стоит» с 4 tier-карточками (массовая/узкие
  ниши/B2B/премиум) — Lumosity-style pricing page.
- CTA-banner снизу заменён на bundle-предложение «4990₽ за все 9» с
  зачёркнутой суммарной ценой.

### Landing (download.html)
- prof_footer обновлён (ru+en): «Тематические профили — годовая подписка
  от 490₽/год · оплата картой/СБП через Telegram. → Все цены и пакеты»
- Ссылка ведёт на profiles.html секцию pricing.

### Не сделано в v1.8.0 (отложено)
- ❌ Автоматизация платежей (CloudPayments / Robokassa) — MVP сначала
  проверяет спрос на ручной выдаче, потом включаем шлюз.
- ❌ Auto-renewal — клиент сам должен оплатить через год (manual renewal).
- ❌ Уведомление в приложении за 14 дней до истечения кода — нужна
  пуш-инфраструктура.
- ❌ Revocation list для отдельных кодов — нужен server (Supabase Edge Fn).

### Бизнес-нота (Claude)
- Низкий ценовой диапазон 490-990₽/год — это «impulse zone». Конверсия
  выше, но LTV ниже. Это разумно для **MVP-проверки спроса**. Через 2-3
  месяца после первых продаж — сделать A/B-тест с ценами ×2 для премиум-
  сегмента (Execs, NZT-48) — там реальный потолок выше.
- Execs за 990₽/год выглядит «слишком дёшево» для рынка executive coaching
  (где средний чек 10-50к/мес). Если зайдёт корп-канал — поднимать до
  4990-9990₽/год для B2B клиентов отдельным master-кодом.

---

## [1.7.0] — 2026-05-24

### Added — Profile Switcher на главном экране
- **Шапка `index.tsx` переделана.** Раньше профиль («🎁 Free (без подписки)»)
  был просто текстом — пользователь не понимал что это можно сменить.
- Теперь в шапке: кликабельный **профиль-чип** с фоном цвета профиля,
  иконкой профиля, названием и chevron ▾ — явно намекает что нажимается.
- Рядом с настройками — **новая кнопка 👤 (person-circle)** в цвете профиля.
  Дублирует чип для тех кто привык к иконкам в правом углу.
- Hint под чипом: «нажми на чип чтобы сменить профиль».
- Клик по чипу или 👤 → открывает **ProfileSwitcherModal** (bottom sheet
  со всеми 11 профилями) — больше не нужно идти в Settings.

### Added — `ProfileSwitcherModal` (reusable компонент)
- Bottom-sheet с сеткой всех профилей.
- Клик по разблокированному → переключение + закрытие.
- Клик по locked → открывается inline ProfileDetailModal с описанием,
  sales-хуком, списком 9 игр, кнопками «Ввести код» / «Запросить в Telegram
  у @Denis_On999».
- Inline code-input modal внутри — для тех у кого код уже на руках.
- Используется пока только в index.tsx; в Settings оставлена прежняя
  inline-реализация (рефактор позже).

### UX
- Главный экран теперь self-sufficient — все ключевые действия с профилем
  доступны прямо отсюда. До этого «как поменять профиль» было неочевидно.

---

## [1.6.1] — 2026-05-24

### Fixed
- **GameCard ширина РЕАЛЬНО фиксирована между секциями на Web.** Прошлые
  попытки через flex+wrap+gap+margin+belt-and-braces width/maxWidth/flexBasis
  не давали стабильного результата в RN Web — браузер всё равно перераспределял
  свободное место между карточками когда их в секции было мало (2 вместо
  потенциальных 5). Память выглядела с широкими карточками, Внимание узкими.
- Переход на **CSS Grid** через style-passthrough (RN Web 0.18+):
  ```ts
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
  gap: 10,
  ```
  Браузер сам считает кол-во колонок и каждая карточка получает ОДИНАКОВУЮ
  ширину независимо от того сколько их в секции.
- GameCard на web рендерится с `width: '100%'` (заполняет grid-cell) +
  `aspectRatio: 1/1.2` (высота автоматом по ширине).
- На **native (iOS/Android RN)** — fallback на старый flex+wrap с фикс. cardWidth.

### Technical
- Новое поле в GameCardProps: `width` теперь `number | string` (для `'100%'` на web).
- `Platform.OS === 'web'` гейтит выбор стратегии (grid vs flex).

---

## [1.6.0] — 2026-05-24

### Added — Profile Detail Modal
- **Клик по locked профилю в Settings** теперь открывает развёрнутую модалку
  вместо «ничего не происходит». Внутри:
  - 🎯 Sales hook — короткая продающая фраза (1 строка, цветной блок)
  - 📝 Long description — полный разбор для кого/зачем
  - 🏷 Метаданные: ⏱ длительность сессии, ☀️ Зарядка, 💰 Financial Day, 📊 Assessment
  - 🎮 Список 9 игр в этом профиле (с категорией-эмодзи и читаемым названием)
  - 🔑 Кнопка «У меня уже есть код — ввести»
  - 💬 Кнопка «Запросить код у @Denis_On999» — открывает Telegram с pre-filled
    сообщением «Привет, Денис! Хочу получить код доступа к профилю «X»...»
- **Long press** на любой карточке (даже разблокированной) → та же модалка.
- **Если профиль уже разблокирован** → кнопка «✓ Переключиться на этот профиль».
- **Если это текущий профиль** → плашка «✓ Это твой текущий профиль».

### Added — Sales Hooks (новое поле в ProfileDef)
- `sales_hook?: string` — 1 короткая эмоциональная фраза для продаж.
  Заполнено для всех 11 профилей. Примеры:
  - 💼 Execs: «Лучшие решения под давлением. Цена ошибки = миллион — цена тренировки = 15 минут.»
  - 👴 Seniors: «Замедли когнитивное старение на 7-10 лет. 15 минут в день — критично.»
  - 🎓 Students: «100 баллов ЕГЭ требуют 12 часов фокуса в день. Подготовь мозг к марафону.»
  - 👩 Women: «5 минут залипательного отдыха — без чувства вины. Он реально полезен.»
  - 💊 NZT-48: «NZT-48 из фильма — но реально. Полная батарея префронталки.»
  - 🚗 Drivers: «На -30% меньше ошибок реакции после месяца тренировок.»

### Removed
- `disabled={locked}` на TouchableOpacity — теперь карточка кликабельная.

### UX note
- Telegram-ссылка использует deeplink `https://t.me/Denis_On999?text=...`.
  На macOS/Windows откроется Telegram Desktop (если установлен) или web.
  На Android/iOS — сразу нативное приложение.

---

## [1.5.0] — 2026-05-24

### Added — Dynamic Keygen System
- **`frontend/scripts/keygen.mjs`** — CLI для генерации динамических кодов
  разблокировки профилей. Запуск: `yarn keygen --profile execs --days 90`
  или интерактивно `yarn keygen:interactive`.
- **Формат кода:** `XXX-YYMMDD-SSSS-CCCCCC` (21 символ)
  - XXX = 3-char profile prefix (ODV/CHE/KID/RED/NZT/DRV/SEN/EXC/STD/WOM)
  - YYMMDD = expiry date UTC
  - SSSS = 4-char serial для учёта «кому выдан»
  - CCCCCC = HMAC-SHA256 checksum от секретного ключа
- **`unlock.ts`** теперь проверяет ОБА формата параллельно:
  1. Сначала статический master-код (SHA-256 lookup) — backward compat
  2. Если не нашёлся → проверка как динамический (HMAC + expiry)
- **Auto-increment serial** при `--count > 1`: для serial=BIZ1 + count=5
  выдаст BIZ1, BIZ2, BIZ3, BIZ4, BIZ5.
- **NPM scripts:** `yarn keygen` и `yarn keygen:interactive`.

### Преимущества над статическими master-кодами
- Каждый код может иметь свой срок действия
- Можно генерить пачкой (100 уникальных кодов для промо-акции)
- Учёт «кому выдан» через serial (4 chars)
- Не нужен новый релиз приложения для выдачи кода
- Работает offline (HMAC проверяется встроенным ключом)

### Известные ограничения
- Отзыв ОДНОГО кода = только сменой ключа (отзовутся все динамические).
  Гранулярный отзыв = нужна revocation list через Supabase Edge Function
  (отложено — пока не критично).
- Serial = просто метка, не проверяется криптографически. Реальный учёт
  ведётся в `~/Downloads/PSYGAMES_UNLOCK_CODES.md`.

### Безопасность
- HMAC секрет вшит в JS bundle → reverse-engineer возможен. Для small
  commercial — достаточно. При утечке: `openssl rand -hex 32` →
  обновить в keygen.mjs + unlock.ts → push → CI rebuild → все динамические
  коды моментально инвалидируются.
- Статические master-коды (CHESS-NZT-2026, etc.) не затрагиваются.

---

## [1.4.1] — 2026-05-24

### Changed
- **👩 Женщины — engagement refactor.** По запросу Дениса заменил
  evidence-based набор (RMET, Switching, Trail Making, Phonemic Fluency,
  Word Pairs, Math Sprint) на залипательный казуальный mix:
  - 🧠 Память: Picture Pairs + Memory Matrix (Memory Match-жанр)
  - 🎯 Внимание (×4): Find Differences + Visual Search + Schulte + Proofreading
  - 🧩 Логика: Anagrams (Wordscapes) + Sudoku
  - ⚡ Скорость: Targets (лёгкая аркада)
- Description: «Multitasking · чтение эмоций · вербалка» →
  «Залипательные казуалки: парные картинки, отличия, hidden object, судоку, анаграммы».
- Длительность: «10-15 мин» → «5-10 мин» (формат микро-отдыха).
- ⚠ **Осознанно нарушено правило «1+1+1+1+5»** — перекос в attention (4/9)
  потому что женские казуалки = поиск/сопоставление, а не префронтальная
  батарея. Если retention не подтвердит — можно вернуть сбалансированный mix.

### Note
- Master code остаётся прежний: `WOMEN-NZT-2026`. Хеш не менялся.
- Никто из других 10 профилей не затронут.

---

## [1.4.0] — 2026-05-24

### Added
- **👩 Женщины** — 11-й тематический профиль. Аудитория: женщины 25-55,
  мамы, а также HR-специалисты, медсёстры, учителя, продажники обоих полов.
  9 игр под мультитаскинг (Switching, Trail Making), социальную когницию
  (RMET — Reading Mind in Eyes), вербалку (Phonemic Fluency), память на
  имена/списки (Word Pairs, Picture Pairs), внимание к деталям (Find
  Differences, Schulte) + бытовой счёт (Math Sprint).
- Master code: `WOMEN-NZT-2026` (hash `ccdc487...`).
- Цвет профиля: `#ec4899` (розовый), эмодзи: 👩.
- Длительность сессии: 10-15 мин. Warmup ✅, Assessment ✅, Financial ❌.

### Changed
- Settings UI label: «10 профилей» → «11 профилей · 1 бесплатный + 10 тематических».
- Onboarding слайд: «10 профилей под цель» → «11 профилей под цель».
- Unlock modal: добавлено упоминание профиля Женщины в список тематических.

### Critical note (от Claude)
- Gender-locked название «Женщины» отсекает мужскую B2B-аудиторию (HR,
  медучреждения) — это решение Дениса. По сути игр там нет ничего женского,
  они просто bias-нуты под soft skills + multitasking. Если продажи покажут
  что профиль покупают и мужчины тоже — переименовать в «Soft skills /
  Эмпатия» за один патч (только display_name + description).

---

## [1.3.0] — 2026-05-24

### Changed (BREAKING for personal users)
- **Removed all 5 personal profiles** (Денис / Алекс / Валя / Юля / Гость) from
  the public app. Семейные имена больше не светятся в коммерческой сборке.
- Бывший profile «Денис» (полный доступ ко всем 47 играм + Зарядка + Financial
  Brain Day + Assessment) пересоздан как тематический профиль **ODV999** под
  отдельным мастер-кодом. Тот же код, что и staticrypt-пароль NZT-сайта.
- `ProfileId` теперь: `odv999 | chess | kids | vasilyeva | nzt48 | free |
  drivers | seniors | execs | students` (10 штук, было 14).
- Раздел «👥 Личные» в Settings теперь не рендерится, если личных профилей нет.
- Onboarding-слайд «5 профилей» заменён на «10 профилей под цель» с упоминанием
  тематических батарей.
- Legacy migration: установки с сохранённым `denis/alex/valya/yulya/guest`
  тихо переключаются на FREE при первом запуске v1.3.0 (никаких ошибок,
  никаких потерь данных — `cognitive_sessions.person` остаётся как было).

### Added
- ODV999 themed profile + master code лежит в локальном `UNLOCK_CODES.md`
  (не в git). Чтобы войти — Settings → 🔑 Ввести код → ввести мастер-код.

---

## [1.2.6] — 2026-05-24

### Fixed
- **GameCard widths still drifted on Web** even with v1.2.5's CSS belt.
  Root cause: `gap` in flex-wrap is a known RN Web bug — it distributes
  the gap unevenly across items in rows with different item counts.
- Replaced parent `gap: GRID_GAP` (12px) with per-card `marginRight: 10,
  marginBottom: 10` directly on the outer View inside GameCard.
- Recomputed `cardWidth` formula to account for trailing per-card margin
  (so N cards + N margins fit containerWidth, not N + (N-1) gaps).

---

## [1.2.5] — 2026-05-24

### Fixed
- **macOS Tauri WebView** (WebKit) sometimes ignored plain `width` on
  flex-wrap children, letting cards stretch in sections with fewer items.
  Plain `width: cardWidth` worked in Chrome (Web build) but not always
  in macOS native app. Added belt-and-braces sizing on outer View:
  `width + minWidth + maxWidth + flexBasis + flexShrink:0 + flexGrow:0`.
  Same for height. This forces WebKit to honor exact dimensions
  regardless of flex parent layout decisions.

---

## [1.2.4] — 2026-05-24

### Fixed
- **GameCard sizes differed BETWEEN sections** (Память cards taller +
  narrower than Внимание cards on same page). Sections with fewer cards
  had cards rendered with different dimensions because RN Web's
  `flexBasis` + `width` combination on TouchableOpacity wasn't reliably
  honored — flex distribution still leaked through.
- Wrapped GameCard contents in an outer plain `<View style={{width:X, height:Y}}>`.
  In RN Web a plain View with inline width/height renders as `<div style="width:Xpx;height:Ypx">`,
  which is rock-solid against any flex math. TouchableOpacity + LinearGradient
  inside use `flex:1` to fill it exactly.
- Every game card on every section is now EXACTLY cardWidth × cardHeight.

---

## [1.2.3] — 2026-05-24

### Fixed
- **GameCard width now stable** across rows. After v1.2.2 fix for height,
  width started varying within rows (Парные ≈200px, Span ≈240px on the
  same row). RN Web's flex-wrap was still letting cards stretch/shrink
  to fill leftover space inconsistently.
- TouchableOpacity now has `flexShrink: 0, flexGrow: 0, flexBasis: cardWidth`
  — hard-pins each card to exactly cardWidth, no flex distribution.
- `gamesGrid` got `alignContent: flex-start` and `alignItems: flex-start`
  to prevent any row-level stretching.

---

## [1.2.2] — 2026-05-24

### Fixed
- **GameCard: row heights still differed between rows** (row 1 was taller
  than row 2 visually). v1.2.1 didn't fully fix it because dimensions
  were set on inner LinearGradient, not outer TouchableOpacity. RN Web
  wrap-flex measures each row's cross-size independently, so shorter
  rows could collapse to the natural content height.
- Moved `{width, height}` to outer TouchableOpacity (forces explicit
  layout dimensions per card). LinearGradient now uses `flex: 1` to
  fill its parent. TextContainer uses `flex: 1` to push badge to bottom.
  All cards on all rows now perfectly equal.

---

## [1.2.1] — 2026-05-24

### Fixed
- **Hero cards (Зарядка / Профиль / FIN BRAIN)** had different heights
  because `minHeight: 130` allowed cards with longer subtitles (e.g.
  «12 тестов · ~12 мин» + ★ badge) to stretch past 130 while neighbours
  stayed shorter. Fixed: `height: 150` (fixed), all 3 always equal.
- **Game cards** had varying internal layout: cards with short
  description had big empty gap between icon and text (because
  `justifyContent: 'space-between'` distributed remaining space).
  Fixed: removed `space-between` from card style; explicit `marginTop: 12`
  between icon and text, `marginTop: 'auto'` on badge to pin it to
  bottom. Result: identical visual structure regardless of desc length.

---

## [1.2.0] — 2026-05-23

Big refactor: 4 categories + balanced themed profiles.

### Changed
- **6 categories → 4** (Lumosity-style for simpler discovery):
  - 🧠 Память (12) — без изменений
  - 👁 Внимание (7) — только pure attention
  - 🧩 Логика и принятие решений (14) — was Logic (8) + Switching (3) + Risk (3)
  - ⚡ Скорость и торможение (14) — was Inhibition (7) + Speed (3) + Math (3) + Social (1)
  - Category sizes now 12/7/14/14 (was 12/7/8/14/3/3, разрыв 4.7× → 2.0×)
- **All 9 themed profiles rebuilt by «1+1+1+1 base + 5 themed» formula**.
  Every profile now covers ALL 4 categories with bias on its target audience.
  Previously many profiles had 0 games in 2-3 categories.

### New profile layouts (9 themed, 9 games each, all 4 cats covered)
- ♟ Шахматист: Corsi+CPT+ToL+ChoiceRT + 5 logic-bias (MR/Pattern/SET/Sudoku/Schulte)
- 🧒 Дети: Picture Pairs+Find Diff+Hanoi+Targets + 5 fun-bias
- 📖 Скорочтение: Reading Span+Schulte+Anagrams+SDMT + 5 attention-bias
- 💊 NZT-48: N-back+CPT+ToL+Conflict + 5 full-prefrontal-bias
- 🚗 Водители: N-back+CPT+Trail+ChoiceRT + 5 attention/reaction-bias
- 👴 50+: Picture Pairs+Schulte+Mnemonics+SDMT + 5 memory-bias
- 💼 Предприниматели: N-back+CPT+ToL+Conflict + 5 risk/decision-bias (BART/Iowa/PRL)
- 🎓 Студенты ЕГЭ: Reading Span+Schulte+Pattern+Math Sprint + 5 memory-bias
- 🎁 FREE: Picture Pairs+Schulte+Hanoi+Math Sprint + 5 funnel-teaser-bias

### Why
- Old profiles had 0 control for 5 themed (Шах, Дети, Скоро, Студенты, FREE) —
  bug: pure inhibition is one of the most trainable functions, can't omit it
- NZT-48 had only 1 memory game (contradicts the «WM is the base» concept)
- Шахматист had 5/9 in logic (too lopsided)
- Уровень категорий теперь равный для всех ЦА

### Technical
- `GameCategory` type: removed 'control', 'math', 'speed'; added 'action'
- `CATEGORY_ORDER` reduced from 6 to 4 entries
- `CATEGORY_META.action` added with flash-outline icon (same as ex-speed)
- 14 games re-categorised in `games.ts`: 6 → 'logic' (Trail/Switching/WCST/BART/Iowa/PRL), 14 → 'action' (Stroop/Flanker/GoNoGo/StopSignal/Counter/MathSprint/NumberBonds/ChoiceRT/Targets/SDMT/RMET/2 hubs)
- `LanguageContext.tsx`: new `catAction` key; legacy `catControl`/`catMath`/`catSpeed`
  point to «Скорость и торможение» for back-compat with any old code paths
- `app/index.tsx`: `grouped` Record narrowed to 4-category type

---

## [1.1.3] — 2026-05-23

### Added
- **Anagrams: hint banner** — each word now shows a short clue («💡
  упрямое животное» for «осёл») above the letter slots. Helps users
  who can shuffle letters but can't think of any matching word.

### Fixed
- **Anagrams: word list bugs** — `компьютер` (9 letters) was in the
  5-letter array, `берёза` (6) in 5, half of the 6-letter array was
  actually 7 letters. All entries now type-checked + auto-filtered by
  `.filter(e => e.w.length === N)` to prevent regression.

---

## [1.1.2] — 2026-05-23

### Fixed
- **Find Differences: shapes overlap** — random scene generation had no
  collision check, so two shapes could be drawn on top of each other.
  In SVG `onPress` only fires on the topmost element → the bottom shape
  was un-tappable, even if it was the actual diff. Fixed with rejection
  sampling (60 attempts per shape with min-distance check). Also enlarged
  scene area (280 → 340px height) and protected size-change diffs from
  introducing new overlaps.

---

## [1.1.1] — 2026-05-23

### Fixed
- **Picture Pairs «10 пар»** was always locked for themed profiles because
  the level manifest only had 6/8/12, while UI had 6/8/10/12 buttons.
  Added '10 pairs' as a 3rd step (unlock at 8 pairs ≤75s), and adjusted
  12 pairs to require '10 pairs ≤100s × 2'.

---

## [1.1.0] — 2026-05-17

Commercial profiles + level progression + onboarding UX.

### Added
- **9 themed commercial profiles** (chess / kids / vasilyeva /
  nzt48 / drivers / seniors / execs / students / free), each = 9 games
  curated for the audience. Personal profiles (Денис/Алекс/Валя/Юля/Гость)
  unchanged.
- **Unlock-code system**: 8 master codes (SHA-256 hashed in code, plaintext
  in `~/Downloads/PSYGAMES_UNLOCK_CODES.md` not in git). FREE is default,
  others require code.
- **Welcome modal** at first run with «FREE / Have a code» choice. Sets
  `psygames_first_run_done` flag.
- **Level progression** for themed profiles. 10 games with thresholds:
  Schulte (5×5 → 6×6 → 7×7 → 8×8 → 9×9 → 10×10), N-back (1 → 2 → 3 → 4),
  Digit Span (forward → backward), Corsi, Memory Matrix, Picture Pairs,
  Math Sprint, Pattern, Mental Rotation, CPT. Personal profiles see no locks.
- **UI locks** on 9/10 game config screens (🔒 emoji + disabled tap + helper
  text). CPT pending refactor — tracked in DB task `b5e34e05`.
- **`useLevelGate` hook** — reusable 3-line patch for level locks in any game.
- **Global UnlockToast** — «🎉 Новый уровень разблокирован!» banner shown
  for 4.5 sec when threshold is met.
- **Expanded profile descriptions** — `long_description`, `audience`,
  `session_minutes` fields added to ProfileDef.
- **Settings UI split** — «👥 Личные» + «🎯 Тематические» sections with
  lock icons on un-unlocked themed.

### Changed
- **Default profile = FREE** for unknown devices (was Денис). Commercial
  users no longer leak into personal data.
- **Default difficulty = first level** in all 9 patched games (was middle).
  Themed users start at unlocked level instead of staring at locked default.
- Main screen 3 hero blocks compressed into a single horizontal row of
  small squares (was vertical stack ~660px → now ~130px).

### Fixed
- Mental Rotation isometric SVG rendering bugs (z=min face → z=max,
  painter's algorithm Y sign).
- Picture Pairs photo-memory flash mode (per-card preview before play).
- Digit Span auto-check on last digit + auto-advance.
- Story Recall «Готов» button to skip distractor when ready.
- Proofreading cell sizing for desktop.

### Infrastructure
- `psygames-native` repo created as **single source of truth** for all
  platforms (Mac/Win/Android/Web). One push = 4 platform builds + auto
  web-deploy to `psygames-web`.
- GH Actions matrix workflow with caching, Android keystore signing,
  release-on-tag automation.
- README updated in all 3 places (`psygames-native`, `psygames-web`,
  local `psygames/frontend`) to mark single source of truth.

---

## [1.0.0] — 2026-05 (pre-versioning)

Initial native release covering everything before commercial profiles.

### Highlights
- 47 cognitive games across 6 categories (memory / attention / logic /
  control / math / speed)
- Утренняя Зарядка with per-weekday playlists
- Financial Brain Day battery (Iowa → BART → PRL, biweekly)
- G1 Initial Skill Assessment (12-domain radar)
- Achievements (20 in 5 categories)
- F2 Supabase cloud sync (fire-and-forget upsert)
- Profile gating × 5 personal profiles (Денис/Алекс/Валя/Юля/Гость)
- Onboarding tutorial (5 slides)

See git log before 2026-05-17 for details.
