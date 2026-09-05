import json, chess, collections
d = json.load(open('sacrifice_pattern.json'))['puzzles']
стат = collections.Counter(); строгие = []
for z in d:
    b = chess.Board(z['fen'])
    ходы = [chess.Move.from_uci(m) for m in z['moves']]
    for m in ходы[:-1]: b.push(m)
    посл = ходы[-1]
    ф = b.piece_at(посл.from_square)
    цвет = b.turn
    поддержка = [b.piece_at(s).piece_type for s in b.attackers(цвет, посл.to_square) if s != посл.from_square]
    стат['всего'] += 1
    if ф and ф.piece_type == chess.QUEEN:
        стат['матует ферзь'] += 1
        if chess.BISHOP in поддержка:
            стат['+ держит слон (узор)'] += 1; строгие.append(z)
        elif поддержка: стат['+ держит другая фигура'] += 1
        else: стат['без поддержки'] += 1
    else:
        стат['матует не ферзь'] += 1
print(dict(стат))
деб = [z for z in строгие if z['opening']]
print('строгих:', len(строгие), '· дебютных из них:', len(деб))
р = sorted(z['rating'] for z in строгие)
print('рейтинг', р[0], '…', р[-1], 'медиана', р[len(р)//2], '· ≤1500:', sum(1 for x in р if x <= 1500))
м = collections.Counter(z['mateIn'] for z in строгие); print('мат в N:', dict(м))
json.dump({'_источник': 'https://database.lichess.org/lichess_db_puzzle.csv.zst (CC0 1.0)',
           '_отбор': 'тема sacrifice ∧ (mateIn2|mateIn3) ∧ ПОСЛЕДНИЙ ход: ферзь матует на f7/f2 при поддержке своего СЛОНА ∧ движок подтвердил, что первый наш ход отдаёт материал и линия матует',
           '_замер': '05.09.2026 · с темой sacrifice в базе 459 732 · мат в 2-3 из них 195 481 · мат на f7/f2 — 8 085 · реально отдают материал 7 863 · с узором детского мата — %d' % len(строгие),
           '_собрано': '2026-09-05', 'puzzles': строгие},
          open('sacrifice_scholar.json', 'w'), ensure_ascii=False)
