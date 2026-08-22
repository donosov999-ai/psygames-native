/* psygames-mental-rotation-i18n · VER 1 · 23.08.2026 */
/**
 * СЛОВАРЬ МОДУЛЯ — ДВЕНАДЦАТЬ ЯЗЫКОВ, А НЕ ДВА.
 *
 * 🔴 ПОЧЕМУ НОВЫЕ СТРОКИ ЖИВУТ ЗДЕСЬ, А НЕ В ОБЩЕМ СЛОВАРЕ. Базовые `ru`/`en`
 * приложения лежат ИНЛАЙНОМ в `LanguageContext`, а `src/contexts/translations/*`
 * — только десять оверлеев поверх этой базы. Ключ, заведённый в оверлеях без
 * базы, вернул бы русскому и англичанину САМО ИМЯ КЛЮЧА («netPrompt» на экране).
 * Поэтому строки партии живут в модуле — и сразу на все двенадцать языков, как у
 * «Соедини точки», «Одной линии» и остальных лабораторных игр.
 *
 * ⚠️ ЧЕГО ЗДЕСЬ НЕТ И ПОЧЕМУ. Ни одной строки, выбранной тернарником по языку
 * (`language === 'ru' ? … : …`): такая развилка знает ровно два языка из
 * двенадцати, и немец с корейцем читают английскую подпись посреди своего
 * экрана. Это тот самый класс дыры, ради которого заведён гейт
 * `games-module-i18n`; его правила повторены пробой этой игры
 * (`mental-rotation-tasks.test.ts`) — по РЕАЛЬНО ВОЗВРАЩЁННЫМ объектам, а не по
 * разбору исходника.
 *
 * ⚠️ ПОДСТАНОВКИ ЧИТАЮТСЯ ПО-РАЗНОМУ НА РАЗНЫХ ЯЗЫКАХ. «Как выглядит фигура,
 * если смотреть {view}?» — предлог у направления взгляда СВОЙ в каждом языке
 * («сверху», «from above», «von oben», «上から»), поэтому предлог входит в саму
 * подстановку, а не в шаблон. Иначе перевод пришлось бы ломать под русский
 * порядок слов.
 */
import type { MentalRotationLocale } from './types';

export interface MentalRotationStrings {
  /** Слово перед видом задания в поле партии («Задание: Развёртка»). */
  taskLabel: string;
  taskRotation: string;
  taskProjection: string;
  taskNet: string;
  /** Вопрос пробы на проекцию. `{view}` — направление взгляда со своим предлогом. */
  projectionPrompt: string;
  viewTop: string;
  viewFront: string;
  viewSide: string;
  /** Вопрос пробы на развёртку. */
  netPrompt: string;
  /** Подписи под вариантами после ответа — чем именно вариант хорош или плох. */
  optionCorrect: string;
  optionMirror: string;
  optionOther: string;
  optionOtherView: string;
  optionEditedShape: string;
  optionSwap: string;
  /** Разбор ответа. */
  reviewTitle: string;
  reviewRotationHint: string;
  /** Подпись кадра разбора: `{n}` — номер шага, `{axis}` — ось поворота. */
  reviewStep: string;
  axisX: string;
  axisY: string;
  axisZ: string;
  reviewProjectionHint: string;
  reviewNetHint: string;
  reviewNext: string;
  /** Доступность: подпись варианта для чтения с экрана. `{n}` — номер. */
  a11yOption: string;
  /** Строка на экране настройки: из чего состоит партия. */
  kindsSummary: string;
}

