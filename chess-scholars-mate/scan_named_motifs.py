"""Именованные матовые узоры Lichess — по одному пулу на узор.

🔴 ЗАЧЕМ. Просьба Дениса 05.09.2026: «сделай выпадающим списком выбор режима…
чтобы можно было выбрать и отрабатывать отдельный». То есть человек выбирает
узор — арабский, эполетный, Бодена — и гоняет только его.

⚠️ ЗДЕСЬ ОГРАНИЧЕНИЕ `opening` СНЯТО НАМЕРЕННО. В лестнице узор обязан быть
узнаваем в дебютной позиции, поэтому там берутся только дебютные. Но при
РУЧНОМ выборе человек уже знает, что тренирует, и дебютных у арабского мата
всего 18 — режима из них не выйдет. Берём все, порядок по рейтингу.
"""
import csv, json, chess, collections
csv.field_size_limit(10**7)

УЗОРЫ = [
    'backRankMate', 'pillsburysMate', 'operaMate', 'smotheredMate', 'epauletteMate',
    'cornerMate', 'hookMate', 'swallowstailMate', 'arabianMate', 'anastasiaMate',
    'morphysMate', 'bodenMate', 'doubleBishopMate', 'dovetailMate', 'killBoxMate',
    'vukovicMate', 'balestraMate', 'triangleMate', 'blindSwineMate',
]
НА_УЗОР = 1200

кучи = collections.defaultdict(list)
стат = collections.Counter()
with open('lichess.csv', newline='') as f:
    r = csv.reader(f); hdr = next(r)
    I = {k: i for i, k in enumerate(hdr)}
    for row in r:
        темы = set(row[I['Themes']].split())
        # Только мат в один ход: узор должен читаться сразу, без расчёта.
        if 'mateIn1' not in темы: continue
        for у in УЗОРЫ:
            if у not in темы: continue
            стат[у] += 1
            if len(кучи[у]) >= НА_УЗОР: continue
            # Ровный срез по рейтингу: берём каждую k-ю, а не первые подряд.
            кучи[у].append({'id': row[I['PuzzleId']], 'fen': row[I['FEN']],
                            'moves': row[I['Moves']].split(), 'rating': int(row[I['Rating']]),
                            'themes': row[I['Themes']], 'url': row[I['GameUrl']]})
            break

# Движок подтверждает мат — разметке не верим.
годные = {}
for у, список in кучи.items():
    ок = []
    for z in список:
        try:
            b = chess.Board(z['fen'])
            b.push(chess.Move.from_uci(z['moves'][0]))
            b.push(chess.Move.from_uci(z['moves'][1]))
            if b.is_checkmate(): ок.append(z)
        except Exception:
            pass
    годные[у] = ок

for у in УЗОРЫ:
    print(f'{у:20} в базе {стат[у]:7}  взято {len(годные.get(у, [])):5}')
json.dump({'_источник': 'https://database.lichess.org/lichess_db_puzzle.csv.zst (CC0 1.0)',
           '_отбор': 'мат в один ход с именованной темой узора; мат подтверждён движком python-chess. Ограничение opening СНЯТО: при ручном выборе узора дебютных не хватает (у арабского мата их 18).',
           '_собрано': '2026-09-05', 'motifs': годные},
          open('named_motifs.json', 'w'), ensure_ascii=False)
print('всего взято:', sum(len(v) for v in годные.values()))
