# PsyGames — App Store listing kit (для Сергея, ASC)

> Готовые тексты под все поля App Store Connect. Primary Language = **English (U.S.)** (база), RU — локализация (добавить вторым языком в ASC).
> ⚠️ Научная честность (Apple + FTC режут health-claims): НЕ обещаем «boost IQ / get smarter / лечит». Обещаем валидные тесты + измеримый прогресс.

---

## 1. Базовые поля
- **Name (≤30):** `PsyGames`
- **Subtitle (≤30):** EN `131 brain training games` · RU `131 игра для тренировки мозга`
- **Bundle ID:** `com.psygames.app`
- **Primary category:** Education · **Secondary:** Games → Puzzle
- **Age rating:** 4+ (нет нежелательного контента)
- **Price:** Free (модель подписки/IAP — отдельно, если будет)

## 2. Promotional Text (≤170, можно менять без ревью)
- **EN:** `New: a language warm-up that mixes two foreign languages round by round. 131 cognitive games on real neuropsychology. 12 languages, offline, no ads.`
- **RU:** `Новое: языковая зарядка — два иностранных вперемешку, раунд за раундом. 131 когнитивная игра на реальных парадигмах. 12 языков, офлайн, без рекламы.`

## 3. Description (EN — primary)
```
PsyGames is 131 cognitive training games built on validated neuropsychological paradigms — N-back, Stroop, Corsi, Trail Making, SET, Tower of London and more.

Train and measure the things that matter: memory, attention, logic, processing speed and self-control. Every game is a real cognitive task, not a toy — so your results are meaningful and your progress is measurable.

WHAT'S INSIDE
• 131 games across 6 categories: Memory, Attention, Logic, Intuition, Speed & Control, Recovery
• Morning warm-up and a calm "before sleep" session — curated complexes that auto-run with the right settings
• 12 profiles for different goals: languages, kids, seniors, focus, reaction, entrepreneurs and more
• Progress tracking + a cognitive assessment that maps your strengths and weaknesses on a radar
• 12 languages · works fully offline · no ads, no spam

HONEST ABOUT THE SCIENCE
Training reliably improves your performance on these tasks and closely related skills (near-transfer). We do not promise a higher IQ — research on far-transfer is mixed. What we give you are valid instruments and a clear, measurable picture of your progress. That's the difference from "brain-game" toys.
```

## 4. Description (RU — локализация)
```
PsyGames — это 131 когнитивный тренажёр на основе валидированных нейропсихологических парадигм: N-back, Струп, Корси, Trail Making, SET, Башня Лондона и другие.

Тренируйте и измеряйте то, что важно: память, внимание, логику, скорость обработки и самоконтроль. Каждая игра — реальный когнитивный тест, а не игрушка, поэтому результат осмыслен, а прогресс измерим.

ЧТО ВНУТРИ
• 131 игра в 6 категориях: Память, Внимание, Логика, Интуиция, Скорость и Контроль, Восстановление
• Утренняя зарядка и спокойный режим «перед сном» — готовые комплексы, запускаются сразу с нужными настройками
• 12 профилей под разные цели: языки, дети, 50+, фокус, реакция, предприниматели и др.
• Отслеживание прогресса + оценка с радаром сильных и слабых сторон
• 12 языков · работает офлайн · без рекламы

ЧЕСТНО О НАУКЕ
Тренировка надёжно улучшает результат на самих заданиях и близких навыках (near-transfer). Мы НЕ обещаем рост IQ — перенос на «общий интеллект» научно спорен. Мы даём валидные инструменты и понятную, измеримую картину прогресса. В этом отличие от «развивашек».
```

## 5. Keywords (≤100 символов, без пробелов после запятых)
- **EN:** `brain,memory,attention,focus,cognitive,logic,reaction,n-back,stroop,puzzle,concentration,vocabulary`
- **RU:** `мозг,память,внимание,фокус,логика,реакция,концентрация,тренировка,слова,язык,шульте,судоку,счёт`

