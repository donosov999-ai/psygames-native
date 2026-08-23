/* psygames-proofreading-series-i18n · VER 1 · 23.08.2026 */
/**
 * СЛОВАРЬ СЕРИИ КОРРЕКТУРКИ — СРАЗУ НА ВСЕ ДВЕНАДЦАТЬ ЯЗЫКОВ.
 *
 * ⚠️ ПОЧЕМУ НЕ В ОБЩИЙ СЛОВАРЬ ПРИЛОЖЕНИЯ. `src/contexts/LanguageContext.tsx` и
 * `src/contexts/translations/*` правят параллельно другие заходы, и новый ключ
 * там — гарантированный конфликт в файле, который держит все игры. Подписи серии
 * нужны ровно одному экрану, поэтому живут рядом с ним — тем же приёмом, что
 * `schulte/core/i18n.ts`, `fillwords/core/i18n.ts` и `n-back/core/i18n.ts`.
 *
 * ⚠️ ИМЁН КАТЕГОРИЙ ЗДЕСЬ НЕТ, И ЭТО НАМЕРЕННО. «Животные», «еда», «дом» уже
 * переведены на двенадцать языков ключами `catVocab_<cat>` общего словаря —
 * второй такой список разошёлся бы с первым в первую же правку. Экран
 * подставляет готовое имя в `{cat}`.
 *
 * ⚠️ ДВЕНАДЦАТЬ, А НЕ ДВА. Модуль со словарём на `ru`/`en` выдаёт японцу и
 * корейцу английский текст посреди переведённого экрана — дыра, ради которой
 * заведён гейт `games-module-i18n`. Полнота, отличие от английского и своя
 * письменность сверяются им же.
 *
 * ⚠️ ПОРТУГАЛЬСКИЙ — БРАЗИЛЬСКИЙ, как и весь остальной словарь приложения.
 *
 * 🔴 ЧЕГО ЗДЕСЬ НЕЛЬЗЯ ОБЕЩАТЬ. Ни одна подпись не называет разности «оценкой
 * мозга». T₂−T₁ и T₃−T₂ — это цена ОДНОГО добавленного правила в ЭТОЙ партии на
 * ЭТОМ поле, и ничего сверх того по ним сказать нельзя.
 */

/** Список ровно как `type Language` приложения (LanguageContext). */
export type ProofSeriesLocale =
  | 'ru' | 'en' | 'es' | 'de' | 'zh' | 'hi'
  | 'pt' | 'fr' | 'it' | 'ja' | 'ko' | 'ar';

/** Порядок неважен, важна полнота: по нему сверяется словарь в гейте. */
export const PROOF_SERIES_LOCALES: readonly ProofSeriesLocale[] = [
  'ru', 'en', 'es', 'de', 'zh', 'hi', 'pt', 'fr', 'it', 'ja', 'ko', 'ar',
];

export interface ProofSeriesStrings {
  /** Кнопка входа в серию на экране настроек. */
  entry: string;
  /** С какого поля пойдёт серия. Подставляется {size}. */
  startsAt: string;
  /** Прежние поля блоков — показываются ЯВНО, чтобы старт с минимума не читался как откат. */
  yourLevels: string;
  /** Названия блоков — во врезке, в шапке и в разборе. */
  blockSign: string;
  blockWord: string;
  blockSense: string;
  /** Правило блока: строка под полем и она же во врезке. */
  ruleSign: string;
  ruleWord: string;
  ruleSense: string;
  /** Заголовок врезки между блоками. */
  ruleChanges: string;
  /** Главное, что говорит врезка: поле не менялось. */
  sameField: string;
  /** «Блок {n} из {total}» в шапке партии. */
  blockOf: string;
  /** Заголовок разбора. */
  seriesDone: string;
  /** T₁ — просто время первого блока. */
  signSpeed: string;
  /** T₂ − T₁. */
  segmentCost: string;
  /** T₃ − T₂. */
  senseCost: string;
  /** Прерванная серия: блоки записаны, разностей нет. */
  notFinished: string;
  /** Поле выросло: все блоки устойчивы. */
  levelUp: string;
  /** Какой блок держит уровень и сколько чистых прогонов ему ещё нужно. */
  heldBy: string;
  again: string;
  leave: string;
  /** Честный отказ вместо спрятанной кнопки: где режим уже работает. */
  noSense: string;
}

