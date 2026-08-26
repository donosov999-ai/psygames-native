export type PauseLocale = 'ru' | 'en';

export type PracticeSetId =
  | 'breathing'
  | 'eye-gym'
  | 'face-speech'
  | 'relaxation'
  | 'pelvic-floor'
  | 'mobility'
  | 'postures'
  | 'abdomen'
  | 'isometrics'
  | 'feldenkrais';

export type PracticeContext = 'desk-invisible' | 'desk-visible' | 'home';
export type GuideMode = 'visual' | 'audio' | 'both';
export type PlanMode = 'solo' | 'parallel' | 'charge';
export type CatalogStatus = 'approved' | 'extension' | 'experimental';
export type ParallelClass = 'breath' | 'eyes' | 'face' | 'pelvic' | 'motor' | 'attention' | 'solo';
export type AttentionLoad = 'low' | 'peak';
export type MotionChannel = 'breath' | 'eyes' | 'face' | 'tension' | 'stretch' | 'voice' | 'still';
export type GuideChannel = 'scale' | 'position' | 'focus' | 'none' | 'tension';
export type LeaderShape = 'circle' | 'square' | 'triangle' | 'none';
export type VisualLeaderMode = 'center-shape' | 'single-dot' | 'full-screen-clock' | 'image-processing';
export type PracticeProgramRef = `${PracticeSetId}/${string}`;
export type WarningId =
  | 'general-stop'
  | 'breath-hold'
  | 'rapid-breathing'
  | 'pelvic-floor'
  | 'neck-mobility'
  | 'vacuum'
  | 'yoga-load'
  | 'voice-comfort'
  | 'advanced-abdomen'
  | 'experimental';

export interface LocalizedText {
  readonly ru: string;
  readonly en: string;
}

export interface PracticeStep {
  readonly id: string;
  readonly title: LocalizedText;
  readonly cue: LocalizedText;
  readonly durationMs: number;
  readonly attention: AttentionLoad;
  readonly channel: GuideChannel;
  readonly motion: MotionChannel;
}

export interface PracticeProgram {
  readonly id: string;
  readonly title: LocalizedText;
  readonly description: LocalizedText;
  readonly steps: readonly PracticeStep[];
  readonly contexts?: readonly PracticeContext[];
  readonly leaderShape?: LeaderShape;
  readonly warningIds?: readonly WarningId[];
  readonly soloOnly?: boolean;
  readonly requiresAudioInParallel?: boolean;
  readonly requiresPriorExperience?: boolean;
  /** Overrides the parent set status for a single catalog variation. */
  readonly status?: CatalogStatus;
  /** Overrides scheduling semantics when variations inside one set differ. */
  readonly parallelClass?: ParallelClass;
}

export interface PracticeSet {
  readonly id: PracticeSetId;
  readonly title: LocalizedText;
  readonly summary: LocalizedText;
  readonly status: CatalogStatus;
  readonly defaultEnabled: boolean;
  readonly contexts: readonly PracticeContext[];
  readonly parallelClass: ParallelClass;
  readonly warningIds?: readonly WarningId[];
  readonly programs: readonly PracticeProgram[];
  readonly defaultProgramId: string;
}

export interface PracticeSelection {
  readonly setId: PracticeSetId;
  readonly programId?: string;
}

export interface PlanRequest {
  readonly mode: PlanMode;
  readonly selections: readonly PracticeSelection[];
  readonly durationMs: number;
  readonly locale: PauseLocale;
  readonly guideMode: GuideMode;
  readonly context: PracticeContext;
  readonly soloCompletions?: Partial<Record<PracticeSetId, number>>;
  readonly masteryThreshold?: number;
  readonly acknowledgedWarnings?: readonly WarningId[];
  readonly confirmedPriorExperience?: readonly PracticeProgramRef[];
  readonly allowExperimental?: boolean;
  readonly visualLeaderMode?: VisualLeaderMode;
}

export interface PlanValidationIssue {
  readonly code:
    | 'INVALID_DURATION'
    | 'INVALID_SELECTION_COUNT'
    | 'DUPLICATE_SELECTION'
    | 'UNKNOWN_PROGRAM'
    | 'CONTEXT_UNAVAILABLE'
    | 'EXPERIMENTAL_DISABLED'
    | 'WARNING_NOT_ACKNOWLEDGED'
    | 'PRIOR_EXPERIENCE_REQUIRED'
    | 'MASTERY_REQUIRED'
    | 'PAIR_NOT_ALLOWED'
    | 'AUDIO_GUIDE_REQUIRED'
    | 'ATTENTION_PEAK_COLLISION'
    | 'DURATION_TOO_SHORT';
  readonly message: LocalizedText;
  readonly setIds?: readonly PracticeSetId[];
  readonly warningId?: WarningId;
  readonly programRef?: PracticeProgramRef;
}

export interface PlannedStep {
  readonly lane: number;
  readonly setId: PracticeSetId;
  readonly programId: string;
  readonly stepId: string;
  readonly title: string;
  readonly cue: string;
  readonly channel: GuideChannel;
  readonly motion: MotionChannel;
  readonly startMs: number;
  readonly endMs: number;
  readonly attentionPeakStartMs: number | null;
  readonly attentionPeakEndMs: number | null;
}

export interface PlanBlock {
  readonly id: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly setIds: readonly PracticeSetId[];
}

export interface PracticePlan {
  readonly id: string;
  readonly version: 'pause-practices-plan-v1';
  readonly mode: PlanMode;
  readonly locale: PauseLocale;
  readonly guideMode: GuideMode;
  readonly context: PracticeContext;
  readonly visualLeaderMode: VisualLeaderMode;
  readonly durationMs: number;
  readonly selections: readonly Required<PracticeSelection>[];
  readonly blocks: readonly PlanBlock[];
  readonly timeline: readonly PlannedStep[];
  readonly warningIds: readonly WarningId[];
  readonly priorExperienceProgramIds: readonly PracticeProgramRef[];
}

export interface GuideCue {
  readonly setId: PracticeSetId;
  readonly programId: string;
  readonly stepId: string;
  readonly title: string;
  readonly cue: string;
  readonly channel: GuideChannel;
  readonly motion: MotionChannel;
  readonly leaderShape: LeaderShape;
  readonly tone: ToneGuide | null;
  readonly progress: number;
}

export interface ToneGuide {
  readonly kind: 'pitch-ramp' | 'steady';
  readonly fromHz: number;
  readonly toHz: number;
}

export interface VisualGuideFrame {
  readonly mode: VisualLeaderMode;
  readonly shape: LeaderShape;
  readonly phaseProgress: number;
  readonly scale: number;
  readonly saturation: number;
  readonly blurPx: number;
  readonly pixelSize: number;
}

export interface ActiveFrame {
  readonly elapsedMs: number;
  readonly progress: number;
  readonly cues: readonly GuideCue[];
}

export type SessionPhase = 'ready' | 'running' | 'paused' | 'completed' | 'disposed';

export interface PracticeResult {
  readonly planId: string;
  readonly durationMs: number;
  readonly completedSetIds: readonly PracticeSetId[];
  readonly completion: 1;
  readonly adherence: 1;
  readonly interruptedCount: number;
}

export interface PracticeSession {
  readonly phase: SessionPhase;
  readonly plan: PracticePlan;
  readonly elapsedMs: number;
  readonly runningSinceMs: number | null;
  readonly interruptedCount: number;
  readonly result: PracticeResult | null;
}

const l = (ru: string, en: string): LocalizedText => ({ ru, en });
const s = (
  id: string,
  ruTitle: string,
  enTitle: string,
  ruCue: string,
  enCue: string,
  durationMs: number,
  attention: AttentionLoad,
  channel: MotionChannel,
): PracticeStep => {
  const guideChannel: GuideChannel = channel === 'breath'
    ? 'scale'
    : channel === 'tension'
      ? 'tension'
      : channel === 'eyes'
        ? (id === 'far-focus' || id === 'converge' || id === 'focus' ? 'focus' : id === 'palming' ? 'none' : 'position')
        : 'none';
  return {
    id,
    title: l(ruTitle, enTitle),
    cue: l(ruCue, enCue),
    durationMs,
    attention,
    channel: guideChannel,
    motion: channel,
  };
};

const p = (
  id: string,
  ruTitle: string,
  enTitle: string,
  ruDescription: string,
  enDescription: string,
  steps: readonly PracticeStep[],
  options: Pick<PracticeProgram, 'warningIds' | 'soloOnly' | 'requiresAudioInParallel' | 'requiresPriorExperience' | 'contexts' | 'leaderShape' | 'status' | 'parallelClass'> = {},
): PracticeProgram => ({
  id,
  title: l(ruTitle, enTitle),
  description: l(ruDescription, enDescription),
  steps,
  ...options,
});

