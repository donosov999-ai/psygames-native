/* psygames-schulte-series-i18n · VER 1 · 23.08.2026 */
/**
 * СЛОВАРЬ СЕРИИ БЛОКОВ — СРАЗУ НА ВСЕ ДВЕНАДЦАТЬ ЯЗЫКОВ.
 *
 * ⚠️ ПОЧЕМУ НЕ В ОБЩИЙ СЛОВАРЬ ПРИЛОЖЕНИЯ. `src/contexts/LanguageContext.tsx` и
 * `src/contexts/translations/*` правят параллельно другие заходы, и новый ключ
 * там — гарантированный конфликт в файле, который держит все игры. Подписи
 * серии нужны ровно одному экрану, поэтому живут рядом с ним — тем же приёмом,
 * что `dots-connect/core/i18n.ts`, `fillwords/core/i18n.ts` и `n-back/core/i18n.ts`.
 *
 * ⚠️ ДВЕНАДЦАТЬ, А НЕ ДВА. Модуль со словарём на `ru`/`en` выдаёт японцу, корейцу
 * и немцу английский текст посреди переведённого экрана — дыра, ради которой
 * заведён гейт `games-module-i18n`. Полнота, отличие от английского и своя
 * письменность у своей локали сверяются пробой `src/__tests__/schulte-series.test.ts`.
 *
 * ⚠️ ПОРТУГАЛЬСКИЙ — БРАЗИЛЬСКИЙ, как и весь остальной словарь приложения.
 *
 * 🔴 ЧЕГО ЗДЕСЬ НЕЛЬЗЯ ОБЕЩАТЬ. Ни одна подпись не называет разности «оценкой
 * мозга» и не сулит роста внимания: T₂−T₁ — это цена ОДНОГО добавленного правила
 * в ЭТОЙ партии на ЭТОМ поле, и ничего сверх того по ней сказать нельзя.
 * Врабатываемость и психическая устойчивость по этим блокам не считаются вовсе:
 * классические ВР и ПУ берутся с серии таблиц под ОДНИМ правилом, а здесь правило
 * меняется на каждом блоке — числа вышли бы выдуманными.
 */

/** Список ровно как `type Language` приложения (LanguageContext). */
export type SchulteSeriesLocale =
  | 'ru' | 'en' | 'es' | 'de' | 'zh' | 'hi'
  | 'pt' | 'fr' | 'it' | 'ja' | 'ko' | 'ar';

/** Порядок неважен, важна полнота: по нему сверяется словарь в пробе. */
export const SCHULTE_SERIES_LOCALES: readonly SchulteSeriesLocale[] = [
  'ru', 'en', 'es', 'de', 'zh', 'hi', 'pt', 'fr', 'it', 'ja', 'ko', 'ar',
];

export interface SchulteSeriesStrings {
  /** Кнопка входа в серию на экране настроек. */
  entry: string;
  /** С какого поля пойдёт серия. Подставляется {size}. */
  startsAt: string;
  /** Прежние поля блоков — показываются ЯВНО, чтобы старт с минимума не читался как откат. */
  yourLevels: string;
  /** Названия блоков — в врезке, в шапке и в разборе. */
  blockOrder: string;
  blockAlternate: string;
  blockSum: string;
  /** Правило блока: строка на поле и она же во врезке. */
  ruleOrder: string;
  ruleAlternate: string;
  ruleSum: string;
  /** Заголовок врезки между блоками. */
  ruleChanges: string;
  /** Главное, что говорит врезка: поле не менялось. */
  sameField: string;
  /** «Блок {n} из {total}» в шапке партии. */
  blockOf: string;
  /** Заголовок разбора. */
  seriesDone: string;
  /** T₁ — просто время первого блока. */
  speed: string;
  /** T₂ − T₁. */
  switchCost: string;
  /** T₃ − T₁. */
  holdCost: string;
  /** Прерванная серия: блоки записаны, разностей нет. */
  notFinished: string;
  /** Поле выросло: все блоки устойчивы. */
  levelUp: string;
  /** Какой блок держит уровень и сколько чистых прогонов ему ещё нужно. */
  heldBy: string;
  again: string;
  leave: string;
}

