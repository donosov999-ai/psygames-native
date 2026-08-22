/* psygames-fillwords-i18n · VER 1 · 22.08.2026 */
/**
 * СЛОВАРЬ ПОДПИСЕЙ ФИЛВОРДОВ — ВСЕ ДВЕНАДЦАТЬ ЯЗЫКОВ ПРИЛОЖЕНИЯ.
 *
 * ⚠️ ПОЧЕМУ ЗДЕСЬ, А НЕ В ОБЩЕМ СЛОВАРЕ. Базовые ru/en общего словаря лежат
 * ИНЛАЙНОМ в `src/contexts/LanguageContext.tsx`, а десять переводов — в
 * `src/contexts/translations/*.ts`. Ключ, заведённый только в переводах, роняет
 * гейт `dictionary-duplicates` («осиротевший ключ»), а править LanguageContext
 * этому заходу нельзя — файл держат параллельные правки соседних игр. Тот же
 * выбор и по той же причине уже сделан пятью лабораторными играми
 * (`memory-palace`, `one-line`, `navigator`, `object-tracker`, `rhythm-pitch`):
 * текст ВНУТРИ партии живёт в модуле игры и знает все двенадцать языков.
 *
 * ⚠️ ЧТО БЕРЁТСЯ ИЗ ОБЩЕГО СЛОВАРЯ, А НЕ ДУБЛИРУЕТСЯ ЗДЕСЬ. Всё, что уже
 * переведено: «Найдите» (`find`), «Подсказка» (`btn_hint`), «Найдено»
 * (`label_found`), «Уровень» (`level`), «Начать» (`start`), название самой
 * корректурной пробы (`proofreading`). Заводить им вторые имена значило бы
 * получить на соседних экранах два перевода одного слова — ровно та беда, из-за
 * которой в приложении и завели гейт на дубли ключей.
 *
 * ⚠️ ПОЛНОТА ПРОВЕРЯЕТСЯ ИСПОЛНЕНИЕМ. `fillwords-i18n.test.ts` сверяет список
 * языков с типом `Language` из LanguageContext (читая файл, а не переписывая
 * список сюда), требует своей письменности у ru/zh/ja/ko/ar/hi, запрещает
 * английские копии и мёртвые ключи. Список, переписанный руками, протух бы на
 * первом же добавленном языке — и молча.
 */

export interface FillwordsStrings {
  /** Название режима — на кнопке выбора и в объяснении, где режима нет. */
  modeName: string;
  /** Строка «что делать» над полем. */
  task: string;
  /** Правило целиком — на экране настройки, до начала партии. */
  rules: string;
  /** Параметры уровня: размер поля, число слов, лимит времени. */
  levelLine: string;
  /** Критерий прохождения уровня. */
  pass: string;
  /**
   * Честный отказ: словаря на этом языке нет, вот языки, где он есть.
   *
   * ⚠️ Счётчиков «слов» и «букв» здесь НЕТ намеренно: их подписи берутся из
   * общего словаря приложения (`label_words`, `label_letters`) — они там уже
   * переведены на все двенадцать, и заводить им вторые имена значило бы
   * получить на соседних экранах два перевода одного слова.
   */
  noDictionary: string;
}

