/* psygames-faces-names-i18n · VER 1 · 19.08.2026 */
/**
 * СВОЙ СЛОВАРЬ МОДУЛЯ — НА ВСЕ ДВЕНАДЦАТЬ ЯЗЫКОВ.
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНЫЙ СЛОВАРЬ, А НЕ `t()` ПРИЛОЖЕНИЯ. Модуль пришёл из
 * лаборатории самодостаточным: у него своё ядро и свои строки, и он не знает про
 * LanguageContext. Это правильно — так его можно проверять отдельно, — но у
 * лабораторной версии словарь знал ровно два языка, `ru` и `en`, а всё
 * остальное молча получало английский. У приложения языков двенадцать, и это
 * ровно тот случай, ради которого написан ci-i18n-hardcode-guard: экран
 * выглядит переведённым у тех двоих, кто на него смотрит, а немец, кореец и
 * японец видят английскую вставку посреди своего интерфейса.
 *
 * Поэтому здесь полные двенадцать. Гейт faces-names-integration сверяет, что ни
 * один язык не потерян и ни одна строка не осталась английской заглушкой.
 *
 * ЧЕГО ЗДЕСЬ НЕТ И ПОЧЕМУ. Строк своего экрана итога («Проверка завершена»,
 * «Общая точность», «Повторить с тем же seed») нет: в приложении итог партии
 * рисует ОБЩИЙ LevelCleared, у модуля собственного финального экрана больше нет.
 * Подробности — в шапке FacesNamesGame.tsx.
 */
import { factById } from './content';
import type {
  FaceShape,
  FacesNamesLocale,
  HairStyle,
  SyntheticFaceSpec,
} from './types';

export interface FacesNamesStrings {
  /** Заставка правил */
  title: string;
  skill: string;
  rulesTitle: string;
  rulesBody: string;
  rulesRecall: string;
  privacy: string;
  fairness: string;
  keyboardHelp: string;
  start: string;
  exit: string;
  /** Фаза изучения */
  study: string;
  studyProgress: string;
  rememberName: string;
  rememberFact: string;
  nextPerson: string;
  startPause: string;
  /** Фаза помехи */
  interference: string;
  interferenceBody: string;
  interferenceProgress: string;
  /** Фазы припоминания */
  recognition: string;
  recognitionPrompt: string;
  recognitionProgress: string;
  nameRecall: string;
  namePrompt: string;
  factRecall: string;
  factPrompt: string;
  /** Управление партией */
  pause: string;
  resume: string;
  restart: string;
  /** Шапка поля: «Уровень 7 · лиц: 4» — раньше слово Level было вшито в разметку */
  levelLine: string;
  /** Описание портрета для экранного диктора */
  portrait: string;
  glassesSuffix: string;
  shape: Record<FaceShape, string>;
  hair: Record<HairStyle, string>;
}