const breathingPrograms: readonly PracticeProgram[] = [
  p('box', 'Квадрат 4–4–4–4', 'Box 4–4–4–4', 'Ровный цикл из четырёх фаз.', 'An even four-phase cycle.', [
    s('inhale', 'Вдох', 'Inhale', 'Вдохните носом мягко, без усилия.', 'Inhale gently through the nose.', 4_000, 'low', 'breath'),
    s('hold-in', 'Пауза', 'Hold', 'Не напрягайтесь; пропустите задержку при дискомфорте.', 'Stay relaxed; skip the hold if uncomfortable.', 4_000, 'low', 'breath'),
    s('exhale', 'Выдох', 'Exhale', 'Плавно выдохните.', 'Exhale smoothly.', 4_000, 'low', 'breath'),
    s('hold-out', 'Пауза', 'Hold', 'Сохраняйте спокойствие, без натуживания.', 'Stay calm without straining.', 4_000, 'low', 'breath'),
  ], { warningIds: ['breath-hold'], leaderShape: 'square' }),
  p('calm-478', 'Спокойное 4–7–8', 'Calm 4–7–8', 'Удлинённый цикл с задержкой.', 'A longer cycle with a hold.', [
    s('inhale', 'Вдох', 'Inhale', 'Мягкий вдох на четыре счёта.', 'Gentle inhale for four counts.', 4_000, 'low', 'breath'),
    s('hold', 'Пауза', 'Hold', 'Только комфортная задержка; можно сразу выдохнуть.', 'Hold only if comfortable; exhale early if needed.', 7_000, 'low', 'breath'),
    s('exhale', 'Выдох', 'Exhale', 'Длинный спокойный выдох.', 'Take a long, calm exhale.', 8_000, 'low', 'breath'),
  ], { warningIds: ['breath-hold'], leaderShape: 'circle' }),
  p('coherent', 'Резонансное 5,5–5,5', 'Coherent 5.5–5.5', 'Ровный вдох и выдох.', 'Even inhale and exhale.', [
    s('inhale', 'Вдох', 'Inhale', 'Вдохните плавно.', 'Inhale smoothly.', 5_500, 'low', 'breath'),
    s('exhale', 'Выдох', 'Exhale', 'Выдохните плавно.', 'Exhale smoothly.', 5_500, 'low', 'breath'),
  ], { leaderShape: 'circle' }),
  p('physiological-sigh', 'Физиологический вздох', 'Physiological sigh', 'Два мягких вдоха и длинный выдох.', 'Two gentle inhales and a long exhale.', [
    s('inhale-one', 'Первый вдох', 'First inhale', 'Мягко вдохните носом.', 'Inhale gently through the nose.', 2_000, 'low', 'breath'),
    s('inhale-two', 'Добавочный вдох', 'Second inhale', 'Небольшой добавочный вдох без усилия.', 'Add a small second inhale without strain.', 1_000, 'low', 'breath'),
    s('exhale', 'Длинный выдох', 'Long exhale', 'Медленно выдохните.', 'Exhale slowly.', 6_000, 'low', 'breath'),
  ], { leaderShape: 'triangle' }),
  p('extended-exhale', 'Удлинённый выдох 4–6', 'Extended exhale 4–6', 'Выдох немного длиннее вдоха.', 'The exhale is slightly longer than the inhale.', [
    s('inhale', 'Вдох', 'Inhale', 'Вдохните на четыре счёта.', 'Inhale for four counts.', 4_000, 'low', 'breath'),
    s('exhale', 'Выдох', 'Exhale', 'Выдохните на шесть счётов.', 'Exhale for six counts.', 6_000, 'low', 'breath'),
  ], { leaderShape: 'circle' }),
  p('calm-424', 'Спокойное 4–2–4', 'Calm 4–2–4', 'Короткая комфортная пауза между вдохом и выдохом.', 'A short comfortable pause between inhale and exhale.', [
    s('inhale', 'Вдох', 'Inhale', 'Мягко вдохните.', 'Inhale gently.', 4_000, 'low', 'breath'),
    s('hold', 'Пауза', 'Hold', 'Не задерживайте дыхание через силу.', 'Do not force the breath hold.', 2_000, 'low', 'breath'),
    s('exhale', 'Выдох', 'Exhale', 'Спокойно выдохните.', 'Exhale calmly.', 4_000, 'low', 'breath'),
  ], { warningIds: ['breath-hold'], leaderShape: 'triangle' }),
  p('wim-hof', 'Интенсивные циклы', 'Intensive cycles', 'Тридцать активных дыханий и восстановление. Только отдельный режим.', 'Thirty active breaths and recovery. Solo mode only.', [
    s('active-breath', 'Активное дыхание', 'Active breath', 'Глубоко вдохните и свободно отпустите выдох.', 'Breathe in deeply and let the exhale go.', 3_000, 'peak', 'breath'),
    s('recovery', 'Обычное дыхание', 'Recovery', 'Вернитесь к обычному дыханию; без рекордов и натуживания.', 'Return to normal breathing; do not strain or chase records.', 10_000, 'low', 'breath'),
  ], { warningIds: ['rapid-breathing', 'breath-hold'], soloOnly: true, leaderShape: 'circle' }),
  p('nadi-shodhana', 'Нади Шодхана', 'Nadi Shodhana', 'Попеременное дыхание без обязательной задержки.', 'Alternate-nostril breathing without a required hold.', [
    s('left-in', 'Вдох слева', 'Inhale left', 'Закройте правую ноздрю и мягко вдохните через левую.', 'Close the right nostril and inhale gently through the left.', 4_000, 'low', 'breath'),
    s('right-out', 'Выдох справа', 'Exhale right', 'Поменяйте сторону и мягко выдохните.', 'Switch sides and exhale gently.', 4_000, 'low', 'breath'),
    s('right-in', 'Вдох справа', 'Inhale right', 'Вдохните без усилия.', 'Inhale without strain.', 4_000, 'low', 'breath'),
    s('left-out', 'Выдох слева', 'Exhale left', 'Поменяйте сторону и выдохните.', 'Switch sides and exhale.', 4_000, 'low', 'breath'),
  ], { contexts: ['desk-visible', 'home'], leaderShape: 'circle' }),
  p('ujjayi', 'Уджайи', 'Ujjayi', 'Мягкое дыхание с едва слышным звуком без сжатия горла.', 'Gentle audible breathing without throat strain.', [
    s('inhale', 'Мягкий вдох', 'Gentle inhale', 'Дышите носом; горло остаётся свободным.', 'Breathe through the nose; keep the throat relaxed.', 5_000, 'low', 'breath'),
    s('exhale', 'Мягкий выдох', 'Gentle exhale', 'Выдохните с тихим ровным звуком.', 'Exhale with a quiet, even sound.', 5_000, 'low', 'breath'),
  ], { warningIds: ['voice-comfort'], contexts: ['desk-visible', 'home'], leaderShape: 'circle' }),
  p('breath-awareness', 'Наблюдение дыхания', 'Breath awareness', 'Анапанасати без управления дыханием и без оценки результата.', 'Anapanasati without controlling the breath or scoring the result.', [
    s('settle', 'Устроиться', 'Settle', 'Сядьте устойчиво и разрешите дыханию оставаться обычным.', 'Sit steadily and allow the breath to remain natural.', 12_000, 'peak', 'still'),
    s('contact', 'Точка ощущения', 'Contact point', 'Заметьте, где дыхание ощущается яснее: у носа, в груди или животе.', 'Notice where breathing is clearest: near the nose, chest, or abdomen.', 14_000, 'peak', 'still'),
    s('whole-breath', 'Весь цикл', 'Whole breath', 'Следите за одним естественным вдохом и выдохом от начала до конца.', 'Follow one natural inhale and exhale from beginning to end.', 16_000, 'peak', 'still'),
    s('return', 'Возвращение внимания', 'Return attention', 'Когда отвлеклись, спокойно отметьте это и вернитесь к следующему дыханию.', 'When distracted, notice it calmly and return to the next breath.', 16_000, 'peak', 'still'),
    s('close', 'Завершение', 'Close', 'Расширьте внимание на комнату и завершите без оценки «получилось — не получилось».', 'Widen attention to the room and finish without judging success or failure.', 12_000, 'peak', 'still'),
  ], { soloOnly: true, status: 'extension', parallelClass: 'attention' }),
];

const eyeFull = p('full', 'Полный комплекс', 'Full sequence', 'Восемь шагов существующей гимнастики для глаз.', 'Eight steps from the existing eye routine.', [
  s('directions', 'По направлениям', 'Directions', 'Следите за движущейся точкой; голову сохраняйте неподвижной.', 'Follow the moving point while keeping the head still.', 8_000, 'low', 'eyes'),
  s('horizontal', 'Влево — вправо', 'Left — right', 'Двигайте только глазами, без боли.', 'Move only the eyes, without pain.', 8_000, 'peak', 'eyes'),
  s('vertical', 'Вверх — вниз', 'Up — down', 'Сохраняйте голову неподвижной.', 'Keep the head still.', 8_000, 'peak', 'eyes'),
  s('circle', 'Круг', 'Circle', 'Опишите взглядом медленный круг.', 'Trace a slow circle with your gaze.', 8_000, 'peak', 'eyes'),
  s('figure-eight', 'Восьмёрка', 'Figure eight', 'Проследите плавную горизонтальную восьмёрку.', 'Trace a smooth horizontal figure eight.', 8_000, 'peak', 'eyes'),
  s('far-focus', 'Вдаль · 6 метров', 'Distance · 6 metres', 'Посмотрите на объект примерно в шести метрах и спокойно моргайте.', 'Look at an object about six metres away and blink naturally.', 10_000, 'peak', 'eyes'),
  s('converge', 'Сведение', 'Convergence', 'Медленно приблизьте палец; остановитесь при дискомфорте.', 'Bring a finger closer slowly; stop if uncomfortable.', 10_000, 'peak', 'eyes'),
  s('palming', 'Пальминг', 'Palming', 'Закройте глаза ладонями без давления.', 'Cover closed eyes with your palms without pressure.', 12_000, 'low', 'eyes'),
], { requiresAudioInParallel: true });

const faceFull = p('full', 'Лицо целиком', 'Full face', 'Мягкая последовательность без обещаний омоложения.', 'A gentle sequence with no rejuvenation claim.', [
  s('cheeks', 'Надуть щёки', 'Puff cheeks', 'Мягко надуйте щёки, не задерживая дыхание.', 'Puff the cheeks gently while breathing normally.', 8_000, 'peak', 'face'),
  s('smile', 'Улыбка', 'Smile', 'Улыбнитесь без болезненного напряжения.', 'Smile without painful tension.', 8_000, 'peak', 'face'),
  s('pucker', 'Губы трубочкой', 'Lip pucker', 'Соберите губы и затем расслабьте.', 'Pucker the lips, then relax.', 8_000, 'peak', 'face'),
  s('brows', 'Брови', 'Brows', 'Поднимите брови, затем полностью отпустите напряжение.', 'Lift the brows, then fully release.', 8_000, 'peak', 'face'),
  s('eyes-soft', 'Мягкий прищур', 'Gentle squint', 'Слегка прищурьтесь без давления на глаза.', 'Squint lightly without pressure around the eyes.', 8_000, 'peak', 'face'),
  s('jaw', 'Челюсть', 'Jaw', 'Немного откройте рот и мягко сдвиньте челюсть.', 'Open slightly and move the jaw gently.', 8_000, 'peak', 'face'),
  s('simhasana', 'Симхасана', 'Lion face', 'Откройте рот, вытяните язык без боли, затем расслабьтесь.', 'Open the mouth, extend the tongue without pain, then relax.', 8_000, 'peak', 'face'),
  s('ears', 'Растирание ушей', 'Ear rubbing', 'Мягко разотрите ушные раковины.', 'Rub the outer ears gently.', 8_000, 'low', 'face'),
  s('forehead', 'Разглаживание лба', 'Forehead smoothing', 'Проведите пальцами по лбу без сильного давления.', 'Sweep fingers across the forehead without firm pressure.', 8_000, 'low', 'face'),
], { contexts: ['home'], warningIds: ['general-stop'], parallelClass: 'face' });

