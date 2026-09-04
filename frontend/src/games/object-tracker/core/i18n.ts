/* psygames-object-tracker-i18n · VER 2 · 19.08.2026 */
/**
 * СВОЙ СЛОВАРЬ МОДУЛЯ «Трекер объектов» — НА ВСЕ ДВЕНАДЦАТЬ ЯЗЫКОВ (VER 2).
 *
 * 🔴 ЧТО БЫЛО СЛОМАНО. Модуль пришёл из лаборатории (`~/dev/psygames-game-lab`,
 * ветка `codex/game-object-tracker`) со словарём на `ru` и `en`. У приложения
 * языков двенадцать: человек с интерфейсом на японском видел «Track the
 * targets» и «Object 3» посреди своего экрана. Гейт ci-i18n-hardcode-guard эту
 * дыру поймать не мог — он смотрит только в `app/games/*`, а здесь `src/games`.
 *
 * ⚠️ РАСХОЖДЕНИЕ С ЛАБОРАТОРИЕЙ №1, НАМЕРЕННОЕ. Добавлены три ключа:
 * `levelLine`, `stepProgress`, `reducedModeBadge`. В лабораторном адаптере
 * строка уровня была зашита по-английски прямо в вёрстке (`Level 5 · 12 / 5`).
 *
 * 🔴 РАСХОЖДЕНИЕ №2, VER 2: УБРАНЫ ЧЕТЫРНАДЦАТЬ МЁРТВЫХ КЛЮЧЕЙ. При интеграции у
 * модуля забрали СВОЙ экран итога (итог рисует общий LevelCleared — иначе не
 * запишутся звёзды и серия), а строки от него остались лежать: `resultTitle`,
 * `playAgain`, `noAutoAdvance`, `accuracy`, `hits`, `misses`,
 * `falseSelections`, `closeApproaches`, `duration`, `seed`. Туда же — `start`,
 * `pause`, `resume` (кнопку запуска рисует экран-обёртка через `t('start')`,
 * паузу держит общая рамка приложения) и `rulesTitle` (обёртка выводит только
 * `rulesBody` + `rulesSelection`). Ни одну из них ни разу не показали ни в
 * приложении, ни в самом модуле. Строка, переведённая на двенадцать языков и не
 * выведенная ни разу, — это не запас, а ложное «переведено»: ровно так уже
 * случилось с бейджем отсчёта в SET. Что мёртвых ключей нет, держит гейт
 * games-module-i18n.
 */
import type { ObjectTrackerLocale } from './types';

export interface ObjectTrackerStrings {
  /** Заставка правил (экран-обёртка) */
  title: string;
  skill: string;
  rulesBody: string;
  rulesSelection: string;
  reducedMotionInfo: string;
  keyboardHelp: string;
  /** Ход раунда */
  beginMotion: string;
  preview: string;
  moving: string;
  selection: string;
  selectProgress: string;
  stepMotion: string;
  motionProgress: string;
  restart: string;
  exit: string;
  /** Подписи для экранного диктора */
  objectLabel: string;
  targetPreviewLabel: string;
  selectedLabel: string;
  /** Шапка поля и щадящий режим */
  levelLine: string;
  stepProgress: string;
  reducedModeBadge: string;
}