const STRINGS: Record<MentalRotationLocale, MentalRotationStrings> = {
  ru: {
    taskLabel: 'Задание',
    taskRotation: 'Поворот',
    taskProjection: 'Проекция',
    taskNet: 'Развёртка',
    projectionPrompt: 'Как выглядит фигура, если смотреть {view}?',
    viewTop: 'сверху',
    viewFront: 'спереди',
    viewSide: 'справа',
    netPrompt: 'Какой кубик сложится из этой выкройки?',
    optionCorrect: 'верный ответ',
    optionMirror: 'зеркало',
    optionOther: 'другая фигура',
    optionOtherView: 'вид с другой стороны',
    optionEditedShape: 'кубик не на месте',
    optionSwap: 'грани переставлены',
    reviewTitle: 'Разбор',
    reviewRotationHint: 'Эталон поворачивается шаг за шагом к правильному ответу.',
    reviewStep: 'Шаг {n}: {axis}',
    axisX: 'ось X',
    axisY: 'ось Y',
    axisZ: 'ось Z',
    reviewProjectionHint: 'Клетка закрашена, если вдоль этой линии взгляда стоит хотя бы один кубик.',
    reviewNetHint: 'Верный кубик складывается из выкройки; зеркальный не совместить с ним никаким поворотом.',
    reviewNext: 'Дальше',
    a11yOption: 'Вариант {n}',
    kindsSummary: 'Три вида заданий: поворот, проекция, развёртка.',
  },
  en: {
    taskLabel: 'Task',
    taskRotation: 'Rotation',
    taskProjection: 'Projection',
    taskNet: 'Cube net',
    projectionPrompt: 'How does the shape look {view}?',
    viewTop: 'from above',
    viewFront: 'from the front',
    viewSide: 'from the right',
    netPrompt: 'Which cube folds from this net?',
    optionCorrect: 'correct',
    optionMirror: 'mirror',
    optionOther: 'another shape',
    optionOtherView: 'view from another side',
    optionEditedShape: 'one cube moved',
    optionSwap: 'two faces swapped',
    reviewTitle: 'Walkthrough',
    reviewRotationHint: 'The reference turns step by step into the correct option.',
    reviewStep: 'Step {n}: {axis}',
    axisX: 'X axis',
    axisY: 'Y axis',
    axisZ: 'Z axis',
    reviewProjectionHint: 'A cell is filled when at least one cube stands along that line of sight.',
    reviewNetHint: 'The right cube folds from the net; a mirrored one never matches, however you turn it.',
    reviewNext: 'Next',
    a11yOption: 'Option {n}',
    kindsSummary: 'Three task types: rotation, projection, cube net.',
  },
  es: {
    taskLabel: 'Tarea',
    taskRotation: 'Rotación',
    taskProjection: 'Proyección',
    taskNet: 'Desarrollo',
    projectionPrompt: '¿Cómo se ve la figura {view}?',
    viewTop: 'desde arriba',
    viewFront: 'de frente',
    viewSide: 'desde la derecha',
    netPrompt: '¿Qué cubo se forma con este desarrollo?',
    optionCorrect: 'correcta',
    optionMirror: 'espejo',
    optionOther: 'otra figura',
    optionOtherView: 'vista desde otro lado',
    optionEditedShape: 'un cubo movido',
    optionSwap: 'dos caras intercambiadas',
    reviewTitle: 'Explicación',
    reviewRotationHint: 'La figura de referencia gira paso a paso hasta la opción correcta.',
    reviewStep: 'Paso {n}: {axis}',
    axisX: 'eje X',
    axisY: 'eje Y',
    axisZ: 'eje Z',
    reviewProjectionHint: 'Una casilla se rellena si hay al menos un cubo en esa línea de visión.',
    reviewNetHint: 'El cubo correcto se pliega desde el desarrollo; el reflejado no coincide por más que lo gires.',
    reviewNext: 'Siguiente',
    a11yOption: 'Opción {n}',
    kindsSummary: 'Tres tipos de tarea: rotación, proyección y desarrollo.',
  },
  de: {
    taskLabel: 'Aufgabe',
    taskRotation: 'Drehung',
    taskProjection: 'Projektion',
    taskNet: 'Würfelnetz',
    projectionPrompt: 'Wie sieht die Figur {view} aus?',
    viewTop: 'von oben',
    viewFront: 'von vorn',
    viewSide: 'von rechts',
    netPrompt: 'Welcher Würfel entsteht aus diesem Netz?',
    optionCorrect: 'richtig',
    optionMirror: 'Spiegelbild',
    optionOther: 'andere Figur',
    optionOtherView: 'Ansicht von einer anderen Seite',
    optionEditedShape: 'ein Würfel verschoben',
    optionSwap: 'zwei Flächen vertauscht',
    reviewTitle: 'Auflösung',
    reviewRotationHint: 'Die Referenzfigur dreht sich Schritt für Schritt zur richtigen Option.',
    reviewStep: 'Schritt {n}: {axis}',
    axisX: 'X-Achse',
    axisY: 'Y-Achse',
    axisZ: 'Z-Achse',
    reviewProjectionHint: 'Ein Feld ist gefüllt, wenn in dieser Blickrichtung mindestens ein Würfel steht.',
    reviewNetHint: 'Der richtige Würfel entsteht aus dem Netz; der gespiegelte passt durch keine Drehung.',
    reviewNext: 'Weiter',
    a11yOption: 'Variante {n}',
    kindsSummary: 'Drei Aufgabentypen: Drehung, Projektion, Würfelnetz.',
  },
  zh: {
    taskLabel: '任务',
    taskRotation: '旋转',
    taskProjection: '投影',
    taskNet: '展开图',
    projectionPrompt: '{view}看，这个图形是什么样子？',
    viewTop: '从上面',
    viewFront: '从正面',
    viewSide: '从右面',
    netPrompt: '这张展开图能折成哪个立方体？',
    optionCorrect: '正确',
    optionMirror: '镜像',
    optionOther: '另一个图形',
    optionOtherView: '另一个方向的视图',
    optionEditedShape: '有一个方块移位',
    optionSwap: '两个面调换了',
    reviewTitle: '解析',
    reviewRotationHint: '参照图形一步一步转到正确选项。',
    reviewStep: '第 {n} 步：{axis}',
    axisX: 'X 轴',
    axisY: 'Y 轴',
    axisZ: 'Z 轴',
    reviewProjectionHint: '沿这条视线只要有一个方块，格子就被填上。',
    reviewNetHint: '正确的立方体能由展开图折成；镜像的怎么转都对不上。',
    reviewNext: '继续',
    a11yOption: '选项 {n}',
    kindsSummary: '三种题型：旋转、投影、展开图。',
  },
  hi: {
    taskLabel: 'कार्य',
    taskRotation: 'घुमाव',
    taskProjection: 'प्रक्षेपण',
    taskNet: 'घन-जाल',
    projectionPrompt: '{view} देखने पर यह आकृति कैसी दिखेगी?',
    viewTop: 'ऊपर से',
    viewFront: 'सामने से',
    viewSide: 'दाईं ओर से',
    netPrompt: 'इस जाल को मोड़ने पर कौन-सा घन बनेगा?',
    optionCorrect: 'सही',
    optionMirror: 'दर्पण-प्रति',
    optionOther: 'दूसरी आकृति',
    optionOtherView: 'दूसरी दिशा से दृश्य',
    optionEditedShape: 'एक घन खिसका हुआ',
    optionSwap: 'दो फलक अदल-बदल',
    reviewTitle: 'व्याख्या',
    reviewRotationHint: 'संदर्भ आकृति कदम-दर-कदम घूमकर सही विकल्प बन जाती है।',
    reviewStep: 'चरण {n}: {axis}',
    axisX: 'X अक्ष',
    axisY: 'Y अक्ष',
    axisZ: 'Z अक्ष',
    reviewProjectionHint: 'उस दृष्टि-रेखा पर एक भी घन हो तो खाना भर जाता है।',
    reviewNetHint: 'सही घन जाल से मुड़कर बनता है; दर्पण-प्रति किसी भी घुमाव से नहीं मिलती।',
    reviewNext: 'आगे',
    a11yOption: 'विकल्प {n}',
    kindsSummary: 'तीन तरह के कार्य: घुमाव, प्रक्षेपण, घन-जाल।',
  },
  pt: {
    taskLabel: 'Tarefa',
    taskRotation: 'Rotação',
    taskProjection: 'Projeção',
    taskNet: 'Planificação',
    projectionPrompt: 'Como fica a figura vista {view}?',
    viewTop: 'de cima',
    viewFront: 'de frente',
    viewSide: 'da direita',
    netPrompt: 'Que cubo se forma com esta planificação?',
    optionCorrect: 'correta',
    optionMirror: 'espelho',
    optionOther: 'outra figura',
    optionOtherView: 'vista de outro lado',
    optionEditedShape: 'um cubo deslocado',
    optionSwap: 'duas faces trocadas',
    reviewTitle: 'Explicação',
    reviewRotationHint: 'A figura de referência gira passo a passo até a opção correta.',
    reviewStep: 'Passo {n}: {axis}',
    axisX: 'eixo X',
    axisY: 'eixo Y',
    axisZ: 'eixo Z',
    reviewProjectionHint: 'Uma casa fica preenchida se houver ao menos um cubo nessa linha de visão.',
    reviewNetHint: 'O cubo certo dobra-se a partir da planificação; o espelhado não coincide por rotação alguma.',
    reviewNext: 'Seguinte',
    a11yOption: 'Opção {n}',
    kindsSummary: 'Três tipos de tarefa: rotação, projeção, planificação.',
  },
  fr: {
    taskLabel: 'Tâche',
    taskRotation: 'Rotation',
    taskProjection: 'Projection',
    taskNet: 'Patron',
    projectionPrompt: 'À quoi ressemble la figure vue {view} ?',
    viewTop: 'de dessus',
    viewFront: 'de face',
    viewSide: 'de droite',
    netPrompt: 'Quel cube obtient-on avec ce patron ?',
    optionCorrect: 'bonne réponse',
    optionMirror: 'miroir',
    optionOther: 'autre figure',
    optionOtherView: 'vue d’un autre côté',
    optionEditedShape: 'un cube déplacé',
    optionSwap: 'deux faces interverties',
    reviewTitle: 'Explication',
    reviewRotationHint: 'La figure de référence pivote pas à pas jusqu’à la bonne option.',
    reviewStep: 'Étape {n} : {axis}',
    axisX: 'axe X',
    axisY: 'axe Y',
    axisZ: 'axe Z',
    reviewProjectionHint: 'Une case est remplie s’il y a au moins un cube sur cette ligne de vue.',
    reviewNetHint: 'Le bon cube se plie à partir du patron ; le cube miroir ne coïncide avec aucune rotation.',
    reviewNext: 'Suivant',
    a11yOption: 'Choix {n}',
    kindsSummary: 'Trois types d’exercice : rotation, projection, patron.',
  },
  it: {
    taskLabel: 'Compito',
    taskRotation: 'Rotazione',
    taskProjection: 'Proiezione',
    taskNet: 'Sviluppo',
    projectionPrompt: 'Come appare la figura vista {view}?',
    viewTop: 'dall’alto',
    viewFront: 'di fronte',
    viewSide: 'da destra',
    netPrompt: 'Quale cubo si ottiene da questo sviluppo?',
    optionCorrect: 'corretta',
    optionMirror: 'specchio',
    optionOther: 'altra figura',
    optionOtherView: 'vista da un altro lato',
    optionEditedShape: 'un cubetto spostato',
    optionSwap: 'due facce scambiate',
    reviewTitle: 'Spiegazione',
    reviewRotationHint: 'La figura di riferimento ruota passo dopo passo fino all’opzione corretta.',
    reviewStep: 'Passo {n}: {axis}',
    axisX: 'asse X',
    axisY: 'asse Y',
    axisZ: 'asse Z',
    reviewProjectionHint: 'Una casella è piena se lungo quella linea di vista c’è almeno un cubetto.',
    reviewNetHint: 'Il cubo giusto si piega dallo sviluppo; quello speculare non combacia con nessuna rotazione.',
    reviewNext: 'Avanti',
    a11yOption: 'Opzione {n}',
    kindsSummary: 'Tre tipi di esercizio: rotazione, proiezione, sviluppo.',
  },
  ja: {
    taskLabel: '課題',
    taskRotation: '回転',
    taskProjection: '投影',
    taskNet: '展開図',
    projectionPrompt: '{view}見ると、この立体はどう見える？',
    viewTop: '上から',
    viewFront: '正面から',
    viewSide: '右から',
    netPrompt: 'この展開図を折るとどの立方体になる？',
    optionCorrect: '正解',
    optionMirror: '鏡像',
    optionOther: '別の形',
    optionOtherView: '別方向からの見え方',
    optionEditedShape: 'キューブが一つずれている',
    optionSwap: '面が二つ入れ替わっている',
    reviewTitle: '解説',
    reviewRotationHint: '基準の立体が一手ずつ回って正解の向きになる。',
    reviewStep: '{n} 手目：{axis}',
    axisX: 'X 軸',
    axisY: 'Y 軸',
    axisZ: 'Z 軸',
    reviewProjectionHint: 'その視線上に立方体が一つでもあれば、そのマスは塗られる。',
    reviewNetHint: '正解の立方体は展開図から折れる。鏡像はどう回しても重ならない。',
    reviewNext: '次へ',
    a11yOption: '選択肢 {n}',
    kindsSummary: '課題は三種類：回転・投影・展開図。',
  },
  ko: {
    taskLabel: '과제',
    taskRotation: '회전',
    taskProjection: '투영',
    taskNet: '전개도',
    projectionPrompt: '{view} 보면 이 도형은 어떻게 보일까요?',
    viewTop: '위에서',
    viewFront: '앞에서',
    viewSide: '오른쪽에서',
    netPrompt: '이 전개도를 접으면 어떤 정육면체가 될까요?',
    optionCorrect: '정답',
    optionMirror: '거울상',
    optionOther: '다른 도형',
    optionOtherView: '다른 방향에서 본 모습',
    optionEditedShape: '큐브 하나가 어긋남',
    optionSwap: '두 면이 서로 바뀜',
    reviewTitle: '해설',
    reviewRotationHint: '기준 도형이 한 단계씩 돌아 정답 방향이 됩니다.',
    reviewStep: '{n}단계: {axis}',
    axisX: 'X축',
    axisY: 'Y축',
    axisZ: 'Z축',
    reviewProjectionHint: '그 시선 위에 큐브가 하나라도 있으면 칸이 채워집니다.',
    reviewNetHint: '정답 정육면체는 전개도로 접힙니다. 거울상은 아무리 돌려도 겹치지 않습니다.',
    reviewNext: '다음',
    a11yOption: '선택지 {n}',
    kindsSummary: '과제는 세 가지: 회전, 투영, 전개도.',
  },
  ar: {
    taskLabel: 'المهمة',
    taskRotation: 'تدوير',
    taskProjection: 'إسقاط',
    taskNet: 'شبكة المكعب',
    projectionPrompt: 'كيف يبدو الشكل {view}؟',
    viewTop: 'من الأعلى',
    viewFront: 'من الأمام',
    viewSide: 'من اليمين',
    netPrompt: 'أي مكعب ينتج عن طي هذه الشبكة؟',
    optionCorrect: 'صحيح',
    optionMirror: 'انعكاس مرآتي',
    optionOther: 'شكل آخر',
    optionOtherView: 'منظر من جهة أخرى',
    optionEditedShape: 'مكعّب واحد في غير موضعه',
    optionSwap: 'وجهان متبادلان',
    reviewTitle: 'الشرح',
    reviewRotationHint: 'يدور الشكل المرجعي خطوة بخطوة حتى يصل إلى الخيار الصحيح.',
    reviewStep: 'الخطوة {n}: {axis}',
    axisX: 'المحور X',
    axisY: 'المحور Y',
    axisZ: 'المحور Z',
    reviewProjectionHint: 'تمتلئ الخانة إذا وقف مكعّب واحد على الأقل على خط النظر هذا.',
    reviewNetHint: 'المكعب الصحيح يُطوى من الشبكة، أما المعكوس مرآتيًا فلا يطابقه أي تدوير.',
    reviewNext: 'التالي',
    a11yOption: 'الخيار {n}',
    kindsSummary: 'ثلاثة أنواع من المهام: التدوير والإسقاط وشبكة المكعب.',
  },
};

/** Незнакомый язык — английский, а не пустой экран. Тип этого не допускает, но рантайм бывает шире типа. */
export function getMentalRotationStrings(locale: MentalRotationLocale): MentalRotationStrings {
  return STRINGS[locale] ?? STRINGS.en;
}

export function interpolateMentalRotation(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  ));
}
