"""Дебютные матовые УЗОРЫ из базы Lichess — один проход, все мотивы сразу.

🔴 ЗАЧЕМ. Денис 05.09.2026, пройдя три уровня: «по сути одна комбинация, слон и
ферзь, дают то за чёрных то за белых из разных позиций — я бы не сказал, что
это разные». Он прав: лестница меняла секунды и обстановку, а УЗОР был один.
Здесь набираются соседние узоры, чтобы лестница росла по мотивам.

Каждый узор определяется ДВИЖКОМ по последнему ходу: какая фигура матует, куда,
и кто держит поле.
"""
import csv, json, chess, collections
csv.field_size_limit(10**7)

СТАТ = collections.Counter()
КУЧИ = collections.defaultdict(list)

def мотив(доска_до, ход, темы):
    """Имя узора по позиции ПЕРЕД матующим ходом."""
    ф = доска_до.piece_at(ход.from_square)
    if not ф: return None
    цвет = доска_до.turn
    поле = chess.square_name(ход.to_square)
    держат = {доска_до.piece_at(s).piece_type for s in доска_до.attackers(цвет, ход.to_square) if s != ход.from_square}
    if 'smotheredMate' in темы: return 'smothered'
    if ф.piece_type == chess.QUEEN and поле in ('f7', 'f2'):
        if chess.BISHOP in держат: return 'scholar'          # детский мат
        if chess.KNIGHT in держат: return 'queenKnight'      # ферзь при коне
        if not держат: return 'queenAlone'                   # ферзь без поддержки
        return None
    if ф.piece_type == chess.QUEEN and поле in ('h5', 'h4') and доска_до.fullmove_number <= 6:
        return 'fool'                                         # мат дурака
    if ф.piece_type == chess.BISHOP and поле in ('f7', 'f2'):
        return 'bishopF7'                                     # матует слон
    if ф.piece_type == chess.KNIGHT and 'opening' in темы:
        return 'knightOpening'                                # конём в дебюте (в т.ч. Легаль)
    return None

with open('lichess.csv', newline='') as f:
    r = csv.reader(f); hdr = next(r)
    I = {k: i for i, k in enumerate(hdr)}
    for row in r:
        СТАТ['всего'] += 1
        темы = set(row[I['Themes']].split())
        if 'mateIn1' not in темы: continue
        # Дебют или ранний миттельшпиль: узор должен быть узнаваем, а не выдуман.
        fen = row[I['FEN']]
        try: ход_номер = int(fen.rsplit(' ', 1)[1])
        except Exception: continue
        if ход_номер > 14: continue
        ходы = row[I['Moves']].split()
        if len(ходы) < 2: continue
        b = chess.Board(fen)
        try:
            b.push(chess.Move.from_uci(ходы[0]))
            наш = chess.Move.from_uci(ходы[1])
            имя = мотив(b, наш, темы)
            if not имя: continue
            b.push(наш)
            if not b.is_checkmate(): continue
        except Exception:
            continue
        СТАТ[имя] += 1
        if len(КУЧИ[имя]) < 4000:
            КУЧИ[имя].append({'id': row[I['PuzzleId']], 'fen': fen, 'moves': ходы,
                              'rating': int(row[I['Rating']]), 'fullmove': ход_номер,
                              'themes': row[I['Themes']], 'url': row[I['GameUrl']]})

for k, v in СТАТ.most_common(): print(f'{k}: {v}')
json.dump({'_источник': 'https://database.lichess.org/lichess_db_puzzle.csv.zst (CC0 1.0)',
           '_отбор': 'мат в 1 до 14-го хода, узор определён движком по матующей фигуре, полю и тому, кто держит поле',
           '_собрано': '2026-09-05',
           'motifs': {k: v for k, v in КУЧИ.items()}},
          open('opening_motifs.json', 'w'), ensure_ascii=False)
print('видов:', len(КУЧИ), '· записано:', sum(len(v) for v in КУЧИ.values()))