const STRINGS: Record<ProofSeriesLocale, ProofSeriesStrings> = {
  ru: {
    entry: 'Серия: три правила на одном поле букв',
    startsAt: 'Начинаем с поля {size}×{size}',
    yourLevels: 'Твои поля: знак {sign}, слово {word}, смысл {sense}',
    blockSign: 'Поиск знака',
    blockWord: 'Поиск слов',
    blockSense: 'Поиск по смыслу',
    ruleSign: 'Отмечай все клетки с буквой {sign}',
    ruleWord: 'Собери все слова — поле разбирается целиком',
    ruleSense: 'Собирай только слова из группы «{cat}»',
    ruleChanges: 'Правило меняется',
    sameField: 'Поле то же самое — новое только правило',
    blockOf: 'Блок {n} из {total}',
    seriesDone: 'Серия пройдена',
    signSpeed: 'Скорость поиска знака',
    segmentCost: 'Цена сегментации',
    senseCost: 'Цена смысла',
    notFinished: 'Серия не доиграна — разности не считаем',
    levelUp: 'Все три блока устойчивы: поле растёт до {size}×{size}',
    heldBy: 'Поле держит блок «{block}»: нужно ещё {runs} чистых прогона подряд',
    again: 'Ещё раз',
    leave: 'Выйти',
    noSense: 'Смысловой блок держится на словаре с категориями. Пока он есть на языках: {langs}',
  },
  en: {
    entry: 'Series: three rules on one letter grid',
    startsAt: 'Starting at a {size}×{size} grid',
    yourLevels: 'Your grids: sign {sign}, word {word}, sense {sense}',
    blockSign: 'Sign search',
    blockWord: 'Word search',
    blockSense: 'Search by meaning',
    ruleSign: 'Mark every cell holding the letter {sign}',
    ruleWord: 'Collect every word — the grid comes apart in full',
    ruleSense: 'Collect only the words from the group “{cat}”',
    ruleChanges: 'The rule changes',
    sameField: 'Same grid — only the rule is new',
    blockOf: 'Block {n} of {total}',
    seriesDone: 'Series complete',
    signSpeed: 'Sign search speed',
    segmentCost: 'Cost of segmenting',
    senseCost: 'Cost of meaning',
    notFinished: 'Series unfinished — no differences counted',
    levelUp: 'All three blocks are stable: the grid grows to {size}×{size}',
    heldBy: 'The grid is held by “{block}”: {runs} more clean runs in a row',
    again: 'Once more',
    leave: 'Leave',
    noSense: 'The sense block runs on a dictionary with categories. So far it exists for: {langs}',
  },
  es: {
    entry: 'Serie: tres reglas en una misma cuadrícula de letras',
    startsAt: 'Empezamos con una cuadrícula de {size}×{size}',
    yourLevels: 'Tus cuadrículas: signo {sign}, palabra {word}, sentido {sense}',
    blockSign: 'Búsqueda del signo',
    blockWord: 'Búsqueda de palabras',
    blockSense: 'Búsqueda por sentido',
    ruleSign: 'Marca todas las casillas con la letra {sign}',
    ruleWord: 'Reúne todas las palabras: la cuadrícula se desarma entera',
    ruleSense: 'Reúne solo las palabras del grupo «{cat}»',
    ruleChanges: 'Cambia la regla',
    sameField: 'La misma cuadrícula: solo la regla es nueva',
    blockOf: 'Bloque {n} de {total}',
    seriesDone: 'Serie completada',
    signSpeed: 'Velocidad de búsqueda del signo',
    segmentCost: 'Coste de segmentar',
    senseCost: 'Coste del significado',
    notFinished: 'Serie sin terminar: no se calculan diferencias',
    levelUp: 'Los tres bloques son estables: la cuadrícula crece a {size}×{size}',
    heldBy: 'La cuadrícula la retiene «{block}»: faltan {runs} rondas limpias seguidas',
    again: 'Otra vez',
    leave: 'Salir',
    noSense: 'El bloque de sentido vive de un diccionario con categorías. Por ahora existe en: {langs}',
  },
  de: {
    entry: 'Serie: drei Regeln auf einem Buchstabenfeld',
    startsAt: 'Wir starten mit einem {size}×{size}-Feld',
    yourLevels: 'Deine Felder: Zeichen {sign}, Wort {word}, Sinn {sense}',
    blockSign: 'Zeichensuche',
    blockWord: 'Wortsuche',
    blockSense: 'Suche nach Bedeutung',
    ruleSign: 'Markiere jedes Feld mit dem Buchstaben {sign}',
    ruleWord: 'Sammle alle Wörter — das Feld wird ganz zerlegt',
    ruleSense: 'Sammle nur die Wörter aus der Gruppe «{cat}»',
    ruleChanges: 'Die Regel wechselt',
    sameField: 'Dasselbe Feld — neu ist nur die Regel',
    blockOf: 'Block {n} von {total}',
    seriesDone: 'Serie geschafft',
    signSpeed: 'Tempo der Zeichensuche',
    segmentCost: 'Preis des Zerlegens',
    senseCost: 'Preis der Bedeutung',
    notFinished: 'Serie nicht zu Ende — keine Differenzen',
    levelUp: 'Alle drei Blöcke sitzen: das Feld wächst auf {size}×{size}',
    heldBy: 'Das Feld hält der Block «{block}»: noch {runs} saubere Durchgänge in Folge',
    again: 'Noch einmal',
    leave: 'Verlassen',
    noSense: 'Der Sinn-Block lebt von einem Wörterbuch mit Kategorien. Bisher gibt es das für: {langs}',
  },
  zh: {
    entry: '连环：同一张字母表，三条规则',
    startsAt: '从 {size}×{size} 的字表开始',
    yourLevels: '你的字表：找字 {sign}，找词 {word}，按义找 {sense}',
    blockSign: '找字母',
    blockWord: '找词',
    blockSense: '按意思找',
    ruleSign: '把所有写着字母 {sign} 的格子都点出来',
    ruleWord: '把词全部找出来 —— 整张表都要拆完',
    ruleSense: '只找「{cat}」这一类的词',
    ruleChanges: '规则要变了',
    sameField: '字表还是这张 —— 变的只是规则',
    blockOf: '第 {n} 段，共 {total} 段',
    seriesDone: '连环完成',
    signSpeed: '找字母的速度',
    segmentCost: '切分的代价',
    senseCost: '辨义的代价',
    notFinished: '连环没做完 —— 不计算差值',
    levelUp: '三段都稳了：字表增大到 {size}×{size}',
    heldBy: '卡住的是「{block}」：还需要连续 {runs} 次干净完成',
    again: '再来一次',
    leave: '离开',
    noSense: '按义找依靠带分类的词库。目前只有这些语言有：{langs}',
  },
  hi: {
    entry: 'शृंखला: एक ही अक्षर-जाल पर तीन नियम',
    startsAt: '{size}×{size} जाल से शुरू करते हैं',
    yourLevels: 'तुम्हारे जाल: अक्षर {sign}, शब्द {word}, अर्थ {sense}',
    blockSign: 'अक्षर की खोज',
    blockWord: 'शब्दों की खोज',
    blockSense: 'अर्थ से खोज',
    ruleSign: '{sign} अक्षर वाले सभी खाने चुनो',
    ruleWord: 'सारे शब्द बटोरो — पूरा जाल खुल जाना चाहिए',
    ruleSense: 'सिर्फ़ «{cat}» समूह के शब्द बटोरो',
    ruleChanges: 'नियम बदल रहा है',
    sameField: 'जाल वही है — नया सिर्फ़ नियम है',
    blockOf: '{total} में से {n} खंड',
    seriesDone: 'शृंखला पूरी',
    signSpeed: 'अक्षर खोजने की गति',
    segmentCost: 'शब्द अलग करने की कीमत',
    senseCost: 'अर्थ पहचानने की कीमत',
    notFinished: 'शृंखला अधूरी — अंतर नहीं गिने जाते',
    levelUp: 'तीनों खंड स्थिर: जाल बढ़कर {size}×{size} हुआ',
    heldBy: 'जाल को «{block}» रोक रहा है: लगातार {runs} और साफ़ दौर चाहिए',
    again: 'एक बार और',
    leave: 'बाहर',
    noSense: 'अर्थ वाला खंड श्रेणियों वाले शब्दकोश पर टिका है। फ़िलहाल वह इन भाषाओं में है: {langs}',
  },
  pt: {
    entry: 'Série: três regras na mesma grade de letras',
    startsAt: 'Começamos com uma grade {size}×{size}',
    yourLevels: 'Suas grades: sinal {sign}, palavra {word}, sentido {sense}',
    blockSign: 'Busca do sinal',
    blockWord: 'Busca de palavras',
    blockSense: 'Busca pelo sentido',
    ruleSign: 'Marque todas as casas com a letra {sign}',
    ruleWord: 'Junte todas as palavras — a grade se desmonta inteira',
    ruleSense: 'Junte só as palavras do grupo «{cat}»',
    ruleChanges: 'A regra muda',
    sameField: 'A grade é a mesma — só a regra é nova',
    blockOf: 'Bloco {n} de {total}',
    seriesDone: 'Série concluída',
    signSpeed: 'Velocidade de busca do sinal',
    segmentCost: 'Custo de separar as palavras',
    senseCost: 'Custo do significado',
    notFinished: 'Série incompleta — sem diferenças calculadas',
    levelUp: 'Os três blocos estão estáveis: a grade cresce para {size}×{size}',
    heldBy: 'A grade está presa em «{block}»: faltam {runs} rodadas limpas seguidas',
    again: 'Mais uma vez',
    leave: 'Sair',
    noSense: 'O bloco de sentido vive de um dicionário com categorias. Por enquanto ele existe em: {langs}',
  },
  fr: {
    entry: 'Série : trois règles sur une même grille de lettres',
    startsAt: 'On commence par une grille {size}×{size}',
    yourLevels: 'Tes grilles : signe {sign}, mot {word}, sens {sense}',
    blockSign: 'Recherche du signe',
    blockWord: 'Recherche de mots',
    blockSense: 'Recherche par le sens',
    ruleSign: 'Marque toutes les cases portant la lettre {sign}',
    ruleWord: 'Ramasse tous les mots — la grille se démonte entièrement',
    ruleSense: 'Ne ramasse que les mots du groupe « {cat} »',
    ruleChanges: 'La règle change',
    sameField: 'Même grille — seule la règle est nouvelle',
    blockOf: 'Bloc {n} sur {total}',
    seriesDone: 'Série terminée',
    signSpeed: 'Vitesse de recherche du signe',
    segmentCost: 'Coût du découpage',
    senseCost: 'Coût du sens',
    notFinished: 'Série inachevée — aucune différence calculée',
    levelUp: 'Les trois blocs sont stables : la grille passe à {size}×{size}',
    heldBy: 'La grille est retenue par « {block} » : encore {runs} manches propres d’affilée',
    again: 'Encore une fois',
    leave: 'Quitter',
    noSense: 'Le bloc du sens vit d’un dictionnaire avec catégories. Pour l’instant il existe en : {langs}',
  },
  it: {
    entry: 'Serie: tre regole sulla stessa griglia di lettere',
    startsAt: 'Si parte da una griglia {size}×{size}',
    yourLevels: 'Le tue griglie: segno {sign}, parola {word}, senso {sense}',
    blockSign: 'Ricerca del segno',
    blockWord: 'Ricerca di parole',
    blockSense: 'Ricerca per senso',
    ruleSign: 'Segna tutte le caselle con la lettera {sign}',
    ruleWord: 'Raccogli tutte le parole: la griglia si smonta per intero',
    ruleSense: 'Raccogli solo le parole del gruppo «{cat}»',
    ruleChanges: 'La regola cambia',
    sameField: 'Stessa griglia: cambia solo la regola',
    blockOf: 'Blocco {n} di {total}',
    seriesDone: 'Serie completata',
    signSpeed: 'Velocità di ricerca del segno',
    segmentCost: 'Costo del separare le parole',
    senseCost: 'Costo del significato',
    notFinished: 'Serie incompleta: nessuna differenza calcolata',
    levelUp: 'Tutti e tre i blocchi sono stabili: la griglia sale a {size}×{size}',
    heldBy: 'La griglia è trattenuta da «{block}»: servono altre {runs} prove pulite di fila',
    again: 'Ancora una volta',
    leave: 'Esci',
    noSense: 'Il blocco del senso vive di un dizionario con categorie. Per ora esiste in: {langs}',
  },
  ja: {
    entry: '連続：同じ文字盤で三つのルール',
    startsAt: '{size}×{size} の文字盤から始めます',
    yourLevels: 'あなたの盤：文字 {sign}、語 {word}、意味 {sense}',
    blockSign: '文字を探す',
    blockWord: '語を探す',
    blockSense: '意味で探す',
    ruleSign: '文字 {sign} のマスをすべて押してください',
    ruleWord: '語をすべて集める — 盤は最後まで解けます',
    ruleSense: '「{cat}」の仲間の語だけを集めてください',
    ruleChanges: 'ルールが変わります',
    sameField: '盤は同じ — 変わるのはルールだけ',
    blockOf: '{total} 区分のうち {n} 区分目',
    seriesDone: '連続をやり切りました',
    signSpeed: '文字を探す速さ',
    segmentCost: '語の切り出しの代償',
    senseCost: '意味を見分ける代償',
    notFinished: '連続が途中 — 差は出しません',
    levelUp: '三つとも安定：盤が {size}×{size} に広がります',
    heldBy: '止めているのは「{block}」：あと {runs} 回続けてミスなく',
    again: 'もう一度',
    leave: 'やめる',
    noSense: '意味の区分は分類つきの語彙に頼ります。今あるのは：{langs}',
  },
  ko: {
    entry: '연속: 같은 글자판에서 규칙 셋',
    startsAt: '{size}×{size} 글자판에서 시작합니다',
    yourLevels: '내 판: 글자 {sign}, 낱말 {word}, 뜻 {sense}',
    blockSign: '글자 찾기',
    blockWord: '낱말 찾기',
    blockSense: '뜻으로 찾기',
    ruleSign: '글자 {sign}이 있는 칸을 모두 누르세요',
    ruleWord: '낱말을 모두 모으세요 — 판은 끝까지 풀립니다',
    ruleSense: '«{cat}» 무리의 낱말만 모으세요',
    ruleChanges: '규칙이 바뀝니다',
    sameField: '판은 그대로 — 규칙만 새로',
    blockOf: '{total}단계 중 {n}단계',
    seriesDone: '연속을 마쳤습니다',
    signSpeed: '글자 찾는 속도',
    segmentCost: '낱말을 끊어 내는 비용',
    senseCost: '뜻을 가리는 비용',
    notFinished: '연속이 중간에 끝남 — 차이는 세지 않습니다',
    levelUp: '세 단계 모두 안정: 판이 {size}×{size}로 커집니다',
    heldBy: '판을 붙드는 건 «{block}»: 깨끗한 판 {runs}번 더 연달아',
    again: '한 번 더',
    leave: '나가기',
    noSense: '뜻 단계는 갈래가 붙은 낱말집에 기댑니다. 지금은 이 말들에만 있습니다: {langs}',
  },
  ar: {
    entry: 'سلسلة: ثلاث قواعد على شبكة حروف واحدة',
    startsAt: 'نبدأ بشبكة {size}×{size}',
    yourLevels: 'شبكاتك: الحرف {sign}، الكلمة {word}، المعنى {sense}',
    blockSign: 'البحث عن الحرف',
    blockWord: 'البحث عن الكلمات',
    blockSense: 'البحث بالمعنى',
    ruleSign: 'علّم كل خانة فيها الحرف {sign}',
    ruleWord: 'اجمع كل الكلمات — تُفكّك الشبكة بالكامل',
    ruleSense: 'اجمع كلمات مجموعة «{cat}» فقط',
    ruleChanges: 'القاعدة تتغيّر',
    sameField: 'الشبكة نفسها — الجديد هو القاعدة فقط',
    blockOf: 'المقطع {n} من {total}',
    seriesDone: 'اكتملت السلسلة',
    signSpeed: 'سرعة البحث عن الحرف',
    segmentCost: 'كلفة فصل الكلمات',
    senseCost: 'كلفة تمييز المعنى',
    notFinished: 'السلسلة لم تكتمل — لا تُحسب الفروق',
    levelUp: 'المقاطع الثلاثة ثابتة: تكبر الشبكة إلى {size}×{size}',
    heldBy: 'يوقف الشبكة «{block}»: تلزم {runs} جولات نظيفة متتالية',
    again: 'مرة أخرى',
    leave: 'خروج',
    noSense: 'مقطع المعنى يقوم على معجم بفئات. وهو متوفر حتى الآن في: {langs}',
  },
};

export function getProofSeriesStrings(locale: ProofSeriesLocale): ProofSeriesStrings {
  return STRINGS[locale] ?? STRINGS.en;
}
