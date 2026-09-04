# Microsoft Store — listing, locale en

Автор: Denis Onosov (ODV999) · под сборку v1.192.0 (Windows x64 .exe/.msi, собирается в CI на тегах)

Это НЕ перевод карточки Google Play. У Microsoft другая структура полей (одно Description
вместо short+full, отдельные Features и Search terms) и другой читатель: человек за рабочим
компьютером, а не в телефоне в метро. Довод «тренируйся между задачами на той же машине,
где работаешь» в Play бессмысленен, а здесь — главный.

⚠️ ЧЕГО ЗДЕСЬ НАМЕРЕННО НЕТ: обещаний про клавиатуру и горячие клавиши. На 12.08.2026
клавиатуру в коде обрабатывает единственный файл — и тот не игра, а кнопка отзыва
(`src/services/feedback.ts`). Все упражнения работают мышью. Для настольного магазина это
слабое место, но врать в карточке хуже, чем иметь пробел.

---

## Title

```
Brain Tools: Cognitive Training
```
31 символ (лимит 256)

⚠️ ИМЯ БЕЗ СЛОВА GAMES — ЭТО НЕ КОСМЕТИКА. Заявку 13.08.2026 отклонили по правилу
10.2.9.4: «Your win32 submission appears to be a game. Games are not accepted as MSI
or EXE». Игру в Store нельзя подавать как .msi/.exe, а Tauri других форматов не
собирает. Значит нам нельзя выглядеть игрой — ни названием, ни описанием.

Бренд при этом не теряется: издатель в заявке значится как **Psy Games**, и эта
строка видна в карточке. Слово уходит из названия продукта, но остаётся у автора.

---

## Description

Лимит 10 000 символов · использовано 4350

```
Read a page — and you still know what was on it.
Hold three tasks in your head and drop none of them.
Sit down to work — and two hours later you still haven't reached for the phone.

That's not a gift you're born with. It's trained — and here you can see by how much.

Brain Tools is cognitive training with 67 exercises for memory, attention, logic and thinking speed. Not another "test your IQ", but training with results you can measure.

WHY THE DESKTOP VERSION IS THE ONE THAT STICKS

Brain apps die on the phone. You install one, open it three times on the way to work, and forget it — because the phone is where you rest, and training is work.

On the computer it lands differently. It's the machine you already sit at for eight hours. A ten-minute set between two tasks costs you nothing to start: no unlocking, no finding the icon, no "later". And the screen finally has room — Schulte tables, memory matrices and Sudoku were designed for a full field of view, not a 6-inch strip.

MEMORY
Visual memory with Corsi blocks, matrices and matching pairs. Working memory with N-back, operation span and reading span. Hold a pattern in mind and reproduce it later.

ATTENTION AND FOCUS
Schulte tables, Spot the Difference, Posner and Flanker tasks. Practise staying on task despite interruptions — the exact skill an open inbox eats.

LOGIC AND PUZZLES
Sudoku with 15 rule variants, Tower of Hanoi, Tower of London, SET and anagrams. Plan several moves ahead.

THINKING SPEED AND REACTION
Stroop, Go/No-Go, timed arithmetic and Trail Making — reaction time, mental math and cognitive control.

WHY YOU WON'T QUIT IN THREE DAYS

Most brain apps are the same drill at the same difficulty, and progress you have to take on faith. This one is built differently.

• Levels in every exercise. Nail it and difficulty rises; miss and it waits for you. Always at your edge, never past it
• Boss rounds at milestones: same rule, unexpected twist
• Streak. Skip a day, start over. A blunt trick, but it beats good intentions
• Synapse, your pet, lives on the screen, grows with your training and points at what's lagging
• Points for accuracy and speed, a shop with frames, avatars and titles
• Daily challenge with its own streak, plus achievements

WHAT'S INSIDE

• 67 exercises for memory, attention, logic, speed and control
• Warm-up in one button: morning, daytime, evening and night — ready sets launch with the right settings
• 12 profiles for different goals: languages, kids, 50+, focus, reaction, founders and more
• Assessment with a radar of strengths and weak spots
• 12 languages · works offline · no ads

THIS IS NOT A CASUAL PUZZLE APP

Behind every exercise is a validated paradigm, not invented mechanics. Schulte tables — search speed and attention span. The Stroop test — suppressing the automatic response: name the colour, don't read the word. N-back — working memory, the most studied paradigm in cognitive training. The Corsi block test — visuospatial memory. Trail Making — switching between sequences. Tower of London and Tower of Hanoi — planning several steps ahead. Plus SET, Go/No-Go, Flanker, WCST, the Posner cueing task and fifty more.

That's why the number on screen means something. You're not watching "level 7" — you're watching yourself improve.

DEVELOPERS WHO ANSWER

A feedback button lives inside the app: write or speak, and a screenshot attaches automatically. When a fix ships, the app tells you exactly what changed because of YOUR message and in which version.

WHO IT'S FOR

• Adults — holding focus in work where you're interrupted every five minutes
• 50+ — memory and reaction speed, regularly and without fiddly settings
• Kids 7+ — counting, memory and attention in a playful form, in a dedicated profile
• Students and language learners — concentration, foreign sounds and memory for words
• Chess players, speed readers and anyone training decisions under pressure

HONEST ABOUT THE SCIENCE

Training reliably improves the trained tasks and closely related skills (near transfer). We do NOT promise an IQ boost — transfer to "general intelligence" is scientifically disputed. What we give you is validated instruments and a clear, measurable picture of progress. That's the difference from casual puzzle apps.

NO SIGN-UP

Install and play. Progress is stored on your device. Optional anonymous cloud sync — no name, no email.
```

