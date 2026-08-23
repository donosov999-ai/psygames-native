/* psygames-chess-blind-i18n · VER 1 · 23.08.2026 */
/**
 * СЛОВАРЬ СЕРИИ «ШАХМАТЫ ВСЛЕПУЮ» — СРАЗУ НА ВСЕ ДВЕНАДЦАТЬ ЯЗЫКОВ.
 *
 * ⚠️ ПОЧЕМУ НЕ В ОБЩИЙ СЛОВАРЬ ПРИЛОЖЕНИЯ. `src/contexts/LanguageContext.tsx` и
 * `src/contexts/translations/*` правят параллельно другие заходы, и новый ключ
 * там — гарантированный конфликт в файле, который держит все игры. Подписи серии
 * нужны ровно одному экрану, поэтому живут рядом с ним — тем же приёмом, что
 * `schulte/core/i18n.ts`, `proofreading/core/i18n.ts` и `stop-signal/core/i18n.ts`.
 *
 * ⚠️ ДВЕНАДЦАТЬ, А НЕ ДВА. Словарь на `ru`/`en` выдаёт японцу, корейцу и немцу
 * английский текст посреди переведённого экрана — дыра, ради которой заведён гейт
 * `games-module-i18n`. Полнота, отличие от английского и своя письменность у своей
 * локали сверяются им же.
 *
 * ⚠️ ПОРТУГАЛЬСКИЙ — БРАЗИЛЬСКИЙ, как и весь остальной словарь приложения.
 *
 * 🔴 ИМЁН ФИГУР ЗДЕСЬ НЕТ, И ЭТО РЕШЕНИЕ, А НЕ ПРОПУСК. Фигура называется
 * ФИГУРНЫМ ЗНАКОМ (♞), одинаковым во всех двенадцати языках; подставляет его
 * `pieceGlyph` из `board.ts`. Двенадцать переводов слова «конь» — это сто сорок
 * четыре строки и столько же возможностей ошибиться там, где переводить нечего.
 *
 * 🔴 ЧЕГО ЗДЕСЬ НЕЛЬЗЯ ОБЕЩАТЬ. Ни одна подпись не называет разности «оценкой
 * мозга» и не сулит роста внимания или шахматной силы: T₂ − T₁ — это цена ОДНОГО
 * добавленного правила в ЭТОЙ партии на ЭТОЙ позиции, и ничего сверх того по ней
 * сказать нельзя.
 */

/** Список ровно как `type Language` приложения (LanguageContext). */
export type ChessBlindLocale =
  | 'ru' | 'en' | 'es' | 'de' | 'zh' | 'hi'
  | 'pt' | 'fr' | 'it' | 'ja' | 'ko' | 'ar';

/** Порядок неважен, важна полнота: по нему сверяется словарь в гейте. */
export const CHESS_BLIND_LOCALES: readonly ChessBlindLocale[] = [
  'ru', 'en', 'es', 'de', 'zh', 'hi', 'pt', 'fr', 'it', 'ja', 'ko', 'ar',
];

export interface ChessBlindStrings {
  /** Кнопка входа в серию. */
  entry: string;
  /** С какой полосы по числу фигур пойдёт серия. Подставляются {min} и {max}. */
  startsAt: string;
  /** Прежние уровни блоков — показываются ЯВНО, чтобы старт с минимума не читался как откат. */
  yourLevels: string;
  /** Откуда позиция: {white}, {black}, {year}, {move}. */
  fromGame: string;
  /** Названия блоков — во врезке, в шапке и в разборе. */
  blockSquare: string;
  blockKnight: string;
  blockRecall: string;
  /** Правило блока: строка на доске и она же во врезке. */
  ruleSquare: string;
  /** Подставляется {moves}. */
  ruleKnight: string;
  ruleRecall: string;
  /** «Блок {n} из {total}» в шапке партии. */
  blockOf: string;
  /** Заголовок врезки между блоками. */
  ruleChanges: string;
  /** Главное, что говорит врезка: позиция не менялась. */
  samePosition: string;
  /** Фаза показа позиции в блоке памяти. */
  memorize: string;
  /** Сам вопрос блока 1: {a} и {b}. */
  askSquare: string;
  /** Сам вопрос блока 2: {from}, {to}, {moves}. */
  askKnight: string;
  /** Сам вопрос блока 3: {square}, {piece}. */
  askRecall: string;
  /** Чем называется пустое поле в утверждении вопроса. */
  emptySquare: string;
  /** Две кнопки ответа — одни и те же во всех трёх блоках. */
  answerYes: string;
  answerNo: string;
  /** Заголовок разбора. */
  seriesDone: string;
  /** T₁ — просто время первого блока. */
  coordSpeed: string;
  /** T₂ − T₁. */
  knightCost: string;
  /** T₃ − T₁. */
  holdCost: string;
  /** Прерванная серия: блоки записаны, разностей нет. */
  notFinished: string;
  /** Уровень вырос: все блоки устойчивы. Подставляются {min} и {max}. */
  levelUp: string;
  /** Какой блок держит уровень и сколько чистых прогонов ему ещё нужно. */
  heldBy: string;
}

