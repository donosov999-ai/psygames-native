/* psygames-navigator-i18n · VER 2 · 19.08.2026 */
/**
 * СВОЙ СЛОВАРЬ МОДУЛЯ «Навигатор» — НА ВСЕ ДВЕНАДЦАТЬ ЯЗЫКОВ (VER 2).
 *
 * 🔴 ЧТО БЫЛО СЛОМАНО. Модуль пришёл из лаборатории со словарём на `ru` и `en`.
 * У приложения языков двенадцать, и `getNavigatorStrings('ja')` молча падал на
 * английский: японец видел на кнопках «North-east», «Study the route», «Landmark
 * 2». Гейт ci-i18n-hardcode-guard эту дыру не ловит — он смотрит только в
 * `app/games/*`, а словарь модуля живёт в `src/games`.
 *
 * 🔴 ЗДЕСЬ ПЕРЕВЕДЕНЫ НЕ ТОЛЬКО ФРАЗЫ, НО И ЧЕТЫРЕ НАБОРА ПОДПИСЕЙ. Направления
 * (`DIRECTION_LABELS`), повороты (`TURN_LABELS`), стороны света
 * (`HOME_LABELS`) и режимы (`MODE_LABELS`) — это ПОДПИСИ КНОПОК ОТВЕТА, то есть
 * самое читаемое место игры. Английский «South-west» на корейской кнопке — не
 * косметика: человек отвечает вслепую.
 *
 * ⚠️ НАПРАВЛЕНИЯ ЭКРАНА ≠ СТОРОНЫ СВЕТА, И ЭТО РАЗНЫЕ СЛОВА. `DIRECTION_LABELS`
 * подписывают движение ПО ЭКРАНУ («Вверх», 上, Oben), а `HOME_LABELS` —
 * направление на старт по компасу («Север», 北, Norden). В английском обе шкалы
 * читаются легко, поэтому соблазн подписать всё сторонами света велик; в
 * японском и корейском это дало бы «北へ進む» там, где человек просто ведёт
 * палец вверх по сетке.
 *
 * ⚠️ ПОРТУГАЛЬСКИЙ — БРАЗИЛЬСКИЙ: `Leste`, а не `Este`; `trajeto`, а не
 * `trajecto`.
 *
 * 🔴 VER 2: УБРАНЫ ДЕВЯТЬ МЁРТВЫХ КЛЮЧЕЙ. При интеграции у модуля забрали СВОЙ
 * экран итога (итог рисует общий LevelCleared — иначе не запишутся звёзды и
 * серия), а строки от него остались лежать: `resultTitle`, `playAgain`,
 * `noAutoAdvance`, `routeAccuracy`, `extraSteps`, `angularError`,
 * `turnAccuracy`, `duration`, `seed`. Ни одну из них ни разу не показали.
 * Строка, переведённая на двенадцать языков и не выведенная ни разу, — это не
 * запас, а ложное «переведено». Что мёртвых ключей нет, держит гейт
 * games-module-i18n.
 */
import type {
  CardinalDirection,
  HomeSector,
  NavigatorLocale,
  NavigatorMode,
  TurnInstruction,
} from './types';

export interface NavigatorStrings {
  title: string;
  /**
   * Описание игры для карточки и экрана настроек. Канон ru/en от автора модуля —
   * ровно тот текст, который уедет в общий словарь ключом `navigatorDesc`
   * (см. INTEGRATION.md §2). Держим его здесь, чтобы у слова был один источник:
   * пока ключа в словаре нет, экран берёт текст отсюда.
   */
  catalogDesc: string;
  skill: string;
  rulesTitle: string;
  rulesBody: string;
  routeRecallRule: string;
  turnSequenceRule: string;
  homeDirectionRule: string;
  progressionInfo: string;
  start: string;
  study: string;
  recall: string;
  delay: string;
  delayBody: string;
  continue: string;
  ready: string;
  pause: string;
  resume: string;
  restart: string;
  exit: string;
  grid: string;
  routeProgress: string;
  turnProgress: string;
  routePrompt: string;
  turnPrompt: string;
  homePrompt: string;
  swipeHint: string;
  mapHidden: string;
  startCell: string;
  finishCell: string;
  currentCell: string;
  routeCell: string;
  falseBranch: string;
  landmark: string;
  keyboardHelp: string;
}

