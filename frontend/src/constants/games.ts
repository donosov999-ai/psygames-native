export type GameCategory =
  | 'memory'
  | 'attention'
  | 'logic'
  | 'control'
  | 'math'
  | 'speed';

export interface GameConfig {
  id: string;
  nameKey: string;
  descKey: string;
  skillKey: string;
  gradient: string[];
  icon: string;
  route: string;
  category: GameCategory;
  /** Hide from main menu (still accessible by route via warmup/playlists/group cards) */
  hideFromMenu?: boolean;
}

export const CATEGORY_ORDER: GameCategory[] = [
  'memory',
  'attention',
  'logic',
  'control',
  'math',
  'speed',
];

export const CATEGORY_META: Record<GameCategory, { titleKey: string; icon: string; color: string }> = {
  memory:    { titleKey: 'catMemory',    icon: 'library-outline',         color: '#f093fb' },
  attention: { titleKey: 'catAttention', icon: 'eye-outline',             color: '#667eea' },
  logic:     { titleKey: 'catLogic',     icon: 'extension-puzzle-outline',color: '#a8c0ff' },
  control:   { titleKey: 'catControl',   icon: 'hand-left-outline',       color: '#fc466b' },
  math:      { titleKey: 'catMath',      icon: 'calculator-outline',      color: '#fa709a' },
  speed:     { titleKey: 'catSpeed',     icon: 'flash-outline',           color: '#ff0844' },
};