const voiceWarmup = p('voice-warmup', 'Разминка голоса', 'Voice warm-up', 'Без громкости и давления в горле.', 'Without loudness or throat pressure.', [
  s('hum', 'Мычание', 'Hum', 'Тихо промычите на удобной высоте.', 'Hum quietly at a comfortable pitch.', 10_000, 'peak', 'voice'),
  s('lips', 'Губная трель', 'Lip trill', 'Мягко провибрируйте губами.', 'Let the lips trill gently.', 10_000, 'peak', 'voice'),
  s('vowels', 'Гласные', 'Vowels', 'Произнесите гласные в удобном диапазоне.', 'Speak vowels in a comfortable range.', 12_000, 'peak', 'voice'),
  s('tongue-twister', 'Дикция', 'Diction', 'Медленно произнесите короткую чистоговорку.', 'Say a short articulation phrase slowly.', 12_000, 'peak', 'voice'),
  s('silence', 'Пауза', 'Rest', 'Дайте голосу отдохнуть.', 'Let the voice rest.', 8_000, 'low', 'still'),
], { soloOnly: true, warningIds: ['voice-comfort'], contexts: ['home'], parallelClass: 'solo' });

const articulationGym = p('articulation-gym', 'Артикуляционная гимнастика', 'Articulation gym', 'Губы, челюсть, язык и чёткие слоги без форсирования.', 'Lips, jaw, tongue and clear syllables without forcing.', [
  s('smile-pucker', 'Улыбка — трубочка', 'Smile — pucker', 'Чередуйте широкую мягкую улыбку и губы трубочкой.', 'Alternate a broad gentle smile and a soft lip pucker.', 10_000, 'peak', 'face'),
  s('lip-circle', 'Круг губами', 'Lip circle', 'Медленно проведите собранными губами по кругу.', 'Move softly rounded lips in a slow circle.', 10_000, 'peak', 'face'),
  s('jaw-open-close', 'Челюсть', 'Jaw', 'Плавно откройте и закройте рот в комфортном диапазоне.', 'Open and close the mouth smoothly within a comfortable range.', 10_000, 'peak', 'face'),
  s('tongue-tip', 'Кончик языка', 'Tongue tip', 'Коснитесь кончиком языка области за верхними зубами, затем нижних зубов.', 'Touch the area behind the upper teeth, then the lower teeth with the tongue tip.', 10_000, 'peak', 'face'),
  s('tongue-sides', 'Язык в стороны', 'Tongue sides', 'Мягко направляйте язык к левому и правому уголку рта.', 'Move the tongue gently toward the left and right corners of the mouth.', 10_000, 'peak', 'face'),
  s('syllables', 'Па — та — ка', 'Pa — ta — ka', 'Медленно и чётко повторяйте слоги без повышения громкости.', 'Repeat the syllables slowly and clearly without getting louder.', 12_000, 'peak', 'voice'),
  s('phrase', 'Чистоговорка', 'Articulation phrase', 'Произнесите короткую фразу сначала медленно, затем чуть свободнее.', 'Say a short phrase slowly, then a little more freely.', 14_000, 'peak', 'voice'),
  s('articulation-rest', 'Расслабление', 'Release', 'Расслабьте губы, язык и челюсть.', 'Relax the lips, tongue and jaw.', 8_000, 'low', 'still'),
], { soloOnly: true, warningIds: ['voice-comfort'], contexts: ['home'], parallelClass: 'solo' });

const tonguePosture = p('tongue-posture', 'Положение языка у нёба', 'Tongue posture at palate', 'Миофункциональная постановка и спокойное глотание, не артикуляционная гимнастика.', 'Myofunctional placement and calm swallowing, not articulation training.', [
  s('find-spot', 'Найти точку', 'Find the spot', 'Поставьте кончик языка на нёбо сразу за верхними зубами, не упираясь в зубы.', 'Place the tongue tip on the palate just behind the upper teeth, without pressing the teeth.', 8_000, 'peak', 'tension'),
  s('palate-hold', 'Мягкое удержание', 'Gentle hold', 'Поднимите язык к нёбу настолько, насколько комфортно, и дышите обычно.', 'Rest as much of the tongue on the palate as comfortable and breathe normally.', 10_000, 'low', 'tension'),
  s('controlled-swallow', 'Спокойное глотание', 'Calm swallow', 'Сохраняя кончик языка у нёба, спокойно сглотните без натуживания.', 'Keep the tongue tip at the palate and swallow calmly without straining.', 8_000, 'peak', 'tension'),
  s('tongue-release', 'Расслабление', 'Release', 'Полностью расслабьте язык и челюсть.', 'Relax the tongue and jaw fully.', 8_000, 'low', 'still'),
], { status: 'extension', warningIds: ['general-stop'], contexts: ['desk-invisible', 'desk-visible', 'home'], parallelClass: 'motor' });