const STRINGS: Record<FacesNamesLocale, FacesNamesStrings> = {
  ru: {
    title: 'Лица и имена',
    skill: 'Ассоциативная память',
    rulesTitle: 'Как играть',
    rulesBody: 'Запомните синтетический портрет, точное имя и нейтральный факт о каждом персонаже.',
    rulesRecall: 'После короткой задачи выберите знакомое лицо, затем его имя и на высоких уровнях факт.',
    privacy: 'Все портреты процедурные: здесь нет фотографий, контактов или реальных пользователей.',
    fairness: 'Имя всегда показано одним и тем же точным текстом. Незнакомое имя не получает дополнительного штрафа.',
    keyboardHelp: 'Клавиатура: Tab — перейти между вариантами, Enter или пробел — выбрать, P — пауза, R — заново.',
    start: 'Начать изучение',
    exit: 'Выйти',
    study: 'Изучение',
    studyProgress: 'Персонаж {current} из {total}',
    rememberName: 'Имя',
    rememberFact: 'Факт',
    nextPerson: 'Следующий персонаж',
    startPause: 'Перейти к короткой задаче',
    interference: 'Короткая задача',
    interferenceBody: 'Решите пример, затем начнётся проверка памяти.',
    interferenceProgress: 'Задача {current} из {total}',
    recognition: 'Узнавание лица',
    recognitionPrompt: 'Какое лицо было в фазе изучения?',
    recognitionProgress: 'Проверка {current} из {total}',
    nameRecall: 'Выбор имени',
    namePrompt: 'Как зовут этого персонажа?',
    factRecall: 'Выбор факта',
    factPrompt: 'Какой факт относился к этому персонажу?',
    pause: 'Пауза',
    resume: 'Продолжить',
    restart: 'Начать заново',
    levelLine: 'Уровень {level} · лиц: {people}',
    portrait: 'Синтетический иллюстрированный портрет {n}: {shape}, {hair}{glasses}.',
    glassesSuffix: ', круглые очки',
    shape: { oval: 'овальный контур', round: 'круглый контур', long: 'вытянутый контур', angular: 'угловатый контур' },
    hair: { crop: 'короткая причёска', wave: 'волнистая причёска', curve: 'закруглённая причёска', parted: 'причёска с пробором' },
  },
  en: {
    title: 'Faces & Names',
    skill: 'Associative memory',
    rulesTitle: 'How to play',
    rulesBody: 'Remember each synthetic portrait, exact name, and neutral fact.',
    rulesRecall: 'After a short task, choose the familiar face, then its name and at higher levels its fact.',
    privacy: 'Every portrait is procedural: there are no photos, contacts, or real users here.',
    fairness: 'Each name is always shown as the same exact text. An unfamiliar name receives no extra penalty.',
    keyboardHelp: 'Keyboard: Tab moves between choices, Enter or Space selects, P pauses, R restarts.',
    start: 'Start studying',
    exit: 'Exit',
    study: 'Study',
    studyProgress: 'Person {current} of {total}',
    rememberName: 'Name',
    rememberFact: 'Fact',
    nextPerson: 'Next person',
    startPause: 'Continue to the short task',
    interference: 'Short task',
    interferenceBody: 'Solve the sum, then memory recall begins.',
    interferenceProgress: 'Task {current} of {total}',
    recognition: 'Face recognition',
    recognitionPrompt: 'Which face appeared during study?',
    recognitionProgress: 'Recall {current} of {total}',
    nameRecall: 'Choose the name',
    namePrompt: 'What is this person’s name?',
    factRecall: 'Choose the fact',
    factPrompt: 'Which fact belonged to this person?',
    pause: 'Pause',
    resume: 'Resume',
    restart: 'Restart',
    levelLine: 'Level {level} · faces: {people}',
    portrait: 'Synthetic illustrated portrait {n}: {shape}, {hair}{glasses}.',
    glassesSuffix: ', round glasses',
    shape: { oval: 'oval outline', round: 'round outline', long: 'long outline', angular: 'angular outline' },
    hair: { crop: 'cropped hairstyle', wave: 'wavy hairstyle', curve: 'curved hairstyle', parted: 'parted hairstyle' },
  },
  es: {
    title: 'Caras y nombres',
    skill: 'Memoria asociativa',
    rulesTitle: 'Cómo jugar',
    rulesBody: 'Memoriza el retrato sintético, el nombre exacto y un dato neutro de cada personaje.',
    rulesRecall: 'Tras una tarea breve, elige la cara conocida, luego su nombre y, en niveles altos, su dato.',
    privacy: 'Todos los retratos son procedurales: aquí no hay fotos, contactos ni usuarios reales.',
    fairness: 'El nombre siempre se muestra con el mismo texto exacto. Un nombre desconocido no penaliza más.',
    keyboardHelp: 'Teclado: Tab cambia de opción, Enter o espacio selecciona, P pausa, R reinicia.',
    start: 'Empezar a memorizar',
    exit: 'Salir',
    study: 'Memorización',
    studyProgress: 'Persona {current} de {total}',
    rememberName: 'Nombre',
    rememberFact: 'Dato',
    nextPerson: 'Siguiente persona',
    startPause: 'Pasar a la tarea breve',
    interference: 'Tarea breve',
    interferenceBody: 'Resuelve la suma y empezará la prueba de memoria.',
    interferenceProgress: 'Tarea {current} de {total}',
    recognition: 'Reconocer la cara',
    recognitionPrompt: '¿Qué cara apareció en la memorización?',
    recognitionProgress: 'Prueba {current} de {total}',
    nameRecall: 'Elegir el nombre',
    namePrompt: '¿Cómo se llama esta persona?',
    factRecall: 'Elegir el dato',
    factPrompt: '¿Qué dato correspondía a esta persona?',
    pause: 'Pausa',
    resume: 'Continuar',
    restart: 'Reiniciar',
    levelLine: 'Nivel {level} · caras: {people}',
    portrait: 'Retrato ilustrado sintético {n}: {shape}, {hair}{glasses}.',
    glassesSuffix: ', gafas redondas',
    shape: { oval: 'contorno ovalado', round: 'contorno redondo', long: 'contorno alargado', angular: 'contorno anguloso' },
    hair: { crop: 'pelo corto', wave: 'pelo ondulado', curve: 'pelo redondeado', parted: 'pelo con raya' },
  },
  de: {
    title: 'Gesichter und Namen',
    skill: 'Assoziatives Gedächtnis',
    rulesTitle: 'So wird gespielt',
    rulesBody: 'Merke dir zu jeder Figur das synthetische Porträt, den genauen Namen und einen neutralen Fakt.',
    rulesRecall: 'Nach einer kurzen Aufgabe wählst du das bekannte Gesicht, dann den Namen und in hohen Stufen den Fakt.',
    privacy: 'Alle Porträts sind prozedural: hier gibt es keine Fotos, Kontakte oder echten Nutzer.',
    fairness: 'Der Name erscheint immer als derselbe exakte Text. Ein unbekannter Name wird nicht zusätzlich bestraft.',
    keyboardHelp: 'Tastatur: Tab wechselt die Auswahl, Enter oder Leertaste wählt, P pausiert, R startet neu.',
    start: 'Merkphase starten',
    exit: 'Beenden',
    study: 'Merkphase',
    studyProgress: 'Person {current} von {total}',
    rememberName: 'Name',
    rememberFact: 'Fakt',
    nextPerson: 'Nächste Person',
    startPause: 'Weiter zur kurzen Aufgabe',
    interference: 'Kurze Aufgabe',
    interferenceBody: 'Löse die Rechnung, danach beginnt die Gedächtnisprüfung.',
    interferenceProgress: 'Aufgabe {current} von {total}',
    recognition: 'Gesicht erkennen',
    recognitionPrompt: 'Welches Gesicht kam in der Merkphase vor?',
    recognitionProgress: 'Prüfung {current} von {total}',
    nameRecall: 'Namen wählen',
    namePrompt: 'Wie heißt diese Person?',
    factRecall: 'Fakt wählen',
    factPrompt: 'Welcher Fakt gehörte zu dieser Person?',
    pause: 'Pause',
    resume: 'Fortsetzen',
    restart: 'Neu starten',
    levelLine: 'Stufe {level} · Gesichter: {people}',
    portrait: 'Synthetisches gezeichnetes Porträt {n}: {shape}, {hair}{glasses}.',
    glassesSuffix: ', runde Brille',
    shape: { oval: 'ovale Kontur', round: 'runde Kontur', long: 'längliche Kontur', angular: 'kantige Kontur' },
    hair: { crop: 'kurze Frisur', wave: 'wellige Frisur', curve: 'runde Frisur', parted: 'Frisur mit Scheitel' },
  },
  zh: {
    title: '人脸与名字',
    skill: '联想记忆',
    rulesTitle: '玩法',
    rulesBody: '记住每个人物的合成肖像、准确的名字和一条中性事实。',
    rulesRecall: '完成一道小题后，先选出见过的脸，再选名字，高关卡还要选事实。',
    privacy: '所有肖像均为程序生成：这里没有照片、通讯录，也没有真实用户。',
    fairness: '名字始终以同一段文字显示。不熟悉的名字不会被额外扣分。',
    keyboardHelp: '键盘：Tab 切换选项，Enter 或空格选择，P 暂停，R 重来。',
    start: '开始记忆',
    exit: '退出',
    study: '记忆阶段',
    studyProgress: '第 {current} 位，共 {total} 位',
    rememberName: '名字',
    rememberFact: '事实',
    nextPerson: '下一位',
    startPause: '进入小题',
    interference: '小题',
    interferenceBody: '算出这道加法，然后开始记忆检验。',
    interferenceProgress: '第 {current} 题，共 {total} 题',
    recognition: '识别人脸',
    recognitionPrompt: '哪张脸在记忆阶段出现过？',
    recognitionProgress: '第 {current} 次检验，共 {total} 次',
    nameRecall: '选择名字',
    namePrompt: '这个人叫什么名字？',
    factRecall: '选择事实',
    factPrompt: '哪条事实属于这个人？',
    pause: '暂停',
    resume: '继续',
    restart: '重新开始',
    levelLine: '第 {level} 关 · 人脸：{people}',
    portrait: '合成插画肖像 {n}：{shape}，{hair}{glasses}。',
    glassesSuffix: '，圆框眼镜',
    shape: { oval: '椭圆脸型', round: '圆脸型', long: '长脸型', angular: '棱角脸型' },
    hair: { crop: '短发', wave: '波浪发', curve: '圆润发型', parted: '中分发型' },
  },
  hi: {
    title: 'चेहरे और नाम',
    skill: 'साहचर्य स्मृति',
    rulesTitle: 'कैसे खेलें',
    rulesBody: 'हर किरदार का कृत्रिम चित्र, सटीक नाम और एक तटस्थ तथ्य याद रखें।',
    rulesRecall: 'एक छोटे काम के बाद जाना-पहचाना चेहरा चुनें, फिर उसका नाम और ऊँचे स्तरों पर तथ्य।',
    privacy: 'सभी चित्र प्रोग्राम से बने हैं: यहाँ न तस्वीरें हैं, न संपर्क, न असली उपयोगकर्ता।',
    fairness: 'नाम हमेशा एक ही सटीक पाठ में दिखता है। अनजान नाम पर अतिरिक्त दंड नहीं लगता।',
    keyboardHelp: 'कीबोर्ड: Tab विकल्प बदलता है, Enter या स्पेस चुनता है, P रोकता है, R फिर से शुरू करता है।',
    start: 'याद करना शुरू करें',
    exit: 'बाहर जाएँ',
    study: 'याद करने का चरण',
    studyProgress: '{total} में से {current} व्यक्ति',
    rememberName: 'नाम',
    rememberFact: 'तथ्य',
    nextPerson: 'अगला व्यक्ति',
    startPause: 'छोटे काम पर जाएँ',
    interference: 'छोटा काम',
    interferenceBody: 'जोड़ हल करें, फिर स्मृति की जाँच शुरू होगी।',
    interferenceProgress: '{total} में से {current} काम',
    recognition: 'चेहरा पहचानें',
    recognitionPrompt: 'याद करने के चरण में कौन-सा चेहरा था?',
    recognitionProgress: '{total} में से {current} जाँच',
    nameRecall: 'नाम चुनें',
    namePrompt: 'इस व्यक्ति का नाम क्या है?',
    factRecall: 'तथ्य चुनें',
    factPrompt: 'कौन-सा तथ्य इस व्यक्ति का था?',
    pause: 'विराम',
    resume: 'जारी रखें',
    restart: 'फिर से शुरू करें',
    levelLine: 'स्तर {level} · चेहरे: {people}',
    portrait: 'कृत्रिम चित्रित पोर्ट्रेट {n}: {shape}, {hair}{glasses}।',
    glassesSuffix: ', गोल चश्मा',
    shape: { oval: 'अंडाकार रूपरेखा', round: 'गोल रूपरेखा', long: 'लंबी रूपरेखा', angular: 'कोणीय रूपरेखा' },
    hair: { crop: 'छोटे बाल', wave: 'लहरदार बाल', curve: 'गोलाकार बाल', parted: 'माँग वाले बाल' },
  },
  pt: {
    title: 'Rostos e nomes',
    skill: 'Memória associativa',
    rulesTitle: 'Como jogar',
    rulesBody: 'Memorize o retrato sintético, o nome exato e um fato neutro de cada personagem.',
    rulesRecall: 'Depois de uma tarefa curta, escolha o rosto conhecido, depois o nome e, em níveis altos, o fato.',
    privacy: 'Todos os retratos são procedurais: aqui não há fotos, contatos nem usuários reais.',
    fairness: 'O nome aparece sempre com o mesmo texto exato. Um nome desconhecido não recebe punição extra.',
    keyboardHelp: 'Teclado: Tab muda de opção, Enter ou espaço seleciona, P pausa, R recomeça.',
    start: 'Começar a memorizar',
    exit: 'Sair',
    study: 'Memorização',
    studyProgress: 'Pessoa {current} de {total}',
    rememberName: 'Nome',
    rememberFact: 'Fato',
    nextPerson: 'Próxima pessoa',
    startPause: 'Ir para a tarefa curta',
    interference: 'Tarefa curta',
    interferenceBody: 'Resolva a soma e a prova de memória começa.',
    interferenceProgress: 'Tarefa {current} de {total}',
    recognition: 'Reconhecer o rosto',
    recognitionPrompt: 'Qual rosto apareceu na memorização?',
    recognitionProgress: 'Prova {current} de {total}',
    nameRecall: 'Escolher o nome',
    namePrompt: 'Qual é o nome desta pessoa?',
    factRecall: 'Escolher o fato',
    factPrompt: 'Qual fato pertencia a esta pessoa?',
    pause: 'Pausa',
    resume: 'Continuar',
    restart: 'Recomeçar',
    levelLine: 'Nível {level} · rostos: {people}',
    portrait: 'Retrato ilustrado sintético {n}: {shape}, {hair}{glasses}.',
    glassesSuffix: ', óculos redondos',
    shape: { oval: 'contorno oval', round: 'contorno redondo', long: 'contorno alongado', angular: 'contorno anguloso' },
    hair: { crop: 'cabelo curto', wave: 'cabelo ondulado', curve: 'cabelo arredondado', parted: 'cabelo repartido' },
  },
  fr: {
    title: 'Visages et prénoms',
    skill: 'Mémoire associative',
    rulesTitle: 'Comment jouer',
    rulesBody: 'Retenez pour chaque personnage le portrait synthétique, le prénom exact et un fait neutre.',
    rulesRecall: 'Après une courte tâche, choisissez le visage connu, puis son prénom et, aux niveaux élevés, son fait.',
    privacy: 'Tous les portraits sont procéduraux : ni photos, ni contacts, ni utilisateurs réels ici.',
    fairness: 'Le prénom est toujours affiché avec le même texte exact. Un prénom inconnu n’est pas pénalisé davantage.',
    keyboardHelp: 'Clavier : Tab change de choix, Entrée ou espace valide, P met en pause, R relance.',
    start: 'Commencer à mémoriser',
    exit: 'Quitter',
    study: 'Mémorisation',
    studyProgress: 'Personne {current} sur {total}',
    rememberName: 'Prénom',
    rememberFact: 'Fait',
    nextPerson: 'Personne suivante',
    startPause: 'Passer à la courte tâche',
    interference: 'Courte tâche',
    interferenceBody: 'Résolvez l’addition, puis le test de mémoire commence.',
    interferenceProgress: 'Tâche {current} sur {total}',
    recognition: 'Reconnaître le visage',
    recognitionPrompt: 'Quel visage est apparu pendant la mémorisation ?',
    recognitionProgress: 'Test {current} sur {total}',
    nameRecall: 'Choisir le prénom',
    namePrompt: 'Quel est le prénom de cette personne ?',
    factRecall: 'Choisir le fait',
    factPrompt: 'Quel fait appartenait à cette personne ?',
    pause: 'Pause',
    resume: 'Reprendre',
    restart: 'Recommencer',
    levelLine: 'Niveau {level} · visages : {people}',
    portrait: 'Portrait illustré synthétique {n} : {shape}, {hair}{glasses}.',
    glassesSuffix: ', lunettes rondes',
    shape: { oval: 'contour ovale', round: 'contour rond', long: 'contour allongé', angular: 'contour anguleux' },
    hair: { crop: 'cheveux courts', wave: 'cheveux ondulés', curve: 'cheveux arrondis', parted: 'cheveux avec raie' },
  },
  it: {
    title: 'Volti e nomi',
    skill: 'Memoria associativa',
    rulesTitle: 'Come si gioca',
    rulesBody: 'Memorizza di ogni personaggio il ritratto sintetico, il nome esatto e un fatto neutro.',
    rulesRecall: 'Dopo un compito breve scegli il volto conosciuto, poi il suo nome e, ai livelli alti, il fatto.',
    privacy: 'Tutti i ritratti sono procedurali: qui non ci sono foto, contatti o utenti reali.',
    fairness: 'Il nome è sempre mostrato con lo stesso testo esatto. Un nome sconosciuto non riceve penalità extra.',
    keyboardHelp: 'Tastiera: Tab cambia opzione, Invio o spazio seleziona, P mette in pausa, R ricomincia.',
    start: 'Inizia a memorizzare',
    exit: 'Esci',
    study: 'Memorizzazione',
    studyProgress: 'Persona {current} di {total}',
    rememberName: 'Nome',
    rememberFact: 'Fatto',
    nextPerson: 'Persona successiva',
    startPause: 'Passa al compito breve',
    interference: 'Compito breve',
    interferenceBody: 'Risolvi la somma, poi inizia la prova di memoria.',
    interferenceProgress: 'Compito {current} di {total}',
    recognition: 'Riconoscere il volto',
    recognitionPrompt: 'Quale volto è comparso nella memorizzazione?',
    recognitionProgress: 'Prova {current} di {total}',
    nameRecall: 'Scegli il nome',
    namePrompt: 'Come si chiama questa persona?',
    factRecall: 'Scegli il fatto',
    factPrompt: 'Quale fatto apparteneva a questa persona?',
    pause: 'Pausa',
    resume: 'Riprendi',
    restart: 'Ricomincia',
    levelLine: 'Livello {level} · volti: {people}',
    portrait: 'Ritratto illustrato sintetico {n}: {shape}, {hair}{glasses}.',
    glassesSuffix: ', occhiali tondi',
    shape: { oval: 'contorno ovale', round: 'contorno tondo', long: 'contorno allungato', angular: 'contorno spigoloso' },
    hair: { crop: 'capelli corti', wave: 'capelli mossi', curve: 'capelli arrotondati', parted: 'capelli con riga' },
  },
  ja: {
    title: '顔と名前',
    skill: '連想記憶',
    rulesTitle: '遊び方',
    rulesBody: '各人物の合成ポートレート、正確な名前、中立的な事実を覚えます。',
    rulesRecall: '短い課題のあと、見覚えのある顔を選び、次に名前を、上位レベルでは事実も選びます。',
    privacy: 'ポートレートはすべて手続き生成です。写真も連絡先も実在の利用者もありません。',
    fairness: '名前はつねに同じ表記で表示されます。なじみのない名前でも追加の減点はありません。',
    keyboardHelp: 'キーボード：Tab で選択肢を移動、Enter またはスペースで決定、P で一時停止、R でやり直し。',
    start: '記憶を始める',
    exit: '終了',
    study: '記憶',
    studyProgress: '{total} 人中 {current} 人目',
    rememberName: '名前',
    rememberFact: '事実',
    nextPerson: '次の人',
    startPause: '短い課題へ進む',
    interference: '短い課題',
    interferenceBody: '足し算を解くと、記憶のテストが始まります。',
    interferenceProgress: '{total} 問中 {current} 問目',
    recognition: '顔を見分ける',
    recognitionPrompt: '記憶の段階に出てきた顔はどれですか。',
    recognitionProgress: '{total} 回中 {current} 回目',
    nameRecall: '名前を選ぶ',
    namePrompt: 'この人の名前は何ですか。',
    factRecall: '事実を選ぶ',
    factPrompt: 'この人に結びついていた事実はどれですか。',
    pause: '一時停止',
    resume: '再開',
    restart: 'やり直す',
    levelLine: 'レベル {level} · 顔：{people}',
    portrait: '合成イラストの肖像 {n}：{shape}、{hair}{glasses}。',
    glassesSuffix: '、丸めがね',
    shape: { oval: '卵形の輪郭', round: '丸い輪郭', long: '面長の輪郭', angular: '角張った輪郭' },
    hair: { crop: '短い髪型', wave: '波打つ髪型', curve: '丸みのある髪型', parted: '分け目のある髪型' },
  },
  ko: {
    title: '얼굴과 이름',
    skill: '연합 기억',
    rulesTitle: '게임 방법',
    rulesBody: '각 인물의 합성 초상, 정확한 이름, 중립적인 사실을 기억하세요.',
    rulesRecall: '짧은 과제를 마친 뒤 익숙한 얼굴을 고르고, 이어서 이름을, 높은 단계에서는 사실도 고릅니다.',
    privacy: '모든 초상은 절차적으로 생성됩니다. 사진도, 연락처도, 실제 사용자도 없습니다.',
    fairness: '이름은 항상 같은 표기로 표시됩니다. 낯선 이름이라고 더 감점되지 않습니다.',
    keyboardHelp: '키보드: Tab으로 보기 이동, Enter 또는 스페이스로 선택, P는 일시정지, R은 다시 시작.',
    start: '기억 시작',
    exit: '나가기',
    study: '기억 단계',
    studyProgress: '{total}명 중 {current}번째',
    rememberName: '이름',
    rememberFact: '사실',
    nextPerson: '다음 사람',
    startPause: '짧은 과제로 이동',
    interference: '짧은 과제',
    interferenceBody: '덧셈을 풀면 기억 확인이 시작됩니다.',
    interferenceProgress: '{total}문제 중 {current}번째',
    recognition: '얼굴 알아보기',
    recognitionPrompt: '기억 단계에 나온 얼굴은 어느 것입니까?',
    recognitionProgress: '{total}회 중 {current}번째',
    nameRecall: '이름 고르기',
    namePrompt: '이 사람의 이름은 무엇입니까?',
    factRecall: '사실 고르기',
    factPrompt: '이 사람에게 해당하던 사실은 무엇입니까?',
    pause: '일시정지',
    resume: '계속하기',
    restart: '다시 시작',
    levelLine: '레벨 {level} · 얼굴: {people}',
    portrait: '합성 일러스트 초상 {n}: {shape}, {hair}{glasses}.',
    glassesSuffix: ', 둥근 안경',
    shape: { oval: '타원형 윤곽', round: '둥근 윤곽', long: '긴 윤곽', angular: '각진 윤곽' },
    hair: { crop: '짧은 머리', wave: '웨이브 머리', curve: '둥근 머리', parted: '가르마 머리' },
  },
  ar: {
    title: 'وجوه وأسماء',
    skill: 'الذاكرة الترابطية',
    rulesTitle: 'طريقة اللعب',
    rulesBody: 'احفظ لكل شخصية صورتها التخليقية واسمها الدقيق وحقيقة محايدة عنها.',
    rulesRecall: 'بعد مهمة قصيرة اختر الوجه المألوف، ثم اسمه، وفي المستويات العليا حقيقته.',
    privacy: 'كل الصور مولَّدة برمجياً: لا صور فوتوغرافية ولا جهات اتصال ولا مستخدمين حقيقيين هنا.',
    fairness: 'يظهر الاسم دائماً بالنص نفسه بالضبط. والاسم غير المألوف لا يُخصم عليه أكثر.',
    keyboardHelp: 'لوحة المفاتيح: Tab للتنقل بين الخيارات، Enter أو المسافة للاختيار، P للإيقاف المؤقت، R لإعادة البدء.',
    start: 'ابدأ الحفظ',
    exit: 'خروج',
    study: 'مرحلة الحفظ',
    studyProgress: 'الشخص {current} من {total}',
    rememberName: 'الاسم',
    rememberFact: 'الحقيقة',
    nextPerson: 'الشخص التالي',
    startPause: 'انتقل إلى المهمة القصيرة',
    interference: 'مهمة قصيرة',
    interferenceBody: 'احسب الجمع، ثم يبدأ اختبار الذاكرة.',
    interferenceProgress: 'المهمة {current} من {total}',
    recognition: 'تمييز الوجه',
    recognitionPrompt: 'أي وجه ظهر في مرحلة الحفظ؟',
    recognitionProgress: 'الاختبار {current} من {total}',
    nameRecall: 'اختر الاسم',
    namePrompt: 'ما اسم هذه الشخصية؟',
    factRecall: 'اختر الحقيقة',
    factPrompt: 'أي حقيقة كانت تخص هذه الشخصية؟',
    pause: 'إيقاف مؤقت',
    resume: 'متابعة',
    restart: 'إعادة البدء',
    levelLine: 'المستوى {level} · الوجوه: {people}',
    portrait: 'صورة توضيحية تخليقية {n}: {shape}، {hair}{glasses}.',
    glassesSuffix: '، نظارة دائرية',
    shape: { oval: 'ملامح بيضاوية', round: 'ملامح مستديرة', long: 'ملامح ممدودة', angular: 'ملامح حادة' },
    hair: { crop: 'شعر قصير', wave: 'شعر مموج', curve: 'شعر مستدير', parted: 'شعر بفرق' },
  },
};

