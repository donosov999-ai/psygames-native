# ТЗ чату «Билингво» — раздел «Языки», две развилки, одиннадцать игр, зарядка и ОБЩИЙ СЛОЙ ЗВУКА

*Автор: Denis Onosov (ODV999) · ⚠️ Информация конфиденциальная · 12.09.2026*

> 🔴 **ПРАВИЛА — В `CHATS_RULES.md`, И ОН ГЛАВНЕЕ ЭТОГО ФАЙЛА.**
> Здесь они пересказаны для холодного старта; при расхождении верен
> `~/dev/psygames/CHATS_RULES.md`. Правило меняется ТАМ и только там.
>
> **Первым делом — §0 того файла:** регистрация в TeamOps, своя папка со своим
> `PROJECT_REF.md`, и только потом код.

> ⚠️ **ФАЙЛ ЗАВЕДЁН 12.09.2026, ПОЗЖЕ ОСТАЛЬНЫХ ДЕВЯТИ.** У «Языков» ТЗ не было
> вовсе: девять ТЗ завели 06.09 по темам, «Языки» и «Пространство» пропустили —
> та же причина, по которой у обоих не было и карточки в реестре. Поэтому раздел
> три дня работал без ТЗ и под чужим именем.

## §0. Кто ведёт

| | |
|---|---|
| чат | **«Билингво»** |
| имя в TeamOps | `psygames-languages-claude-mac` |
| папка | `~/dev/psygames/languages-chat/` · реф `PROJECT_REF.md` |
| канал | `psygames` |

⚠️ **`fydao-claude-mac` — ЧУЖОЕ ИМЯ.** Это слот сетки «канал × агент» для сайта
fydao.ru (`channels: ['fydao.ru']`, свой `session_id`). До 12.09.2026 раздел
объявлялся им по ошибке; следствие — 11.09 с него сняли девять задач psygames с
верным доводом «к psygames он не приписан ни одним полем». Во всех вызовах
`as="psygames-languages-claude-mac"`.

## §1. Раздел «Языки» — что веду

Хаб `/games/languages-hub`, внутри две развилки.

**«Слова»** — `/games/words-hub`

| упражнение | файл |
|---|---|
| Словарь SRS | `app/games/vocab-srs.tsx` |
| Сортировка по смыслу | `app/games/semantic-sort.tsx` |
| Пропущенное слово | `app/games/cloze.tsx` |
| Слово или нет | `app/games/lexical-decision.tsx` |
| Анаграммы | `app/games/anagrams.tsx` |
| Беглость речи (COWAT) | `app/games/phonemic-fluency.tsx` |
| Пересказ | `app/games/story-recall.tsx` |

**«Слух»** — `/games/hearing-hub`

| упражнение | файл |
|---|---|
| Фонемы: пары | `app/games/phoneme-pairs.tsx` |
| Тоны китайского | `app/games/chinese-tones.tsx` |
| Эхо: псевдослова | `app/games/pseudoword-echo.tsx` |
| Диктант | `app/games/dictation.tsx` |

📍 Замер 12.09.2026: у `hearing-hub` ровно ОДИН родитель — `languages-hub`.
Игрок попадает в слух только через «Языки».

**Языковая зарядка — моя целиком:** `src/services/languageFlow.ts`,
карточка `src/components/warmups/LanguagesWarmup.tsx`, режим билингво
`src/services/bilingualMode.ts`, `src/components/BilingualToggle.tsx`,
`src/components/LanguageBadge.tsx`.
Зарядка БЕРЁТ ВЗАЙМЫ два чужих экрана — `word-pairs` (раздел «Память и слух»)
и `listening-span` (раздел «Объём памяти»): они принимают `targetLang` и черпают
из общего словаря. Свои правки в них не делаю, пишу владельцу.

## §2. 🔊 ОБЩИЙ СЛОЙ: ЗВУК — передан мне 12.09.2026 решением Дениса

🔴 **ЭТО НЕ МОЙ РАЗДЕЛ, А СЛОЙ ВСЕГО ПРИЛОЖЕНИЯ.** Я его владелец, но потребители
у него из ДВУХ разделов, и половина — чужие.

### Что входит