export const GAMES: GameConfig[] = [
  // ATTENTION
  {
    id: 'schulte_table',
    nameKey: 'schulteTable',
    descKey: 'schulteTableDesc',
    skillKey: 'skillAttention',
    gradient: ['#667eea', '#764ba2'],
    icon: 'grid',
    route: '/games/schulte',
    category: 'attention',
  },
  {
    id: 'proofreading',
    nameKey: 'proofreading',
    descKey: 'proofreadingDesc',
    skillKey: 'skillFocus',
    gradient: ['#a8edea', '#fed6e3'],
    icon: 'search',
    route: '/games/proofreading',
    category: 'attention',
  },
  {
    id: 'find_differences',
    nameKey: 'findDiff',
    descKey: 'findDiffDesc',
    skillKey: 'skillDetailAttention',
    gradient: ['#34e89e', '#0f3443'],
    icon: 'search',
    route: '/games/find-differences',
    category: 'attention',
  },

  // MEMORY
  {
    id: 'word_pairs',
    nameKey: 'wordPairs',
    descKey: 'wordPairsDesc',
    skillKey: 'skillMemory',
    gradient: ['#f093fb', '#f5576c'],
    icon: 'link',
    route: '/games/word-pairs',
    category: 'memory',
  },
  {
    id: 'mnemonics',
    nameKey: 'mnemonics',
    descKey: 'mnemonicsDesc',
    skillKey: 'skillSequence',
    gradient: ['#4facfe', '#00f2fe'],
    icon: 'bulb',
    route: '/games/mnemonics',
    category: 'memory',
  },
  {
    id: 'n_back',
    nameKey: 'nBack',
    descKey: 'nBackDesc',
    skillKey: 'skillWorkingMemory',
    gradient: ['#5b86e5', '#36d1dc'],
    icon: 'analytics',
    route: '/games/n-back',
    category: 'memory',
  },
  {
    id: 'digit_span',
    nameKey: 'digitSpan',
    descKey: 'digitSpanDesc',
    skillKey: 'skillShortTermMemory',
    gradient: ['#11998e', '#38ef7d'],
    icon: 'call',
    route: '/games/digit-span',
    category: 'memory',
    hideFromMenu: true, // merged into 'span_group'
  },
  {
    id: 'memory_matrix',
    nameKey: 'memoryMatrix',
    descKey: 'memoryMatrixDesc',
    skillKey: 'skillVisualMemory',
    gradient: ['#8e2de2', '#4a00e0'],
    icon: 'grid',
    route: '/games/memory-matrix',
    category: 'memory',
  },
  {
    id: 'picture_pairs',
    nameKey: 'picturePairs',
    descKey: 'picturePairsDesc',
    skillKey: 'skillVisualMemory',
    gradient: ['#f857a6', '#ff5858'],
    icon: 'heart',
    route: '/games/picture-pairs',
    category: 'memory',
  },
  {
    id: 'reading_span',
    nameKey: 'readingSpan',
    descKey: 'readingSpanDesc',
    skillKey: 'skillWorkingMemory',
    gradient: ['#1f4037', '#99f2c8'],
    icon: 'book',
    route: '/games/reading-span',
    category: 'memory',
  },
  {
    id: 'corsi',
    nameKey: 'corsi',
    descKey: 'corsiDesc',
    skillKey: 'skillVisualMemory',
    gradient: ['#0083B0', '#00B4DB'],
    icon: 'grid',
    route: '/games/corsi',
    category: 'memory',
    hideFromMenu: true, // merged into 'span_group'
  },
  {
    id: 'ospan',
    nameKey: 'ospan',
    descKey: 'ospanDesc',
    skillKey: 'skillWorkingMemory',
    gradient: ['#cb356b', '#bdfff3'],
    icon: 'calculator',
    route: '/games/ospan',
    category: 'memory',
  },
  {
    id: 'spatial_span',
    nameKey: 'spatialSpan',
    descKey: 'spatialSpanDesc',
    skillKey: 'skillVisualMemory',
    gradient: ['#1A2980', '#26D0CE'],
    icon: 'apps',
    route: '/games/spatial-span',
    category: 'memory',
    hideFromMenu: true, // merged into 'span_group'
  },
  // Group card combining digit_span + corsi + spatial_span
  {
    id: 'span_group',
    nameKey: 'spanGroup',
    descKey: 'spanGroupDesc',
    skillKey: 'skillShortTermMemory',
    gradient: ['#0ea5e9', '#10b981'],
    icon: 'albums',
    route: '/games/span',
    category: 'memory',
  },

  // LOGIC / REASONING
  {
    id: 'hanoi',
    nameKey: 'hanoi',
    descKey: 'hanoiDesc',
    skillKey: 'skillProblemSolving',
    gradient: ['#a8c0ff', '#3f2b96'],
    icon: 'extension-puzzle',
    route: '/games/hanoi',
    category: 'logic',
  },
  {
    id: 'sudoku',
    nameKey: 'sudoku',
    descKey: 'sudokuDesc',
    skillKey: 'skillLogic',
    gradient: ['#7f7fd5', '#86a8e7'],
    icon: 'apps',
    route: '/games/sudoku',
    category: 'logic',
  },
  {
    id: 'anagrams',
    nameKey: 'anagrams',
    descKey: 'anagramsDesc',
    skillKey: 'skillVerbal',
    gradient: ['#ee9ca7', '#ffdde1'],
    icon: 'language',
    route: '/games/anagrams',
    category: 'logic',
  },
  {
    id: 'pattern',
    nameKey: 'pattern',
    descKey: 'patternDesc',
    skillKey: 'skillReasoning',
    gradient: ['#7028e4', '#e5b2ca'],
    icon: 'analytics',
    route: '/games/pattern',
    category: 'logic',
  },
  {
    id: 'set_game',
    nameKey: 'setGame',
    descKey: 'setGameDesc',
    skillKey: 'skillReasoning',
    gradient: ['#43cea2', '#185a9d'],
    icon: 'shapes',
    route: '/games/set-game',
    category: 'logic',
  },
  {
    id: 'mental_rotation',
    nameKey: 'mentalRotation',
    descKey: 'mentalRotationDesc',
    skillKey: 'skillSpatial',
    gradient: ['#5614b0', '#dbd65c'],
    icon: 'cube',
    route: '/games/mental-rotation',
    category: 'logic',
  },
  {
    id: 'tower_london',
    nameKey: 'towerLondon',
    descKey: 'towerLondonDesc',
    skillKey: 'skillPlanning',
    gradient: ['#3a1c71', '#d76d77'],
    icon: 'git-branch',
    route: '/games/tower-london',
    category: 'logic',
  },

  // CONTROL / INHIBITION
  // Group card: Stroop + Stroop-emotional + Flanker (interference resolution)
  {
    id: 'attention_conflict',
    nameKey: 'attentionConflict',
    descKey: 'attentionConflictDesc',
    skillKey: 'skillInhibition',
    gradient: ['#7c3aed', '#ec4899'],
    icon: 'layers',
    route: '/games/attention-conflict',
    category: 'control',
  },
  // Group card: Go/No-Go + Stop-Signal (action restraint vs cancellation)
  {
    id: 'inhibition',
    nameKey: 'inhibition',
    descKey: 'inhibitionDesc',
    skillKey: 'skillInhibition',
    gradient: ['#11998e', '#ee0979'],
    icon: 'hand-left',
    route: '/games/inhibition',
    category: 'control',
  },
  {
    id: 'stroop',
    nameKey: 'stroop',
    descKey: 'stroopDesc',
    skillKey: 'skillInhibition',
    gradient: ['#fc466b', '#3f5efb'],
    icon: 'eye',
    route: '/games/stroop',
    category: 'control',
    hideFromMenu: true, // merged into 'attention_conflict'
  },
  {
    id: 'go_no_go',
    nameKey: 'goNoGo',
    descKey: 'goNoGoDesc',
    skillKey: 'skillInhibition',
    gradient: ['#11998e', '#38ef7d'],
    icon: 'pause-circle',
    route: '/games/go-no-go',
    category: 'control',
    hideFromMenu: true, // merged into 'inhibition'
  },
  {
    id: 'stop_signal',
    nameKey: 'stopSignal',
    descKey: 'stopSignalDesc',
    skillKey: 'skillInhibition',
    gradient: ['#ee0979', '#ff6a00'],
    icon: 'hand-left',
    route: '/games/stop-signal',
    category: 'control',
    hideFromMenu: true, // merged into 'inhibition'
  },
  {
    id: 'trail_making',
    nameKey: 'trailMaking',
    descKey: 'trailMakingDesc',
    skillKey: 'skillSwitching',
    gradient: ['#fc6076', '#ff9a44'],
    icon: 'swap-horizontal',
    route: '/games/trail-making',
    category: 'control',
  },
  {
    id: 'switching_task',
    nameKey: 'switchingTask',
    descKey: 'switchingTaskDesc',
    skillKey: 'skillSwitching',
    gradient: ['#7873f5', '#ff6ec4'],
    icon: 'swap-horizontal',
    route: '/games/switching-task',
    category: 'control',
  },
  {
    id: 'wcst',
    nameKey: 'wcst',
    descKey: 'wcstDesc',
    skillKey: 'skillSwitching',
    gradient: ['#834d9b', '#d04ed6'],
    icon: 'shuffle',
    route: '/games/wcst',
    category: 'control',
  },
  {
    id: 'flanker',
    nameKey: 'flanker',
    descKey: 'flankerDesc',
    skillKey: 'skillInhibition',
    gradient: ['#16222a', '#3a6073'],
    icon: 'flash',
    route: '/games/flanker',
    category: 'control',
    hideFromMenu: true, // merged into 'attention_conflict'
  },
  {
    id: 'stroop_emotional',
    nameKey: 'stroopEmotional',
    descKey: 'stroopEmotionalDesc',
    skillKey: 'skillInhibition',
    gradient: ['#8E2DE2', '#4A00E0'],
    icon: 'heart-dislike',
    route: '/games/stroop-emotional',
    category: 'control',
    hideFromMenu: true, // merged into 'attention_conflict'
  },
  {
    id: 'bart',
    nameKey: 'bart',
    descKey: 'bartDesc',
    skillKey: 'skillRisk',
    gradient: ['#ff5e62', '#ff9966'],
    icon: 'warning',
    route: '/games/bart',
    category: 'control',
  },
  {
    id: 'iowa',
    nameKey: 'iowa',
    descKey: 'iowaDesc',
    skillKey: 'skillRisk',
    gradient: ['#0F2027', '#2C5364'],
    icon: 'cash',
    route: '/games/iowa',
    category: 'control',
  },
  {
    id: 'prl',
    nameKey: 'prl',
    descKey: 'prlDesc',
    skillKey: 'skillRisk',
    gradient: ['#1e3c72', '#2a5298'],
    icon: 'trending-up',
    route: '/games/prl',
    category: 'control',
  },

  // MATH
  {
    id: 'counter',
    nameKey: 'counter',
    descKey: 'counterDesc',
    skillKey: 'skillMath',
    gradient: ['#fa709a', '#fee140'],
    icon: 'add-circle',
    route: '/games/counter',
    category: 'math',
  },
  {
    id: 'math_sprint',
    nameKey: 'mathSprint',
    descKey: 'mathSprintDesc',
    skillKey: 'skillMath',
    gradient: ['#fc4a1a', '#f7b733'],
    icon: 'calculator',
    route: '/games/math-sprint',
    category: 'math',
  },
  {
    id: 'number_bonds',
    nameKey: 'numberBonds',
    descKey: 'numberBondsDesc',
    skillKey: 'skillMath',
    gradient: ['#36d1dc', '#5b86e5'],
    icon: 'git-merge',
    route: '/games/number-bonds',
    category: 'math',
  },

  // SPEED / REACTION
  {
    id: 'targets',
    nameKey: 'targets',
    descKey: 'targetsDesc',
    skillKey: 'skillReaction',
    gradient: ['#ff0844', '#ffb199'],
    icon: 'disc',
    route: '/games/targets',
    category: 'speed',
  },
  {
    id: 'choice_rt',
    nameKey: 'choiceRt',
    descKey: 'choiceRtDesc',
    skillKey: 'skillReaction',
    gradient: ['#fdc830', '#f37335'],
    icon: 'arrow-forward-circle',
    route: '/games/choice-rt',
    category: 'speed',
  },
  {
    id: 'visual_search',
    nameKey: 'visualSearch',
    descKey: 'visualSearchDesc',
    skillKey: 'skillFocus',
    gradient: ['#536976', '#292e49'],
    icon: 'scan',
    route: '/games/visual-search',
    category: 'attention',
  },
  {
    id: 'sdmt',
    nameKey: 'sdmt',
    descKey: 'sdmtDesc',
    skillKey: 'skillProcessingSpeed',
    gradient: ['#0f2027', '#2c5364'],
    icon: 'apps',
    route: '/games/sdmt',
    category: 'speed',
  },
  {
    id: 'posner',
    nameKey: 'posner',
    descKey: 'posnerDesc',
    skillKey: 'skillFocus',
    gradient: ['#3a6186', '#89253e'],
    icon: 'navigate',
    route: '/games/posner',
    category: 'attention',
  },
  {
    id: 'ant',
    nameKey: 'ant',
    descKey: 'antDesc',
    skillKey: 'skillFocus',
    gradient: ['#005C97', '#363795'],
    icon: 'git-network',
    route: '/games/ant',
    category: 'attention',
  },
  {
    id: 'cpt',
    nameKey: 'cpt',
    descKey: 'cptDesc',
    skillKey: 'skillSustainedAttention',
    gradient: ['#0f4c75', '#3282b8'],
    icon: 'time',
    route: '/games/cpt',
    category: 'attention',
  },
  {
    id: 'phonemic_fluency',
    nameKey: 'phonemic',
    descKey: 'phonemicDesc',
    skillKey: 'skillVerbal',
    gradient: ['#16a085', '#f4d03f'],
    icon: 'chatbubbles',
    route: '/games/phonemic-fluency',
    category: 'logic',
  },
  {
    id: 'story_recall',
    nameKey: 'story',
    descKey: 'storyDesc',
    skillKey: 'skillMemory',
    gradient: ['#654ea3', '#eaafc8'],
    icon: 'book',
    route: '/games/story-recall',
    category: 'memory',
  },
  {
    id: 'rmet',
    nameKey: 'rmet',
    descKey: 'rmetDesc',
    skillKey: 'skillSocial',
    gradient: ['#fc466b', '#a445b2'],
    icon: 'eye',
    route: '/games/rmet',
    category: 'control',
  },
];