export const PRACTICE_CATALOG: readonly PracticeSet[] = [
  {
    id: 'breathing', title: l('Дыхание', 'Breathing'), summary: l('Управляемые варианты и спокойное наблюдение дыхания.', 'Guided variations and calm breath awareness.'),
    status: 'approved', defaultEnabled: true, contexts: ['desk-invisible', 'desk-visible', 'home'], parallelClass: 'breath', programs: breathingPrograms, defaultProgramId: 'coherent',
  },
  {
    id: 'eye-gym', title: l('Гимнастика для глаз', 'Eye gym'), summary: l('Движения, фокусировка и отдых без боли.', 'Movement, focus and rest without pain.'),
    status: 'approved', defaultEnabled: true, contexts: ['desk-invisible', 'desk-visible', 'home'], parallelClass: 'eyes', warningIds: ['general-stop'],
    programs: [
      eyeFull,
      p('desk', 'За столом', 'At the desk', 'Компактный комплекс с паузой взгляда вдаль, без пальминга и сведения.', 'A compact sequence with a distance break, without palming or convergence.', eyeFull.steps.slice(0, 6)),
      p('gaze-fixation', 'Фиксация взгляда · точка', 'Gaze fixation · point', 'Короткая фиксация на удобной точке без напряжения.', 'Brief focus on a comfortable point without strain.', [
        s('focus', 'Фокус', 'Focus', 'Смотрите на точку без напряжения и не подавляйте моргание.', 'Look at the point without strain; do not suppress blinking.', 10_000, 'peak', 'eyes'),
        s('release', 'Расслабить взгляд', 'Release gaze', 'Переведите взгляд вдаль и моргните.', 'Look farther away and blink.', 8_000, 'low', 'eyes'),
      ], { requiresAudioInParallel: true, status: 'extension' }),
    ], defaultProgramId: 'desk',
  },
  {
    id: 'face-speech', title: l('Лицо, голос и артикуляция', 'Face, voice and articulation'), summary: l('Одна вариация за раз: лицо, голос, артикуляция или положение языка.', 'Choose one variation at a time: face, voice, articulation, or tongue posture.'),
    status: 'approved', defaultEnabled: true, contexts: ['desk-invisible', 'desk-visible', 'home'], parallelClass: 'face', warningIds: ['general-stop'],
    programs: [faceFull, voiceWarmup, articulationGym, tonguePosture], defaultProgramId: 'full',
  },
  {
    id: 'relaxation', title: l('Расслабление', 'Relaxation'), summary: l('Одна вариация за раз: мышечная релаксация, сканирование тела или аутогенная пауза.', 'Choose one variation at a time: muscle relaxation, body scan, or autogenic pause.'),
    status: 'approved', defaultEnabled: true, contexts: ['desk-invisible', 'desk-visible', 'home'], parallelClass: 'attention', programs: [
      p('pmr-groups', 'Мышечная релаксация · группы', 'Muscle relaxation · groups', 'Умеренно напрягать и полностью расслаблять группы мышц.', 'Tense muscle groups moderately, then release fully.', [
        s('hands', 'Кисти', 'Hands', 'Сожмите кисти умеренно, затем полностью отпустите.', 'Tense the hands moderately, then release fully.', 10_000, 'peak', 'tension'),
        s('shoulders', 'Плечи', 'Shoulders', 'Слегка поднимите плечи и расслабьте.', 'Lift the shoulders lightly and release.', 10_000, 'peak', 'tension'),
        s('face', 'Лицо', 'Face', 'Мягко напрягите лицо и отпустите.', 'Tense the face gently and release.', 10_000, 'peak', 'tension'),
        s('abdomen', 'Живот', 'Abdomen', 'Умеренно напрягите живот без задержки дыхания.', 'Tense the abdomen moderately without holding breath.', 10_000, 'peak', 'tension'),
        s('legs', 'Ноги', 'Legs', 'Напрягите ноги и затем полностью расслабьте.', 'Tense the legs and then fully release.', 10_000, 'peak', 'tension'),
        s('rest', 'Отдых', 'Rest', 'Отметьте разницу между напряжением и расслаблением.', 'Notice the contrast between tension and release.', 12_000, 'low', 'still'),
      ], { soloOnly: true }),
      p('body-scan-short', 'Сканирование тела · коротко', 'Body scan · short', 'Наблюдение ощущений без оценки и изменения.', 'Observe sensations without judging or changing.', [
        s('feet', 'Стопы', 'Feet', 'Отметьте ощущения в стопах.', 'Notice sensations in the feet.', 12_000, 'peak', 'still'),
        s('legs', 'Ноги', 'Legs', 'Переведите внимание к ногам.', 'Move attention to the legs.', 12_000, 'peak', 'still'),
        s('torso', 'Корпус', 'Torso', 'Отметьте дыхание и опору корпуса.', 'Notice breathing and support through the torso.', 12_000, 'peak', 'still'),
        s('face', 'Лицо', 'Face', 'Отметьте ощущения в лице и челюсти.', 'Notice sensations in the face and jaw.', 12_000, 'peak', 'still'),
        s('whole', 'Всё тело', 'Whole body', 'Охватите вниманием всё тело.', 'Include the whole body in awareness.', 12_000, 'peak', 'still'),
      ], { soloOnly: true }),
      p('autogenic-short', 'Аутогенная пауза', 'Autogenic pause', 'Нейтральные формулы самонаблюдения по методу Шульца без диагностики и обещаний результата.', 'Neutral Schultz-informed observation phrases without diagnosis or outcome claims.', [
        s('settle', 'Устроиться', 'Settle', 'Примите устойчивое удобное положение; глаза можно закрыть или оставить открытыми.', 'Choose a stable comfortable position; eyes may stay open or closed.', 12_000, 'peak', 'still'),
        s('weight', 'Ощущение опоры', 'Sense support', 'Мысленно отметьте: руки и ноги спокойно опираются. Не вызывайте тяжесть намеренно.', 'Silently note that arms and legs are supported. Do not force a feeling of heaviness.', 14_000, 'peak', 'still'),
        s('warmth', 'Температура', 'Temperature', 'Заметьте фактическое ощущение тепла или прохлады без попытки его изменить.', 'Notice the actual sense of warmth or coolness without trying to change it.', 14_000, 'peak', 'still'),
        s('breath', 'Обычное дыхание', 'Natural breath', 'Позвольте дыханию идти своим ритмом; не удлиняйте и не задерживайте его.', 'Let breathing keep its own rhythm; do not lengthen or hold it.', 14_000, 'peak', 'still'),
        s('return', 'Возвращение', 'Return', 'Пошевелите пальцами, откройте глаза при необходимости и спокойно завершите.', 'Move the fingers, open the eyes if needed, and finish calmly.', 12_000, 'peak', 'still'),
      ], { soloOnly: true, status: 'extension' }),
    ], defaultProgramId: 'pmr-groups',
  },
  {
    id: 'pelvic-floor', title: l('Кегель / тазовое дно', 'Kegel / pelvic floor'), summary: l('Короткие, длинные и смешанные сокращения без участия живота и ягодиц.', 'Short, long, and mixed squeezes without engaging the abdomen or glutes.'),
    status: 'approved', defaultEnabled: false, contexts: ['desk-invisible', 'desk-visible', 'home'], parallelClass: 'pelvic', warningIds: ['pelvic-floor'], programs: [
      p('balanced', 'Смешанная последовательность', 'Mixed sequence', 'Короткие и длинные сокращения без задержки дыхания и натуживания.', 'Short and long squeezes without breath holding or straining.', [
        s('long-squeeze', 'Плавное сокращение', 'Long squeeze', 'Мягко сократите мышцы, продолжая дышать; живот и ягодицы остаются расслабленными.', 'Squeeze gently while continuing to breathe; keep the abdomen and glutes relaxed.', 5_000, 'peak', 'tension'),
        s('long-release', 'Полное расслабление', 'Full release', 'Полностью расслабьте мышцы.', 'Release the muscles completely.', 5_000, 'low', 'tension'),
        s('short-squeeze', 'Короткое сокращение', 'Short squeeze', 'Коротко сократите без участия живота и ягодиц.', 'Make a short squeeze without using abdomen or glutes.', 2_000, 'peak', 'tension'),
        s('short-release', 'Расслабление', 'Release', 'Полностью отпустите напряжение.', 'Release all tension.', 4_000, 'low', 'tension'),
      ]),
      p('quick', 'Короткие сокращения', 'Quick squeezes', 'Короткое сокращение всегда сменяется полным расслаблением.', 'Every quick squeeze is followed by a full release.', [
        s('short-squeeze', 'Короткое сокращение', 'Short squeeze', 'Коротко сократите без участия живота и ягодиц.', 'Make a short squeeze without using abdomen or glutes.', 2_000, 'peak', 'tension'),
        s('short-release', 'Полное расслабление', 'Full release', 'Полностью отпустите напряжение.', 'Release all tension.', 4_000, 'low', 'tension'),
      ]),
      p('holds', 'Длинные удержания', 'Long holds', 'Мягкое удержание при обычном дыхании, без натуживания.', 'A gentle hold with normal breathing and no straining.', [
        s('long-squeeze', 'Плавное сокращение', 'Long squeeze', 'Мягко сократите мышцы; живот и ягодицы остаются расслабленными.', 'Squeeze gently; keep the abdomen and glutes relaxed.', 5_000, 'peak', 'tension'),
        s('long-release', 'Полное расслабление', 'Full release', 'Расслабляйтесь не меньше, чем длилось сокращение.', 'Relax for at least as long as the squeeze.', 5_000, 'low', 'tension'),
      ]),
      p('exhale-sync', 'Синхронизация с выдохом', 'Exhale sync', 'Сокращение только на спокойном выдохе, расслабление на вдохе.', 'Squeeze only on a calm exhale and release on inhale.', [
        s('long-squeeze', 'Выдох · сокращение', 'Exhale · squeeze', 'На выдохе мягко сократите мышцы без участия живота и ягодиц.', 'On exhale, squeeze gently without engaging the abdomen or glutes.', 5_000, 'peak', 'tension'),
        s('long-release', 'Вдох · расслабление', 'Inhale · release', 'На вдохе полностью расслабьтесь.', 'Release completely on inhale.', 5_000, 'low', 'tension'),
      ]),
    ], defaultProgramId: 'balanced',
  },
  {
    id: 'mobility', title: l('Подвижность суставов', 'Joint mobility'), summary: l('Одна зона за раз: шея и плечи, грудной отдел, голеностоп или кисти.', 'Choose one area at a time: neck and shoulders, thoracic spine, ankles, or wrists.'),
    status: 'approved', defaultEnabled: true, contexts: ['desk-invisible', 'desk-visible', 'home'], parallelClass: 'motor', warningIds: ['general-stop'], programs: [
      p('neck-shoulders', 'Шея и плечи', 'Neck and shoulders', 'Медленно и только в комфортном диапазоне.', 'Slowly and only within a comfortable range.', [
        s('shoulder-rolls', 'Круги плечами', 'Shoulder rolls', 'Сделайте медленные круги плечами.', 'Roll the shoulders slowly.', 10_000, 'peak', 'stretch'),
        s('side', 'Наклон в сторону', 'Side tilt', 'Наклоните голову в сторону без давления рукой.', 'Tilt the head sideways without hand pressure.', 10_000, 'peak', 'stretch'),
        s('turn', 'Поворот', 'Turn', 'Поверните голову в комфортном диапазоне.', 'Turn the head within a comfortable range.', 10_000, 'peak', 'stretch'),
        s('release', 'Расслабление', 'Release', 'Вернитесь в нейтральное положение.', 'Return to neutral.', 8_000, 'low', 'still'),
      ], { contexts: ['desk-visible', 'home'], warningIds: ['neck-mobility'] }),
      p('thoracic-chair', 'Грудной отдел · на стуле', 'Thoracic spine · chair', 'Разгибание и мягкий поворот верхней части корпуса с опорой.', 'Supported extension and gentle upper-body rotation.', [
        s('open', 'Раскрытие', 'Chest opening', 'Отведите плечи назад, не прогибая поясницу.', 'Draw shoulders back without arching the low back.', 10_000, 'peak', 'stretch'),
        s('rotate-left', 'Поворот влево', 'Rotate left', 'Мягко поверните верх корпуса.', 'Rotate the upper body gently.', 10_000, 'peak', 'stretch'),
        s('rotate-right', 'Поворот вправо', 'Rotate right', 'Повторите в другую сторону.', 'Repeat on the other side.', 10_000, 'peak', 'stretch'),
        s('neutral', 'Нейтраль', 'Neutral', 'Сядьте ровно и спокойно подышите.', 'Sit tall and breathe normally.', 8_000, 'low', 'still'),
      ], { contexts: ['desk-visible', 'home'] }),
      p('ankle-seated', 'Голеностоп · сидя', 'Ankles · seated', 'Экспериментальные контролируемые движения стоп без боли.', 'Experimental controlled foot movements without pain.', [
        s('circles-left', 'Круги левой стопой', 'Left ankle circles', 'Медленно опишите круг стопой.', 'Circle the foot slowly.', 10_000, 'peak', 'stretch'),
        s('circles-right', 'Круги правой стопой', 'Right ankle circles', 'Повторите другой стопой.', 'Repeat with the other foot.', 10_000, 'peak', 'stretch'),
        s('flex', 'Носок к себе — от себя', 'Point and flex', 'Чередуйте движение в комфортном диапазоне.', 'Alternate within a comfortable range.', 10_000, 'peak', 'stretch'),
        s('rest', 'Отдых', 'Rest', 'Поставьте обе стопы на опору.', 'Rest both feet on a stable surface.', 8_000, 'low', 'still'),
      ], { status: 'experimental', warningIds: ['experimental'] }),
      p('wrists-desk', 'Кисти и руки', 'Wrists and hands', 'Экспериментальные мягкие движения без пружинения.', 'Experimental gentle movement without bouncing.', [
        s('open-close', 'Открыть — закрыть', 'Open — close', 'Мягко раскройте и сожмите пальцы.', 'Open and close the fingers gently.', 10_000, 'peak', 'stretch'),
        s('circles', 'Круги кистями', 'Wrist circles', 'Сделайте небольшие медленные круги.', 'Make small, slow circles.', 10_000, 'peak', 'stretch'),
        s('shake', 'Стряхнуть', 'Shake out', 'Легко встряхните кисти.', 'Shake the hands out lightly.', 8_000, 'low', 'stretch'),
      ], { status: 'experimental', warningIds: ['experimental'] }),
    ], defaultProgramId: 'neck-shoulders',
  },
  {
    id: 'postures', title: l('Позы', 'Postures'), summary: l('Одна выбранная поза за раз: всадник, сапожник, лотос или стойка столбом.', 'Choose one posture at a time: horse, cobbler, lotus, or standing post.'),
    status: 'extension', defaultEnabled: false, contexts: ['home'], parallelClass: 'motor', warningIds: ['yoga-load'], programs: [
      p('horse-shallow', 'Всадник · неглубоко', 'Horse · shallow', 'Устойчивая неглубокая стойка без работы до отказа.', 'A stable shallow stance without training to failure.', [
        s('horse-setup', 'Положение', 'Set up', 'Поставьте стопы устойчиво и слегка согните колени.', 'Place feet steadily and bend the knees slightly.', 12_000, 'peak', 'tension'),
        s('horse-hold', 'Удержание', 'Hold', 'Дышите спокойно; выпрямитесь раньше при дискомфорте.', 'Breathe normally; stand up early if uncomfortable.', 15_000, 'peak', 'tension'),
        s('horse-release', 'Выход', 'Release', 'Медленно выпрямитесь и расслабьте ноги.', 'Stand up slowly and relax the legs.', 10_000, 'low', 'still'),
      ], { requiresAudioInParallel: true }),
      p('cobbler-supported', 'Сапожник / бабочка · с опорой', 'Cobbler / butterfly · supported', 'Мягкая сидячая поза с разрешённой опорой под колени.', 'A gentle seated posture with optional support under the knees.', [
        s('cobbler-setup', 'Устроиться', 'Set up', 'Сядьте устойчиво, соедините стопы без усилия.', 'Sit steadily and bring the feet together without force.', 12_000, 'peak', 'stretch'),
        s('cobbler-breathe', 'Спокойное дыхание', 'Breathe', 'Не давите руками на колени.', 'Do not press the knees down with the hands.', 18_000, 'low', 'still'),
        s('cobbler-release', 'Выход', 'Release', 'Мягко выпрямите ноги.', 'Straighten the legs gently.', 10_000, 'low', 'still'),
      ], { requiresAudioInParallel: true }),
      p('lotus-comfortable', 'Лотос · комфортный вариант', 'Lotus · comfortable variation', 'Только знакомый удобный вариант: простой сед, полулотос или лотос без давления на колени.', 'Use only a familiar comfortable variation: easy seat, half lotus, or lotus without knee pressure.', [
        s('lotus-setup', 'Выбрать вариант', 'Choose a variation', 'Сядьте в уже знакомый устойчивый вариант; не подтягивайте стопы силой.', 'Use a familiar stable variation; never pull the feet into place.', 12_000, 'peak', 'stretch'),
        s('lotus-breathe', 'Спокойное дыхание', 'Breathe', 'Сохраняйте обычное дыхание и выйдите при дискомфорте в коленях или тазобедренных суставах.', 'Keep breathing normally and leave the posture for knee or hip discomfort.', 18_000, 'low', 'still'),
        s('lotus-release', 'Выход', 'Release', 'Освободите ноги руками и мягко смените положение.', 'Release the legs with your hands and change position gently.', 10_000, 'low', 'still'),
      ], { requiresAudioInParallel: true }),
      p('standing-post-short', 'Стойка столбом · коротко', 'Standing post · short', 'Экспериментальная спокойная стойка без усталости до отказа.', 'Experimental quiet standing without training to failure.', [
        s('post-setup', 'Положение', 'Set up', 'Встаньте устойчиво, колени мягкие.', 'Stand steadily with soft knees.', 12_000, 'peak', 'still'),
        s('post-hold', 'Спокойная стойка', 'Quiet standing', 'Дышите обычно; прекратите при дискомфорте.', 'Breathe normally; stop if uncomfortable.', 20_000, 'peak', 'still'),
        s('post-release', 'Выход', 'Release', 'Мягко смените положение.', 'Change position gently.', 10_000, 'low', 'still'),
      ], { requiresAudioInParallel: true, status: 'experimental', warningIds: ['experimental'] }),
    ], defaultProgramId: 'horse-shallow',
  },
  {
    id: 'isometrics', title: l('Изометрические сокращения', 'Isometric contractions'), summary: l('Одна вариация за раз: ягодицы или мягкая общая изометрия.', 'Choose one variation at a time: glutes or gentle general isometrics.'),
    status: 'extension', defaultEnabled: false, contexts: ['desk-invisible', 'desk-visible', 'home'], parallelClass: 'motor', warningIds: ['general-stop'], programs: [
      p('glute-seated', 'Ягодицы · сидя', 'Glutes · seated', 'Умеренное сокращение и полное расслабление без задержки дыхания.', 'A moderate squeeze and full release without breath holding.', [
        s('squeeze', 'Сокращение', 'Squeeze', 'Умеренно сократите ягодицы и продолжайте дышать.', 'Squeeze the glutes moderately and keep breathing.', 5_000, 'peak', 'tension'),
        s('release', 'Расслабление', 'Release', 'Полностью расслабьте мышцы.', 'Release the muscles fully.', 7_000, 'low', 'tension'),
      ]),
      p('general-gentle', 'Общая изометрия · мягко', 'General isometrics · gentle', 'Экспериментальные умеренные статические усилия без задержки дыхания.', 'Experimental moderate static effort without breath holding.', [
        s('palms', 'Ладони', 'Palms', 'Умеренно прижмите ладони друг к другу, продолжая дышать.', 'Press palms together moderately while breathing.', 8_000, 'peak', 'tension'),
        s('release', 'Расслабление', 'Release', 'Полностью отпустите усилие.', 'Release the effort completely.', 8_000, 'low', 'tension'),
        s('feet', 'Стопы в пол', 'Feet into floor', 'Умеренно прижмите стопы к полу.', 'Press the feet into the floor moderately.', 8_000, 'peak', 'tension'),
        s('rest', 'Отдых', 'Rest', 'Вернитесь к обычной позе и дыханию.', 'Return to a normal posture and breath.', 10_000, 'low', 'still'),
      ], { status: 'experimental', warningIds: ['experimental'] }),
    ], defaultProgramId: 'glute-seated',
  },
  {
    id: 'abdomen', title: l('Живот', 'Abdomen'), summary: l('Одна вариация за раз: базовые уровни, прогрессия или знакомые агнисара, вакуум и наули.', 'One variation at a time: foundations, progression, or familiar agnisara, vacuum, and nauli.'),
    status: 'extension', defaultEnabled: false, contexts: ['desk-invisible', 'desk-visible', 'home'], parallelClass: 'motor', warningIds: ['general-stop'], programs: [
      p('foundation-progression', 'Базовая прогрессия · 1→2', 'Foundation progression · 1→2', 'Последовательно: мягкая активация на выдохе, затем удержание при обычном дыхании.', 'Sequential foundations: gentle exhale engagement, then a hold with normal breathing.', [
        s('foundation-exhale', 'Уровень 1 · выдох', 'Level 1 · exhale', 'На выдохе слегка подтяните низ живота.', 'Gently engage the lower abdomen on exhale.', 6_000, 'peak', 'tension'),
        s('foundation-release', 'Полное расслабление', 'Full release', 'На вдохе полностью отпустите.', 'Release fully on inhale.', 6_000, 'low', 'breath'),
        s('foundation-hold', 'Уровень 2 · удержание', 'Level 2 · hold', 'Слегка напрягите живот и продолжайте дышать обычно.', 'Engage the abdomen lightly and keep breathing normally.', 8_000, 'peak', 'tension'),
        s('foundation-finish', 'Завершение', 'Finish', 'Полностью отпустите напряжение.', 'Release all tension.', 8_000, 'low', 'tension'),
      ]),
      p('level-1', 'Уровень 1 · дыхание', 'Level 1 · breathing', 'Наблюдение и мягкая активация на выдохе.', 'Awareness and gentle activation on exhale.', [
        s('exhale-engage', 'Мягкая активация', 'Gentle engagement', 'На выдохе слегка подтяните низ живота.', 'Gently engage the lower abdomen on exhale.', 6_000, 'peak', 'tension'),
        s('release', 'Расслабление', 'Release', 'На вдохе полностью отпустите.', 'Release fully on inhale.', 6_000, 'low', 'breath'),
      ]),
      p('level-2', 'Уровень 2 · удержание', 'Level 2 · hold', 'Умеренное удержание при обычном дыхании.', 'Moderate hold while breathing normally.', [
        s('engage', 'Активация', 'Engage', 'Слегка напрягите живот, не задерживая дыхание.', 'Engage the abdomen lightly without holding breath.', 8_000, 'peak', 'tension'),
        s('release', 'Расслабление', 'Release', 'Полностью отпустите напряжение.', 'Release fully.', 8_000, 'low', 'tension'),
      ]),
      p('level-3', 'Уровень 3 · агнисара', 'Level 3 · agnisara', 'Таймер агнисары для тех, кто уже освоил технику отдельно.', 'An agnisara timer for people who already learned the technique elsewhere.', [
        s('practice', 'Знакомая агнисара', 'Familiar agnisara', 'Выполните уже освоенную агнисару в привычном комфортном темпе; приложение не обучает технике.', 'Perform the agnisara technique you already learned at a familiar comfortable pace; the app does not teach it.', 15_000, 'peak', 'tension'),
        s('release', 'Завершить', 'Finish', 'Завершите знакомым способом и восстановите обычное дыхание.', 'Finish in the way you learned and restore normal breathing.', 12_000, 'low', 'breath'),
      ], { warningIds: ['advanced-abdomen'], soloOnly: true, requiresPriorExperience: true }),
      p('level-4', 'Уровень 4 · вакуум', 'Level 4 · vacuum', 'Таймер вакуума для тех, кто уже освоил технику отдельно.', 'A vacuum timer for people who already learned the technique elsewhere.', [
        s('practice', 'Знакомый вакуум', 'Familiar vacuum', 'Выполните уже освоенный вакуум в привычном безопасном варианте; приложение не обучает технике.', 'Perform the vacuum technique you already learned in your familiar safe form; the app does not teach it.', 15_000, 'peak', 'tension'),
        s('release', 'Завершить', 'Finish', 'Завершите знакомым способом и вернитесь к обычному дыханию.', 'Finish in the way you learned and return to normal breathing.', 12_000, 'low', 'breath'),
      ], { warningIds: ['advanced-abdomen', 'vacuum'], soloOnly: true, requiresPriorExperience: true }),
      p('level-5', 'Уровень 5 · наули', 'Level 5 · nauli', 'Таймер наули для тех, кто уже освоил технику отдельно.', 'A nauli timer for people who already learned the technique elsewhere.', [
        s('practice', 'Знакомая наули', 'Familiar nauli', 'Выполните уже освоенную наули в привычном комфортном варианте; приложение не обучает технике.', 'Perform the nauli technique you already learned in your familiar comfortable form; the app does not teach it.', 15_000, 'peak', 'tension'),
        s('release', 'Завершить', 'Finish', 'Завершите знакомым способом и восстановите обычное дыхание.', 'Finish in the way you learned and restore normal breathing.', 12_000, 'low', 'breath'),
      ], { warningIds: ['advanced-abdomen'], soloOnly: true, requiresPriorExperience: true }),
      p('experienced-progression', 'Продвинутая последовательность · 3→5', 'Experienced progression · 3→5', 'Последовательный таймер агнисары, вакуума и наули только для тех, кто уже освоил все три техники.', 'A sequential agnisara, vacuum, and nauli timer only for people who already learned all three techniques.', [
        s('advanced-agnisara', 'Знакомая агнисара', 'Familiar agnisara', 'Выполните уже освоенную агнисару; приложение не обучает технике.', 'Perform the agnisara technique you already learned; the app does not teach it.', 15_000, 'peak', 'tension'),
        s('advanced-recover-one', 'Восстановить дыхание', 'Restore breathing', 'Полностью завершите подход и вернитесь к обычному дыханию.', 'Finish the effort completely and return to normal breathing.', 12_000, 'low', 'breath'),
        s('advanced-vacuum', 'Знакомый вакуум', 'Familiar vacuum', 'Выполните уже освоенный вакуум в привычном безопасном варианте.', 'Perform the vacuum technique you already learned in your familiar safe form.', 15_000, 'peak', 'tension'),
        s('advanced-recover-two', 'Восстановить дыхание', 'Restore breathing', 'Полностью завершите подход и вернитесь к обычному дыханию.', 'Finish the effort completely and return to normal breathing.', 12_000, 'low', 'breath'),
        s('advanced-nauli', 'Знакомая наули', 'Familiar nauli', 'Выполните уже освоенную наули; приложение не обучает технике.', 'Perform the nauli technique you already learned; the app does not teach it.', 15_000, 'peak', 'tension'),
        s('advanced-finish', 'Завершить', 'Finish', 'Завершите знакомым способом и восстановите обычное дыхание.', 'Finish in the way you learned and restore normal breathing.', 12_000, 'low', 'breath'),
      ], { warningIds: ['advanced-abdomen', 'vacuum'], soloOnly: true, requiresPriorExperience: true }),
    ], defaultProgramId: 'foundation-progression',
  },
  {
    id: 'feldenkrais', title: l('Осознанное движение', 'Awareness through movement'), summary: l('Очень небольшие движения с вниманием к различиям, только отдельно.', 'Very small movements with attention to differences, solo only.'),
    status: 'extension', defaultEnabled: false, contexts: ['desk-visible', 'home'], parallelClass: 'attention', warningIds: ['general-stop'], programs: [p('seated-observation', 'Сидя · мягкое исследование', 'Seated gentle exploration', 'Оригинальная короткая последовательность в духе принципов Фельденкрайза, без лечебных обещаний.', 'An original short sequence informed by Feldenkrais principles, with no treatment claim.', [
      s('settle', 'Исходное положение', 'Settle', 'Сядьте с опорой и отметьте, как вес распределён сейчас.', 'Sit with support and notice how your weight is distributed now.', 12_000, 'peak', 'still'),
      s('small-turn', 'Малый поворот', 'Small turn', 'Очень немного поверните голову в одну сторону и вернитесь; не ищите максимальную амплитуду.', 'Turn the head a very small amount to one side and return; do not seek maximum range.', 14_000, 'peak', 'stretch'),
      s('shoulder-follow', 'Связь с плечами', 'Let shoulders follow', 'Повторите малое движение и отметьте, как плечи могут следовать без усилия.', 'Repeat the small movement and notice how the shoulders can follow without effort.', 14_000, 'peak', 'stretch'),
      s('other-side', 'Другая сторона', 'Other side', 'Исследуйте ту же малую траекторию в другую сторону, без сравнения «лучше — хуже».', 'Explore the same small path on the other side without judging it better or worse.', 14_000, 'peak', 'stretch'),
      s('compare', 'Пауза наблюдения', 'Observe', 'Вернитесь в нейтраль и просто отметьте ощущения; ничего не исправляйте.', 'Return to neutral and simply notice sensations; do not try to correct them.', 14_000, 'peak', 'still'),
    ], { soloOnly: true })], defaultProgramId: 'seated-observation',
  },
] as const;