const STRINGS: Record<NavigatorLocale, NavigatorStrings> = {
  ru: {
    title: 'Навигатор',
    catalogDesc: 'Запоминайте маршруты, последовательности поворотов и направление к старту.',
    skill: 'Пространственная навигация и мысленная карта',
    rulesTitle: 'Три способа держать маршрут в уме',
    rulesBody: 'Логический маршрут остаётся тем же, даже когда карта повёрнута.',
    routeRecallRule: 'Маршрут: изучите путь, затем повторите направления без линии.',
    turnSequenceRule: 'Повороты: запомните лево, прямо и право, затем воспроизведите.',
    homeDirectionRule: 'Домой: после маршрута укажите направление к стартовой клетке.',
    progressionInfo: 'После обучения появляются ориентиры, ложные ветви, поворот, скрытая карта и пауза на воспоминание.',
    start: 'Начать раунд',
    study: 'Изучите маршрут',
    recall: 'Восстановите маршрут',
    delay: 'Удержите карту в уме',
    delayBody: 'Маршрут скрыт. Сохраните его мысленный образ перед ответом.',
    continue: 'Продолжить',
    ready: 'Готов — перейти к ответу',
    pause: 'Пауза',
    resume: 'Продолжить',
    restart: 'Начать заново',
    exit: 'Выйти',
    grid: 'Сетка {size}×{size} · маршрут {steps}',
    routeProgress: 'Шаг {current} из {total}',
    turnProgress: 'Поворот {current} из {total}',
    routePrompt: 'Выберите следующее направление на экране',
    turnPrompt: 'Какой поворот был следующим?',
    homePrompt: 'В каком направлении находится старт?',
    swipeHint: 'Можно нажать кнопку, клавишу или провести по полю.',
    mapHidden: 'Карта скрыта на этом уровне.',
    startCell: 'Старт',
    finishCell: 'Финиш',
    currentCell: 'Текущая позиция',
    routeCell: 'Шаг маршрута {index}',
    falseBranch: 'Ложная ветвь',
    landmark: 'Ориентир {index}',
    keyboardHelp: 'Стрелки/WASD — направления; ←/↑/→ — повороты; NumPad 1–9 — восемь направлений домой. P — пауза, R — перезапуск.',
  },
  en: {
    title: 'Navigator',
    catalogDesc: 'Remember routes, turn sequences, and the direction back to the start.',
    skill: 'Spatial navigation and mental mapping',
    rulesTitle: 'Three ways to hold a route in mind',
    rulesBody: 'The logical route stays the same even when the map rotates.',
    routeRecallRule: 'Route Recall: study a path, then repeat its directions without the line.',
    turnSequenceRule: 'Turn Sequence: remember left, straight, and right, then reproduce them.',
    homeDirectionRule: 'Home Direction: after the route, point toward the starting cell.',
    progressionInfo: 'After tutorials, landmarks, false branches, rotation, hidden maps, and a recall delay appear.',
    start: 'Start round',
    study: 'Study the route',
    recall: 'Recall the route',
    delay: 'Hold the map in mind',
    delayBody: 'The route is hidden. Keep its mental image before answering.',
    continue: 'Continue',
    ready: 'Ready — answer',
    pause: 'Paused',
    resume: 'Resume',
    restart: 'Restart',
    exit: 'Exit',
    grid: '{size}×{size} grid · {steps}-step route',
    routeProgress: 'Step {current} of {total}',
    turnProgress: 'Turn {current} of {total}',
    routePrompt: 'Choose the next screen direction',
    turnPrompt: 'Which turn came next?',
    homePrompt: 'Which direction leads to the start?',
    swipeHint: 'Use a button, keyboard key, or swipe across the field.',
    mapHidden: 'The map is hidden at this level.',
    startCell: 'Start',
    finishCell: 'Finish',
    currentCell: 'Current position',
    routeCell: 'Route step {index}',
    falseBranch: 'False branch',
    landmark: 'Landmark {index}',
    keyboardHelp: 'Arrows/WASD choose directions; ←/↑/→ choose turns; Numpad 1–9 chooses eight home directions. P pauses; R restarts.',
  },
  es: {
    title: 'Navegante',
    catalogDesc: 'Memoriza recorridos, secuencias de giros y la dirección de vuelta al inicio.',
    skill: 'Navegación espacial y mapa mental',
    rulesTitle: 'Tres formas de sostener un recorrido en la cabeza',
    rulesBody: 'El recorrido lógico sigue siendo el mismo aunque el mapa gire.',
    routeRecallRule: 'Recorrido: estudia el camino y luego repite las direcciones sin la línea.',
    turnSequenceRule: 'Giros: memoriza izquierda, recto y derecha, y luego reprodúcelos.',
    homeDirectionRule: 'Al inicio: después del recorrido, señala hacia la casilla de partida.',
    progressionInfo: 'Tras el tutorial aparecen puntos de referencia, ramas falsas, rotación, mapa oculto y una pausa para recordar.',
    start: 'Empezar la ronda',
    study: 'Estudia el recorrido',
    recall: 'Reconstruye el recorrido',
    delay: 'Sostén el mapa en la cabeza',
    delayBody: 'El recorrido está oculto. Conserva su imagen mental antes de responder.',
    continue: 'Continuar',
    ready: 'Listo — voy a responder',
    pause: 'Pausa',
    resume: 'Continuar',
    restart: 'Reiniciar',
    exit: 'Salir',
    grid: 'Cuadrícula {size}×{size} · recorrido de {steps}',
    routeProgress: 'Paso {current} de {total}',
    turnProgress: 'Giro {current} de {total}',
    routePrompt: 'Elige la siguiente dirección en la pantalla',
    turnPrompt: '¿Qué giro venía después?',
    homePrompt: '¿En qué dirección queda la salida?',
    swipeHint: 'Puedes pulsar un botón, una tecla o deslizar por el tablero.',
    mapHidden: 'En este nivel el mapa está oculto.',
    startCell: 'Salida',
    finishCell: 'Meta',
    currentCell: 'Posición actual',
    routeCell: 'Paso {index} del recorrido',
    falseBranch: 'Rama falsa',
    landmark: 'Referencia {index}',
    keyboardHelp: 'Flechas/WASD para las direcciones; ←/↑/→ para los giros; teclado numérico 1–9 para las ocho direcciones a la salida. P pausa; R reinicia.',
  },
  de: {
    title: 'Navigator',
    catalogDesc: 'Merke dir Wege, Abbiegefolgen und die Richtung zurück zum Start.',
    skill: 'Räumliche Orientierung und Karte im Kopf',
    rulesTitle: 'Drei Wege, eine Route im Kopf zu behalten',
    rulesBody: 'Die logische Route bleibt dieselbe, auch wenn die Karte gedreht wird.',
    routeRecallRule: 'Weg: präge dir den Pfad ein und gib die Richtungen dann ohne Linie wieder.',
    turnSequenceRule: 'Abbiegen: merke dir links, geradeaus und rechts und gib es wieder.',
    homeDirectionRule: 'Zum Start: zeige nach dem Weg in Richtung des Startfeldes.',
    progressionInfo: 'Nach den Übungsstufen kommen Landmarken, falsche Abzweige, Drehung, verdeckte Karte und eine Denkpause dazu.',
    start: 'Runde starten',
    study: 'Präge dir den Weg ein',
    recall: 'Gib den Weg wieder',
    delay: 'Halte die Karte im Kopf',
    delayBody: 'Der Weg ist verdeckt. Behalte sein Bild im Kopf, bevor du antwortest.',
    continue: 'Weiter',
    ready: 'Bereit — zur Antwort',
    pause: 'Pause',
    resume: 'Fortsetzen',
    restart: 'Neu starten',
    exit: 'Beenden',
    grid: 'Raster {size}×{size} · Weg über {steps}',
    routeProgress: 'Schritt {current} von {total}',
    turnProgress: 'Abbiegen {current} von {total}',
    routePrompt: 'Wähle die nächste Richtung auf dem Bildschirm',
    turnPrompt: 'Welches Abbiegen kam als Nächstes?',
    homePrompt: 'In welcher Richtung liegt der Start?',
    swipeHint: 'Nimm einen Knopf, eine Taste oder wische über das Feld.',
    mapHidden: 'Auf dieser Stufe ist die Karte verdeckt.',
    startCell: 'Start',
    finishCell: 'Ziel',
    currentCell: 'Aktuelle Position',
    routeCell: 'Wegschritt {index}',
    falseBranch: 'Falscher Abzweig',
    landmark: 'Landmarke {index}',
    keyboardHelp: 'Pfeile/WASD wählen Richtungen; ←/↑/→ wählen das Abbiegen; Ziffernblock 1–9 wählt die acht Richtungen zum Start. P pausiert; R startet neu.',
  },
  zh: {
    title: '领航员',
    catalogDesc: '记住路线、转弯的顺序，以及回到起点的方向。',
    skill: '空间定位与心里的地图',
    rulesTitle: '把路线记在心里的三种办法',
    rulesBody: '就算地图转了方向，路线本身还是那条路线。',
    routeRecallRule: '路线：先看清走法，再在没有线的情况下把方向重走一遍。',
    turnSequenceRule: '转弯：记住左、直、右的顺序，然后照着做一遍。',
    homeDirectionRule: '回起点：走完路线后，指出起点格子在哪个方向。',
    progressionInfo: '过了教学关，会出现地标、假岔路、旋转、藏起来的地图，还有一段回想的停顿。',
    start: '开始本轮',
    study: '记住这条路线',
    recall: '把路线复原',
    delay: '把地图记在心里',
    delayBody: '路线已经藏起来了。回答之前先在心里把它留住。',
    continue: '继续',
    ready: '准备好了——开始作答',
    pause: '暂停',
    resume: '继续',
    restart: '重新开始',
    exit: '退出',
    grid: '{size}×{size} 网格 · {steps} 步路线',
    routeProgress: '第 {current} 步，共 {total} 步',
    turnProgress: '第 {current} 个转弯，共 {total} 个',
    routePrompt: '选出屏幕上的下一个方向',
    turnPrompt: '接下来是哪个转弯？',
    homePrompt: '起点在哪个方向？',
    swipeHint: '可以点按钮、按键，也可以在盘面上划一下。',
    mapHidden: '这一关的地图是藏起来的。',
    startCell: '起点',
    finishCell: '终点',
    currentCell: '当前位置',
    routeCell: '路线第 {index} 步',
    falseBranch: '假岔路',
    landmark: '地标 {index}',
    keyboardHelp: '方向键/WASD 选方向；←/↑/→ 选转弯；小键盘 1–9 选回起点的八个方向。P 暂停，R 重来。',
  },
  hi: {
    title: 'दिशा-बोध',
    catalogDesc: 'रास्ते, मोड़ों का क्रम और शुरुआत की ओर लौटने की दिशा याद रखें।',
    skill: 'जगह की समझ और दिमाग़ में बना नक्शा',
    rulesTitle: 'रास्ता दिमाग़ में रखने के तीन तरीक़े',
    rulesBody: 'नक्शा घूम जाए तब भी रास्ता वही रहता है।',
    routeRecallRule: 'रास्ता: पहले राह देख लें, फिर बिना रेखा के दिशाएँ दोहराएँ।',
    turnSequenceRule: 'मोड़: बाएँ, सीधे और दाएँ का क्रम याद करें, फिर वैसा ही दोहराएँ।',
    homeDirectionRule: 'शुरुआत की ओर: रास्ता पूरा करके बताएँ कि शुरू का ख़ाना किस ओर है।',
    progressionInfo: 'सिखाने वाले स्तरों के बाद निशानियाँ, झूठी शाखाएँ, घुमाव, छिपा नक्शा और याद करने का ठहराव आते हैं।',
    start: 'दौर शुरू करें',
    study: 'रास्ता देख लें',
    recall: 'रास्ता दोहराएँ',
    delay: 'नक्शा दिमाग़ में रखें',
    delayBody: 'रास्ता छिपा है। जवाब देने से पहले उसकी तस्वीर मन में बनाए रखें।',
    continue: 'जारी रखें',
    ready: 'तैयार — जवाब देने चलें',
    pause: 'ठहराव',
    resume: 'जारी रखें',
    restart: 'नए सिरे से',
    exit: 'बाहर',
    grid: '{size}×{size} जाल · {steps} क़दम का रास्ता',
    routeProgress: 'क़दम {total} में से {current}',
    turnProgress: 'मोड़ {total} में से {current}',
    routePrompt: 'पर्दे पर अगली दिशा चुनें',
    turnPrompt: 'अगला मोड़ कौन-सा था?',
    homePrompt: 'शुरुआत किस दिशा में है?',
    swipeHint: 'बटन दबाएँ, कुंजी दबाएँ या पट पर उँगली फेरें।',
    mapHidden: 'इस स्तर पर नक्शा छिपा हुआ है।',
    startCell: 'शुरुआत',
    finishCell: 'अंत',
    currentCell: 'मौजूदा जगह',
    routeCell: 'रास्ते का क़दम {index}',
    falseBranch: 'झूठी शाखा',
    landmark: 'निशानी {index}',
    keyboardHelp: 'तीर/WASD से दिशाएँ; ←/↑/→ से मोड़; NumPad 1–9 से शुरुआत की आठ दिशाएँ। P ठहराव, R नए सिरे से।',
  },
  pt: {
    title: 'Navegador',
    catalogDesc: 'Memorize trajetos, sequências de curvas e a direção de volta ao início.',
    skill: 'Orientação espacial e mapa mental',
    rulesTitle: 'Três jeitos de guardar um trajeto na cabeça',
    rulesBody: 'O trajeto lógico continua o mesmo, mesmo quando o mapa gira.',
    routeRecallRule: 'Trajeto: estude o caminho e depois repita as direções sem a linha.',
    turnSequenceRule: 'Curvas: memorize esquerda, reto e direita e depois reproduza.',
    homeDirectionRule: 'De volta ao início: depois do trajeto, aponte para a casa de partida.',
    progressionInfo: 'Passado o tutorial, aparecem pontos de referência, ramos falsos, rotação, mapa escondido e uma pausa para lembrar.',
    start: 'Começar a rodada',
    study: 'Estude o trajeto',
    recall: 'Refaça o trajeto',
    delay: 'Segure o mapa na cabeça',
    delayBody: 'O trajeto está escondido. Guarde a imagem dele antes de responder.',
    continue: 'Continuar',
    ready: 'Pronto — vamos responder',
    pause: 'Pausa',
    resume: 'Continuar',
    restart: 'Recomeçar',
    exit: 'Sair',
    grid: 'Grade {size}×{size} · trajeto de {steps}',
    routeProgress: 'Passo {current} de {total}',
    turnProgress: 'Curva {current} de {total}',
    routePrompt: 'Escolha a próxima direção na tela',
    turnPrompt: 'Qual curva vinha em seguida?',
    homePrompt: 'Em que direção fica a partida?',
    swipeHint: 'Dá para tocar um botão, apertar uma tecla ou deslizar pelo tabuleiro.',
    mapHidden: 'Neste nível o mapa fica escondido.',
    startCell: 'Partida',
    finishCell: 'Chegada',
    currentCell: 'Posição atual',
    routeCell: 'Passo {index} do trajeto',
    falseBranch: 'Ramo falso',
    landmark: 'Referência {index}',
    keyboardHelp: 'Setas/WASD para as direções; ←/↑/→ para as curvas; teclado numérico 1–9 para as oito direções da partida. P pausa; R recomeça.',
  },
  fr: {
    title: 'Navigateur',
    catalogDesc: 'Mémorisez des trajets, des suites de virages et la direction du retour au départ.',
    skill: 'Orientation dans l’espace et carte mentale',
    rulesTitle: 'Trois façons de garder un trajet en tête',
    rulesBody: 'Le trajet logique reste le même, même quand la carte pivote.',
    routeRecallRule: 'Trajet : observez le chemin, puis refaites les directions sans la ligne.',
    turnSequenceRule: 'Virages : retenez gauche, tout droit et droite, puis reproduisez la suite.',
    homeDirectionRule: 'Retour au départ : après le trajet, pointez vers la case de départ.',
    progressionInfo: 'Après le tutoriel arrivent les repères, les fausses branches, la rotation, la carte masquée et un temps de rappel.',
    start: 'Lancer la manche',
    study: 'Observez le trajet',
    recall: 'Refaites le trajet',
    delay: 'Gardez la carte en tête',
    delayBody: 'Le trajet est masqué. Gardez-en l’image avant de répondre.',
    continue: 'Continuer',
    ready: 'Prêt — passer à la réponse',
    pause: 'Pause',
    resume: 'Reprendre',
    restart: 'Recommencer',
    exit: 'Quitter',
    grid: 'Grille {size}×{size} · trajet de {steps}',
    routeProgress: 'Étape {current} sur {total}',
    turnProgress: 'Virage {current} sur {total}',
    routePrompt: 'Choisissez la direction suivante à l’écran',
    turnPrompt: 'Quel virage venait ensuite ?',
    homePrompt: 'Dans quelle direction se trouve le départ ?',
    swipeHint: 'Un bouton, une touche ou un glissé sur le plateau, au choix.',
    mapHidden: 'À ce niveau, la carte est masquée.',
    startCell: 'Départ',
    finishCell: 'Arrivée',
    currentCell: 'Position actuelle',
    routeCell: 'Étape {index} du trajet',
    falseBranch: 'Fausse branche',
    landmark: 'Repère {index}',
    keyboardHelp: 'Flèches/WASD pour les directions ; ←/↑/→ pour les virages ; pavé numérique 1–9 pour les huit directions du départ. P met en pause ; R relance.',
  },
  it: {
    title: 'Navigatore',
    catalogDesc: 'Memorizza percorsi, sequenze di svolte e la direzione di ritorno alla partenza.',
    skill: 'Orientamento nello spazio e mappa mentale',
    rulesTitle: 'Tre modi di tenere un percorso in testa',
    rulesBody: 'Il percorso logico resta lo stesso anche quando la mappa ruota.',
    routeRecallRule: 'Percorso: studia la strada, poi ripeti le direzioni senza la linea.',
    turnSequenceRule: 'Svolte: memorizza sinistra, dritto e destra, poi riproduci la sequenza.',
    homeDirectionRule: 'Verso la partenza: finito il percorso, indica dov’è la casella di partenza.',
    progressionInfo: 'Dopo il tutorial arrivano punti di riferimento, rami falsi, rotazione, mappa nascosta e una pausa per ricordare.',
    start: 'Inizia il turno',
    study: 'Studia il percorso',
    recall: 'Ricostruisci il percorso',
    delay: 'Tieni la mappa in testa',
    delayBody: 'Il percorso è nascosto. Conserva la sua immagine prima di rispondere.',
    continue: 'Continua',
    ready: 'Pronto — passo alla risposta',
    pause: 'Pausa',
    resume: 'Riprendi',
    restart: 'Ricomincia',
    exit: 'Esci',
    grid: 'Griglia {size}×{size} · percorso di {steps}',
    routeProgress: 'Passo {current} di {total}',
    turnProgress: 'Svolta {current} di {total}',
    routePrompt: 'Scegli la prossima direzione sullo schermo',
    turnPrompt: 'Quale svolta veniva dopo?',
    homePrompt: 'In che direzione si trova la partenza?',
    swipeHint: 'Puoi usare un pulsante, un tasto o far scorrere il dito sul campo.',
    mapHidden: 'A questo livello la mappa è nascosta.',
    startCell: 'Partenza',
    finishCell: 'Arrivo',
    currentCell: 'Posizione attuale',
    routeCell: 'Passo {index} del percorso',
    falseBranch: 'Ramo falso',
    landmark: 'Riferimento {index}',
    keyboardHelp: 'Frecce/WASD per le direzioni; ←/↑/→ per le svolte; tastierino 1–9 per le otto direzioni verso la partenza. P mette in pausa; R ricomincia.',
  },
  ja: {
    title: '頭の中の地図',
    catalogDesc: '道すじ、曲がる順番、そして出発点へ戻る方角を覚えます。',
    skill: '空間の見当づけと頭の中の地図',
    rulesTitle: '道すじを頭に残す三つのやり方',
    rulesBody: '地図が回っても、道すじそのものは変わりません。',
    routeRecallRule: '道すじ：まず道を覚え、線が消えたあとで進む向きをたどり直します。',
    turnSequenceRule: '曲がり方：左・まっすぐ・右の並びを覚えて、そのとおりに再現します。',
    homeDirectionRule: '出発点へ：道すじのあと、出発したマスがどちらかを指します。',
    progressionInfo: '練習を過ぎると、目印、にせの分かれ道、回転、隠れた地図、そして思い出すための間が加わります。',
    start: 'ラウンドを始める',
    study: '道すじを覚える',
    recall: '道すじをたどり直す',
    delay: '地図を頭に留める',
    delayBody: '道すじは隠れています。答える前に、頭の中の絵を保ってください。',
    continue: '続ける',
    ready: '準備できた — 回答へ',
    pause: '一時停止',
    resume: '再開',
    restart: 'やり直す',
    exit: '終了',
    grid: '{size}×{size} のマス · {steps} 手の道すじ',
    routeProgress: '{total} 歩中 {current} 歩目',
    turnProgress: '{total} 回中 {current} 回目の曲がり',
    routePrompt: '画面での次の向きを選んでください',
    turnPrompt: '次はどちらへ曲がりましたか？',
    homePrompt: '出発点はどの方角ですか？',
    swipeHint: 'ボタン、キー、盤面のスワイプ、どれでも使えます。',
    mapHidden: 'このレベルでは地図が隠れています。',
    startCell: '出発点',
    finishCell: 'ゴール',
    currentCell: '今いる場所',
    routeCell: '道すじ {index} 歩目',
    falseBranch: 'にせの分かれ道',
    landmark: '目印 {index}',
    keyboardHelp: '矢印/WASDで向き、←/↑/→で曲がり方、テンキー1–9で出発点への八方位。Pで一時停止、Rでやり直し。',
  },
  ko: {
    title: '길찾기',
    catalogDesc: '길, 꺾인 순서, 그리고 출발점으로 돌아가는 방향을 외우세요.',
    skill: '공간 감각과 머릿속 지도',
    rulesTitle: '길을 머리에 담아 두는 세 가지 방법',
    rulesBody: '지도가 돌아가도 길 자체는 그대로입니다.',
    routeRecallRule: '길: 먼저 길을 익히고, 선이 사라진 뒤 방향을 그대로 되짚으세요.',
    turnSequenceRule: '꺾임: 왼쪽·직진·오른쪽의 차례를 외운 뒤 그대로 재현하세요.',
    homeDirectionRule: '출발점으로: 길을 마친 뒤 출발한 칸이 어느 쪽인지 가리키세요.',
    progressionInfo: '연습 단계를 지나면 표지물, 가짜 갈림길, 회전, 가려진 지도, 그리고 떠올릴 틈이 더해집니다.',
    start: '판 시작',
    study: '길 익히기',
    recall: '길 되짚기',
    delay: '지도를 머리에 담아 두기',
    delayBody: '길이 가려졌습니다. 답하기 전에 머릿속 그림을 붙잡아 두세요.',
    continue: '계속하기',
    ready: '준비됐어요 — 답하러 가기',
    pause: '일시정지',
    resume: '이어하기',
    restart: '다시 시작',
    exit: '나가기',
    grid: '{size}×{size} 칸 · {steps}걸음 길',
    routeProgress: '{total}걸음 중 {current}걸음',
    turnProgress: '{total}번 중 {current}번째 꺾임',
    routePrompt: '화면에서 다음 방향을 고르세요',
    turnPrompt: '다음은 어느 쪽으로 꺾었나요?',
    homePrompt: '출발점은 어느 방향인가요?',
    swipeHint: '단추를 눌러도, 키를 눌러도, 판을 쓸어도 됩니다.',
    mapHidden: '이 단계에서는 지도가 가려집니다.',
    startCell: '출발',
    finishCell: '도착',
    currentCell: '지금 위치',
    routeCell: '길 {index}걸음째',
    falseBranch: '가짜 갈림길',
    landmark: '표지물 {index}',
    keyboardHelp: '화살표/WASD는 방향, ←/↑/→는 꺾임, 숫자판 1–9는 출발점까지의 여덟 방향. P는 일시정지, R은 다시 시작.',
  },
  ar: {
    title: 'دليل الطريق',
    catalogDesc: 'احفظ المسارات وتسلسل المنعطفات واتجاه العودة إلى نقطة البداية.',
    skill: 'التوجّه المكاني والخريطة الذهنية',
    rulesTitle: 'ثلاث طرق لحفظ المسار في الذهن',
    rulesBody: 'المسار نفسه لا يتغيّر حتى لو دارت الخريطة.',
    routeRecallRule: 'المسار: ادرس الطريق ثم أعِد الاتجاهات بعد اختفاء الخط.',
    turnSequenceRule: 'المنعطفات: احفظ يسار ومستقيم ويمين ثم أعِد التسلسل.',
    homeDirectionRule: 'إلى البداية: بعد المسار، أشِر إلى خانة الانطلاق.',
    progressionInfo: 'بعد التدريب تظهر العلامات والفروع الكاذبة والدوران والخريطة المخفية ومهلة للتذكّر.',
    start: 'ابدأ الجولة',
    study: 'ادرس المسار',
    recall: 'أعِد بناء المسار',
    delay: 'احفظ الخريطة في ذهنك',
    delayBody: 'المسار مخفيّ الآن. احتفظ بصورته الذهنية قبل الإجابة.',
    continue: 'متابعة',
    ready: 'جاهز — إلى الإجابة',
    pause: 'إيقاف مؤقت',
    resume: 'استئناف',
    restart: 'إعادة البدء',
    exit: 'خروج',
    grid: 'شبكة {size}×{size} · مسار من {steps}',
    routeProgress: 'الخطوة {current} من {total}',
    turnProgress: 'المنعطف {current} من {total}',
    routePrompt: 'اختر الاتجاه التالي على الشاشة',
    turnPrompt: 'أي منعطف جاء بعد ذلك؟',
    homePrompt: 'في أي اتجاه تقع نقطة البداية؟',
    swipeHint: 'استعمل زرّاً أو مفتاحاً أو مرّر إصبعك على اللوح.',
    mapHidden: 'الخريطة مخفيّة في هذا المستوى.',
    startCell: 'البداية',
    finishCell: 'النهاية',
    currentCell: 'الموضع الحالي',
    routeCell: 'خطوة المسار {index}',
    falseBranch: 'فرع كاذب',
    landmark: 'علامة {index}',
    keyboardHelp: 'الأسهم/WASD للاتجاهات، و←/↑/→ للمنعطفات، ولوحة الأرقام 1–9 للاتجاهات الثمانية نحو البداية. P إيقاف مؤقت، R إعادة.',
  },
};