---

## Features

Лимит 20 пунктов, по одной строке. Первые три видны в плитке — там самое сильное.

```
67 exercises for memory, attention, logic and speed
Full-screen Schulte tables, matrices and Sudoku
Levels that adapt: rise when you nail it, wait when you miss
Sudoku with 15 rule variants
N-back, Stroop, Corsi, Trail Making and 50 more validated tasks
Warm-up in one button: morning, daytime, evening, night
12 profiles: languages, kids, 50+, focus, reaction, founders
Assessment with a radar of strengths and weak spots
Synapse — a pet that grows with your training
Daily challenge, streaks and achievements
Works fully offline
No ads, no sign-up, no email
12 languages
```

---

## Search terms

Лимит 7 штук, каждое до 40 символов. Не дублируют слова из Title и Description —
Microsoft индексирует те поля отдельно, а здесь место под то, чего в тексте нет.

```
brain training
memory improvement
concentration exercises
cognitive training
schulte table
n-back working memory
mental math trainer
```

Длины: 14 · 18 · 23 · 18 · 13 · 21 · 19 — все в пределах 40.

---

## Short description

Shown at the top of the Store listing. Recommended ≤270 characters.

```
Brain training that survives past week one. 67 exercises for memory, attention, logic and speed — every one a validated paradigm, not invented mechanics. Levels adapt to you, a streak keeps you honest, progress is measurable. Offline. No ads, no sign-up.
```

---

## What's new in this version

Лимит 1500 символов.

```
Sudoku, reworked
• Bigger, colour-coded number keys, moved right under the board — there used to be half a screen of emptiness between them
• Hint, undo and colour moved to the top; mode and rules sit next to Play
• Each exercise opens straight into settings, with the description folded into an “About” row
• A digit sitting on a circle or a tint is no longer washed out — it is drawn solid over any backdrop

Play with your hands
• Tower of Hanoi: drag discs with your finger; tapping the pegs still works
• Keyboard support on desktop: digits enter, Backspace clears, arrows move around the board

New long-form puzzles
• Samurai Sudoku — five overlapping 9×9 grids, now in the exercise catalogue
• Fractal Sudoku — behind every cell of the top grid hides a whole sudoku

Everywhere else
• Buttons across the app got bigger: 123 of 440 were below a reliable finger-tap size
• The interface colour you buy is now visible on the home screen
• Japanese went from 54% to 97% translated
```
