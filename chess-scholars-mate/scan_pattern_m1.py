"""Полный отбор узора детского мата из базы Lichess — один проход, всё нужное сразу.

⚠️ ЭТОТ СКРИПТ — ИСТОЧНИК ПРАВДЫ ДЛЯ ПУЛА. Прежний отбор шёл по теме
`attackingF2F7`, а она описана у Lichess как «атака на ПЕШКУ f2/f7»: она не
стоит НИ У ОДНОЙ задачи, где ферзь матует на уже пустое поле. Замер 05.09.2026:
строгий узор во всей базе 16 427, прежний отбор давал 3 749 — потеряно 12 678.

Узор считается ДВИЖКОМ: матует ферзь на f7/f2, и это поле держит свой слон.
"""
import csv, json, chess, collections
csv.field_size_limit(10**7)
СТАТ = collections.Counter()
строгие, ферзьБезСлона, слоном = [], [], []

with open('lichess.csv', newline='') as f:
    r = csv.reader(f); hdr = next(r)
    I = {k: i for i, k in enumerate(hdr)}
    for row in r:
        СТАТ['всего'] += 1
        темы = set(row[I['Themes']].split())
        if 'mateIn1' not in темы: continue
        ходы = row[I['Moves']].split()
        if len(ходы) < 2 or ходы[1][2:4] not in ('f7', 'f2'): continue
        СТАТ['мат в 1 на f7/f2'] += 1
        b = chess.Board(row[I['FEN']])
        try:
            b.push(chess.Move.from_uci(ходы[0]))
            наш = chess.Move.from_uci(ходы[1])
            ф = b.piece_at(наш.from_square)
            цвет = b.turn
            держат = [b.piece_at(s).piece_type for s in b.attackers(цвет, наш.to_square) if s != наш.from_square]
            b.push(наш)
            if not b.is_checkmate(): СТАТ['движок: не мат'] += 1; continue
        except Exception:
            СТАТ['битая запись'] += 1; continue
        з = {'id': row[I['PuzzleId']], 'fen': row[I['FEN']], 'moves': ходы,
             'rating': int(row[I['Rating']]), 'fullmove': int(row[I['FEN']].rsplit(' ', 1)[1]),
             'themes': row[I['Themes']], 'url': row[I['GameUrl']], 'opening': row[I['OpeningTags']]}
        if ф and ф.piece_type == chess.QUEEN:
            if chess.BISHOP in держат: СТАТ['узор: ферзь + слон'] += 1; строгие.append(з)
            elif chess.KNIGHT in держат: СТАТ['ферзь + конь'] += 1
            elif держат: СТАТ['ферзь + другая'] += 1
            else: СТАТ['ферзь без поддержки'] += 1; ферзьБезСлона.append(з)
        elif ф and ф.piece_type == chess.BISHOP:
            СТАТ['матует слон'] += 1; слоном.append(з)
        else: СТАТ['матует другая фигура'] += 1

for k, v in СТАТ.most_common(): print(f'{k}: {v}')
json.dump({'_источник': 'https://database.lichess.org/lichess_db_puzzle.csv.zst (CC0 1.0)',
           '_отбор': 'мат в 1: матует ФЕРЗЬ на f7/f2 и это поле держит свой СЛОН — узор детского мата, проверен движком python-chess по всем 6 100 960 задачам',
           '_замер': '05.09.2026 · строгий узор %d · прежний отбор по теме attackingF2F7 давал 3 749 из них' % len(строгие),
           '_собрано': '2026-09-05', 'puzzles': строгие},
          open('pattern_m1_full.json', 'w'), ensure_ascii=False)
print('записано строгих:', len(строгие))