export const EXCLUDED_DUPLICATES = [
  { name: 'mula bandha', representedBy: 'pelvic-floor' },
  { name: 'shavasana', representedBy: 'relaxation/pmr-groups or relaxation/body-scan-short' },
  { name: 'yoga nidra', representedBy: 'relaxation/body-scan-short' },
  { name: 'drishti', representedBy: 'eye-gym/gaze-fixation' },
  { name: 'paida', representedBy: 'face-speech/full' },
  { name: 'lotus', representedBy: 'postures/lotus-comfortable, not a separate set' },
] as const;

export const WARNING_TEXT: Readonly<Record<WarningId, LocalizedText>> = {
  'general-stop': l('Остановитесь при боли, головокружении, онемении или выраженном дискомфорте.', 'Stop for pain, dizziness, numbness, or marked discomfort.'),
  'breath-hold': l('Задержки необязательны: не выполняйте их через дискомфорт и сразу вернитесь к обычному дыханию.', 'Breath holds are optional: never force them and return to normal breathing if uncomfortable.'),
  'rapid-breathing': l('Интенсивное дыхание выполняется сидя или лёжа, не в воде, не за рулём и не там, где потеря равновесия опасна.', 'Do intensive breathing seated or lying down, never in water, while driving, or where loss of balance is hazardous.'),
  'pelvic-floor': l('Дышите обычно, полностью расслабляйтесь между сокращениями и не тренируйтесь через боль.', 'Breathe normally, fully relax between squeezes, and never train through pain.'),
  'neck-mobility': l('Шея движется медленно и только в комфортном диапазоне; без давления рукой и резких кругов.', 'Move the neck slowly within a comfortable range, without hand pressure or forceful circles.'),
  vacuum: l('Вакуум — отдельная продвинутая практика. Не выполняйте при беременности или если врач ограничил нагрузки/задержки дыхания.', 'Abdominal vacuum is a separate advanced practice. Do not use during pregnancy or when a clinician has restricted exertion or breath holding.'),
  'yoga-load': l('Выберите неглубокую устойчивую позу; новичкам не нужны экстремальные варианты. При состояниях здоровья обсудите нагрузку со специалистом.', 'Choose a shallow, stable posture; beginners do not need extreme variants. Discuss exertion with a professional when health conditions apply.'),
  'voice-comfort': l('Звук остаётся тихим и удобным; прекратите при боли, охриплости или давлении в горле.', 'Keep sound quiet and comfortable; stop for pain, hoarseness, or throat pressure.'),
  'advanced-abdomen': l('Агнисара, вакуум и наули здесь не преподаются. Режим даёт только таймер уже знакомой практики и предназначен для тех, кто освоил технику заранее.', 'Agnisara, vacuum and nauli are not taught here. This mode only times an already familiar practice and is for people who learned the technique beforehand.'),
  experimental: l('Экспериментальный набор выключен по умолчанию и не имеет продуктового обещания эффективности.', 'This experimental set is off by default and carries no product efficacy claim.'),
};

