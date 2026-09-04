#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Озвучка стимулов аудио-игр ФАЙЛАМИ (задача a382fd2f).

🔴 ДВА РЕШЕНИЯ, БЕЗ КОТОРЫХ ЭТО НЕ РАБОТАЕТ.

1. API ТОЛЬКО ДЛЯ ГЕНЕРАЦИИ, НИКОГДА В РАНТАЙМЕ. Это когнитивные ТЕСТЫ: в n-back
   стимулы идут раз в 2-3 секунды, в «Слуховом охвате» межсловный интервал — сам
   измеряемый параметр. Замер вызова 04.09.2026: 1,1-2,3 с и плавает от сети.
   Сетевая задержка внутри пробы ломает ИЗМЕРЕНИЕ, а не удобство. Плюс без
   интернета четыре игры были бы мертвы, и за каждую партию мы платили бы вечно.

2. СЕМПЛЫ НЕ В БАНДЛЕ. Tauri вшивает веб-ассеты в КАЖДУЮ из четырёх нативных
   библиотек: 4 МБ корпуса дали бы +17 МБ к APK. Мы только что срезали 20 МБ
   (v1.160, 88→68) — возвращать их ради звука нельзя. Файлы раздаёт psy-games.pro,
   приложение тянет ТОЛЬКО свой язык при первом заходе в аудио-игру и кэширует.

⚠️ СИСТЕМНАЯ РЕПЛИКА ОБЯЗАТЕЛЬНА. Без неё модель отвечает РАЗГОВОРОМ: замер на
слове «snake» — 9,25 с болтовни «Hello, it sounds like you're interested in
talking about snakes…». С репликой — 0,85 с и ровно слово.

🔴 И ОДНОЙ РЕПЛИКИ МАЛО: СВЕРЯЕМ СКАЗАННОЕ С ЗАКАЗАННЫМ. Замер 04.09.2026 на
десяти коротких стимулах: половина ушла в разговор. Буква «H» дала «Hello! What
would you like to talk about today?», «ef» — «Sure, I'd be happy to help…», «pee» —
«I'm here to help you with…». Чем короче стимул, тем чаще модель принимает его за
реплику собеседника. Поэтому каждый ответ проверяется по РАСШИФРОВКЕ (модель
возвращает её вместе со звуком) и по длительности, а брак переспрашивается.
Без этой сверки в корпус молча уехали бы файлы, где вместо слова — приветствие.

⚠️ ГЕНЕРАЦИЯ ИДЕМПОТЕНТНА: существующий файл не перегенерируется. Полный корпус
1471 стимул ≈ $0.12. Ключ берётся из переменной окружения OPENROUTER_API_KEY —
брать отдельный ключ с малым капом, а не тот, что делит прод-бот.

ЗАПУСК:
  OPENROUTER_API_KEY=… python3 scripts/gen_voice_samples.py --probe   # проверить голос
  OPENROUTER_API_KEY=… python3 scripts/gen_voice_samples.py --lang ru # один язык
  OPENROUTER_API_KEY=… python3 scripts/gen_voice_samples.py           # весь корпус