const STRINGS: Record<ChessBlindLocale, ChessBlindStrings> = {
  ru: {
    entry: 'Серия: три правила на одной позиции',
    startsAt: 'Начинаем с позиции в {min}–{max} фигур',
    yourLevels: 'Твои уровни: поля {square}, конь {knight}, память {recall}',
    fromGame: 'Позиция из партии {white} — {black}, {year}, ход {move}',
    blockSquare: 'Цвет полей',
    blockKnight: 'Ход коня',
    blockRecall: 'Память о позиции',
    ruleSquare: 'Отвечай, одного ли цвета два поля',
    ruleKnight: 'Отвечай, дойдёт ли конь за {moves} хода. Фигуры маршруту не мешают',
    ruleRecall: 'Позицию уберут. Отвечай, что стояло на поле',
    blockOf: 'Блок {n} из {total}',
    ruleChanges: 'Правило меняется',
    samePosition: 'Позиция та же самая — новое только правило',
    memorize: 'Запомни позицию',
    askSquare: 'Одного ли цвета {a} и {b}?',
    askKnight: 'Дойдёт ли конь с {from} на {to} за {moves} хода?',
    askRecall: 'На {square} стоит {piece}?',
    emptySquare: 'пусто',
    answerYes: 'Да',
    answerNo: 'Нет',
    seriesDone: 'Серия пройдена',
    coordSpeed: 'Координатная работа',
    knightCost: 'Цена правила хода',
    holdCost: 'Цена удержания позиции',
    notFinished: 'Серия не доиграна — разности не считаем',
    levelUp: 'Все три блока устойчивы: на доске станет {min}–{max} фигур',
    heldBy: 'Уровень держит блок «{block}»: нужно ещё {runs} чистых прогона подряд',
  },
  en: {
    entry: 'Series: three rules on one position',
    startsAt: 'Starting from a position with {min}–{max} pieces',
    yourLevels: 'Your levels: squares {square}, knight {knight}, memory {recall}',
    fromGame: 'Position from {white} — {black}, {year}, move {move}',
    blockSquare: 'Colour of squares',
    blockKnight: 'Knight move',
    blockRecall: 'Memory of the position',
    ruleSquare: 'Answer whether the two squares share a colour',
    ruleKnight: 'Answer whether the knight arrives in {moves} moves. Pieces do not block the route',
    ruleRecall: 'The position will be hidden. Answer what stood on the square',
    blockOf: 'Block {n} of {total}',
    ruleChanges: 'The rule changes',
    samePosition: 'Same position — only the rule is new',
    memorize: 'Memorise the position',
    askSquare: 'Are {a} and {b} the same colour?',
    askKnight: 'Does the knight reach {to} from {from} in {moves} moves?',
    askRecall: 'Is {piece} standing on {square}?',
    emptySquare: 'empty',
    answerYes: 'Yes',
    answerNo: 'No',
    seriesDone: 'Series complete',
    coordSpeed: 'Coordinate work',
    knightCost: 'Cost of the move rule',
    holdCost: 'Cost of holding the position',
    notFinished: 'Series unfinished — no differences counted',
    levelUp: 'All three blocks are stable: the board grows to {min}–{max} pieces',
    heldBy: 'The level is held by “{block}”: {runs} more clean runs in a row',
  },
  es: {
    entry: 'Serie: tres reglas en una posición',
    startsAt: 'Empezamos con una posición de {min}–{max} piezas',
    yourLevels: 'Tus niveles: casillas {square}, caballo {knight}, memoria {recall}',
    fromGame: 'Posición de {white} — {black}, {year}, jugada {move}',
    blockSquare: 'Color de las casillas',
    blockKnight: 'Salto del caballo',
    blockRecall: 'Memoria de la posición',
    ruleSquare: 'Responde si las dos casillas son del mismo color',
    ruleKnight: 'Responde si el caballo llega en {moves} saltos. Las piezas no estorban',
    ruleRecall: 'La posición se ocultará. Responde qué había en la casilla',
    blockOf: 'Bloque {n} de {total}',
    ruleChanges: 'La regla cambia',
    samePosition: 'La misma posición: solo cambia la regla',
    memorize: 'Memoriza la posición',
    askSquare: '¿{a} y {b} son del mismo color?',
    askKnight: '¿El caballo llega de {from} a {to} en {moves} saltos?',
    askRecall: '¿En {square} está {piece}?',
    emptySquare: 'vacía',
    answerYes: 'Sí',
    answerNo: 'No',
    seriesDone: 'Serie completada',
    coordSpeed: 'Trabajo con coordenadas',
    knightCost: 'Coste de la regla de movimiento',
    holdCost: 'Coste de retener la posición',
    notFinished: 'Serie sin terminar: no se calculan las diferencias',
    levelUp: 'Los tres bloques son estables: el tablero sube a {min}–{max} piezas',
    heldBy: 'El nivel lo retiene «{block}»: faltan {runs} rondas limpias seguidas',
  },
  de: {
    entry: 'Serie: drei Regeln auf einer Stellung',
    startsAt: 'Wir beginnen mit einer Stellung aus {min}–{max} Figuren',
    yourLevels: 'Deine Stufen: Felder {square}, Springer {knight}, Gedächtnis {recall}',
    fromGame: 'Stellung aus {white} — {black}, {year}, Zug {move}',
    blockSquare: 'Farbe der Felder',
    blockKnight: 'Springerzug',
    blockRecall: 'Gedächtnis für die Stellung',
    ruleSquare: 'Antworte, ob beide Felder dieselbe Farbe haben',
    ruleKnight: 'Antworte, ob der Springer in {moves} Zügen ankommt. Figuren stören den Weg nicht',
    ruleRecall: 'Die Stellung wird verdeckt. Antworte, was auf dem Feld stand',
    blockOf: 'Block {n} von {total}',
    ruleChanges: 'Die Regel ändert sich',
    samePosition: 'Dieselbe Stellung — neu ist nur die Regel',
    memorize: 'Präge dir die Stellung ein',
    askSquare: 'Haben {a} und {b} dieselbe Farbe?',
    askKnight: 'Kommt der Springer von {from} nach {to} in {moves} Zügen an?',
    askRecall: 'Steht {piece} auf {square}?',
    emptySquare: 'leer',
    answerYes: 'Ja',
    answerNo: 'Nein',
    seriesDone: 'Serie geschafft',
    coordSpeed: 'Arbeit mit Koordinaten',
    knightCost: 'Preis der Zugregel',
    holdCost: 'Preis des Behaltens der Stellung',
    notFinished: 'Serie nicht beendet — keine Differenzen',
    levelUp: 'Alle drei Blöcke sind stabil: das Brett wächst auf {min}–{max} Figuren',
    heldBy: 'Die Stufe hält der Block „{block}“: noch {runs} saubere Durchgänge in Folge',
  },
  zh: {
    entry: '连续三关：同一局面，三条规则',
    startsAt: '从 {min}–{max} 个棋子的局面开始',
    yourLevels: '你的等级：格子 {square}，马 {knight}，记忆 {recall}',
    fromGame: '局面出自 {white} — {black}，{year} 年，第 {move} 回合',
    blockSquare: '格子的颜色',
    blockKnight: '马的走法',
    blockRecall: '局面记忆',
    ruleSquare: '回答两个格子是否同色',
    ruleKnight: '回答马能否在 {moves} 步内走到。棋子不挡路',
    ruleRecall: '局面会被盖住。回答那个格子上是什么',
    blockOf: '第 {n} 关，共 {total} 关',
    ruleChanges: '规则变了',
    samePosition: '局面没变——变的只是规则',
    memorize: '记住这个局面',
    askSquare: '{a} 和 {b} 是同色格吗？',
    askKnight: '马能从 {from} 用 {moves} 步走到 {to} 吗？',
    askRecall: '{square} 上是 {piece} 吗？',
    emptySquare: '空格',
    answerYes: '是',
    answerNo: '否',
    seriesDone: '整轮完成',
    coordSpeed: '坐标运算',
    knightCost: '走法规则的代价',
    holdCost: '记住局面的代价',
    notFinished: '这一轮没打完——不计算差值',
    levelUp: '三关都稳了：棋盘增加到 {min}–{max} 个棋子',
    heldBy: '卡住等级的是「{block}」：还需要连续 {runs} 次干净通过',
  },
  hi: {
    entry: 'श्रृंखला: एक ही स्थिति पर तीन नियम',
    startsAt: '{min}–{max} मोहरों वाली स्थिति से शुरू करते हैं',
    yourLevels: 'तुम्हारे स्तर: खाने {square}, घोड़ा {knight}, स्मृति {recall}',
    fromGame: 'स्थिति: {white} — {black}, {year}, चाल {move}',
    blockSquare: 'खानों का रंग',
    blockKnight: 'घोड़े की चाल',
    blockRecall: 'स्थिति की स्मृति',
    ruleSquare: 'बताओ कि दोनों खाने एक ही रंग के हैं या नहीं',
    ruleKnight: 'बताओ कि घोड़ा {moves} चालों में पहुँचेगा या नहीं। मोहरे रास्ता नहीं रोकते',
    ruleRecall: 'स्थिति छिपा दी जाएगी। बताओ उस खाने पर क्या था',
    blockOf: 'खंड {n} / {total}',
    ruleChanges: 'नियम बदल रहा है',
    samePosition: 'स्थिति वही है — नया सिर्फ़ नियम है',
    memorize: 'स्थिति याद कर लो',
    askSquare: 'क्या {a} और {b} एक ही रंग के हैं?',
    askKnight: 'क्या घोड़ा {from} से {to} तक {moves} चालों में जाएगा?',
    askRecall: 'क्या {square} पर {piece} था?',
    emptySquare: 'खाली',
    answerYes: 'हाँ',
    answerNo: 'नहीं',
    seriesDone: 'श्रृंखला पूरी',
    coordSpeed: 'निर्देशांक का काम',
    knightCost: 'चाल के नियम की कीमत',
    holdCost: 'स्थिति थामे रखने की कीमत',
    notFinished: 'श्रृंखला अधूरी — अंतर नहीं गिने जाते',
    levelUp: 'तीनों खंड स्थिर: बिसात {min}–{max} मोहरों तक बढ़ती है',
    heldBy: 'स्तर रोक रखा है «{block}» ने: लगातार {runs} साफ़ दौर और चाहिए',
  },
  pt: {
    entry: 'Série: três regras em uma posição',
    startsAt: 'Começamos com uma posição de {min}–{max} peças',
    yourLevels: 'Seus níveis: casas {square}, cavalo {knight}, memória {recall}',
    fromGame: 'Posição de {white} — {black}, {year}, lance {move}',
    blockSquare: 'Cor das casas',
    blockKnight: 'Salto do cavalo',
    blockRecall: 'Memória da posição',
    ruleSquare: 'Responda se as duas casas têm a mesma cor',
    ruleKnight: 'Responda se o cavalo chega em {moves} lances. As peças não atrapalham',
    ruleRecall: 'A posição será escondida. Responda o que estava na casa',
    blockOf: 'Bloco {n} de {total}',
    ruleChanges: 'A regra muda',
    samePosition: 'A mesma posição — só a regra é nova',
    memorize: 'Memorize a posição',
    askSquare: '{a} e {b} têm a mesma cor?',
    askKnight: 'O cavalo vai de {from} a {to} em {moves} lances?',
    askRecall: 'Em {square} está {piece}?',
    emptySquare: 'vazia',
    answerYes: 'Sim',
    answerNo: 'Não',
    seriesDone: 'Série concluída',
    coordSpeed: 'Trabalho com coordenadas',
    knightCost: 'Custo da regra de movimento',
    holdCost: 'Custo de reter a posição',
    notFinished: 'Série não concluída — diferenças não são contadas',
    levelUp: 'Os três blocos estão estáveis: o tabuleiro sobe para {min}–{max} peças',
    heldBy: 'O nível é segurado por «{block}»: faltam {runs} rodadas limpas seguidas',
  },
  fr: {
    entry: 'Série : trois règles sur une position',
    startsAt: 'On commence par une position de {min}–{max} pièces',
    yourLevels: 'Tes niveaux : cases {square}, cavalier {knight}, mémoire {recall}',
    fromGame: 'Position de {white} — {black}, {year}, coup {move}',
    blockSquare: 'Couleur des cases',
    blockKnight: 'Saut du cavalier',
    blockRecall: 'Mémoire de la position',
    ruleSquare: 'Réponds si les deux cases sont de la même couleur',
    ruleKnight: 'Réponds si le cavalier arrive en {moves} coups. Les pièces ne gênent pas',
    ruleRecall: 'La position sera cachée. Réponds ce qui était sur la case',
    blockOf: 'Bloc {n} sur {total}',
    ruleChanges: 'La règle change',
    samePosition: 'La même position — seule la règle est nouvelle',
    memorize: 'Mémorise la position',
    askSquare: '{a} et {b} sont-elles de la même couleur ?',
    askKnight: 'Le cavalier va-t-il de {from} à {to} en {moves} coups ?',
    askRecall: 'Y a-t-il {piece} sur {square} ?',
    emptySquare: 'vide',
    answerYes: 'Oui',
    answerNo: 'Non',
    seriesDone: 'Série terminée',
    coordSpeed: 'Travail sur les coordonnées',
    knightCost: 'Coût de la règle de déplacement',
    holdCost: 'Coût du maintien de la position',
    notFinished: 'Série inachevée — pas de différences',
    levelUp: 'Les trois blocs sont stables : le plateau passe à {min}–{max} pièces',
    heldBy: 'Le niveau est retenu par « {block} » : encore {runs} parties propres d’affilée',
  },
  it: {
    entry: 'Serie: tre regole su una posizione',
    startsAt: 'Si parte da una posizione di {min}–{max} pezzi',
    yourLevels: 'I tuoi livelli: case {square}, cavallo {knight}, memoria {recall}',
    fromGame: 'Posizione da {white} — {black}, {year}, mossa {move}',
    blockSquare: 'Colore delle case',
    blockKnight: 'Salto del cavallo',
    blockRecall: 'Memoria della posizione',
    ruleSquare: 'Rispondi se le due case hanno lo stesso colore',
    ruleKnight: 'Rispondi se il cavallo arriva in {moves} mosse. I pezzi non ostacolano',
    ruleRecall: 'La posizione verrà nascosta. Rispondi che cosa c’era sulla casa',
    blockOf: 'Blocco {n} di {total}',
    ruleChanges: 'La regola cambia',
    samePosition: 'La stessa posizione: cambia solo la regola',
    memorize: 'Memorizza la posizione',
    askSquare: '{a} e {b} hanno lo stesso colore?',
    askKnight: 'Il cavallo va da {from} a {to} in {moves} mosse?',
    askRecall: 'Su {square} c’è {piece}?',
    emptySquare: 'vuota',
    answerYes: 'Sì',
    answerNo: 'No',
    seriesDone: 'Serie completata',
    coordSpeed: 'Lavoro con le coordinate',
    knightCost: 'Costo della regola di mossa',
    holdCost: 'Costo di tenere a mente la posizione',
    notFinished: 'Serie non finita: nessuna differenza',
    levelUp: 'Tutti e tre i blocchi sono stabili: la scacchiera sale a {min}–{max} pezzi',
    heldBy: 'Il livello è tenuto da «{block}»: servono altre {runs} partite pulite di fila',
  },
  ja: {
    entry: 'シリーズ：同じ局面で三つのルール',
    startsAt: '駒 {min}–{max} 個の局面から始めます',
    yourLevels: 'あなたのレベル：マス {square}、ナイト {knight}、記憶 {recall}',
    fromGame: '{white} — {black}、{year} 年、{move} 手目の局面',
    blockSquare: 'マスの色',
    blockKnight: 'ナイトの動き',
    blockRecall: '局面の記憶',
    ruleSquare: '二つのマスが同じ色かどうか答えてください',
    ruleKnight: 'ナイトが {moves} 手で着けるか答えてください。駒は邪魔しません',
    ruleRecall: '局面は隠されます。そのマスに何があったか答えてください',
    blockOf: 'ブロック {n} / {total}',
    ruleChanges: 'ルールが変わります',
    samePosition: '局面は同じ — 変わったのはルールだけ',
    memorize: '局面を覚えてください',
    askSquare: '{a} と {b} は同じ色ですか？',
    askKnight: 'ナイトは {from} から {to} へ {moves} 手で行けますか？',
    askRecall: '{square} に {piece} がありましたか？',
    emptySquare: '空き',
    answerYes: 'はい',
    answerNo: 'いいえ',
    seriesDone: 'シリーズ終了',
    coordSpeed: '座標の処理',
    knightCost: '動きの規則の代償',
    holdCost: '局面を保つ代償',
    notFinished: 'シリーズが途中です — 差は出しません',
    levelUp: '三つとも安定：盤の駒が {min}–{max} 個になります',
    heldBy: 'レベルを止めているのは「{block}」：あと {runs} 回続けてミスなし',
  },
  ko: {
    entry: '시리즈: 같은 국면에서 세 가지 규칙',
    startsAt: '기물 {min}–{max}개의 국면에서 시작합니다',
    yourLevels: '내 레벨: 칸 {square}, 나이트 {knight}, 기억 {recall}',
    fromGame: '{white} — {black}, {year}년 {move}수의 국면',
    blockSquare: '칸의 색',
    blockKnight: '나이트의 이동',
    blockRecall: '국면 기억',
    ruleSquare: '두 칸이 같은 색인지 답하세요',
    ruleKnight: '나이트가 {moves}수 만에 도착하는지 답하세요. 기물은 길을 막지 않습니다',
    ruleRecall: '국면이 가려집니다. 그 칸에 무엇이 있었는지 답하세요',
    blockOf: '{total}개 중 {n}번째 블록',
    ruleChanges: '규칙이 바뀝니다',
    samePosition: '국면은 그대로 — 바뀐 것은 규칙뿐',
    memorize: '국면을 외우세요',
    askSquare: '{a}와 {b}는 같은 색인가요?',
    askKnight: '나이트가 {from}에서 {to}까지 {moves}수에 갈까요?',
    askRecall: '{square}에 {piece}가 있었나요?',
    emptySquare: '빈 칸',
    answerYes: '예',
    answerNo: '아니오',
    seriesDone: '시리즈 완료',
    coordSpeed: '좌표 작업',
    knightCost: '이동 규칙의 비용',
    holdCost: '국면을 붙드는 비용',
    notFinished: '시리즈가 중간에 끝남 — 차이는 세지 않습니다',
    levelUp: '세 블록 모두 안정: 판이 기물 {min}–{max}개로 늘어납니다',
    heldBy: '레벨을 붙드는 건 «{block}»: 깨끗한 판 {runs}번 더 연달아',
  },
  ar: {
    entry: 'سلسلة: ثلاث قواعد على وضعية واحدة',
    startsAt: 'نبدأ من وضعية فيها {min}–{max} قطعة',
    yourLevels: 'مستوياتك: المربعات {square}، الحصان {knight}، الذاكرة {recall}',
    fromGame: 'وضعية من {white} — {black}، {year}، النقلة {move}',
    blockSquare: 'لون المربعات',
    blockKnight: 'نقلة الحصان',
    blockRecall: 'ذاكرة الوضعية',
    ruleSquare: 'أجب هل المربعان من اللون نفسه',
    ruleKnight: 'أجب هل يصل الحصان في {moves} نقلات. القطع لا تعيق الطريق',
    ruleRecall: 'ستُخفى الوضعية. أجب ماذا كان على المربع',
    blockOf: 'المقطع {n} من {total}',
    ruleChanges: 'القاعدة تتغيّر',
    samePosition: 'الوضعية نفسها — الجديد هو القاعدة فقط',
    memorize: 'احفظ الوضعية',
    askSquare: 'هل {a} و{b} من اللون نفسه؟',
    askKnight: 'هل يصل الحصان من {from} إلى {to} في {moves} نقلات؟',
    askRecall: 'هل على {square} توجد {piece}؟',
    emptySquare: 'فارغ',
    answerYes: 'نعم',
    answerNo: 'لا',
    seriesDone: 'اكتملت السلسلة',
    coordSpeed: 'العمل بالإحداثيات',
    knightCost: 'كلفة قاعدة النقلة',
    holdCost: 'كلفة الاحتفاظ بالوضعية',
    notFinished: 'السلسلة لم تكتمل — لا تُحسب الفروق',
    levelUp: 'المقاطع الثلاثة ثابتة: تكبر الرقعة إلى {min}–{max} قطعة',
    heldBy: 'يوقف المستوى «{block}»: تلزم {runs} جولات نظيفة متتالية',
  },
};

export function getChessBlindStrings(locale: ChessBlindLocale): ChessBlindStrings {
  return STRINGS[locale] ?? STRINGS.en;
}

export function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  ));
}