export const PAUSE_STRINGS = {
  ru: {
    title: 'Пауза / Зарядка',
    ready: 'Настройте короткую практику',
    start: 'Начать',
    pause: 'Пауза',
    resume: 'Продолжить',
    restart: 'Начать заново',
    exit: 'Выйти',
    completed: 'Практика завершена',
    completionOnly: 'Записано только завершение и время — без оценки здоровья.',
    warnings: 'Перед началом',
    acknowledge: 'Я прочитал предупреждения',
    experiencedOnly: 'Только для уже освоенной техники',
    confirmPriorExperience: 'Я уже умею выполнять выбранную технику',
    progress: 'Прогресс',
    parallel: 'Параллельно',
    solo: 'Отдельно',
  },
  en: {
    title: 'Pause / Recharge',
    ready: 'Set up a short practice',
    start: 'Start',
    pause: 'Pause',
    resume: 'Resume',
    restart: 'Restart',
    exit: 'Exit',
    completed: 'Practice complete',
    completionOnly: 'Only completion and time are recorded — no health score.',
    warnings: 'Before you start',
    acknowledge: 'I have read the warnings',
    experiencedOnly: 'For an already learned technique only',
    confirmPriorExperience: 'I already know how to perform the selected technique',
    progress: 'Progress',
    parallel: 'Parallel',
    solo: 'Solo',
  },
} as const;

export function text(value: LocalizedText, locale: PauseLocale): string {
  return value[locale];
}

export function getPracticeSet(setId: PracticeSetId): PracticeSet {
  const found = PRACTICE_CATALOG.find((item) => item.id === setId);
  if (!found) throw new Error(`Unknown practice set: ${setId as string}`);
  return found;
}

export function getPracticeProgram(setId: PracticeSetId, programId?: string): PracticeProgram {
  const set = getPracticeSet(setId);
  const resolvedId = programId ?? set.defaultProgramId;
  const program = set.programs.find((item) => item.id === resolvedId);
  if (!program) throw new Error(`Unknown program ${resolvedId} for ${setId}`);
  return program;
}

export function getPracticeStatus(setId: PracticeSetId, programId?: string): CatalogStatus {
  const set = getPracticeSet(setId);
  return getPracticeProgram(setId, programId).status ?? set.status;
}

export function getDefaultPracticeSets(): readonly PracticeSet[] {
  return PRACTICE_CATALOG.filter((set) => set.defaultEnabled);
}

interface ResolvedSelection {
  readonly set: PracticeSet;
  readonly program: PracticeProgram;
  readonly selection: Required<PracticeSelection>;
}

function issue(
  code: PlanValidationIssue['code'],
  ru: string,
  en: string,
  extras: Omit<PlanValidationIssue, 'code' | 'message'> = {},
): PlanValidationIssue {
  return { code, message: l(ru, en), ...extras };
}

function safeNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function resolveSelection(selection: PracticeSelection): ResolvedSelection | null {
  const set = PRACTICE_CATALOG.find((item) => item.id === selection.setId);
  if (!set) return null;
  const programId = selection.programId ?? set.defaultProgramId;
  const program = set.programs.find((item) => item.id === programId);
  if (!program) return null;
  return { set, program, selection: { setId: set.id, programId } };
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

export function getRequiredWarnings(selections: readonly PracticeSelection[]): readonly WarningId[] {
  const ids: WarningId[] = [];
  for (const selection of selections) {
    const resolved = resolveSelection(selection);
    if (!resolved) continue;
    ids.push(...(resolved.set.warningIds ?? []), ...(resolved.program.warningIds ?? []));
  }
  return unique(ids);
}

export function getRequiredPriorExperience(selections: readonly PracticeSelection[]): readonly PracticeProgramRef[] {
  const ids: PracticeProgramRef[] = [];
  for (const selection of selections) {
    const resolved = resolveSelection(selection);
    if (resolved?.program.requiresPriorExperience) {
      ids.push(`${resolved.set.id}/${resolved.program.id}`);
    }
  }
  return unique(ids);
}

function completionCount(request: PlanRequest, setId: PracticeSetId): number {
  const value = request.soloCompletions?.[setId] ?? 0;
  return safeNonNegativeInteger(value) ? value : 0;
}

function masteryThreshold(request: PlanRequest): number {
  const value = request.masteryThreshold ?? 3;
  return safeNonNegativeInteger(value) && value > 0 ? value : 3;
}

function isMastered(request: PlanRequest, setId: PracticeSetId): boolean {
  return completionCount(request, setId) >= masteryThreshold(request);
}

function parallelSelectionIssue(item: ResolvedSelection, request: PlanRequest): PlanValidationIssue | null {
  const parallelClass = item.program.parallelClass ?? item.set.parallelClass;
  if (item.program.soloOnly || parallelClass === 'solo' || parallelClass === 'attention') {
    return issue('PAIR_NOT_ALLOWED', 'Выбранный набор выполняется только отдельно.', 'The selected set is solo-only.', { setIds: [item.set.id] });
  }
  if (!isMastered(request, item.set.id)) {
    return issue('MASTERY_REQUIRED', 'Параллельный режим откроется после освоения набора отдельно.', 'Parallel mode unlocks after the set is mastered solo.', { setIds: [item.set.id] });
  }
  if (item.program.requiresAudioInParallel && request.guideMode === 'visual') {
    return issue('AUDIO_GUIDE_REQUIRED', 'Для этого набора в параллели нужна звуковая подсказка.', 'This set requires audio guidance in parallel mode.', { setIds: [item.set.id] });
  }
  return null;
}

function validateResolved(request: PlanRequest, resolved: readonly ResolvedSelection[]): PlanValidationIssue[] {
  const issues: PlanValidationIssue[] = [];
  if (request.mode === 'solo' && resolved.length !== 1) {
    issues.push(issue('INVALID_SELECTION_COUNT', 'Для одиночного режима выберите один набор.', 'Select exactly one set for solo mode.'));
  }
  if (request.mode === 'parallel' && (resolved.length < 2 || resolved.length > 20)) {
    issues.push(issue('INVALID_SELECTION_COUNT', 'Для параллельного режима выберите от 2 до 20 наборов.', 'Select between 2 and 20 sets for parallel mode.'));
  }
  if (request.mode === 'charge' && (resolved.length < 1 || resolved.length > 20)) {
    issues.push(issue('INVALID_SELECTION_COUNT', 'Для зарядки выберите от 1 до 20 наборов.', 'Select between 1 and 20 sets for a charge.'));
  }
  const setIds = resolved.map((item) => item.set.id);
  if (unique(setIds).length !== setIds.length) {
    issues.push(issue('DUPLICATE_SELECTION', 'Один набор нельзя добавить дважды.', 'A set cannot be selected twice.'));
  }
  for (const item of resolved) {
    const availableContexts = item.program.contexts ?? item.set.contexts;
    if (!availableContexts.includes(request.context)) {
      issues.push(issue('CONTEXT_UNAVAILABLE', 'Выбранный набор недоступен в этом контексте.', 'A selected set is unavailable in this context.', { setIds: [item.set.id] }));
    }
    if ((item.program.status ?? item.set.status) === 'experimental' && !request.allowExperimental) {
      issues.push(issue('EXPERIMENTAL_DISABLED', 'Экспериментальный набор нужно включить отдельно.', 'Experimental sets must be enabled explicitly.', { setIds: [item.set.id] }));
    }
  }
  const acknowledged = new Set(request.acknowledgedWarnings ?? []);
  for (const warningId of getRequiredWarnings(resolved.map((item) => item.selection))) {
    if (!acknowledged.has(warningId)) {
      issues.push(issue('WARNING_NOT_ACKNOWLEDGED', 'Перед стартом подтвердите обязательное предупреждение.', 'A required warning must be acknowledged before starting.', { warningId }));
    }
  }
  const confirmedPriorExperience = new Set(request.confirmedPriorExperience ?? []);
  for (const programRef of getRequiredPriorExperience(resolved.map((item) => item.selection))) {
    if (!confirmedPriorExperience.has(programRef)) {
      issues.push(issue(
        'PRIOR_EXPERIENCE_REQUIRED',
        'Этот режим не обучает технике. Подтвердите, что вы уже умеете выполнять выбранную практику.',
        'This mode does not teach the technique. Confirm that you already know how to perform the selected practice.',
        { programRef },
      ));
    }
  }
  if (request.mode === 'parallel') {
    const parallelProblems: PlanValidationIssue[] = [];
    for (const item of resolved) {
      const parallelProblem = parallelSelectionIssue(item, request);
      if (parallelProblem) parallelProblems.push(parallelProblem);
    }
    for (const code of unique(parallelProblems.map((problem) => problem.code))) {
      const matching = parallelProblems.filter((problem) => problem.code === code);
      const first = matching[0]!;
      issues.push({
        ...first,
        setIds: unique(matching.flatMap((problem) => problem.setIds ?? [])),
      });
    }
  }
  return issues;
}

export function validatePlanRequest(request: PlanRequest): readonly PlanValidationIssue[] {
  const issues: PlanValidationIssue[] = [];
  if (!safeNonNegativeInteger(request.durationMs) || request.durationMs < 30_000 || request.durationMs > 3_600_000) {
    issues.push(issue('INVALID_DURATION', 'Длительность должна быть от 30 секунд до 60 минут.', 'Duration must be between 30 seconds and 60 minutes.'));
  }
  const resolved: ResolvedSelection[] = [];
  for (const selection of request.selections) {
    const item = resolveSelection(selection);
    if (!item) {
      issues.push(issue('UNKNOWN_PROGRAM', 'Неизвестный набор или программа.', 'Unknown set or program.', { setIds: [selection.setId] }));
    } else {
      resolved.push(item);
    }
  }
  issues.push(...validateResolved(request, resolved));
  return issues;
}

interface WorkingBlock {
  readonly selections: readonly ResolvedSelection[];
}

function groupForCharge(resolved: readonly ResolvedSelection[], request: PlanRequest): WorkingBlock[] {
  const parallel: ResolvedSelection[] = [];
  const blocks: WorkingBlock[] = [];
  for (const item of resolved) {
    if (parallelSelectionIssue(item, request) === null) {
      parallel.push(item);
    } else {
      blocks.push({ selections: [item] });
    }
  }
  if (parallel.length > 0) {
    parallel.sort((a, b) => Number(b.set.id === 'breathing') - Number(a.set.id === 'breathing'));
    blocks.unshift({ selections: parallel });
  }
  return blocks;
}

function localizeStep(item: ResolvedSelection, step: PracticeStep, locale: PauseLocale, lane: number, startMs: number, endMs: number): PlannedStep {
  const peakDuration = step.attention === 'peak' ? Math.min(250, Math.max(0, endMs - startMs)) : 0;
  return {
    lane,
    setId: item.set.id,
    programId: item.program.id,
    stepId: step.id,
    title: text(step.title, locale),
    cue: text(step.cue, locale),
    channel: step.channel,
    motion: step.motion,
    startMs,
    endMs,
    attentionPeakStartMs: peakDuration > 0 ? startMs : null,
    attentionPeakEndMs: peakDuration > 0 ? startMs + peakDuration : null,
  };
}

function buildLane(item: ResolvedSelection, locale: PauseLocale, lane: number, startMs: number, endMs: number): PlannedStep[] {
  const timeline: PlannedStep[] = [];
  let cursor = startMs;
  let stepIndex = 0;
  while (cursor < endMs) {
    const step = item.program.steps[stepIndex % item.program.steps.length]!;
    const next = Math.min(endMs, cursor + step.durationMs);
    timeline.push(localizeStep(item, step, locale, lane, cursor, next));
    cursor = next;
    stepIndex += 1;
  }
  return timeline;
}

function buildPelvicLaneOnBreath(
  item: ResolvedSelection,
  locale: PauseLocale,
  lane: number,
  breathingLane: readonly PlannedStep[],
): PlannedStep[] {
  const squeeze = item.program.steps.find((step) => step.id === 'long-squeeze') ?? item.program.steps[0]!;
  const release = item.program.steps.find((step) => step.id === 'long-release') ?? item.program.steps[1] ?? item.program.steps[0]!;
  return breathingLane.map((breathStep) => {
    const exhale = breathStep.stepId.includes('exhale') || breathStep.stepId.endsWith('-out');
    return localizeStep(item, exhale ? squeeze : release, locale, lane, breathStep.startMs, breathStep.endMs);
  });
}

function buildLaneOnBreathClock(
  item: ResolvedSelection,
  locale: PauseLocale,
  lane: number,
  breathingLane: readonly PlannedStep[],
): PlannedStep[] {
  return breathingLane.map((breathStep, phaseIndex) => {
    const step = item.program.steps[phaseIndex % item.program.steps.length]!;
    return localizeStep(item, step, locale, lane, breathStep.startMs, breathStep.endMs);
  });
}

function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function staggerSecondaryPeaks(primary: readonly PlannedStep[], secondary: readonly PlannedStep[]): PlannedStep[] | null {
  const primaryPeaks = primary.filter((step) => step.attentionPeakStartMs !== null);
  const adjusted: PlannedStep[] = [];
  for (const step of secondary) {
    if (step.attentionPeakStartMs === null || step.attentionPeakEndMs === null) {
      adjusted.push(step);
      continue;
    }
    const span = step.attentionPeakEndMs - step.attentionPeakStartMs;
    let chosen: number | null = null;
    for (let candidate = step.startMs; candidate + span <= step.endMs; candidate += 250) {
      const collision = primaryPeaks.some((peak) => intervalsOverlap(candidate, candidate + span, peak.attentionPeakStartMs!, peak.attentionPeakEndMs!));
      if (!collision) {
        chosen = candidate;
        break;
      }
    }
    if (chosen === null) {
      // A one-second breathing phase can host more simultaneous lanes than
      // distinct 250 ms attention slots. The cue still follows the shared
      // breath clock, while its extra peak marker is suppressed so the
      // renderer/audio layer never presents colliding transition accents.
      adjusted.push({ ...step, attentionPeakStartMs: null, attentionPeakEndMs: null });
    } else {
      adjusted.push({ ...step, attentionPeakStartMs: chosen, attentionPeakEndMs: chosen + span });
    }
  }
  return adjusted;
}

function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function createPracticePlan(request: PlanRequest): PracticePlan {
  const issues = validatePlanRequest(request);
  if (issues.length > 0) {
    const error = new Error(issues.map((item) => `${item.code}: ${text(item.message, request.locale)}`).join('\n'));
    Object.assign(error, { issues });
    throw error;
  }
  const resolved = request.selections.map((selection) => resolveSelection(selection)!);
  const workingBlocks = request.mode === 'charge'
    ? groupForCharge(resolved, request)
    : [{ selections: resolved }];
  const minimumBlockMs = 15_000;
  if (request.durationMs < workingBlocks.length * minimumBlockMs) {
    const tooShort = issue('DURATION_TOO_SHORT', `Для выбранной зарядки нужно минимум ${workingBlocks.length * 15} секунд.`, `This charge needs at least ${workingBlocks.length * 15} seconds.`);
    const error = new Error(text(tooShort.message, request.locale));
    Object.assign(error, { issues: [tooShort] });
    throw error;
  }

  const baseBlockMs = Math.floor(request.durationMs / workingBlocks.length);
  const remainderMs = request.durationMs - baseBlockMs * workingBlocks.length;
  const blocks: PlanBlock[] = [];
  const timeline: PlannedStep[] = [];
  let cursor = 0;
  workingBlocks.forEach((block, blockIndex) => {
    const blockDuration = baseBlockMs + (blockIndex < remainderMs ? 1 : 0);
    const endMs = cursor + blockDuration;
    const blockId = `block-${blockIndex + 1}`;
    const laneSelections = [...block.selections].sort((a, b) => Number(b.set.id === 'breathing') - Number(a.set.id === 'breathing'));
    blocks.push({ id: blockId, startMs: cursor, endMs, setIds: laneSelections.map((item) => item.set.id) });
    const scheduled: PlannedStep[] = [];
    const breathingLane = laneSelections[0]?.set.id === 'breathing'
      ? buildLane(laneSelections[0], request.locale, 0, cursor, endMs)
      : null;
    laneSelections.forEach((item, lane) => {
      const rawLane = lane === 0 && breathingLane
        ? breathingLane
        : item.set.id === 'eye-gym'
          ? buildLane(item, request.locale, lane, cursor, endMs)
          : item.set.id === 'pelvic-floor' && breathingLane
          ? buildPelvicLaneOnBreath(item, request.locale, lane, breathingLane)
          : breathingLane
            ? buildLaneOnBreathClock(item, request.locale, lane, breathingLane)
            : buildLane(item, request.locale, lane, cursor, endMs);
      const adjustedLane = lane === 0 ? rawLane : staggerSecondaryPeaks(scheduled, rawLane);
      if (!adjustedLane) {
        const collision = issue('ATTENTION_PEAK_COLLISION', 'Не удалось безопасно разнести пики внимания выбранных наборов.', 'The selected sets have attention peaks that cannot be safely staggered.', { setIds: laneSelections.map((selection) => selection.set.id) });
        const error = new Error(text(collision.message, request.locale));
        Object.assign(error, { issues: [collision] });
        throw error;
      }
      scheduled.push(...adjustedLane);
      timeline.push(...adjustedLane);
    });
    cursor = endMs;
  });

  const selections = resolved.map((item) => item.selection);
  const warningIds = getRequiredWarnings(selections);
  const priorExperienceProgramIds = getRequiredPriorExperience(selections);
  const visualLeaderMode = request.visualLeaderMode ?? 'full-screen-clock';
  const fingerprint = JSON.stringify({ mode: request.mode, selections, durationMs: request.durationMs, locale: request.locale, guideMode: request.guideMode, context: request.context, visualLeaderMode });
  return {
    id: `pause-${hashString(fingerprint)}`,
    version: 'pause-practices-plan-v1',
    mode: request.mode,
    locale: request.locale,
    guideMode: request.guideMode,
    context: request.context,
    visualLeaderMode,
    durationMs: request.durationMs,
    selections,
    blocks,
    timeline: timeline.sort((a, b) => a.startMs - b.startMs || a.lane - b.lane),
    warningIds,
    priorExperienceProgramIds,
  };
}

function assertTimestamp(nowMs: number): void {
  if (!safeNonNegativeInteger(nowMs)) throw new Error('Timestamp must be a non-negative safe integer');
}

function runningElapsed(session: PracticeSession, nowMs: number): number {
  assertTimestamp(nowMs);
  if (session.runningSinceMs === null) return session.elapsedMs;
  if (nowMs < session.runningSinceMs) throw new Error('Clock must be monotonic');
  const delta = nowMs - session.runningSinceMs;
  const total = session.elapsedMs + delta;
  if (!Number.isSafeInteger(total)) throw new Error('Elapsed time overflow');
  return Math.min(session.plan.durationMs, total);
}

export function createPracticeSession(plan: PracticePlan): PracticeSession {
  return { phase: 'ready', plan, elapsedMs: 0, runningSinceMs: null, interruptedCount: 0, result: null };
}

export function startPracticeSession(session: PracticeSession, nowMs: number): PracticeSession {
  assertTimestamp(nowMs);
  if (session.phase !== 'ready') throw new Error('Only a ready session can start');
  return { ...session, phase: 'running', runningSinceMs: nowMs };
}

export function pausePracticeSession(session: PracticeSession, nowMs: number): PracticeSession {
  if (session.phase !== 'running') return session;
  const elapsedMs = runningElapsed(session, nowMs);
  if (elapsedMs >= session.plan.durationMs) return completeSession(session, elapsedMs);
  return { ...session, phase: 'paused', elapsedMs, runningSinceMs: null, interruptedCount: session.interruptedCount + 1 };
}

export function resumePracticeSession(session: PracticeSession, nowMs: number): PracticeSession {
  assertTimestamp(nowMs);
  if (session.phase !== 'paused') return session;
  return { ...session, phase: 'running', runningSinceMs: nowMs };
}

function completeSession(session: PracticeSession, elapsedMs: number): PracticeSession {
  const completedSetIds = unique(session.plan.selections.map((selection) => selection.setId));
  const result: PracticeResult = {
    planId: session.plan.id,
    durationMs: session.plan.durationMs,
    completedSetIds,
    completion: 1,
    adherence: 1,
    interruptedCount: session.interruptedCount,
  };
  return { ...session, phase: 'completed', elapsedMs, runningSinceMs: null, result };
}

export function tickPracticeSession(session: PracticeSession, nowMs: number): PracticeSession {
  if (session.phase !== 'running') return session;
  const elapsedMs = runningElapsed(session, nowMs);
  if (elapsedMs >= session.plan.durationMs) return completeSession(session, elapsedMs);
  return { ...session, elapsedMs, runningSinceMs: nowMs };
}

export function restartPracticeSession(session: PracticeSession): PracticeSession {
  if (session.phase === 'disposed') throw new Error('Disposed sessions cannot restart');
  return createPracticeSession(session.plan);
}

export function disposePracticeSession(session: PracticeSession): PracticeSession {
  return { ...session, phase: 'disposed', runningSinceMs: null, result: null };
}

export function elapsedPracticeTime(session: PracticeSession, nowMs?: number): number {
  if (session.phase === 'running') {
    if (nowMs === undefined) throw new Error('nowMs is required for a running session');
    return runningElapsed(session, nowMs);
  }
  return session.elapsedMs;
}

function toneForStep(step: PlannedStep, guideMode: GuideMode): ToneGuide | null {
  if (guideMode === 'visual' || step.channel !== 'scale') return null;
  if (step.stepId === 'hold-in' || step.stepId === 'hold-out' || step.stepId === 'hold') {
    return { kind: 'steady', fromHz: 330, toHz: 330 };
  }
  if (step.stepId.includes('inhale') || step.stepId.endsWith('-in')) {
    return { kind: 'pitch-ramp', fromHz: 220, toHz: 440 };
  }
  if (step.stepId.includes('exhale') || step.stepId.endsWith('-out')) {
    return { kind: 'pitch-ramp', fromHz: 440, toHz: 220 };
  }
  return { kind: 'steady', fromHz: 330, toHz: 330 };
}

export function getActiveFrame(plan: PracticePlan, elapsedMs: number): ActiveFrame {
  if (!safeNonNegativeInteger(elapsedMs)) throw new Error('elapsedMs must be a non-negative safe integer');
  const bounded = Math.min(plan.durationMs, elapsedMs);
  const active = plan.timeline.filter((step) => bounded >= step.startMs && bounded < step.endMs);
  const cues = active.map((step) => ({
    setId: step.setId,
    programId: step.programId,
    stepId: step.stepId,
    title: step.title,
    cue: step.cue,
    channel: step.channel,
    motion: step.motion,
    leaderShape: getPracticeProgram(step.setId, step.programId).leaderShape ?? 'none',
    tone: toneForStep(step, plan.guideMode),
    progress: step.endMs === step.startMs ? 1 : (bounded - step.startMs) / (step.endMs - step.startMs),
  }));
  return { elapsedMs: bounded, progress: plan.durationMs === 0 ? 1 : bounded / plan.durationMs, cues };
}

export function getVisualGuideFrame(cue: GuideCue, mode: VisualLeaderMode): VisualGuideFrame {
  let expansion = 0.5;
  if (cue.stepId === 'hold-in' || cue.stepId === 'hold') expansion = 1;
  else if (cue.stepId === 'hold-out') expansion = 0;
  else if (cue.stepId === 'inhale-one') expansion = cue.progress * 2 / 3;
  else if (cue.stepId === 'inhale-two') expansion = 2 / 3 + cue.progress / 3;
  else if (cue.stepId.includes('inhale') || cue.stepId.endsWith('-in')) expansion = cue.progress;
  else if (cue.stepId.includes('exhale') || cue.stepId.endsWith('-out')) expansion = 1 - cue.progress;
  return {
    mode,
    shape: cue.leaderShape,
    phaseProgress: cue.progress,
    scale: 0.72 + expansion * 0.28,
    saturation: mode === 'image-processing' ? 0.45 + expansion * 0.55 : 1,
    blurPx: mode === 'image-processing' ? (1 - expansion) * 6 : 0,
    pixelSize: mode === 'image-processing' ? Math.round(2 + (1 - expansion) * 10) : 1,
  };
}

export function getSessionFrame(session: PracticeSession, nowMs?: number): ActiveFrame {
  return getActiveFrame(session.plan, elapsedPracticeTime(session, nowMs));
}

export function assertNoAttentionPeakCollisions(plan: PracticePlan): void {
  const peaks = plan.timeline.filter((step) => step.attentionPeakStartMs !== null);
  for (let outer = 0; outer < peaks.length; outer += 1) {
    for (let inner = outer + 1; inner < peaks.length; inner += 1) {
      const a = peaks[outer]!;
      const b = peaks[inner]!;
      if (a.lane === b.lane) continue;
      if (intervalsOverlap(a.attentionPeakStartMs!, a.attentionPeakEndMs!, b.attentionPeakStartMs!, b.attentionPeakEndMs!)) {
        throw new Error(`Attention peak collision: ${a.setId}/${a.stepId} and ${b.setId}/${b.stepId}`);
      }
    }
  }
}
