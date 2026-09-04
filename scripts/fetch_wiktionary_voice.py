#!/usr/bin/env python3
"""ЖИВЫЕ ЗАПИСИ ПРОИЗНОШЕНИЯ ИЗ ВИКИСЛОВАРЯ — вместо машинного голоса.

🔴 ПОЧЕМУ ДАННЫЕ, А НЕ ДРУГАЯ МОДЕЛЬ. Отчёт a4a2a0f4 (04.09.2026): «надо языковую
модель менять, это не вытягивает, даже английский очень криво произносит». Менять
одну синтезирующую модель на другую — значит снова спорить с машиной о том, как
звучит слово. А слова корпуса обиходные, и их УЖЕ произнесли живые люди: замер
04.09 по API Викисловаря даёт ru 211/211, de 208/208, en 215/216 — сплошное
покрытие ровно тех трёх языков, на которых Денис и слушал.

⚠️ ФИЛЬТР ПО ЯЗЫКУ ОБЯЗАТЕЛЕН. На странице «банка» в ru.wiktionary висит файл
Uk-банка.ogg — украинский. Без фильтра по коду языка в имени файла замер даёт
ложное «запись есть», и в игру попадает чужой язык. Первый заход 04.09 именно на
этом и споткнулся.

ЛИЦЕНЗИИ — СНЯТЫ ФАЙЛАМИ, НЕ ПО РЕПУТАЦИИ. Замер по 40 реальным файлам:
CC BY-SA 4.0 (13), CC BY-SA 3.0 (10), CC BY 2.0 fr (8), CC BY 3.0 us (4), CC0 (3),
Public domain (1), CC BY-SA 2.5 (1). Все допускают коммерческое распространение
при указании автора; SA держится на самой записи, которую мы отдаём как есть.
Поэтому скрипт СОХРАНЯЕТ автора и лицензию каждого файла — без этого списка
записи брать нельзя.

Запуск:  python3 scripts/fetch_wiktionary_voice.py ru de en
"""
import hashlib, json, os, re, subprocess, sys, time, urllib.parse, urllib.request

КОРЕНЬ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ВЫХОД = os.path.join(КОРЕНЬ, 'voice-wiktionary')
UA = 'psygames/1.0 (pronunciation corpus; d.onosov999@gmail.com)'
ЗВУК = re.compile(r'\.(ogg|oga|wav|mp3|flac|opus)$', re.I)
КОД = {
    'ru': ['ru', 'rus'], 'de': ['de', 'deu', 'ger'], 'en': ['en', 'eng', 'en-us', 'en-uk', 'en-gb'],
    'es': ['es', 'spa'], 'pt': ['pt', 'por', 'pt-br'], 'zh': ['zh', 'cmn', 'yue', 'nan'],
    'hi': ['hi', 'hin'],
}


def подходит(имя: str, lang: str) -> bool:
    n = имя.split(':', 1)[-1].lower()
    return any(re.match(rf'{c}-', n) or f'({c})-' in n for c in КОД[lang])


def достать(url: str, таймаут: int = 60) -> bytes:
    """Викимедиа отвечает 429 быстрее, чем кажется: заход 04.09 срезался на 12
    файлах из 211. Ждём столько, сколько просит Retry-After, и пробуем снова —
    иначе «взято 5,7%» выглядит как отсутствие записей, хотя записи есть."""
    задержка = 2.0
    for попытка in range(6):
        try:
            r = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(r, timeout=таймаут) as f:
                return f.read()
        except urllib.error.HTTPError as e:
            if e.code not in (429, 503):
                raise
            ждать = float(e.headers.get('Retry-After') or задержка)
            time.sleep(min(ждать, 60))
            задержка = min(задержка * 2, 60)
    raise RuntimeError('шесть попыток подряд упёрлись в 429/503')


def api(host: str, params: dict) -> dict:
    url = f'https://{host}/w/api.php?' + urllib.parse.urlencode(params)
    return json.loads(достать(url, 40))


def слова_корпуса() -> dict:
    p = os.path.join(КОРЕНЬ, 'frontend/src/constants/voiceIndex.generated.ts')
    t = open(p, encoding='utf-8').read()
    j = t.index('{', t.index('VOICE_INDEX'))
    return json.JSONDecoder().raw_decode(t[j:])[0]


