#!/usr/bin/env python3
"""
🔴 НАБОР СЛОВ ДЛЯ РЕЖИМА «НАЙДИ ВСЕ СЛОВА» — АНГЛИЙСКИЙ.

Источники со свободной лицензией, проверенной ФАЙЛОМ:

  · dwyl/english-words — `LICENSE.md` = Unlicense (общественное достояние);
    данные — Moby Word Lists Грейди Уорда, Project Gutenberg #3201, тоже
    общественное достояние. Происхождение названо в `word_list_moby_credits.txt`;
  · hermitdave/FrequencyWords — MIT, частотность по корпусу OpenSubtitles;
  · `/usr/share/dict/propernames` — имена собственные, отсеиваем;
  · LDNOOBW (список Shutterstock) — CC BY 4.0, лицензия прочитана ФАЙЛОМ `LICENSE`
    в самом репозитории, происхождение названо в README: рабочий фильтр их
    автодополнения. Атрибуция, которой требует CC BY, — эти три строки: сам файл
    скачивается в кэш и в репозиторий не идёт (`.gitignore`, `ldnoobw_*`).
    Используется ТОЛЬКО как отсев — в набор не идёт ни одним словом, ровно как
    списки имён у испанского соседа.

⚠️ ПОЧЕМУ НЕ ВЕБСТЕР. Первым источником брался `/usr/share/dict/words` — это
Вебстер 1913 года, и он тащит архаизмы и имена: для базы `abalone` в цели лезли
`abel`, `alba`, `baal`, `bela`. Moby современнее и чище.

⚠️ ПОЧЕМУ ОТ ЧЕТЫРЁХ БУКВ. Трёхбуквенный хвост Moby почти весь негодный:
для `hellhole` он давал `hee`, `heh`, `hel`, `heo`. У русского набора порог иной
(там от трёх), потому что там отбор идёт морфологией, а не длиной.

⚠️ БАЗЫ БЕРУТСЯ ПО ЧАСТОТЕ, А НЕ ПО АЛФАВИТУ. Раньше цикл шёл по алфавитно
отсортированному списку и обрывался на потолке в 2000 — потолок набирался задолго
до конца алфавита, и в наборе оказывалось 19 первых букв из 26: первая база
`abducted`, последняя `swinging`, слов на t–z не было вовсе. Теперь базы
сортируются по частотному рангу: в набор попадают 2000 самых узнаваемых слов, и
алфавит покрыт целиком. Тот же порядок у соседних it/pt.

🔴 ВЗРОСЛАЯ ЛЕКСИКА ОТСЕКАЕТСЯ, ИГРЫ ПРОЕКТА СЕМЕЙНЫЕ. Частотность построена по
субтитрам, то есть по живой речи: до правки 06.09.2026 в наборе стояли `shit`,
`whore`, `rape`, `tits`, `bitch`, `cock`, `piss`, `porn`, `nazi`, а восемь слов
дошли до БАЗ раскладок (`asshole`, `bastard`, `bitches`, `bollocks`, `bullshit`,
`panties`, `pissing`, `sexually`) — то есть стояли заголовком уровня.

⚠️ СРАВНЕНИЕ ТОЧНОЕ, А НЕ ПО ПОДСТРОКЕ ИЛИ НАЧАЛУ СЛОВА. Замер: отбор по началу
слова уносит вместе с бранью `assemble`, `assembly`, `assert`, `assess`, `asset`,
`assign`, `assist`, `assume`, `assure`, `assassin`, `assault`, `titanic`,
`titanium`, `title`, `method`, `methane`, `hello`, `peek`, `peel`, `peer`,
`farther`, `spice`, `bumper`, `arsenal` и `heroine`. Только полное совпадение.

⚠️ ГРАНИЦА — «ВУЛЬГАРНОЕ И ТЕЛЕСНОЕ, ОСКОРБЛЕНИЕ ЧЕЛОВЕКА, ВРАЖДА ПО ПРИЗНАКУ,
САМОПОВРЕЖДЕНИЕ», А НЕ «МРАЧНОЕ». Тот же порядок, что у испанского соседа, где в
список НЕ пошли `matar`, `muerte`, `guerra`. Здесь ровно так же ОСТАЮТСЯ `kill`,
`killer`, `murder`, `death`, `dead`, `corpse`, `blood`, `war`, `weapon`, `knife`,
`bomb`, `torture`, `slave`, `devil`, `satan`, `hate`, `damn`, `hell`, `bloody`,
`booze`, `weed`, `stoned`, `dwarf`, `sexist`, `racist` — обычные слова языка.

Замер 06.09.2026: целей 16443 → 16246 после отсева брани (197 слов: 74 берёт
LDNOOBW, 123 добавлены рукой) · базы-кандидаты 2474 · раскладок 2000 · подслов на
раскладку медиана 14 · слов в наборе 8218 · 263 КБ · первых букв базы 25 из 26.
Двадцать шестая — `x`, и её отсутствие НЕ дефект отбора: среди 2494 кандидатов нет
ни одной базы на x, потому что в первых 10 000 по частоте нет английского слова на
x длиной 7–8 букв (во всём наборе целей их два: `xerox` и `xiii`, оба короче).
"""
import json
import os
import re
import sys
import urllib.request