const MODE_LABELS: Record<NavigatorLocale, Record<NavigatorMode, string>> = {
  ru: { 'route-recall': 'Маршрут', 'turn-sequence': 'Повороты', 'home-direction': 'Направление домой' },
  en: { 'route-recall': 'Route Recall', 'turn-sequence': 'Turn Sequence', 'home-direction': 'Home Direction' },
  es: { 'route-recall': 'Recorrido', 'turn-sequence': 'Giros', 'home-direction': 'Dirección a la salida' },
  de: { 'route-recall': 'Weg', 'turn-sequence': 'Abbiegen', 'home-direction': 'Richtung zum Start' },
  zh: { 'route-recall': '路线', 'turn-sequence': '转弯', 'home-direction': '回起点的方向' },
  hi: { 'route-recall': 'रास्ता', 'turn-sequence': 'मोड़', 'home-direction': 'शुरुआत की दिशा' },
  pt: { 'route-recall': 'Trajeto', 'turn-sequence': 'Curvas', 'home-direction': 'Direção à partida' },
  fr: { 'route-recall': 'Trajet', 'turn-sequence': 'Virages', 'home-direction': 'Direction du départ' },
  it: { 'route-recall': 'Percorso', 'turn-sequence': 'Svolte', 'home-direction': 'Direzione alla partenza' },
  ja: { 'route-recall': '道すじ', 'turn-sequence': '曲がり方', 'home-direction': '出発点の方角' },
  ko: { 'route-recall': '길', 'turn-sequence': '꺾임', 'home-direction': '출발점 방향' },
  ar: { 'route-recall': 'المسار', 'turn-sequence': 'المنعطفات', 'home-direction': 'اتجاه البداية' },
};