"""
import argparse, base64, hashlib, json, os, re, struct, subprocess, sys, time, urllib.request
from pathlib import Path

КОРЕНЬ = Path(__file__).resolve().parent.parent
ФРОНТ = КОРЕНЬ / 'frontend'
ВЫХОД = КОРЕНЬ / 'voice'
МОДЕЛЬ = 'openai/gpt-audio-mini'
ГОЛОС = 'alloy'
ЧАСТОТА = 24000
ЯЗЫКИ = ['en', 'ru', 'es', 'pt', 'de', 'zh', 'hi']
СИСТЕМНАЯ = ('You are a text-to-speech engine. Read aloud EXACTLY the user\'s text, '
             'nothing else. No greetings, no comments, no spelling out, no translation.')

FFMPEG = '/opt/homebrew/bin/ffmpeg' if os.path.exists('/opt/homebrew/bin/ffmpeg') else 'ffmpeg'


def имя_файла(язык: str, текст: str) -> str:
    """Имя файла — хеш от пары «язык|текст».

    Слова бывают китайские и хинди: класть их в имя файла значит зависеть от
    нормализации юникода в трёх местах (диск, CDN, приложение). Хеш стабилен
    везде, а обратное соответствие держит манифест.
    """
    return hashlib.sha1(f'{язык}|{текст}'.encode('utf-8')).hexdigest()[:16] + '.opus'


def стимулы() -> dict:
    """Что озвучиваем — снимается С КОДА игр, а не переписывается сюда руками."""
    из = {я: set() for я in ЯЗЫКИ}

    tv = (ФРОНТ / 'src/constants/translationVocab.ts').read_text(encoding='utf-8')
    for я in ЯЗЫКИ:
        для = re.findall(rf"\b{я}:\s*'([^']+)'", tv)
        из[я].update(для)

    pp = (ФРОНТ / 'app/games/phoneme-pairs.tsx').read_text(encoding='utf-8')
    блок = pp[pp.index('const MINIMAL_PAIRS'):pp.index('const LANG_NAMES')]
    текущий = None
    for строка in блок.split('\n'):
        м = re.match(r"\s{2}([a-z]{2}):\s*\[", строка)
        if м:
            текущий = м.group(1)
            continue
        for a, b in re.findall(r"\['([^']+)',\s*'([^']+)'\]", строка):
            if текущий in из:
                из[текущий].update([a, b])

    # 🔴 БУКВЫ n-back СЮДА НЕ ВХОДЯТ, И ЭТО ЗАМЕР, А НЕ ЛЕНЬ.
    # Проба 04.09.2026 по десяти буквам: половина ответов ушла в разговор («H» →
    # «Hello! What would you like to talk about today?»), а «M» не далась и с трёх
    # попыток — 4,9 с при потолке 2,5. Чем короче стимул, тем чаще модель принимает
    # его за реплику собеседника. Системный голос ОС читает буквы верно и без сети,
    # поэтому n-back остаётся на Web Speech — это не обход проблемы, а правильный
    # инструмент для этого стимула.

    return {я: sorted(с) for я, с in из.items() if с}


def нормализовать(s: str) -> str:
    """Для сверки: без регистра, без знаков препинания и скобочных пояснений."""
    s = re.sub(r'\[[^\]]*\]|\([^)]*\)', ' ', s)
    return re.sub(r'[^\w\u0400-\u04ff\u4e00-\u9fff\u0900-\u097f]+', '', s).lower()


def сказать(ключ: str, текст: str) -> tuple:
    тело = json.dumps({
        'model': МОДЕЛЬ, 'stream': True, 'modalities': ['text', 'audio'],
        'audio': {'voice': ГОЛОС, 'format': 'pcm16'},
        'messages': [{'role': 'system', 'content': СИСТЕМНАЯ}, {'role': 'user', 'content': текст}],
    }).encode()
    req = urllib.request.Request('https://openrouter.ai/api/v1/chat/completions', data=тело,
                                 headers={'Authorization': f'Bearer {ключ}', 'Content-Type': 'application/json'})
    куски = []
    расшифровка = []
    with urllib.request.urlopen(req, timeout=120) as r:
        for строка in r:
            s = строка.decode('utf-8', 'ignore').strip()
            if not s.startswith('data: '):
                continue
            d = s[6:]
            if d == '[DONE]':
                break
            try:
                j = json.loads(d)
            except Exception:
                continue
            зв = ((j.get('choices') or [{}])[0].get('delta') or {}).get('audio') or {}
            if зв.get('data'):
                куски.append(base64.b64decode(зв['data']))
            if зв.get('transcript'):
                расшифровка.append(зв['transcript'])
    return b''.join(куски), ''.join(расшифровка)


def годен(текст: str, pcm: bytes, сказано: str) -> str:
    """Пусто — годен; иначе причина брака. Проверяем ДЛИТЕЛЬНОСТЬ и РАСШИФРОВКУ."""
    сек = len(pcm) / 2 / ЧАСТОТА
    if сек < 0.15:
        return f'слишком коротко ({сек:.2f} с)'
    # Потолок по длине текста: слово из пяти букв не может звучать шесть секунд.
    потолок = max(2.5, 0.45 * len(текст) + 1.5)
    if сек > потолок:
        return f'слишком долго ({сек:.2f} с при потолке {потолок:.1f})'
    н_текст, н_сказано = нормализовать(текст), нормализовать(сказано)
    if н_текст and н_сказано and н_текст not in н_сказано:
        return f'сказано другое: {сказано[:40]!r}'
    return ''


def в_opus(pcm: bytes, путь: Path) -> None:
    wav = путь.with_suffix('.wav')
    with open(wav, 'wb') as f:
        f.write(b'RIFF' + struct.pack('<I', 36 + len(pcm)) + b'WAVEfmt ' +
                struct.pack('<IHHIIHH', 16, 1, 1, ЧАСТОТА, ЧАСТОТА * 2, 2, 16) +
                b'data' + struct.pack('<I', len(pcm)))
        f.write(pcm)
    subprocess.run([FFMPEG, '-y', '-hide_banner', '-loglevel', 'error', '-i', str(wav),
                    '-c:a', 'libopus', '-b:a', '24k', '-ac', '1', str(путь)], check=True)
    wav.unlink(missing_ok=True)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument('--lang', help='только этот язык')
    p.add_argument('--probe', action='store_true', help='десять слов на язык — проверить голос')
    p.add_argument('--limit', type=int, default=0, help='потолок числа файлов за прогон')
    арг = p.parse_args()

    # ⚠️ Ключ — ТОЛЬКО из переменной окружения. Репозиторий публичный: путь к
    # локальному хранилищу секретов здесь был бы подсказкой, где их искать
    # (гейт no-infra-in-public-repo это и поймал 04.09.2026).
    ключ = os.environ.get('OPENROUTER_API_KEY', '').strip()
    if not ключ:
        print('нужен ключ: OPENROUTER_API_KEY=<ключ> python3 scripts/gen_voice_samples.py')
        sys.exit(1)
    корпус = стимулы()
    if арг.lang:
        корпус = {арг.lang: корпус.get(арг.lang, [])}
    if арг.probe:
        корпус = {я: с[:10] for я, с in корпус.items()}

    всего = sum(len(с) for с in корпус.values())
    print(f'корпус: {всего} стимулов по {len(корпус)} языкам')
    сделано = пропущено = 0
    брак: list = []
    манифест = {}
    t0 = time.time()
    for язык, слова in корпус.items():
        папка = ВЫХОД / язык
        папка.mkdir(parents=True, exist_ok=True)
        for слово in слова:
            имя = имя_файла(язык, слово)
            манифест[f'{язык}|{слово}'] = имя
            файл = папка / имя
            if файл.exists() and файл.stat().st_size > 400:
                пропущено += 1
                continue
            if арг.limit and сделано >= арг.limit:
                continue
            try:
                # До трёх попыток: короткий стимул модель нередко принимает за реплику.
                pcm = b''
                беда = 'не пробовали'
                for _ in range(3):
                    pcm, сказано = сказать(ключ, слово)
                    беда = годен(слово, pcm, сказано)
                    if not беда:
                        break
                if беда:
                    брак.append(f'{язык} «{слово}»: {беда}')
                    continue
                в_opus(pcm, файл)
                сделано += 1
                if сделано % 25 == 0:
                    print(f'  {сделано} готово, {time.time() - t0:.0f} с')
            except Exception as e:
                print(f'  ⚠️ {язык} «{слово}»: {type(e).__name__} {str(e)[:80]}')
    (ВЫХОД / 'manifest.json').write_text(json.dumps(манифест, ensure_ascii=False), encoding='utf-8')
    вес = sum(f.stat().st_size for f in ВЫХОД.rglob('*.opus'))
    if брак:
        print(f'\n⚠️ БРАК, не попало в корпус ({len(брак)}):')
        for б in брак[:20]:
            print('   ', б)
    print(f'\nсоздано {сделано}, уже было {пропущено}, всего файлов {len(list(ВЫХОД.rglob("*.opus")))}, '
          f'вес {вес/1048576:.1f} МБ, время {time.time() - t0:.0f} с')


if __name__ == '__main__':
    main()