const STRINGS: Record<ObjectTrackerLocale, ObjectTrackerStrings> = {
  ru: {
    title: 'Трекер объектов',
    skill: 'Динамическое распределённое внимание',
    rulesBody: 'Запомните отмеченные объекты. После запуска отметки исчезнут, а все объекты начнут двигаться одинаково.',
    rulesSelection: 'Когда движение остановится, выберите ровно столько объектов, сколько было отмечено в начале.',
    reducedMotionInfo: 'При уменьшении движения траектория проходит контролируемыми шагами — игра и оценка остаются доступными.',
    keyboardHelp: 'Tab и Enter — навигация и выбор. R — начать раунд заново.',
    beginMotion: 'Запомнил — запустить движение',
    preview: 'Запомните цели',
    moving: 'Следите за целями',
    selection: 'Выберите цели',
    selectProgress: 'Выбрано {selected} из {total}',
    stepMotion: 'Следующий шаг движения',
    motionProgress: 'Движение {current} из {total} с',
    restart: 'Начать заново',
    exit: 'Выйти',
    objectLabel: 'Объект {index}',
    targetPreviewLabel: 'Цель {index}',
    selectedLabel: 'Объект {index}, выбран',
    levelLine: 'Уровень {level} · объектов {objects} · целей {targets}',
    stepProgress: 'Шаг {current} из {total}',
    reducedModeBadge: 'Щадящий режим: движение идёт шагами по вашей кнопке',
  },
  en: {
    title: 'Object Tracker',
    skill: 'Dynamic distributed attention',
    rulesBody: 'Remember the highlighted objects. Their marks disappear when identical objects start moving.',
    rulesSelection: 'After motion stops, select exactly as many objects as were highlighted at the start.',
    reducedMotionInfo: 'With reduced motion, the trajectory advances in controlled steps, keeping the game and scoring available.',
    keyboardHelp: 'Tab and Enter navigate and select. R restarts the round.',
    beginMotion: 'Ready — start motion',
    preview: 'Remember the targets',
    moving: 'Track the targets',
    selection: 'Select the targets',
    selectProgress: 'Selected {selected} of {total}',
    stepMotion: 'Next motion step',
    motionProgress: 'Motion {current} of {total} s',
    restart: 'Restart',
    exit: 'Exit',
    objectLabel: 'Object {index}',
    targetPreviewLabel: 'Target {index}',
    selectedLabel: 'Object {index}, selected',
    levelLine: 'Level {level} · {objects} objects · {targets} targets',
    stepProgress: 'Step {current} of {total}',
    reducedModeBadge: 'Reduced motion: the round advances step by step on your button',
  },
  es: {
    title: 'Sigue los objetos',
    skill: 'Atención dinámica repartida',
    rulesBody: 'Memoriza los objetos marcados. Al arrancar, las marcas desaparecen y todos los objetos se mueven igual.',
    rulesSelection: 'Cuando el movimiento pare, elige exactamente tantos objetos como había marcados al principio.',
    reducedMotionInfo: 'Con movimiento reducido, la trayectoria avanza a pasos controlados: el juego y la puntuación siguen disponibles.',
    keyboardHelp: 'Tab y Enter para moverse y elegir. R reinicia la ronda.',
    beginMotion: 'Ya los tengo — arrancar el movimiento',
    preview: 'Memoriza los objetivos',
    moving: 'Sigue los objetivos',
    selection: 'Elige los objetivos',
    selectProgress: 'Elegidos {selected} de {total}',
    stepMotion: 'Siguiente paso del movimiento',
    motionProgress: 'Movimiento {current} de {total} s',
    restart: 'Reiniciar',
    exit: 'Salir',
    objectLabel: 'Objeto {index}',
    targetPreviewLabel: 'Objetivo {index}',
    selectedLabel: 'Objeto {index}, elegido',
    levelLine: 'Nivel {level} · objetos {objects} · objetivos {targets}',
    stepProgress: 'Paso {current} de {total}',
    reducedModeBadge: 'Modo suave: el movimiento avanza a pasos con tu botón',
  },
  de: {
    title: 'Objekte verfolgen',
    skill: 'Dynamisch verteilte Aufmerksamkeit',
    rulesBody: 'Merke dir die markierten Objekte. Beim Start verschwinden die Marken, und alle Objekte bewegen sich gleich.',
    rulesSelection: 'Wenn die Bewegung stoppt, wähle genau so viele Objekte, wie am Anfang markiert waren.',
    reducedMotionInfo: 'Bei reduzierter Bewegung läuft die Bahn in gesteuerten Schritten — Spiel und Wertung bleiben nutzbar.',
    keyboardHelp: 'Tab und Enter navigieren und wählen. R startet die Runde neu.',
    beginMotion: 'Gemerkt — Bewegung starten',
    preview: 'Merke dir die Ziele',
    moving: 'Verfolge die Ziele',
    selection: 'Wähle die Ziele',
    selectProgress: '{selected} von {total} gewählt',
    stepMotion: 'Nächster Bewegungsschritt',
    motionProgress: 'Bewegung {current} von {total} s',
    restart: 'Neu starten',
    exit: 'Beenden',
    objectLabel: 'Objekt {index}',
    targetPreviewLabel: 'Ziel {index}',
    selectedLabel: 'Objekt {index}, gewählt',
    levelLine: 'Stufe {level} · Objekte {objects} · Ziele {targets}',
    stepProgress: 'Schritt {current} von {total}',
    reducedModeBadge: 'Schonmodus: die Bewegung läuft schrittweise auf deinen Knopf',
  },
  zh: {
    title: '动的目标要盯住',
    skill: '动态分配注意力',
    rulesBody: '记住带标记的目标。开始之后标记会消失，所有物体一起动起来。',
    rulesSelection: '等运动停下来，选出和开头标记数量一样多的物体。',
    reducedMotionInfo: '减弱动效时，轨迹按可控的步子推进——照样能玩，也照样计分。',
    keyboardHelp: 'Tab 和回车用来切换和选择，R 重新开始本轮。',
    beginMotion: '记住了——开始运动',
    preview: '记住目标',
    moving: '盯住目标',
    selection: '选出目标',
    selectProgress: '已选 {selected} / {total}',
    stepMotion: '下一步运动',
    motionProgress: '运动 {total} 秒中的第 {current} 秒',
    restart: '重新开始',
    exit: '退出',
    objectLabel: '物体 {index}',
    targetPreviewLabel: '目标 {index}',
    selectedLabel: '物体 {index}，已选',
    levelLine: '第 {level} 关 · 物体 {objects} · 目标 {targets}',
    stepProgress: '第 {current} 步，共 {total} 步',
    reducedModeBadge: '轻缓模式：按你的按钮，一步一步地动',
  },
  hi: {
    title: 'चलती चीज़ों पर नज़र',
    skill: 'चलते-फिरते बँटा हुआ ध्यान',
    rulesBody: 'निशान लगी चीज़ों को याद कर लें। शुरू होते ही निशान मिट जाएँगे और सब एक जैसे चलने लगेंगे।',
    rulesSelection: 'चलना रुकते ही ठीक उतनी चीज़ें चुनें जितनी शुरू में निशान लगी थीं।',
    reducedMotionInfo: 'हलचल कम रखने पर रास्ता आपके काबू में कदम-दर-कदम बढ़ता है — खेल और अंक दोनों चलते रहते हैं।',
    keyboardHelp: 'Tab और Enter से आना-जाना और चुनाव। R से दौर फिर से।',
    beginMotion: 'याद हो गया — चलना शुरू करें',
    preview: 'निशाने याद करें',
    moving: 'निशानों पर नज़र रखें',
    selection: 'निशाने चुनें',
    selectProgress: '{total} में से {selected} चुने',
    stepMotion: 'चलने का अगला कदम',
    motionProgress: 'चलना: {total} में से {current} सेकंड',
    restart: 'नए सिरे से',
    exit: 'बाहर',
    objectLabel: 'चीज़ {index}',
    targetPreviewLabel: 'निशाना {index}',
    selectedLabel: 'चीज़ {index}, चुनी गई',
    levelLine: 'स्तर {level} · चीज़ें {objects} · निशाने {targets}',
    stepProgress: 'कदम {total} में से {current}',
    reducedModeBadge: 'नरम तरीका: हलचल आपके बटन से कदम-दर-कदम चलती है',
  },
  pt: {
    title: 'Siga os objetos',
    skill: 'Atenção distribuída em movimento',
    rulesBody: 'Memorize os objetos marcados. Ao começar, as marcas somem e todos os objetos passam a se mover igual.',
    rulesSelection: 'Quando o movimento parar, escolha exatamente tantos objetos quantos estavam marcados no início.',
    reducedMotionInfo: 'Com movimento reduzido, a trajetória avança em passos controlados — o jogo e a pontuação continuam disponíveis.',
    keyboardHelp: 'Tab e Enter para navegar e escolher. R recomeça a rodada.',
    beginMotion: 'Memorizei — começar o movimento',
    preview: 'Memorize os alvos',
    moving: 'Acompanhe os alvos',
    selection: 'Escolha os alvos',
    selectProgress: 'Escolhidos {selected} de {total}',
    stepMotion: 'Próximo passo do movimento',
    motionProgress: 'Movimento {current} de {total} s',
    restart: 'Recomeçar',
    exit: 'Sair',
    objectLabel: 'Objeto {index}',
    targetPreviewLabel: 'Alvo {index}',
    selectedLabel: 'Objeto {index}, escolhido',
    levelLine: 'Nível {level} · objetos {objects} · alvos {targets}',
    stepProgress: 'Passo {current} de {total}',
    reducedModeBadge: 'Modo suave: o movimento avança passo a passo no seu botão',
  },
  fr: {
    title: 'Suivi d’objets',
    skill: 'Attention répartie en mouvement',
    rulesBody: 'Mémorisez les objets marqués. Au départ, les marques disparaissent et tous les objets se déplacent pareil.',
    rulesSelection: 'Quand le mouvement s’arrête, choisissez exactement autant d’objets qu’il y en avait de marqués au début.',
    reducedMotionInfo: 'En mouvement réduit, la trajectoire avance par pas maîtrisés : le jeu et le score restent accessibles.',
    keyboardHelp: 'Tab et Entrée pour naviguer et choisir. R relance la manche.',
    beginMotion: 'C’est mémorisé — lancer le mouvement',
    preview: 'Mémorisez les cibles',
    moving: 'Suivez les cibles',
    selection: 'Choisissez les cibles',
    selectProgress: '{selected} sur {total} choisis',
    stepMotion: 'Pas de mouvement suivant',
    motionProgress: 'Mouvement {current} sur {total} s',
    restart: 'Recommencer',
    exit: 'Quitter',
    objectLabel: 'Objet {index}',
    targetPreviewLabel: 'Cible {index}',
    selectedLabel: 'Objet {index}, choisi',
    levelLine: 'Niveau {level} · objets {objects} · cibles {targets}',
    stepProgress: 'Pas {current} sur {total}',
    reducedModeBadge: 'Mode doux : le mouvement avance pas à pas à votre bouton',
  },
  it: {
    title: 'Segui gli oggetti',
    skill: 'Attenzione distribuita in movimento',
    rulesBody: 'Memorizza gli oggetti segnati. All’avvio i segni spariscono e tutti gli oggetti si muovono allo stesso modo.',
    rulesSelection: 'Quando il movimento si ferma, scegli esattamente tanti oggetti quanti erano segnati all’inizio.',
    reducedMotionInfo: 'Con il movimento ridotto la traiettoria avanza a passi controllati: gioco e punteggio restano disponibili.',
    keyboardHelp: 'Tab e Invio per spostarsi e scegliere. R ricomincia il turno.',
    beginMotion: 'Memorizzato — avvia il movimento',
    preview: 'Memorizza i bersagli',
    moving: 'Segui i bersagli',
    selection: 'Scegli i bersagli',
    selectProgress: 'Scelti {selected} di {total}',
    stepMotion: 'Passo di movimento successivo',
    motionProgress: 'Movimento {current} di {total} s',
    restart: 'Ricomincia',
    exit: 'Esci',
    objectLabel: 'Oggetto {index}',
    targetPreviewLabel: 'Bersaglio {index}',
    selectedLabel: 'Oggetto {index}, scelto',
    levelLine: 'Livello {level} · oggetti {objects} · bersagli {targets}',
    stepProgress: 'Passo {current} di {total}',
    reducedModeBadge: 'Modo morbido: il movimento avanza a passi con il tuo pulsante',
  },
  ja: {
    title: '動く的を追う',
    skill: '動きの中で注意を分ける力',
    rulesBody: '印のついた的を覚えます。始めると印は消え、すべての的が同じように動き出します。',
    rulesSelection: '動きが止まったら、最初に印がついていたのと同じ数だけ選びます。',
    reducedMotionInfo: '動きをひかえめにすると、軌道は自分の合図で一歩ずつ進みます。遊びも採点もそのまま使えます。',
    keyboardHelp: 'TabとEnterで移動と選択。Rでラウンドをやり直します。',
    beginMotion: '覚えた — 動かす',
    preview: '的を覚える',
    moving: '的を追う',
    selection: '的を選ぶ',
    selectProgress: '{total} 個中 {selected} 個を選択',
    stepMotion: '次の一歩',
    motionProgress: '動き {total} 秒中 {current} 秒',
    restart: 'やり直す',
    exit: '終了',
    objectLabel: '的 {index}',
    targetPreviewLabel: '目標 {index}',
    selectedLabel: '的 {index}、選択ずみ',
    levelLine: 'レベル {level} · 的 {objects} · 目標 {targets}',
    stepProgress: '{total} 歩中 {current} 歩目',
    reducedModeBadge: 'やさしいモード：自分のボタンで一歩ずつ動きます',
  },
  ko: {
    title: '움직이는 표적 추적',
    skill: '움직임 속에서 나눠 쓰는 주의력',
    rulesBody: '표시된 표적을 외우세요. 시작하면 표시가 사라지고 모든 물체가 똑같이 움직입니다.',
    rulesSelection: '움직임이 멈추면 처음에 표시돼 있던 수만큼만 정확히 고르세요.',
    reducedMotionInfo: '움직임을 줄이면 궤적이 통제된 걸음으로 나아갑니다. 놀이도 점수도 그대로 쓸 수 있습니다.',
    keyboardHelp: 'Tab과 Enter로 이동하고 고릅니다. R은 판을 다시 시작합니다.',
    beginMotion: '외웠어요 — 움직이기',
    preview: '표적 외우기',
    moving: '표적 놓치지 않기',
    selection: '표적 고르기',
    selectProgress: '{total}개 중 {selected}개 선택',
    stepMotion: '다음 움직임 한 걸음',
    motionProgress: '움직임 {total}초 중 {current}초',
    restart: '다시 시작',
    exit: '나가기',
    objectLabel: '물체 {index}',
    targetPreviewLabel: '표적 {index}',
    selectedLabel: '물체 {index}, 선택함',
    levelLine: '{level}단계 · 물체 {objects} · 표적 {targets}',
    stepProgress: '{total}걸음 중 {current}걸음',
    reducedModeBadge: '부드러운 모드: 버튼을 누를 때마다 한 걸음씩 움직입니다',
  },
  ar: {
    title: 'تتبّع الأجسام',
    skill: 'انتباه موزّع أثناء الحركة',
    rulesBody: 'احفظ الأجسام المميّزة. مع الانطلاق تختفي العلامات وتتحرك كل الأجسام بالطريقة نفسها.',
    rulesSelection: 'حين تتوقّف الحركة، اختر عدداً من الأجسام مساوياً تماماً لعدد المميّزة في البداية.',
    reducedMotionInfo: 'مع تخفيف الحركة يتقدّم المسار بخطوات منضبطة، ويبقى اللعب والتقييم متاحين.',
    keyboardHelp: 'Tab وEnter للتنقّل والاختيار. R يعيد الجولة.',
    beginMotion: 'حفظتها — ابدأ الحركة',
    preview: 'احفظ الأهداف',
    moving: 'تابع الأهداف',
    selection: 'اختر الأهداف',
    selectProgress: 'اخترت {selected} من {total}',
    stepMotion: 'خطوة الحركة التالية',
    motionProgress: 'الحركة {current} من {total} ث',
    restart: 'إعادة البدء',
    exit: 'خروج',
    objectLabel: 'جسم {index}',
    targetPreviewLabel: 'هدف {index}',
    selectedLabel: 'جسم {index}، مختار',
    levelLine: 'المستوى {level} · أجسام {objects} · أهداف {targets}',
    stepProgress: 'الخطوة {current} من {total}',
    reducedModeBadge: 'وضع لطيف: الحركة تتقدّم خطوة خطوة بزرّك',
  },
};

/** Незнакомый язык — английский, а не пустой экран. Тип этого не допускает, но рантайм бывает шире типа. */
export function getObjectTrackerStrings(locale: ObjectTrackerLocale): ObjectTrackerStrings {
  return STRINGS[locale] ?? STRINGS.en;
}

export function interpolateObjectTracker(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
}