const STRINGS: Record<string, FillwordsStrings> = {
  ru: {
    modeName: 'Филворды',
    task: 'Ведите пальцем по соседним буквам — слово выделится',
    rules: 'Слово берут протягиванием по соседним клеткам: линия гнётся в любую сторону, включая диагональ. Лишних букв на поле нет — уровень закрыт, когда разобрана последняя.',
    levelLine: 'Поле {rows}×{cols} · слов: {words} · ⏱ {sec} с',
    pass: 'Проход уровня: разобрать все буквы до конца времени',
    noDictionary: 'Филвордам нужен словарь вашего языка, а его пока нет. Языки со словарём: {langs}',
  },
  en: {
    modeName: 'Fillwords',
    task: 'Drag across neighbouring letters — the word lights up',
    rules: 'Take a word by dragging across neighbouring cells: the line may bend any way, diagonals included. The grid holds no spare letters — the level ends when the last one is taken.',
    levelLine: 'Grid {rows}×{cols} · words: {words} · ⏱ {sec} s',
    pass: 'To pass: take every letter before the time runs out',
    noDictionary: 'Fillwords needs a word list for your language and there is none yet. Languages that have one: {langs}',
  },
  es: {
    modeName: 'Sopa de letras',
    task: 'Desliza el dedo por letras vecinas: la palabra se enciende',
    rules: 'Toma una palabra deslizando por casillas vecinas: la línea puede girar hacia cualquier lado, también en diagonal. No hay letras de sobra: el nivel termina cuando no queda ninguna.',
    levelLine: 'Tablero {rows}×{cols} · palabras: {words} · ⏱ {sec} s',
    pass: 'Para superarlo: retira todas las letras antes de que se acabe el tiempo',
    noDictionary: 'La sopa de letras necesita un listado de palabras en tu idioma y todavía no existe. Idiomas que sí lo tienen: {langs}',
  },
  pt: {
    modeName: 'Caça-palavras',
    task: 'Arraste o dedo por letras vizinhas: a palavra acende',
    rules: 'Pegue uma palavra arrastando por casas vizinhas: a linha pode virar para qualquer lado, inclusive na diagonal. Não há letras sobrando — o nível acaba quando não resta nenhuma.',
    levelLine: 'Tabuleiro {rows}×{cols} · palavras: {words} · ⏱ {sec} s',
    pass: 'Para passar: retire todas as letras antes de o tempo acabar',
    noDictionary: 'O caça-palavras precisa de uma lista de palavras no seu idioma e ela ainda não existe. Idiomas que têm uma: {langs}',
  },
  de: {
    modeName: 'Wortgitter',
    task: 'Mit dem Finger über benachbarte Buchstaben ziehen — das Wort leuchtet auf',
    rules: 'Ein Wort nimmst du, indem du über benachbarte Felder ziehst: die Linie darf in jede Richtung knicken, auch diagonal. Überflüssige Buchstaben gibt es nicht — die Stufe endet mit dem letzten genommenen Buchstaben.',
    levelLine: 'Gitter {rows}×{cols} · Wörter: {words} · ⏱ {sec} s',
    pass: 'Geschafft, wenn jeder Buchstabe vor Ablauf der Zeit weg ist',
    noDictionary: 'Das Wortgitter braucht eine Wortliste in deiner Sprache, und die gibt es noch nicht. Sprachen mit Liste: {langs}',
  },
  fr: {
    modeName: 'Mots mêlés',
    task: 'Faites glisser le doigt sur des lettres voisines — le mot s’allume',
    rules: 'Prenez un mot en glissant sur des cases voisines : la ligne peut tourner dans tous les sens, diagonales comprises. Aucune lettre en trop — le niveau se termine avec la dernière lettre prise.',
    levelLine: 'Grille {rows}×{cols} · mots : {words} · ⏱ {sec} s',
    pass: 'Réussi lorsque toutes les lettres sont retirées avant la fin du temps',
    noDictionary: 'Les mots mêlés ont besoin d’une liste de mots dans votre langue, et elle n’existe pas encore. Langues qui en ont une : {langs}',
  },
  it: {
    modeName: 'Parole intrecciate',
    task: 'Trascina il dito sulle lettere vicine: la parola si illumina',
    rules: 'Prendi una parola trascinando sulle caselle vicine: la linea può piegarsi in ogni direzione, diagonali comprese. Non ci sono lettere in più — il livello finisce con l’ultima lettera presa.',
    levelLine: 'Griglia {rows}×{cols} · parole: {words} · ⏱ {sec} s',
    pass: 'Superi il livello se togli tutte le lettere prima che scada il tempo',
    noDictionary: 'Le parole intrecciate richiedono un elenco di parole nella tua lingua, che non esiste ancora. Lingue che ce l’hanno: {langs}',
  },
  ja: {
    modeName: '文字埋めパズル',
    task: '隣り合う文字を指でなぞると単語が光ります',
    rules: '隣り合うマスを指でなぞって単語を取ります。線は斜めを含め、どの向きにも曲がれます。余分な文字はありません。最後の一文字を取るとレベル終了です。',
    levelLine: '盤面 {rows}×{cols} · 単語 {words} · ⏱ {sec} 秒',
    pass: 'クリア条件：制限時間内にすべての文字を取り切ること',
    noDictionary: 'この遊び方にはお使いの言語の単語集が必要ですが、まだありません。単語集のある言語：{langs}',
  },
  ko: {
    modeName: '글자 채우기',
    task: '이웃한 글자를 손가락으로 이어 보세요 — 단어가 켜집니다',
    rules: '이웃한 칸을 이어서 단어를 가져갑니다. 선은 대각선을 포함해 어느 방향으로든 꺾일 수 있습니다. 남는 글자는 없으며, 마지막 글자를 가져가면 단계가 끝납니다.',
    levelLine: '판 {rows}×{cols} · 단어 {words}개 · ⏱ {sec}초',
    pass: '통과 조건: 시간이 끝나기 전에 모든 글자를 가져가기',
    noDictionary: '이 모드에는 사용 중인 언어의 단어 목록이 필요하지만 아직 없습니다. 목록이 있는 언어: {langs}',
  },
  zh: {
    modeName: '填字寻词',
    task: '用手指连划相邻的字母，单词就会亮起',
    rules: '沿相邻的方格滑动即可取走一个单词：线条可以朝任意方向拐弯，包括对角线。棋盘上没有多余字母——取走最后一个字母即过关。',
    levelLine: '棋盘 {rows}×{cols} · 单词 {words} 个 · ⏱ {sec} 秒',
    pass: '过关条件：在时间结束前取走全部字母',
    noDictionary: '该玩法需要你所用语言的词表，目前还没有。已有词表的语言：{langs}',
  },
  hi: {
    modeName: 'शब्द खोज',
    task: 'पास-पास के अक्षरों पर उँगली फेरें — शब्द जगमगा उठेगा',
    rules: 'शब्द लेने के लिए पास-पास के खानों पर उँगली फेरें: रेखा किसी भी ओर मुड़ सकती है, तिरछी भी। यहाँ फालतू अक्षर नहीं हैं — आखिरी अक्षर उठते ही स्तर पूरा हो जाता है।',
    levelLine: 'पट {rows}×{cols} · शब्द: {words} · ⏱ {sec} से.',
    pass: 'पास होने के लिए: समय खत्म होने से पहले सभी अक्षर हटाएँ',
    noDictionary: 'इस खेल के लिए आपकी भाषा की शब्द-सूची चाहिए, जो अभी मौजूद नहीं है। जिन भाषाओं में सूची है: {langs}',
  },
  ar: {
    modeName: 'شبكة الكلمات',
    task: 'مرّر إصبعك على الحروف المتجاورة فتضيء الكلمة',
    rules: 'خذ الكلمة بتمرير إصبعك على الخانات المتجاورة: يمكن للخط أن ينعطف في أي اتجاه، بما في ذلك القطري. لا توجد حروف زائدة — تنتهي المرحلة بأخذ آخر حرف.',
    levelLine: 'الشبكة {rows}×{cols} · الكلمات: {words} · ⏱ {sec} ث',
    pass: 'تُجتاز المرحلة بأخذ كل الحروف قبل انتهاء الوقت',
    noDictionary: 'تحتاج هذه اللعبة إلى قائمة كلمات بلغتك، وهي غير متوفرة بعد. اللغات التي تتوفر لها قائمة: {langs}',
  },
};

/** Языки, на которых написан ИНТЕРФЕЙС режима (не путать с языками слов). */
export const FILLWORDS_UI_LOCALES: string[] = Object.keys(STRINGS).sort();

/** Подписи режима. Неизвестный язык → английский: пусто человеку не покажем. */
export function getFillwordsStrings(locale: string): FillwordsStrings {
  return STRINGS[locale] ?? STRINGS.en;
}

/** Подстановка `{name}` значениями. Незнакомая подстановка остаётся как есть —
 *  так опечатка в имени видна на экране, а не превращается в пустоту. */
export function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  ));
}