def найти(lang: str, слова: list) -> dict:
    """слово → имя файла на Викискладе. Сначала свой Викисловарь, потом английский."""
    есть = {}
    for источник in (f'{lang}.wiktionary.org', 'en.wiktionary.org'):
        # у английских инфинитивов частица «to» отдельной статьи не имеет
        осталось = [(w, w[3:] if lang == 'en' and w.startswith('to ') else w)
                    for w in слова if w not in есть]
        for k in range(0, len(осталось), 50):
            порция = осталось[k:k + 50]
            карта = {стр: исх for исх, стр in порция}
            try:
                d = api(источник, {'action': 'query', 'prop': 'images', 'imlimit': 'max',
                                   'titles': '|'.join(карта), 'format': 'json', 'formatversion': '2'})
            except Exception as e:
                print(f'  ⚠️ {lang} {источник} порция {k}: {e}', file=sys.stderr)
                continue
            for p in d.get('query', {}).get('pages', []):
                исх = карта.get(p['title'])
                if not исх:
                    continue
                зв = [i['title'] for i in p.get('images', []) if ЗВУК.search(i['title']) and подходит(i['title'], lang)]
                if зв:
                    есть[исх] = 'File:' + зв[0].split(':', 1)[-1]
            time.sleep(0.15)
    return есть


def канон(имя: str) -> str:
    """MediaWiki поднимает первую букву названия: `en-us-bank.ogg` возвращается как
    `En-us-bank.ogg`. Русские и немецкие имена и так с заглавной, поэтому промах
    был только у английского: 158 записей из 216 вместо 215 — файлы находились, а
    лицензия к ним не привязывалась, потому что ключ не совпадал."""
    ns, _, имя = имя.partition(':')
    return f'{ns}:{имя[:1].upper()}{имя[1:]}'


def сведения(файлы: list) -> dict:
    """имя файла → (прямой URL, автор, лицензия). Без лицензии файл не берём."""
    из = {}
    for k in range(0, len(файлы), 20):
        d = api('commons.wikimedia.org', {'action': 'query', 'prop': 'imageinfo',
                'iiprop': 'url|extmetadata', 'titles': '|'.join(файлы[k:k + 20]),
                'format': 'json', 'formatversion': '2'})
        for p in d.get('query', {}).get('pages', []):
            ii = (p.get('imageinfo') or [{}])[0]
            em = ii.get('extmetadata', {})
            лиц = em.get('LicenseShortName', {}).get('value')
            if not ii.get('url') or not лиц:
                continue
            автор = re.sub('<[^>]+>', '', em.get('Artist', {}).get('value', '')).strip() or '—'
            из[канон(p['title'])] = (ii['url'], ' '.join(автор.split())[:80], лиц)
        time.sleep(0.2)
    return из


def перекодировать(сырьё: str, цель: str) -> bool:
    r = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', сырьё,
                        '-ac', '1', '-ar', '24000', '-b:a', '24k',
                        '-af', 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,'
                               'areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse,'
                               'loudnorm=I=-16:TP=-1.5:LRA=11',
                        '-c:a', 'libopus', цель], capture_output=True)
    return r.returncode == 0 and os.path.getsize(цель) > 500


def main() -> int:
    языки = sys.argv[1:] or ['ru', 'de', 'en']
    корпус = слова_корпуса()
    os.makedirs(ВЫХОД, exist_ok=True)
    указатель, права = {}, []
    for lang in языки:
        слова = list(корпус.get(lang, {}))
        if not слова:
            print(f'{lang}: в корпусе нет слов — пропускаю')
            continue
        карта = найти(lang, слова)
        инфо = сведения(sorted(set(карта.values())))
        os.makedirs(os.path.join(ВЫХОД, lang), exist_ok=True)
        взято = 0
        указатель[lang] = {}
        for слово, файл in карта.items():
            сведение = инфо.get(канон(файл))
            if not сведение:
                continue
            url, автор, лиц = сведение
            имя = hashlib.sha1(f'{lang}:{слово}'.encode()).hexdigest()[:16] + '.opus'
            цель = os.path.join(ВЫХОД, lang, имя)
            if not os.path.exists(цель):                      # идемпотентно
                сырьё = цель + '.src'
                try:
                    open(сырьё, 'wb').write(достать(url))
                except Exception as e:
                    print(f'  ⚠️ {lang}/{слово}: {e}', file=sys.stderr)
                    continue
                ок = перекодировать(сырьё, цель)
                os.remove(сырьё)
                if not ок:
                    if os.path.exists(цель):
                        os.remove(цель)
                    continue
                time.sleep(0.5)   # темп, на котором Викимедиа не отбивает
            указатель[lang][слово] = имя
            права.append({'lang': lang, 'word': слово, 'file': файл, 'author': автор, 'license': лиц})
            взято += 1
        print(f'{lang}: взято {взято} из {len(слова)} = {100 * взято / len(слова):.1f}%')
    json.dump(указатель, open(os.path.join(ВЫХОД, 'index.json'), 'w'), ensure_ascii=False, indent=1)
    json.dump(права, open(os.path.join(ВЫХОД, 'credits.json'), 'w'), ensure_ascii=False, indent=1)
    print(f'\nуказатель → {ВЫХОД}/index.json · авторы и лицензии → {ВЫХОД}/credits.json')
    return 0


if __name__ == '__main__':
    sys.exit(main())
