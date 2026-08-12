# PsyGames — App Store listing kit (для Сергея, ASC)

> Готовые тексты под все поля App Store Connect. Primary Language = **English (U.S.)** (база), RU — локализация (добавить вторым языком в ASC).
> ⚠️ Научная честность (Apple + FTC режут health-claims): НЕ обещаем «boost IQ / get smarter / лечит». Обещаем валидные тесты + измеримый прогресс.

---

## 1. Базовые поля
- **Name (≤30):** `PsyGames`
- **Subtitle (≤30):** EN `48 brain training games` · RU `48 игр для тренировки мозга`
- **Bundle ID:** `com.psygames.app`
- **Primary category:** Education · **Secondary:** Games → Puzzle
- **Age rating:** 4+ (нет нежелательного контента)
- **Price:** Free (модель подписки/IAP — отдельно, если будет)

## 2. Promotional Text (≤170, можно менять без ревью)
- **EN:** `48 cognitive games built on real neuropsychology — train memory, attention, logic and speed, and watch your progress. 7 languages, offline, no ads.`
- **RU:** `48 когнитивных игр на реальных нейропсих-парадигмах — тренируй память, внимание, логику и скорость, отслеживай прогресс. 7 языков, офлайн, без рекламы.`

## 3. Description (EN — primary)
```
PsyGames is 48 cognitive training games built on validated neuropsychological paradigms — N-back, Stroop, Corsi, Trail Making, SET, Tower of London and more.

Train and measure the things that matter: memory, attention, logic, processing speed and self-control. Every game is a real cognitive task, not a toy — so your results are meaningful and your progress is measurable.

WHAT'S INSIDE
• 48 games across 4 categories: Memory, Attention, Logic, Speed & Control
• Morning warm-up and a calm "before sleep" session — curated complexes that auto-run with the right settings
• 11 profiles for different goals: languages, kids, seniors, focus, reaction, entrepreneurs and more
• Progress tracking + a cognitive assessment that maps your strengths and weaknesses on a radar
• 7 languages · works fully offline · no ads, no spam

HONEST ABOUT THE SCIENCE
Training reliably improves your performance on these tasks and closely related skills (near-transfer). We do not promise a higher IQ — research on far-transfer is mixed. What we give you are valid instruments and a clear, measurable picture of your progress. That's the difference from "brain-game" toys.
```

## 4. Description (RU — локализация)
```
PsyGames — это 48 когнитивных тренажёров на основе валидированных нейропсихологических парадигм: N-back, Струп, Корси, Trail Making, SET, Башня Лондона и другие.

Тренируйте и измеряйте то, что важно: память, внимание, логику, скорость обработки и самоконтроль. Каждая игра — реальный когнитивный тест, а не игрушка, поэтому результат осмыслен, а прогресс измерим.

ЧТО ВНУТРИ
• 48 игр в 4 категориях: Память, Внимание, Логика, Скорость и Контроль
• Утренняя зарядка и спокойный режим «перед сном» — готовые комплексы, запускаются сразу с нужными настройками
• 11 профилей под разные цели: языки, дети, 50+, фокус, реакция, предприниматели и др.
• Отслеживание прогресса + оценка с радаром сильных и слабых сторон
• 7 языков · работает офлайн · без рекламы

ЧЕСТНО О НАУКЕ
Тренировка надёжно улучшает результат на самих заданиях и близких навыках (near-transfer). Мы НЕ обещаем рост IQ — перенос на «общий интеллект» научно спорен. Мы даём валидные инструменты и понятную, измеримую картину прогресса. В этом отличие от «развивашек».
```

## 5. Keywords (≤100 символов, без пробелов после запятых)
- **EN:** `brain,memory,attention,focus,cognitive,logic,reaction,n-back,stroop,puzzle,concentration,mind,iq`
- **RU:** `мозг,память,внимание,фокус,логика,реакция,концентрация,тренировка,когнитивный,нейро,шульте,судоку`

## 6. URLs
- **Support URL:** `https://psy-games.pro/`
- **Marketing URL:** `https://psy-games.pro/`
- **Privacy Policy URL:** `https://psy-games.pro/privacy.html`  ← создаётся (см. ниже), ОБЯЗАТЕЛЬНО

## 7. App Privacy (nutrition label — ответы для ASC)
Апп: без логина, без рекламы, без сторонних трекеров. Данные сессий — локально (AsyncStorage), опц. синк в Supabase **анонимно** (без имени/почты).
- Data used to track you: **НЕТ**
- Data linked to you: **НЕТ**
- Data NOT linked to you: **Usage Data → Product Interaction** (результаты игр/сессии — обезличенно, для функции прогресса, НЕ для рекламы/трекинга)
- Никаких: контактов, локации, идентификаторов, здоровья (формально — не медицинское приложение), фото.

## 8. Age Rating анкета (ответы)
Все категории нежелательного контента — **None / Нет** (насилие, азартные игры (BART/Iowa — это когнитивные тесты решений, не настоящие ставки/деньги → None), контент 17+ — нет). Итог: **4+**.

## 9. Review Notes (для проверяющего Apple — впиши в App Review Information)
```
PsyGames is a cognitive-training app with 48 standalone games. No login required — open and play. No in-app purchases in this build. Games are based on classic neuropsychology paradigms (N-back, Stroop, etc.). "BART" and "Iowa Gambling Task" are cognitive decision-making tests with virtual points only — no real money, no gambling. The app works fully offline; optional anonymous cloud sync (no personal data). No account/demo credentials needed.
```

## 10. Screenshots (спека — снимать ПОСЛЕ нативной сборки, с iOS-симулятора/устройства)
Обязательно для **6.7" iPhone** (1290×2796 px), мин. 3, лучше 5-6:
1. Главный экран — категории + карточки игр (профиль ODV999/NZT, видно «48 игр»).
2. ЗАРЯДКА + ПЕРЕД СНОМ + ОЦЕНКА (3 херо-карточки).
3. Игра в процессе — напр. N-back или Шульте (наглядно).
4. Судоку 9×9 или Башня Лондона (логика).
5. Экран ОЦЕНКА — радар сильных/слабых.
6. Статистика/прогресс.
(iPad 12.9" 2048×2732 — если включаем iPad; для iPhone-only не нужен.)
Текст на скринах — на языке локали (EN для базы, RU для рус. локали).

## 11. What's New (release notes, первый релиз)
- **EN:** `First release. 48 cognitive games, morning & evening complexes, 11 profiles, cognitive assessment, 7 languages, fully offline.`
- **RU:** `Первый релиз. 48 когнитивных игр, утренние и вечерние комплексы, 11 профилей, оценка профиля, 7 языков, полностью офлайн.`