// Russian words for word games
export const RUSSIAN_WORDS = [
  'дом', 'кот', 'солнце', 'книга', 'река', 'лес', 'окно', 'стол', 'дверь', 'дорога',
  'мама', 'папа', 'брат', 'сестра', 'дедушка', 'бабушка', 'друг', 'школа', 'город', 'страна',
  'вода', 'огонь', 'земля', 'воздух', 'небо', 'звезда', 'луна', 'море', 'гора', 'поле',
  'машина', 'поезд', 'самолет', 'корабль', 'велосипед', 'автобус', 'трамвай', 'метро', 'такси', 'ракета',
  'яблоко', 'банан', 'апельсин', 'виноград', 'арбуз', 'дыня', 'персик', 'слива', 'груша', 'вишня',
];

// English words for word games
export const ENGLISH_WORDS = [
  'house', 'cat', 'sun', 'book', 'river', 'forest', 'window', 'table', 'door', 'road',
  'mother', 'father', 'brother', 'sister', 'grandpa', 'grandma', 'friend', 'school', 'city', 'country',
  'water', 'fire', 'earth', 'air', 'sky', 'star', 'moon', 'sea', 'mountain', 'field',
  'car', 'train', 'plane', 'ship', 'bike', 'bus', 'tram', 'metro', 'taxi', 'rocket',
  'apple', 'banana', 'orange', 'grape', 'melon', 'peach', 'plum', 'pear', 'cherry', 'mango',
];

// Russian alphabet for proofreading
export const RUSSIAN_ALPHABET = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ';

// English alphabet for proofreading
export const ENGLISH_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