/**
 * НАПРАВЛЕНИЯ ПО ЭКРАНУ. Не стороны света: человек ведёт палец вверх по сетке, а
 * не идёт на север. Компасные слова — в HOME_LABELS ниже.
 */
const DIRECTION_LABELS: Record<NavigatorLocale, Record<CardinalDirection, string>> = {
  ru: { north: 'Вверх', east: 'Вправо', south: 'Вниз', west: 'Влево' },
  en: { north: 'Up', east: 'Right', south: 'Down', west: 'Left' },
  es: { north: 'Arriba', east: 'Derecha', south: 'Abajo', west: 'Izquierda' },
  de: { north: 'Hoch', east: 'Rechts', south: 'Runter', west: 'Links' },
  zh: { north: '上', east: '右', south: '下', west: '左' },
  hi: { north: 'ऊपर', east: 'दाएँ', south: 'नीचे', west: 'बाएँ' },
  pt: { north: 'Cima', east: 'Direita', south: 'Baixo', west: 'Esquerda' },
  fr: { north: 'Haut', east: 'Droite', south: 'Bas', west: 'Gauche' },
  it: { north: 'Su', east: 'Destra', south: 'Giù', west: 'Sinistra' },
  ja: { north: '上', east: '右', south: '下', west: '左' },
  ko: { north: '위', east: '오른쪽', south: '아래', west: '왼쪽' },
  ar: { north: 'أعلى', east: 'يمين', south: 'أسفل', west: 'يسار' },
};

