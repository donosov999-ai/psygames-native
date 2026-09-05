"""Настоящие маты С ЖЕРТВОЙ по узору детского мата.

Отбор: тема `sacrifice` ∧ (mateIn2 ∨ mateIn3) ∧ ПОСЛЕДНИЙ ход матует на f7/f2.
Прежний отбор шёл только по полю мата — и тема `sacrifice` не стояла ни у одной
из 434 отобранных позиций, при том что в базе она есть у 459 732 задач.
"""
import csv, json, chess, collections
csv.field_size_limit(10**7)

взято, стат = [], collections.Counter()
with open('lichess.csv', newline='') as f:
    r = csv.reader(f); hdr = next(r)
    I = {k: i for i, k in enumerate(hdr)}
    for row in r:
        стат['всего'] += 1
        темы = set(row[I['Themes']].split())
        if 'sacrifice' not in темы: continue
        стат['с жертвой'] += 1
        if not (темы & {'mateIn2', 'mateIn3'}): continue
        стат['мат в 2-3'] += 1
        ходы = row[I['Moves']].split()
        if ходы[-1][2:4] not in ('f7', 'f2'): continue
        стат['мат на f7/f2'] += 1
        взято.append({
            'id': row[I['PuzzleId']], 'fen': row[I['FEN']], 'moves': ходы,
            'rating': int(row[I['Rating']]),
            'mateIn': 2 if 'mateIn2' in темы else 3,
            'opening': 'opening' in темы,
            'themes': sorted(темы), 'url': row[I['GameUrl']],
        })

# Проверяем движком: первый наш ход действительно ОТДАЁТ материал, и линия матует.
СТОИТ = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 0}
годные = []
for z in взято:
    b = chess.Board(z['fen'])
    try:
        b.push(chess.Move.from_uci(z['moves'][0]))          # пре-ход соперника
        наш = chess.Move.from_uci(z['moves'][1])
        фигура = b.piece_at(наш.from_square)
        добыча = b.piece_at(наш.to_square)
        взяли = СТОИТ[добыча.piece_type] if добыча else 0
        # Жертва: после нашего хода поле бьётся соперником, а мы отдаём больше, чем берём.
        b.push(наш)
        бьют = b.attackers(not фигура.color, наш.to_square)
        отдали = СТОИТ[фигура.piece_type] if бьют else 0
        for ход in z['moves'][2:]:
            b.push(chess.Move.from_uci(ход))
        if not b.is_checkmate(): стат['линия не матует'] += 1; continue
    except Exception:
        стат['битая запись'] += 1; continue
    z['жертвует'] = отдали - взяли
    годные.append(z)

жертвует = [z for z in годные if z['жертвует'] > 0]
print('всего строк:', стат['всего'])
print('с темой sacrifice:', стат['с жертвой'], '· из них мат в 2-3:', стат['мат в 2-3'], '· мат на f7/f2:', стат['мат на f7/f2'])
print('линия матует:', len(годные), '· из них РЕАЛЬНО отдают материал:', len(жертвует))
print('дебютных среди отдающих:', sum(1 for z in жертвует if z['opening']))
р = sorted(z['rating'] for z in жертвует)
if р: print('рейтинг', р[0], '…', р[-1], 'медиана', р[len(р)//2])
json.dump({'_источник': 'https://database.lichess.org/lichess_db_puzzle.csv.zst (CC0 1.0)',
           '_отбор': 'тема sacrifice ∧ (mateIn2|mateIn3) ∧ мат на f7/f2 ∧ движок подтвердил, что первый наш ход отдаёт материал и линия действительно матует',
           '_собрано': '2026-09-05', 'puzzles': жертвует},
          open('sacrifice_pattern.json', 'w'), ensure_ascii=False)