## 6. URLs
- **Support URL:** `https://psy-games.pro/`
- **Marketing URL:** `https://psy-games.pro/`
- **Privacy Policy URL:** `https://psy-games.pro/privacy/` (legacy `/privacy.html` также опубликован).
- **Privacy choices / deletion request:** `https://psy-games.pro/account-deletion/`.

## 7. App Privacy (nutrition label — ответы для ASC)
Актуализация 18.10.2026 для cloud-enabled 2.56.30: локальная игра без аккаунта;
необязательный вход по почте через Supabase Auth, облачные копии только после
отдельного согласия. Заявления «синк анонимно / без почты» устарели.
- Data used to track you: **НЕТ**
- Data linked to you: **Contact Info → Email Address**, **Identifiers → User ID**,
  **Usage Data → Product Interaction**, **User Content → Other User Content**:
  аккаунт и согласованные резервные копии прогресса, настроек, имени питомца,
  заработанных очков/инвентаря. Назначение — **App Functionality**, не tracking.
- Прежние ответы для анонимных сессий/диагностики/отзывов сохранять по факту,
  не превращать их молча в «всё удаляется с аккаунтом» и не затирать анкету целиком.
- Контакты, геолокация, реклама и платёжные реквизиты для облака не нужны.
- **Статус:** это инструкция для анкеты; публикация App Privacy требует входа
  в App Store Connect и отдельного подтверждённого readback. Наличие этого файла
  или опубликованной политики не означает, что Apple label уже обновлён.

## 8. Age Rating анкета (ответы)
Все категории нежелательного контента — **None / Нет** (насилие, азартные игры (BART/Iowa — это когнитивные тесты решений, не настоящие ставки/деньги → None), контент 17+ — нет). Итог: **4+**.

## 9. Review Notes (для проверяющего Apple — впиши в App Review Information)
```
PsyGames is a cognitive-training app with 145 games and modes. Local play does not require an account. No paid in-app purchases in this build; shop items use earned game points. Games are based on classic neuropsychology paradigms (N-back, Stroop, etc.). BART and Iowa Gambling Task use virtual points only, with no real-money gambling. Optional cloud backups require email-link sign-in through Supabase Auth and separate explicit consent; sign-in alone does not enable uploads. Settings provides selected-copy restore, cloud-copy deletion, and separately confirmed shared-account deletion for all four apps while preserving local device progress. Reviewers can test local play without credentials; testing cloud requires a mailbox they control. Public privacy and deletion instructions: https://psy-games.pro/privacy/ and https://psy-games.pro/account-deletion/ .
```

## 10. Screenshots (спека — снимать ПОСЛЕ нативной сборки, с iOS-симулятора/устройства)
Обязательно для **6.7" iPhone** (1290×2796 px), мин. 3, лучше 5-6:
1. Главный экран — категории + карточки игр (профиль ODV999/NZT).
   ⚠️ Число на этом экране берётся из `PUBLIC_GAME_COUNT` (`frontend/src/constants/profiles.ts`),
   а он равен `GAMES.length` = 75 и считает три карточки-развилки за тренажёры. В текстах
   карточки стоит 75 — упражнения без развилок, как считает онбординг. Пока долг в
   `profiles.ts` не закрыт, скрин и текст разойдутся на три: снимать с оглядкой.
2. ЗАРЯДКА + ПЕРЕД СНОМ + ОЦЕНКА (3 херо-карточки).
3. Игра в процессе — напр. N-back или Шульте (наглядно).
4. Судоку 9×9 или Башня Лондона (логика).
5. Экран ОЦЕНКА — радар сильных/слабых.
6. Статистика/прогресс.
(iPad 12.9" 2048×2732 — если включаем iPad; для iPhone-only не нужен.)
Текст на скринах — на языке локали (EN для базы, RU для рус. локали).

## 11. What's New (release notes, первый релиз)
- **EN:** `First release. 131 cognitive games, morning & evening complexes, 12 profiles, cognitive assessment, 12 languages, fully offline.`
- **RU:** `Первый релиз. 131 когнитивная игра, утренние и вечерние комплексы, 12 профилей, оценка профиля, 12 языков, полностью офлайн.`