const STRINGS: Record<SchulteSeriesLocale, SchulteSeriesStrings> = {
  ru: {
    entry: 'Серия: три правила на одном поле',
    startsAt: 'Начинаем с поля {size}×{size}',
    yourLevels: 'Твои поля: поиск {order}, чередование {alternate}, счёт {sum}',
    blockOrder: 'Поиск по порядку',
    blockAlternate: 'Чередование',
    blockSum: 'Пара на сумму',
    ruleOrder: 'Ищи числа по порядку: от 1 до {last}',
    ruleAlternate: 'Чередуй: 1, потом {last}, потом 2 — то снизу, то сверху',
    ruleSum: 'Ищи две клетки, дающие в сумме {sum}',
    ruleChanges: 'Правило меняется',
    sameField: 'Поле то же самое — новое только правило',
    blockOf: 'Блок {n} из {total}',
    seriesDone: 'Серия пройдена',
    speed: 'Скорость поиска',
    switchCost: 'Цена переключения',
    holdCost: 'Цена удержания в уме',
    notFinished: 'Серия не доиграна — разности не считаем',
    levelUp: 'Все три блока устойчивы: поле растёт до {size}×{size}',
    heldBy: 'Поле держит блок «{block}»: нужно ещё {runs} чистых прогона подряд',
    again: 'Ещё раз',
    leave: 'Выйти',
  },
  en: {
    entry: 'Series: three rules on one grid',
    startsAt: 'Starting at a {size}×{size} grid',
    yourLevels: 'Your grids: search {order}, alternation {alternate}, sums {sum}',
    blockOrder: 'Search in order',
    blockAlternate: 'Alternation',
    blockSum: 'Pair that adds up',
    ruleOrder: 'Find the numbers in order: 1 to {last}',
    ruleAlternate: 'Alternate: 1, then {last}, then 2 — low, high, low',
    ruleSum: 'Find two cells that add up to {sum}',
    ruleChanges: 'The rule changes',
    sameField: 'Same grid — only the rule is new',
    blockOf: 'Block {n} of {total}',
    seriesDone: 'Series complete',
    speed: 'Search speed',
    switchCost: 'Cost of switching',
    holdCost: 'Cost of holding in mind',
    notFinished: 'Series unfinished — no differences counted',
    levelUp: 'All three blocks are stable: the grid grows to {size}×{size}',
    heldBy: 'The grid is held by “{block}”: {runs} more clean runs in a row',
    again: 'Once more',
    leave: 'Leave',
  },
  es: {
    entry: 'Serie: tres reglas en una misma cuadrícula',
    startsAt: 'Empezamos con una cuadrícula de {size}×{size}',
    yourLevels: 'Tus cuadrículas: búsqueda {order}, alternancia {alternate}, sumas {sum}',
    blockOrder: 'Búsqueda en orden',
    blockAlternate: 'Alternancia',
    blockSum: 'Pareja que suma',
    ruleOrder: 'Busca los números en orden: del 1 al {last}',
    ruleAlternate: 'Alterna: 1, luego {last}, luego 2: abajo, arriba, abajo',
    ruleSum: 'Busca dos casillas que sumen {sum}',
    ruleChanges: 'Cambia la regla',
    sameField: 'La misma cuadrícula: solo la regla es nueva',
    blockOf: 'Bloque {n} de {total}',
    seriesDone: 'Serie completada',
    speed: 'Velocidad de búsqueda',
    switchCost: 'Coste de cambiar de regla',
    holdCost: 'Coste de retener en la mente',
    notFinished: 'Serie sin terminar: no se calculan diferencias',
    levelUp: 'Los tres bloques son estables: la cuadrícula crece a {size}×{size}',
    heldBy: 'La cuadrícula la retiene «{block}»: faltan {runs} rondas limpias seguidas',
    again: 'Otra vez',
    leave: 'Salir',
  },
  de: {
    entry: 'Serie: drei Regeln auf einem Feld',
    startsAt: 'Wir starten mit einem {size}×{size}-Feld',
    yourLevels: 'Deine Felder: Suche {order}, Wechsel {alternate}, Summen {sum}',
    blockOrder: 'Suche der Reihe nach',
    blockAlternate: 'Wechsel',
    blockSum: 'Paar mit Summe',
    ruleOrder: 'Finde die Zahlen der Reihe nach: von 1 bis {last}',
    ruleAlternate: 'Wechsle ab: 1, dann {last}, dann 2 — klein, groß, klein',
    ruleSum: 'Finde zwei Felder, die zusammen {sum} ergeben',
    ruleChanges: 'Die Regel wechselt',
    sameField: 'Dasselbe Feld — neu ist nur die Regel',
    blockOf: 'Block {n} von {total}',
    seriesDone: 'Serie geschafft',
    speed: 'Suchtempo',
    switchCost: 'Preis des Umschaltens',
    holdCost: 'Preis des Im-Kopf-Behaltens',
    notFinished: 'Serie nicht zu Ende — keine Differenzen',
    levelUp: 'Alle drei Blöcke sitzen: das Feld wächst auf {size}×{size}',
    heldBy: 'Das Feld hält der Block «{block}»: noch {runs} saubere Durchgänge in Folge',
    again: 'Noch einmal',
    leave: 'Verlassen',
  },
  zh: {
    entry: '连环：同一张表，三条规则',
    startsAt: '从 {size}×{size} 的表开始',
    yourLevels: '你的表：顺序找 {order}，交替 {alternate}，凑和 {sum}',
    blockOrder: '按顺序找',
    blockAlternate: '交替找',
    blockSum: '凑成一对',
    ruleOrder: '按顺序找数字：从 1 到 {last}',
    ruleAlternate: '交替来：先 1，再 {last}，再 2 —— 一小一大',
    ruleSum: '找出相加等于 {sum} 的两格',
    ruleChanges: '规则要变了',
    sameField: '表还是这张 —— 变的只是规则',
    blockOf: '第 {n} 段，共 {total} 段',
    seriesDone: '连环完成',
    speed: '搜索速度',
    switchCost: '切换的代价',
    holdCost: '心里记住的代价',
    notFinished: '连环没做完 —— 不计算差值',
    levelUp: '三段都稳了：表增大到 {size}×{size}',
    heldBy: '卡住的是「{block}」：还需要连续 {runs} 次干净完成',
    again: '再来一次',
    leave: '离开',
  },
  hi: {
    entry: 'शृंखला: एक ही जाल पर तीन नियम',
    startsAt: '{size}×{size} जाल से शुरू करते हैं',
    yourLevels: 'तुम्हारे जाल: क्रम {order}, अदल-बदल {alternate}, जोड़ {sum}',
    blockOrder: 'क्रम से खोज',
    blockAlternate: 'अदल-बदल',
    blockSum: 'जोड़ वाली जोड़ी',
    ruleOrder: 'अंक क्रम से खोजो: 1 से {last} तक',
    ruleAlternate: 'बदल-बदल कर: 1, फिर {last}, फिर 2 — छोटा, बड़ा, छोटा',
    ruleSum: 'ऐसे दो खाने खोजो जिनका जोड़ {sum} हो',
    ruleChanges: 'नियम बदल रहा है',
    sameField: 'जाल वही है — नया सिर्फ़ नियम है',
    blockOf: '{total} में से {n} खंड',
    seriesDone: 'शृंखला पूरी',
    speed: 'खोज की गति',
    switchCost: 'नियम बदलने की कीमत',
    holdCost: 'मन में रखने की कीमत',
    notFinished: 'शृंखला अधूरी — अंतर नहीं गिने जाते',
    levelUp: 'तीनों खंड स्थिर: जाल बढ़कर {size}×{size} हुआ',
    heldBy: 'जाल को «{block}» रोक रहा है: लगातार {runs} और साफ़ दौर चाहिए',
    again: 'एक बार और',
    leave: 'बाहर',
  },
  pt: {
    entry: 'Série: três regras na mesma grade',
    startsAt: 'Começamos com uma grade {size}×{size}',
    yourLevels: 'Suas grades: busca {order}, alternância {alternate}, somas {sum}',
    blockOrder: 'Busca em ordem',
    blockAlternate: 'Alternância',
    blockSum: 'Par que soma',
    ruleOrder: 'Procure os números em ordem: de 1 até {last}',
    ruleAlternate: 'Alterne: 1, depois {last}, depois 2 — embaixo, em cima, embaixo',
    ruleSum: 'Procure duas casas que somem {sum}',
    ruleChanges: 'A regra muda',
    sameField: 'A grade é a mesma — só a regra é nova',
    blockOf: 'Bloco {n} de {total}',
    seriesDone: 'Série concluída',
    speed: 'Velocidade de busca',
    switchCost: 'Custo de alternar',
    holdCost: 'Custo de manter na cabeça',
    notFinished: 'Série incompleta — sem diferenças calculadas',
    levelUp: 'Os três blocos estão estáveis: a grade cresce para {size}×{size}',
    heldBy: 'A grade está presa em «{block}»: faltam {runs} rodadas limpas seguidas',
    again: 'Mais uma vez',
    leave: 'Sair',
  },
  fr: {
    entry: 'Série : trois règles sur une même grille',
    startsAt: 'On commence par une grille {size}×{size}',
    yourLevels: 'Tes grilles : recherche {order}, alternance {alternate}, sommes {sum}',
    blockOrder: 'Recherche dans l’ordre',
    blockAlternate: 'Alternance',
    blockSum: 'Paire qui fait la somme',
    ruleOrder: 'Trouve les nombres dans l’ordre : de 1 à {last}',
    ruleAlternate: 'Alterne : 1, puis {last}, puis 2 — en bas, en haut, en bas',
    ruleSum: 'Trouve deux cases dont la somme fait {sum}',
    ruleChanges: 'La règle change',
    sameField: 'Même grille — seule la règle est nouvelle',
    blockOf: 'Bloc {n} sur {total}',
    seriesDone: 'Série terminée',
    speed: 'Vitesse de recherche',
    switchCost: 'Coût du changement',
    holdCost: 'Coût du calcul mental',
    notFinished: 'Série inachevée — aucune différence calculée',
    levelUp: 'Les trois blocs sont stables : la grille passe à {size}×{size}',
    heldBy: 'La grille est retenue par « {block} » : encore {runs} manches propres d’affilée',
    again: 'Encore une fois',
    leave: 'Quitter',
  },
  it: {
    entry: 'Serie: tre regole sulla stessa griglia',
    startsAt: 'Si parte da una griglia {size}×{size}',
    yourLevels: 'Le tue griglie: ricerca {order}, alternanza {alternate}, somme {sum}',
    blockOrder: 'Ricerca in ordine',
    blockAlternate: 'Alternanza',
    blockSum: 'Coppia che somma',
    ruleOrder: 'Cerca i numeri in ordine: da 1 a {last}',
    ruleAlternate: 'Alterna: 1, poi {last}, poi 2 — sotto, sopra, sotto',
    ruleSum: 'Cerca due caselle che diano {sum}',
    ruleChanges: 'La regola cambia',
    sameField: 'Stessa griglia: cambia solo la regola',
    blockOf: 'Blocco {n} di {total}',
    seriesDone: 'Serie completata',
    speed: 'Velocità di ricerca',
    switchCost: 'Costo del cambio',
    holdCost: 'Costo del tenere a mente',
    notFinished: 'Serie incompleta: nessuna differenza calcolata',
    levelUp: 'Tutti e tre i blocchi sono stabili: la griglia sale a {size}×{size}',
    heldBy: 'La griglia è trattenuta da «{block}»: servono altre {runs} prove pulite di fila',
    again: 'Ancora una volta',
    leave: 'Esci',
  },
  ja: {
    entry: '連続：同じ盤で三つのルール',
    startsAt: '{size}×{size} の盤から始めます',
    yourLevels: 'あなたの盤：順番 {order}、交互 {alternate}、和 {sum}',
    blockOrder: '順番に探す',
    blockAlternate: '交互に探す',
    blockSum: '和になる二つ',
    ruleOrder: '数字を順番に探す：1 から {last} まで',
    ruleAlternate: '交互に：1、次に {last}、次に 2 — 小さい方と大きい方',
    ruleSum: '足して {sum} になるマスを二つ探す',
    ruleChanges: 'ルールが変わります',
    sameField: '盤は同じ — 変わるのはルールだけ',
    blockOf: '{total} 区分のうち {n} 区分目',
    seriesDone: '連続をやり切りました',
    speed: '探す速さ',
    switchCost: '切り替えの代償',
    holdCost: '頭に置いておく代償',
    notFinished: '連続が途中 — 差は出しません',
    levelUp: '三つとも安定：盤が {size}×{size} に広がります',
    heldBy: '止めているのは「{block}」：あと {runs} 回続けてミスなく',
    again: 'もう一度',
    leave: 'やめる',
  },
  ko: {
    entry: '연속: 같은 판에서 규칙 셋',
    startsAt: '{size}×{size} 판에서 시작합니다',
    yourLevels: '내 판: 순서 {order}, 번갈아 {alternate}, 합 {sum}',
    blockOrder: '순서대로 찾기',
    blockAlternate: '번갈아 찾기',
    blockSum: '합이 되는 짝',
    ruleOrder: '숫자를 순서대로: 1부터 {last}까지',
    ruleAlternate: '번갈아: 1, 다음 {last}, 다음 2 — 작은 쪽과 큰 쪽',
    ruleSum: '더해서 {sum}이 되는 칸 두 개를 찾으세요',
    ruleChanges: '규칙이 바뀝니다',
    sameField: '판은 그대로 — 규칙만 새로',
    blockOf: '{total}단계 중 {n}단계',
    seriesDone: '연속을 마쳤습니다',
    speed: '찾는 속도',
    switchCost: '전환의 비용',
    holdCost: '머릿속에 붙드는 비용',
    notFinished: '연속이 중간에 끝남 — 차이는 세지 않습니다',
    levelUp: '세 단계 모두 안정: 판이 {size}×{size}로 커집니다',
    heldBy: '판을 붙드는 건 «{block}»: 깨끗한 판 {runs}번 더 연달아',
    again: '한 번 더',
    leave: '나가기',
  },
  ar: {
    entry: 'سلسلة: ثلاث قواعد على شبكة واحدة',
    startsAt: 'نبدأ بشبكة {size}×{size}',
    yourLevels: 'شبكاتك: البحث {order}، التناوب {alternate}، الجمع {sum}',
    blockOrder: 'بحث بالترتيب',
    blockAlternate: 'تناوب',
    blockSum: 'زوج بمجموع',
    ruleOrder: 'ابحث عن الأرقام بالترتيب: من 1 إلى {last}',
    ruleAlternate: 'ناوب: 1 ثم {last} ثم 2 — صغير فكبير',
    ruleSum: 'ابحث عن خانتين مجموعهما {sum}',
    ruleChanges: 'القاعدة تتغيّر',
    sameField: 'الشبكة نفسها — الجديد هو القاعدة فقط',
    blockOf: 'المقطع {n} من {total}',
    seriesDone: 'اكتملت السلسلة',
    speed: 'سرعة البحث',
    switchCost: 'كلفة التبديل',
    holdCost: 'كلفة الاحتفاظ في الذهن',
    notFinished: 'السلسلة لم تكتمل — لا تُحسب الفروق',
    levelUp: 'المقاطع الثلاثة ثابتة: تكبر الشبكة إلى {size}×{size}',
    heldBy: 'يوقف الشبكة «{block}»: تلزم {runs} جولات نظيفة متتالية',
    again: 'مرة أخرى',
    leave: 'خروج',
  },
};

export function getSchulteSeriesStrings(locale: SchulteSeriesLocale): SchulteSeriesStrings {
  return STRINGS[locale] ?? STRINGS.en;
}

export function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  ));
}