СЛОВА = "https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt"
ЧАСТОТЫ = "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt"
ИМЕНА = "/usr/share/dict/propernames"
# ⚠️ ВТОРОЙ СПИСОК ИМЁН. В системном всего 1308 строк, и он не знает ни `abigail`,
# ни `ella`, ни `allie` — а они лезли и в базы, и в цели. dominictarr/random-name
# (MIT) добавляет 4945 личных имён.
ИМЕНА_ЕЩЁ = "https://raw.githubusercontent.com/dominictarr/random-name/master/first-names.txt"
БРАНЬ = "https://raw.githubusercontent.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words/master/en"
ПОТОЛОК_РАНГА = 30_000        # цели: чем шире, тем богаче набор
ПОТОЛОК_БАЗЫ = 10_000         # база: только частое слово — иначе в базы лезут
                              # географические имена вроде `aberdeen` (список
                              # `/usr/share/dict/propernames` их не покрывает: в нём
                              # всего 1308 строк)
МАКС_РАСКЛАДОК = 2_000        # больше в приложение не нужно, а вес растёт
МИН_ДЛИНА = 4
# ⚠️ ВОСЕМЬ, А НЕ ШЕСТЬ. Слабые базы тянут за собой мусорные цели: у `abraham`
# набиралось ровно семь слов, и почти все — имена (`ahab`, `amar`, `bram`, `rama`),
# которых нет ни в одном из двух списков имён. Медиана по набору 14, так что
# порог в восемь отсекает слабые базы, не обедняя набор.
МИН_ПОДСЛОВ = 8
МАКС_ПОДСЛОВ = 14

# ⚠️ LDNOOBW ЛОВИТ НЕ ВСЁ, И ЛОВИТ ЛИШНЕЕ — поэтому два списка правки, а не один.
#
# Что он ловит ЛИШНЕГО. Это фильтр автодополнения, он намеренно строг, и под него
# попадают обычные слова, у которых грубое значение лишь второе. Возвращаем их —
# тем же приёмом, что `ВСЁ_ЖЕ_СЛОВА` у испанского соседа: `butt` (приклад,
# стыковое соединение), `escort` (сопровождать), `suck`/`sucks` (сосать),
# `snatch` (выхватить), `hardcore` (заядлый), `bondage` (неволя, как в «in
# bondage»), `playboy` (прожигатель жизни), `spunk` (задор), `scat` (джазовое
# пение, звериный помёт). Оставлен и `queer` — «queer feeling» это обиход, а само
# слово вдобавок нейтральное самоназвание, и вычёркивать его было бы не отсевом
# брани, а стиранием.
ВСЁ_ЖЕ_СЛОВА = {
    "butt", "escort", "suck", "sucks", "snatch", "hardcore", "bondage", "playboy",
    "spunk", "scat", "queer",
}

# Чего он НЕ ловит. Формы и производные, которых в списке просто нет (`rapes` при
# наличии `rape`, `fucked` при `fuck`), плюс то, что он не считает бранью:
# наркотики, оскорбления человека и этнические клички. Найдено замером по 16 443
# целям, каждое слово в целях есть — мёртвых записей ноль.
# 🔴 `chink` вычеркнут, хотя «chink in the armour» — идиома: в ряду плиток игрок
# видит слово, а не идиому. `dwarf`, `dickens`, `dicky`, `crippled`, `bum`,
# `kinks`, `knob`, `lust`, `groin`, `craps`, `cracker` — наоборот, оставлены.
БРАНЬ_ЕЩЁ = {
    "arse", "arses", "assholes", "boobies", "brothel", "brothels", "bugger",
    "buggered", "buggers", "buttocks", "chink", "cocaine", "condom", "condoms",
    "crap", "crapped", "crapper", "crappy", "cripple", "cripples", "damnit",
    "dicks", "drunkard", "dyke", "fart", "farted", "farting", "farts", "fetish",
    "fucked", "fucker", "fucks", "gook", "heroin", "honky", "hooters", "hump",
    "injun", "kraut", "meth", "midget", "midgets", "molest", "molested",
    "molester", "nazi", "nazis", "opium", "overdose", "peed", "peeing", "perv",
    "pervert", "perverts", "pimp", "pimping", "pimps", "piss", "pissed", "pisses",
    "poop", "pooped", "pooping", "prick", "pricks", "puss", "pussies", "raped",
    "rapes", "retard", "retarded", "retards", "scrotum", "sexes", "sexier",
    "sexiest", "shag", "shagged", "shagging", "sluts", "slutty", "sperm", "squaw",
    "stripper", "suicidal", "suicide", "suicides", "testicle", "turd", "turds",
    "vaginal", "vaginas", "wanker", "whitey", "whores", "whoring",
    # Второй проход, чтобы английская граница совпала с русской: там сняты
    # «дура», «идиот», «кретин», «тупица», «псих», «маньяк», «наркоман»,
    # «пьяница» — значит и здесь снимаются их близнецы. Прилагательные при этом
    # ОСТАЮТСЯ (`idiotic`, `moronic`, `drunk`, `drunken`), как остались
    # «дурацкий» и «глупый»: они не называют человека.
    "bimbo", "cretin", "dimwit", "drunks", "floozy", "harlot", "hussy", "idiot",
    "idiots", "imbecile", "junkie", "junkies", "lewd", "lunatic", "maniac",
    "moron", "morons", "nitwit", "nutcase", "nutter", "psycho", "scum", "stoner",
    "twerp", "twit", "weirdo", "wench",
}