/** Незнакомый язык — английский, а не пустой экран. Тип этого не допускает, но рантайм бывает шире типа. */
export function getFacesNamesStrings(locale: FacesNamesLocale): FacesNamesStrings {
  return STRINGS[locale] ?? STRINGS.en;
}

export function interpolateFacesNames(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  ));
}

/** Текст факта на языке интерфейса. Ключ факта не переводится — переводится сам факт. */
export function getFactText(locale: FacesNamesLocale, factId: string): string {
  const item = factById(factId);
  if (!item) return factId;
  return item.text[locale] ?? item.text.en;
}

/**
 * Описание портрета для экранного диктора. Говорит только про контур, причёску и
 * очки — ни про пол, ни про возраст, ни про происхождение. Это не осторожность
 * ради осторожности: портрет процедурный, и любая такая догадка была бы
 * выдумкой про несуществующего человека, сказанной тому, кто проверить не может.
 */
export function describeSyntheticFace(
  locale: FacesNamesLocale,
  face: SyntheticFaceSpec,
): string {
  const strings = getFacesNamesStrings(locale);
  const ordinal = Number.parseInt(face.assetId.slice(-2), 10) || face.variant + 1;
  return interpolateFacesNames(strings.portrait, {
    n: ordinal,
    shape: strings.shape[face.faceShape],
    hair: strings.hair[face.hairStyle],
    glasses: face.glasses ? strings.glassesSuffix : '',
  });
}
