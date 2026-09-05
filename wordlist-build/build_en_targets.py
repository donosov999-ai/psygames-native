#!/usr/bin/env python3
"""
🔴 НАБОР СЛОВ ДЛЯ РЕЖИМА «НАЙДИ ВСЕ СЛОВА» — АНГЛИЙСКИЙ.

Источники со свободной лицензией, проверенной ФАЙЛОМ:

  · dwyl/english-words — `LICENSE.md` = Unlicense (общественное достояние);
    данные — Moby Word Lists Грейди Уорда, Project Gutenberg #3201, тоже
    общественное достояние. Происхождение названо в `word_list_moby_credits.txt`;
  · hermitdave/FrequencyWords — MIT, частотность по корпусу OpenSubtitles;
  · `/usr/share/dict/propernames` — имена собственные, отсеиваем.

⚠️ ПОЧЕМУ НЕ ВЕБСТЕР. Первым источником брался `/usr/share/dict/words` — это
Вебстер 1913 года, и он тащит архаизмы и имена: для базы `abalone` в цели лезли
`abel`, `alba`, `baal`, `bela`. Moby современнее и чище.

⚠️ ПОЧЕМУ ОТ ЧЕТЫРЁХ БУКВ. Трёхбуквенный хвост Moby почти весь негодный:
для `hellhole` он давал `hee`, `heh`, `hel`, `heo`. У русского набора порог иной
(там от трёх), потому что там отбор идёт морфологией, а не длиной.
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


def скачать(url: str, имя: str) -> str:
    if not os.path.exists(имя):
        urllib.request.urlretrieve(url, имя)
    return имя


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

    цели = sorted({w for w, r in ранг.items()
                   if r < ПОТОЛОК_РАНГА and w in моби and w not in собств
                   and re.fullmatch(rf"[a-z]{{{МИН_ДЛИНА},8}}", w)})

    раскладки = []
    for база in (w for w in цели if len(w) in (7, 8) and ранг.get(w, 10 ** 9) < ПОТОЛОК_БАЗЫ):
        под = [w for w in цели if w != база and влезает(w, база)]
        if len(под) < МИН_ПОДСЛОВ:
            continue
        под.sort(key=lambda x: (-len(x), x))
        раскладки.append({"base": база, "words": sorted(под[:МАКС_ПОДСЛОВ])})
        if len(раскладки) >= МАКС_РАСКЛАДОК:
            break

    with open("../frontend/src/constants/allWordsEn.json", "w", encoding="utf-8") as f:
        json.dump(раскладки, f, ensure_ascii=False, separators=(",", ":"))
    длины = sorted(len(x["words"]) for x in раскладки)
    print(f"целей {len(цели)} · раскладок {len(раскладки)} · "
          f"подслов медиана {длины[len(длины) // 2] if длины else 0}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