def скачать(url: str, имя: str) -> str:
    if not os.path.exists(имя):
        urllib.request.urlretrieve(url, имя)
    return имя


def брань() -> set:
    """
    LDNOOBW одним множеством. Многословные записи («2 girls 1 cup», «anal
    impaler») отброшены: цели — это одиночные слова, фраза совпасть не может, и
    держать её в множестве значит держать заведомо мёртвую запись.
    """
    with open(скачать(БРАНЬ, "ldnoobw_en.txt"), encoding="utf-8") as f:
        слова = {с.strip().lower() for с in f if с.strip().isalpha()}
    if len(слова) < 200:
        raise SystemExit(f"LDNOOBW отдал {len(слова)} одиночных слов — формат сменился")
    return (слова | БРАНЬ_ЕЩЁ) - ВСЁ_ЖЕ_СЛОВА


def влезает(слово: str, банк: str) -> bool:
    остаток = list(банк)
    for c in слово:
        if c not in остаток:
            return False
        остаток.remove(c)
    return True


def main() -> int:
    моби = {w.strip().lower() for w in open(скачать(СЛОВА, "words_alpha.txt"), encoding="utf-8")}
    собств = {w.strip().lower() for w in open(ИМЕНА, encoding="latin-1")} if os.path.exists(ИМЕНА) else set()
    собств |= {w.strip().lower() for w in open(скачать(ИМЕНА_ЕЩЁ, "first_names.txt"), encoding="utf-8")}
    ранг = {}
    with open(скачать(ЧАСТОТЫ, "en_50k.txt"), encoding="utf-8") as f:
        for i, стр in enumerate(f):
            ранг.setdefault(стр.split()[0], i)

    взрослое = брань()
    цели = sorted({w for w, r in ранг.items()
                   if r < ПОТОЛОК_РАНГА and w in моби and w not in собств
                   and w not in взрослое        # совпадение полное, не по подстроке
                   and re.fullmatch(rf"[a-z]{{{МИН_ДЛИНА},8}}", w)})

    базы = sorted((w for w in цели if len(w) in (7, 8) and ранг[w] < ПОТОЛОК_БАЗЫ),
                  key=lambda w: ранг[w])          # самые узнаваемые вперёд

    раскладки = []
    for база in базы:
        под = [w for w in цели if w != база and влезает(w, база)]
        if len(под) < МИН_ПОДСЛОВ:
            continue
        под.sort(key=lambda x: (-len(x), x))      # длинные интереснее коротких
        раскладки.append({"base": база, "words": sorted(под[:МАКС_ПОДСЛОВ])})
        if len(раскладки) >= МАКС_РАСКЛАДОК:
            break

    # 🔴 Проверка того, ради чего всё и делалось: каждое слово раскладки обязано
    # собираться из букв базы. Дешевле упасть здесь, чем в игре.
    for р in раскладки:
        плохие = [w for w in р["words"] if not влезает(w, р["base"])]
        if плохие:
            raise SystemExit(f"не собирается из «{р['base']}»: {плохие}")

    # И отдельно — что стоп-список сработал, а не просто лежит в файле.
    в_наборе = {р["base"] for р in раскладки} | {w for р in раскладки for w in р["words"]}
    if в_наборе & взрослое:
        raise SystemExit(f"брань дожила до набора: {sorted(в_наборе & взрослое)}")

    путь = "../frontend/src/constants/allWordsEn.json"
    with open(путь, "w", encoding="utf-8") as f:
        json.dump(раскладки, f, ensure_ascii=False, separators=(",", ":"))
    длины = sorted(len(x["words"]) for x in раскладки)
    буквы = "".join(sorted({р["base"][0] for р in раскладки}))
    print(f"целей {len(цели)} · базы-кандидаты {len(базы)} · раскладок {len(раскладки)} · "
          f"подслов медиана {длины[len(длины) // 2] if длины else 0} "
          f"(мин {длины[0]}, макс {длины[-1]}) · слов уникальных {len(в_наборе)} · "
          f"первых букв базы {len(буквы)} ({буквы}) · "
          f"{os.path.getsize(путь) / 1024:.0f} КБ")
    return 0


if __name__ == "__main__":
    sys.exit(main())