const TURN_LABELS: Record<NavigatorLocale, Record<TurnInstruction, string>> = {
  ru: { left: 'Налево', straight: 'Прямо', right: 'Направо' },
  en: { left: 'Left', straight: 'Straight', right: 'Right' },
  es: { left: 'Izquierda', straight: 'Recto', right: 'Derecha' },
  de: { left: 'Links', straight: 'Geradeaus', right: 'Rechts' },
  zh: { left: '左转', straight: '直行', right: '右转' },
  hi: { left: 'बाएँ', straight: 'सीधे', right: 'दाएँ' },
  pt: { left: 'Esquerda', straight: 'Reto', right: 'Direita' },
  fr: { left: 'Gauche', straight: 'Tout droit', right: 'Droite' },
  it: { left: 'Sinistra', straight: 'Dritto', right: 'Destra' },
  ja: { left: '左', straight: 'まっすぐ', right: '右' },
  ko: { left: '왼쪽', straight: '직진', right: '오른쪽' },
  ar: { left: 'يسار', straight: 'مستقيم', right: 'يمين' },
};

/** СТОРОНЫ СВЕТА — направление на старт по компасу, восемь секторов. */
const HOME_LABELS: Record<NavigatorLocale, Record<HomeSector, string>> = {
  ru: {
    north: 'Север', 'north-east': 'Северо-восток', east: 'Восток', 'south-east': 'Юго-восток',
    south: 'Юг', 'south-west': 'Юго-запад', west: 'Запад', 'north-west': 'Северо-запад',
  },
  en: {
    north: 'North', 'north-east': 'North-east', east: 'East', 'south-east': 'South-east',
    south: 'South', 'south-west': 'South-west', west: 'West', 'north-west': 'North-west',
  },
  es: {
    north: 'Norte', 'north-east': 'Noreste', east: 'Este', 'south-east': 'Sureste',
    south: 'Sur', 'south-west': 'Suroeste', west: 'Oeste', 'north-west': 'Noroeste',
  },
  de: {
    north: 'Norden', 'north-east': 'Nordosten', east: 'Osten', 'south-east': 'Südosten',
    south: 'Süden', 'south-west': 'Südwesten', west: 'Westen', 'north-west': 'Nordwesten',
  },
  zh: {
    north: '北', 'north-east': '东北', east: '东', 'south-east': '东南',
    south: '南', 'south-west': '西南', west: '西', 'north-west': '西北',
  },
  hi: {
    north: 'उत्तर', 'north-east': 'उत्तर-पूर्व', east: 'पूर्व', 'south-east': 'दक्षिण-पूर्व',
    south: 'दक्षिण', 'south-west': 'दक्षिण-पश्चिम', west: 'पश्चिम', 'north-west': 'उत्तर-पश्चिम',
  },
  pt: {
    north: 'Norte', 'north-east': 'Nordeste', east: 'Leste', 'south-east': 'Sudeste',
    south: 'Sul', 'south-west': 'Sudoeste', west: 'Oeste', 'north-west': 'Noroeste',
  },
  fr: {
    north: 'Nord', 'north-east': 'Nord-est', east: 'Est', 'south-east': 'Sud-est',
    south: 'Sud', 'south-west': 'Sud-ouest', west: 'Ouest', 'north-west': 'Nord-ouest',
  },
  it: {
    north: 'Nord', 'north-east': 'Nord-est', east: 'Est', 'south-east': 'Sud-est',
    south: 'Sud', 'south-west': 'Sud-ovest', west: 'Ovest', 'north-west': 'Nord-ovest',
  },
  ja: {
    north: '北', 'north-east': '北東', east: '東', 'south-east': '南東',
    south: '南', 'south-west': '南西', west: '西', 'north-west': '北西',
  },
  ko: {
    north: '북', 'north-east': '북동', east: '동', 'south-east': '남동',
    south: '남', 'south-west': '남서', west: '서', 'north-west': '북서',
  },
  ar: {
    north: 'شمال', 'north-east': 'شمال شرق', east: 'شرق', 'south-east': 'جنوب شرق',
    south: 'جنوب', 'south-west': 'جنوب غرب', west: 'غرب', 'north-west': 'شمال غرب',
  },
};

/** Незнакомый язык — английский, а не пустой экран. Тип этого не допускает, но рантайм бывает шире типа. */
export function getNavigatorStrings(locale: NavigatorLocale): NavigatorStrings {
  return STRINGS[locale] ?? STRINGS.en;
}

export function getNavigatorModeLabel(locale: NavigatorLocale, mode: NavigatorMode): string {
  return (MODE_LABELS[locale] ?? MODE_LABELS.en)[mode];
}

export function getCardinalLabel(locale: NavigatorLocale, direction: CardinalDirection): string {
  return (DIRECTION_LABELS[locale] ?? DIRECTION_LABELS.en)[direction];
}

export function getTurnLabel(locale: NavigatorLocale, turn: TurnInstruction): string {
  return (TURN_LABELS[locale] ?? TURN_LABELS.en)[turn];
}

export function getHomeSectorLabel(locale: NavigatorLocale, sector: HomeSector): string {
  return (HOME_LABELS[locale] ?? HOME_LABELS.en)[sector];
}

export function interpolateNavigator(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
}