| файл | размер | что это |
|---|---|---|
| `frontend/src/services/tts.ts` | 155 строк | синтез голосом ОС |
| `frontend/src/services/voiceSamples.ts` | 88 строк | готовые записи файлами |
| `frontend/src/hooks/useTtsAvailable.ts` | 63 строки | есть ли голос на устройстве |
| `frontend/src/constants/voiceIndex.generated.ts` | **1452 записи** | машинный корпус |
| `frontend/src/constants/voiceLive.generated.ts` | **998 записей** | живые записи |
| `frontend/src/constants/letterVoice.generated.ts` | **20 записей** | буквы для n-back |
| `voice-wiktionary/**` | **632 файла `.opus`** | de · en · ru + `index.json`, `credits.json` |
| `scripts/gen_voice_samples.py`, `fetch_wiktionary_voice.py`, `fetch_letter_voice.py` | | генераторы корпусов |

Пробы слоя — **десять наборов**, а не пять: `voice-samples`, `voice-live-first`,
`voice-insecure-context`, `voice-silent-file`, `voice-native-rec`,
`voice-level-live`, `speech-sound-toggle`, `nback-letter-voice`,
`listening-span-speaks-its-words`, `digit-span-modes`.
📍 Приёмка 12.09.2026: `npx jest voice speech nback-letter listening-span-speaks`
→ **10 наборов, 129 проб, ноль красных.**
⚠️ Шаблон `voice speech nback-letter` НЕ ловит `listening-span-speaks-its-words`
(там «speaks», не «speech»). Гонять с четвёртым словом, иначе один набор слоя
молча не проверяется.

### Кто зовёт слой — СЕМЬ экранов из ДВУХ разделов

Замер: `git grep -l "services/tts\|services/voiceSamples" -- 'frontend/app/games/*'`

| мои | чужие — раздел «Объём памяти», `@psygames-span-claude-mac` |
|---|---|
| `phoneme-pairs` | `digit-span` |
| `chinese-tones` | `listening-span` |
| `pseudoword-echo` | `n-back` |
| `dictation` | |

Плюс вне игр: `src/games/digit-span/core/i18n.ts` — ядро СОСЕДА.

### 🔴 Порядок правки слоя

1. **Сначала грep, потом код:** `git grep -l "services/tts\|services/voiceSamples"`.
2. **Предупредить `@psygames-span-claude-mac` ДО правки**, а не после.
3. Прогнать все десять наборов, а не свои.

⚠️ **Сломаешь звук — сломаешь ИЗМЕРЕНИЕ, а не удобство.** В `n-back` стимул идёт
раз в 2–3 секунды, в «Слуховом охвате» межсловный интервал сам по себе
измеряемый параметр. Задержка синтеза смещает результат пробы, и человек этого
не увидит.

### ⚠️ Три решения, которые УЖЕ приняты — не переоткрывать

1. **Корпус НЕ в бандле, он на `psy-games.pro`.** Tauri вшивает веб-ассеты в
   каждую из четырёх нативных библиотек: 4 МБ звука дали бы **+17 МБ к APK**.
2. **API в рантайме не зовём.** Замер 04.09.2026: 1,1–2,3 с и плавает от сети.
3. **Отсутствие файла — нормальный исход, а не ошибка.** У букв `n-back` записей
   нет НАМЕРЕННО (модель озвучки на однобуквенных стимулах в половине случаев
   отказывала), у псевдослов их не может быть по определению. Им остаётся
   системный голос, и это правильное поведение.

📌 И собственная грабля раздела, уже оплаченная: рост общего словаря 196 → 283
слова уронил долю ОЗВУЧЕННЫХ с 96 % до 67 %, потому что записи снимались под
прежний корпус. Растишь корпус — считай ПРОЦЕНТ покрытия, а не число записей.

## §3. Границы

Чужие разделы не правлю — вижу дефект, пишу владельцу.
Общий слой приложения (`constants/games.ts`, `profiles.ts`, `hubContents.ts`,
`GameShell.tsx`, версии, метки git) — через координатора `psygames-claude-mac`.
`git add -A` запрещён, коммит только по явным путям. Выпуск не собираю, версию
не поднимаю, метку не ставлю.

⚠️ **Открытый вопрос границы на 12.09.2026:** карточка
`psygames-memory-hearing-claude-mac` перечисляет те же четыре экрана развилки
«Слух» плюс `word-pairs`. Структура приложения при этом кладёт `hearing-hub`
внутрь `languages-hub`. Границу проводит админ доски; до решения по слуховым
экранам предупреждаю владельца до правки.
