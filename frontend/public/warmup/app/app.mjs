import {
  AlarmSession,
  createAlarmEnvelope,
  definitionFromEnvelope,
  parseEnvelope,
} from '../shared/smart-alarm/app/alarmService.js';
import {
  createChoiceTrials,
  createSchulteChallenge,
  median,
  pressSchulteCell,
} from '../shared/smart-alarm/app/challenges.js';
import { translate } from '../shared/smart-alarm/app/i18n.js';
import { createNativeAlarmBridge } from '../shared/smart-alarm/runtime/nativeApi.js';
import {
  PRACTICE_CATALOG,
  WARNING_TEXT,
  createPracticePlan,
  createPracticeSession,
  disposePracticeSession,
  getPracticeStatus,
  getPracticeProgram,
  getPracticeSet,
  getRequiredPriorExperience,
  getRequiredWarnings,
  getSessionFrame,
  getVisualGuideFrame,
  pausePracticeSession,
  resumePracticeSession,
  startPracticeSession,
  text as catalogText,
  tickPracticeSession,
  validatePlanRequest,
} from '../shared/pause-practices/core/engine.js';
import {
  VERSION_MANIFEST,
  getPracticeBlockVersion,
} from './versioning.mjs';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const minute = 60_000;
const weekdayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const featuredSets = ['breathing', 'eye-gym', 'face-speech', 'pelvic-floor', 'abdomen', 'mobility', 'postures', 'relaxation', 'isometrics', 'feldenkrais'];
const statusKeys = { approved: 'approved', extension: 'extension', experimental: 'experimental' };
const cosmicAssetRoot = './assets/cosmic-body';
const cosmicPostureAssets = {
  horse: `${cosmicAssetRoot}/pose-horse-phone-v1.webp`,
  cobbler: `${cosmicAssetRoot}/pose-cobbler-phone-v1.webp`,
  lotus: `${cosmicAssetRoot}/pose-lotus-phone-v1.webp`,
  mountain: `${cosmicAssetRoot}/pose-mountain-phone-v1.webp`,
};
const taskKeys = {
  schulte_table: 'schulte',
  choice_rt: 'choiceRt',
};

const copy = {
  ru: {
    skip: 'К содержанию', productName: 'Умный будильник', checkingPlatform: 'Проверяем платформу…',
    alarms: 'Будильники', recharge: 'Зарядка', history: 'История', localMorning: 'Локальное утро',
    alarmsTitle: 'Проснуться — и сразу включиться', alarmsLead: 'Сигнал останавливается после короткой когнитивной задачи или по безопасному лимиту.',
    addAlarm: 'Добавить будильник', nextAlarm: 'Следующий сигнал', noAlarmScheduled: 'Нет активного расписания',
    testNow: 'Проверить сейчас', testNote: 'Ручной тест запускает тот же fail-safe сценарий', honestStatus: 'Честный статус',
    permissions: 'Разрешения и надёжность', configurePermissions: 'Настроить разрешения', schedule: 'Расписание',
    yourAlarms: 'Ваши будильники', failSafe: 'Fail-safe', safetyTitle: 'Сигнал не будет звучать бесконечно',
    safetyCopy: 'Лимит попыток, непрерывного и общего времени работает независимо от результата задачи.',
    safetyEscape: 'Кнопка безопасного выхода всегда на экране', safetySnooze: 'Отсрочка ограничена настройками',
    safetyNoScore: 'Ошибки не превращаются в оценку здоровья', afterWake: 'После пробуждения',
    rechargeTitle: 'Соберите утреннюю зарядку', rechargeLead: 'Чистый планировщик PsyGames сам проверяет предупреждения, опыт и допустимые параллельные сочетания.',
    planner: 'Планировщик', sessionFormat: 'Формат сессии', pureEngine: 'Pure engine', mode: 'Режим', solo: 'Отдельно',
    parallel: 'Параллельно', route: 'Маршрут', duration: 'Длительность', context: 'Контекст', guide: 'Подсказка',
    home: 'Дома', desk: 'За столом', discreet: 'Незаметно', both: 'Экран + звук', visual: 'Только экран', audio: 'Только звук',
    masteryTitle: 'Освоено отдельно', masteryCopy: 'Подтверждаю минимум три самостоятельных завершения выбранных наборов',
    experimentalTitle: 'Экспериментальные наборы', experimentalCopy: 'Включить локальные кандидаты без продуктовых обещаний',
    searchCatalog: 'Поиск по каталогу', fullCatalog: 'Полный каталог', choosePractices: 'Выберите практики',
    catalogRuntime: 'Загружено из pause-practices core', engineCheck: 'Проверка движка', planReady: 'План готовится',
    startRecharge: 'Начать зарядку', completionPrivacy: 'Сохраняются только завершение и время — без медицинской оценки.',
    localOnly: 'Только на устройстве', historyTitle: 'История пробуждений',
    historyLead: 'Нейтральная запись факта: когда сигнал остановлен и какие практики завершены.', timeline: 'Хронология',
    recentEvents: 'Последние события', privacyTitle: 'Приватность по умолчанию',
    privacyCopy: 'Нет аккаунта, рекламы, облака и сетевых запросов. Браузерный preview очищается при закрытии страницы.',
    footerBoundary: 'Локальный wellness-инструмент · не медицинское устройство', footerPrivacy: 'Без сети · без аккаунта · без рекламы',
    alarmSettings: 'Настройки сигнала', newAlarm: 'Новый будильник', label: 'Название', time: 'Время', task: 'Задача пробуждения',
    firstWarmup: 'Первый блок зарядки', weakDomain: 'Слабый домен, иначе зарядка', schulte: 'Таблица Шульте 3×3',
    choiceRt: 'Выбор направления', weekdays: 'Дни недели', attempts: 'Попыток', maxMinutes: 'Лимит сигнала, мин',
    snoozes: 'Отсрочек', snoozeMinutes: 'Повтор через, мин', enabled: 'Будильник включён',
    enabledCopy: 'Выключенный остаётся в списке, но не планируется', browserPreview: 'Браузерный предпросмотр',
    browserPreviewCopy: 'Закрытие страницы удаляет локальное расписание. Это не системный будильник.', delete: 'Удалить', cancel: 'Отмена', save: 'Сохранить',
    wakeCheck: 'Проверка пробуждения', proveAwake: 'Покажите, что вы проснулись',
    alarmActive: 'Сигнал активен. Fail-safe остановит его по первому достигнутому лимиту.', snooze: 'Отложить', safeStop: 'Безопасно остановить',
    alarmDismissed: 'Сигнал остановлен', continueMorning: 'Продолжить утреннюю зарядку?',
    continueMorningCopy: 'Откроем безопасный маршрут из каталога PsyGames. Ничего не запускается без проверки предупреждений.',
    autoOpen: 'Автопереход к плану через', seconds: 'с', openRecharge: 'Открыть зарядку', notNow: 'Не сейчас',
    morningRecharge: 'Утренняя зарядка', parallelPractice: 'Параллельная зарядка · {count} практик', soloPractice: 'Отдельная практика',
    breathingLayer: 'Ритм дыхания', eyeLayer: 'Траектория взгляда', nextAdvice: 'Подсказка', phaseSeconds: '{count} с',
    generalStop: 'Остановитесь при боли, головокружении, онемении или выраженном дискомфорте.',
    pause: 'Пауза', finishWithoutRecord: 'Выйти без записи', resume: 'Продолжить',
    monday: 'Пн', tuesday: 'Вт', wednesday: 'Ср', thursday: 'Чт', friday: 'Пт', saturday: 'Сб', sunday: 'Вс',
    active: 'Активен', off: 'Выключен', localDraft: 'Локальный черновик', edit: 'Изменить', noAlarms: 'Будильников пока нет',
    enabledCount: 'активных', everyDay: 'Каждый день', manualTest: 'Ручной тест', saved: 'Сохранено', saveFailed: 'Не удалось сохранить',
    permissionResult: 'Статус разрешений обновлён', browserPlatform: 'Браузерный preview · расписание живёт только на странице',
    nativePlatform: 'Системный адаптер', unsupported: 'Нет', available: 'Готово', restricted: 'Ограничено', denied: 'Запрещено',
    permissionRequired: 'Нужно разрешение', unknown: 'Неизвестно', scheduler: 'Фоновое расписание', notifications: 'Уведомления',
    continuousAudio: 'Непрерывный звук', rebootRestore: 'Восстановление после перезапуска', fullScreenIntent: 'Полноэкранный запуск', exactAlarm: 'Точное время',
    select: 'Включить', selected: 'Выключить', alwaysOn: 'Всегда включено', approved: 'Основной', extension: 'Расширение', experimental: 'Эксперимент',
    experienced: 'Только для умеющих', soloOnly: 'Только отдельно', program: 'Программа',
    selectionsOne: 'Выбрано: 1', selectionsMany: 'Выбрано: {count}', catalogItems: '{count} наборов',
    planValid: 'План готов', planBlocked: 'Нужны действия', planEmpty: 'Выберите хотя бы одну практику',
    blocks: 'блоков', lanes: 'практик', warningsTitle: 'Перед началом', readWarnings: 'Я прочитал обязательные предупреждения',
    experienceTitle: 'Уже освоенная техника', experienceCopy: 'Агнисара, вакуум и наули здесь не обучаются. Приложение только отсчитывает время знакомой техники.',
    confirmExperience: 'Я уже умею выполнять выбранную технику', startBlocked: 'Устраните замечания движка', showRequired: 'Показать, что нужно',
    challengeSchulteTitle: 'Нажимайте числа по порядку', challengeSchulteHint: 'Следующее число: {next}',
    challengeChoiceTitle: 'Выберите направление стрелки', challengeChoiceHint: 'Дождитесь стрелки и нажмите соответствующую кнопку',
    waiting: 'Приготовьтесь…', wrong: 'Не совпало — попытка учтена', correct: 'Верно', attemptsLeft: 'Ошибок: {failed}/{max}',
    snoozesLeft: 'Отсрочек: {used}/{max}', maxTime: 'Лимит: {minutes} мин', passed: 'Готово — сигнал остановлен',
    escaped: 'Сигнал безопасно остановлен', snoozed: 'Повтор запланирован', audioRestricted: 'Звук браузера недоступен; визуальная задача продолжает работать',
    practiceComplete: 'Зарядка завершена', practiceNotRecorded: 'Выход без записи', practicePaused: 'На паузе',
    noHistory: 'Событий пока нет. Ручной тест появится здесь после завершения.', awakenings: 'Пробуждения', practices: 'Зарядки',
    safeStops: 'Безопасные остановки', alarmEvent: 'Будильник', practiceEvent: 'Зарядка', complete: 'Завершено', safeStopped: 'Остановлено безопасно',
    reasonPassed: 'Задача пройдена', reasonAttemptCap: 'Достигнут лимит попыток', reasonTimeCap: 'Достигнут лимит непрерывного сигнала',
    reasonTotalTimeCap: 'Достигнут общий лимит сигнала', reasonEscape: 'Безопасный выход', reasonSnooze: 'Отложено',
    reasonAdapterError: 'Ошибка системного адаптера', reasonClockError: 'Ошибка часов', reasonDispose: 'Сессия закрыта',
    reasonCollision: 'Совпадающий сигнал пропущен', selfTest: 'Проверка на устройстве', notRun: 'НЕ ПРОВЕРЕНО',
    notApplicable: 'Не применяется', verified: 'Проверено', capabilityFailed: 'Проверка не пройдена',
    localSession: 'Текущая локальная сессия', settingsOpened: 'Системные настройки не открыты на этой платформе', affectedSets: 'Затронутые наборы',
    appVersion: 'Версия приложения {version}', blockVersion: 'Версия блока {version}',
  },
  en: {
    skip: 'Skip to content', productName: 'Smart Alarm', checkingPlatform: 'Checking platform…',
    alarms: 'Alarms', recharge: 'Recharge', history: 'History', localMorning: 'Local morning',
    alarmsTitle: 'Wake up and switch on', alarmsLead: 'The alert stops after a short cognitive task or at a safety limit.',
    addAlarm: 'Add alarm', nextAlarm: 'Next alert', noAlarmScheduled: 'No active schedule', testNow: 'Test now',
    testNote: 'Manual testing uses the same fail-safe flow', honestStatus: 'Honest status', permissions: 'Permissions and reliability',
    configurePermissions: 'Configure permissions', schedule: 'Schedule', yourAlarms: 'Your alarms', failSafe: 'Fail-safe',
    safetyTitle: 'The alert will not ring forever', safetyCopy: 'Attempt, continuous-time, and total-time caps work independently of task success.',
    safetyEscape: 'A safe-stop button is always visible', safetySnooze: 'Snooze is capped by your settings', safetyNoScore: 'Mistakes never become a health score',
    afterWake: 'After waking', rechargeTitle: 'Build a morning recharge',
    rechargeLead: 'The PsyGames pure planner checks warnings, prior experience, and allowed parallel combinations.',
    planner: 'Planner', sessionFormat: 'Session format', pureEngine: 'Pure engine', mode: 'Mode', solo: 'Solo', parallel: 'Parallel', route: 'Route',
    duration: 'Duration', context: 'Context', guide: 'Guidance', home: 'At home', desk: 'At a desk', discreet: 'Discreet',
    both: 'Screen + sound', visual: 'Screen only', audio: 'Sound only', masteryTitle: 'Mastered solo',
    masteryCopy: 'I confirm at least three solo completions for each selected set', experimentalTitle: 'Experimental sets',
    experimentalCopy: 'Enable local candidates without product claims', searchCatalog: 'Search catalog', fullCatalog: 'Full catalog',
    choosePractices: 'Choose practices', catalogRuntime: 'Loaded from pause-practices core', engineCheck: 'Engine check', planReady: 'Preparing plan',
    startRecharge: 'Start recharge', completionPrivacy: 'Only completion and time are recorded — no medical assessment.',
    localOnly: 'On this device only', historyTitle: 'Wake history', historyLead: 'A neutral record of when alerts stopped and practices completed.',
    timeline: 'Timeline', recentEvents: 'Recent events', privacyTitle: 'Private by default',
    privacyCopy: 'No account, ads, cloud, or network requests. Browser preview resets when the page closes.',
    footerBoundary: 'Local wellness tool · not a medical device', footerPrivacy: 'No network · no account · no ads',
    alarmSettings: 'Alert settings', newAlarm: 'New alarm', label: 'Label', time: 'Time', task: 'Wake challenge',
    firstWarmup: 'First recharge block', weakDomain: 'Weak domain, else recharge', schulte: '3×3 Schulte table', choiceRt: 'Direction choice',
    weekdays: 'Weekdays', attempts: 'Attempts', maxMinutes: 'Alert cap, min', snoozes: 'Snoozes', snoozeMinutes: 'Repeat after, min',
    enabled: 'Alarm enabled', enabledCopy: 'A disabled alarm stays in the list but is not scheduled', browserPreview: 'Browser preview',
    browserPreviewCopy: 'Closing this page removes the local schedule. This is not a system alarm.', delete: 'Delete', cancel: 'Cancel', save: 'Save',
    wakeCheck: 'Wake check', proveAwake: 'Show that you are awake', alarmActive: 'Alert active. Fail-safe stops it at the first reached limit.',
    snooze: 'Snooze', safeStop: 'Stop safely', alarmDismissed: 'Alert stopped', continueMorning: 'Continue with a morning recharge?',
    continueMorningCopy: 'We will open a safe PsyGames catalog route. Nothing starts before warning checks.', autoOpen: 'Open plan automatically in',
    seconds: 's', openRecharge: 'Open recharge', notNow: 'Not now', morningRecharge: 'Morning recharge',
    parallelPractice: 'Parallel recharge · {count} practices', soloPractice: 'Solo practice', breathingLayer: 'Breathing rhythm',
    eyeLayer: 'Gaze path', nextAdvice: 'Guidance', phaseSeconds: '{count} s',
    generalStop: 'Stop for pain, dizziness, numbness, or marked discomfort.', pause: 'Pause', finishWithoutRecord: 'Exit without recording', resume: 'Resume',
    monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
    active: 'Active', off: 'Off', localDraft: 'Local draft', edit: 'Edit', noAlarms: 'No alarms yet', enabledCount: 'active', everyDay: 'Every day',
    manualTest: 'Manual test', saved: 'Saved', saveFailed: 'Could not save', permissionResult: 'Permission status refreshed',
    browserPlatform: 'Browser preview · schedules live only on this page', nativePlatform: 'System adapter', unsupported: 'No', available: 'Ready',
    restricted: 'Restricted', denied: 'Denied', permissionRequired: 'Permission needed', unknown: 'Unknown', scheduler: 'Background scheduling',
    notifications: 'Notifications', continuousAudio: 'Continuous audio', rebootRestore: 'Restore after reboot', fullScreenIntent: 'Full-screen launch', exactAlarm: 'Exact timing',
    select: 'Enable', selected: 'Disable', alwaysOn: 'Always on', approved: 'Core', extension: 'Extension', experimental: 'Experimental', experienced: 'Experienced only',
    soloOnly: 'Solo only', program: 'Program', selectionsOne: 'Selected: 1', selectionsMany: 'Selected: {count}', catalogItems: '{count} sets',
    planValid: 'Plan ready', planBlocked: 'Action needed', planEmpty: 'Choose at least one practice', blocks: 'blocks', lanes: 'practices',
    warningsTitle: 'Before you start', readWarnings: 'I have read the required warnings', experienceTitle: 'Already learned technique',
    experienceCopy: 'Agnisara, vacuum, and nauli are not taught here. The app only times a familiar technique.',
    confirmExperience: 'I already know how to perform the selected technique', startBlocked: 'Resolve the engine issues', showRequired: 'Show required actions',
    challengeSchulteTitle: 'Tap the numbers in order', challengeSchulteHint: 'Next number: {next}',
    challengeChoiceTitle: 'Choose the arrow direction', challengeChoiceHint: 'Wait for the arrow, then press the matching button', waiting: 'Get ready…',
    wrong: 'Mismatch — attempt recorded', correct: 'Correct', attemptsLeft: 'Errors: {failed}/{max}', snoozesLeft: 'Snoozes: {used}/{max}',
    maxTime: 'Cap: {minutes} min', passed: 'Done — alert stopped', escaped: 'Alert stopped safely', snoozed: 'Retry scheduled',
    audioRestricted: 'Browser audio is unavailable; the visual task continues', practiceComplete: 'Recharge complete',
    practiceNotRecorded: 'Exited without recording', practicePaused: 'Paused', noHistory: 'No events yet. A completed manual test will appear here.',
    awakenings: 'Wake-ups', practices: 'Recharges', safeStops: 'Safe stops', alarmEvent: 'Alarm', practiceEvent: 'Recharge', complete: 'Completed', safeStopped: 'Stopped safely',
    reasonPassed: 'Challenge passed', reasonAttemptCap: 'Attempt cap reached', reasonTimeCap: 'Continuous alert cap reached',
    reasonTotalTimeCap: 'Total alert cap reached', reasonEscape: 'Safe exit', reasonSnooze: 'Snoozed',
    reasonAdapterError: 'System adapter error', reasonClockError: 'Clock error', reasonDispose: 'Session closed',
    reasonCollision: 'Overlapping alert skipped', selfTest: 'On-device check', notRun: 'NOT TESTED',
    notApplicable: 'Not applicable', verified: 'Verified', capabilityFailed: 'Check failed',
    localSession: 'Current local session', settingsOpened: 'System settings were not opened on this platform', affectedSets: 'Affected sets',
    appVersion: 'App version {version}', blockVersion: 'Block version {version}',
  },
};

const state = {
  locale: 'ru',
  theme: 'dark',
  tab: 'alarms',
  alarms: [],
  capabilities: null,
  activeAlarm: null,
  challenge: null,
  choiceTimer: null,
  offerTimer: null,
  outcomes: [],
  practiceHistory: [],
  practice: null,
  practiceTimer: null,
  practiceVisual: { eyeKey: null, eyePosition: null },
  nativeUnsubscribe: null,
  recharge: {
    mode: 'charge',
    durationMs: 120_000,
    context: 'home',
    guideMode: 'both',
    selected: new Map([['breathing', 'box'], ['eye-gym', 'desk']]),
    mastery: false,
    allowExperimental: false,
    warningsAcknowledged: false,
    priorExperienceConfirmed: false,
    search: '',
    plan: null,
  },
};

function enforceBaselineBreathing() {
  if (state.recharge.mode !== 'solo') state.recharge.selected.set('breathing', 'box');
}

const rawBridge = createNativeAlarmBridge();
const bridge = new Proxy(rawBridge, {
  get(target, property) {
    if (property !== 'startAlert') {
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    }
    return async (...args) => {
      try {
        return await target.startAlert(...args);
      } catch (error) {
        if (state.capabilities?.platform === 'web') {
          toast(t('audioRestricted'));
          return undefined;
        }
        throw error;
      }
    };
  },
});

function t(key, replacements = {}) {
  let value = copy[state.locale]?.[key];
  if (value === undefined) {
    try { value = translate(state.locale, key); } catch { value = key; }
  }
  value ??= key;
  return Object.entries(replacements).reduce((result, [name, replacement]) => result.replace(`{${name}}`, String(replacement)), value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatTime(hour, minuteValue) {
  return `${String(hour).padStart(2, '0')}:${String(minuteValue).padStart(2, '0')}`;
}

function formatDuration(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function toast(message) {
  const region = $('#toast-region');
  const item = document.createElement('div');
  item.className = 'toast';
  item.textContent = message;
  region.replaceChildren(item);
  window.setTimeout(() => item.remove(), 3200);
}

function applyLocale() {
  document.documentElement.lang = state.locale;
  document.title = state.locale === 'ru' ? 'PsyGames · Умный будильник' : 'PsyGames · Smart Alarm';
  $$('[data-i18n]').forEach((node) => { node.textContent = t(node.dataset.i18n); });
  $$('[data-i18n-option]').forEach((node) => { node.textContent = t(node.dataset.i18nOption); });
  $$('[data-i18n-placeholder]').forEach((node) => { node.placeholder = t(node.dataset.i18nPlaceholder); });
  $('#language-label').textContent = state.locale === 'ru' ? 'EN' : 'RU';
  $('#theme-toggle').ariaLabel = state.locale === 'ru' ? 'Сменить тему' : 'Switch theme';
  const appVersion = $('#app-version');
  appVersion.textContent = `v${VERSION_MANIFEST.app.displayVersion}`;
  appVersion.ariaLabel = t('appVersion', { version: VERSION_MANIFEST.app.displayVersion });
  document.documentElement.dataset.appVersion = VERSION_MANIFEST.app.displayVersion;
  document.querySelector('meta[name="version"]')?.setAttribute('content', VERSION_MANIFEST.app.displayVersion);
  renderWeekdays();
  renderCapabilities();
  renderAlarms();
  renderCatalog();
  renderPlan();
  renderHistory();
  if (!$('#challenge-layer').hidden) renderChallenge();
  if (!$('#practice-layer').hidden) renderPractice();
}

function switchTab(tab) {
  state.tab = tab;
  $$('.nav-item').forEach((button) => {
    const active = button.dataset.tab === tab;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  $$('.page-panel').forEach((panel) => {
    const active = panel.dataset.panel === tab;
    panel.hidden = !active;
    panel.classList.toggle('is-active', active);
  });
  if (tab === 'recharge') renderPlan();
  if (tab === 'history') void refreshHistory();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderWeekdays(selected) {
  const picker = $('#weekday-picker');
  const previouslySelected = new Set($$('input:checked', picker).map((input) => Number(input.value)));
  const values = selected !== undefined
    ? new Set(selected)
    : picker.childElementCount
      ? previouslySelected
      : new Set([1, 2, 3, 4, 5]);
  picker.innerHTML = weekdayKeys.map((key, day) => `
    <label class="weekday-option">
      <input type="checkbox" name="weekday" value="${day}" ${values.has(day) ? 'checked' : ''} />
      <span>${escapeHtml(t(key))}</span>
    </label>`).join('');
}

function defaultDraft() {
  return {
    label: state.locale === 'ru' ? 'Доброе утро' : 'Good morning',
    hour: 7,
    minute: 30,
    weekdays: [1, 2, 3, 4, 5],
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    taskMode: 'first-warmup',
    maxFailedAttempts: 3,
    maxRingMinutes: 5,
    maxSnoozes: 2,
    snoozeMinutes: 5,
    enabled: true,
  };
}

function draftFromEnvelope(envelope) {
  const policy = envelope.spec.taskPolicy;
  return {
    id: envelope.spec.id,
    label: envelope.label,
    hour: envelope.spec.schedule.time.hour,
    minute: envelope.spec.schedule.time.minute,
    weekdays: [...envelope.spec.schedule.weekdays],
    timeZone: envelope.spec.schedule.timeZone,
    taskMode: policy.mode === 'fixed' ? policy.gameId : policy.mode,
    maxFailedAttempts: envelope.spec.failSafe.maxFailedAttempts,
    maxRingMinutes: Math.round(envelope.spec.failSafe.maxContinuousRingMs / minute),
    maxSnoozes: envelope.spec.snooze.maxSnoozes,
    snoozeMinutes: Math.round(envelope.spec.snooze.delayMs / minute),
    enabled: envelope.spec.enabled,
  };
}

function envelopeWithEnabled(draft) {
  const generated = createAlarmEnvelope({ ...draft, enabled: true });
  if (draft.enabled) return generated;
  return { ...generated, spec: { ...generated.spec, enabled: false } };
}

/**
 * 🔴 ЗДЕСЬ БЫЛ ПУТЬ, ОТКАЗ КОТОРОГО ОСТАВЛЯЛ БУДИЛЬНИК МОЛЧА МЁРТВЫМ.
 *
 * Функция не ловила НИЧЕГО: `bridge.list()` может отклониться, а `parseEnvelope`
 * бросает на любом определении без `spec`/`task`/`occurrence`/`label`. Дальше в
 * `boot()` стоял `await Promise.all([...])` — и одно исключение отсюда роняло весь
 * запуск. Соседние две функции исключения ловят внутри, эта — нет.
 *
 * Цена отказа была не «список не показался». Падал ВЕСЬ `boot()`, а значит не
 * выполнялись строки НИЖЕ него: подписка на срабатывания и восстановление активного
 * будильника. Итог: сработавший будильник звонит, а задачи и кнопки отключения нет —
 * до нативного предела по времени. Экран при этом остаётся с заглушкой «Проверяем
 * платформу…», то есть человек видит ровно то же, что при обычной загрузке.
 *
 * ⚠️ ОДНО КРИВОЕ ОПРЕДЕЛЕНИЕ БОЛЬШЕ НЕ СЪЕДАЕТ ОСТАЛЬНЫЕ. Прежний `map` бросал на
 * первом же непрошедшем разбор, теряя и все последующие. Теперь разбор идёт
 * поштучно: что читается — показываем, что нет — считаем и говорим вслух.
 */
async function loadAlarms() {
  let definitions = [];
  try {
    definitions = await bridge.list();
  } catch (error) {
    toast(`Не удалось прочитать список будильников: ${error instanceof Error ? error.message : String(error)}`);
    definitions = [];
  }
  let broken = 0;
  state.alarms = definitions.map((definition) => {
    try {
      return { id: definition.alarmId, envelope: parseEnvelope(definition), definition, saved: true };
    } catch {
      broken += 1;
      return null;
    }
  }).filter(Boolean);
  if (broken > 0) toast(`Не удалось разобрать будильников: ${broken}`);
  if (state.alarms.length === 0) {
    const envelope = envelopeWithEnabled(defaultDraft());
    state.alarms.push({ id: envelope.spec.id, envelope, definition: definitionFromEnvelope(envelope), saved: false });
  }
  renderAlarms();
}

function weekdaysLabel(days) {
  if (days.length === 7) return t('everyDay');
  return days.map((day) => t(weekdayKeys[day])).join(' · ');
}

function taskLabel(envelope) {
  const key = taskKeys[envelope.task.gameId] ?? 'schulte';
  const degraded = envelope.task.fidelity === 'fallback' ? ` · ${state.locale === 'ru' ? 'безопасный fallback' : 'safe fallback'}` : '';
  return `${t(key)}${degraded}`;
}

function renderAlarms() {
  const list = $('#alarm-list');
  if (!list) return;
  const enabled = state.alarms.filter((item) => item.envelope.spec.enabled);
  $('#alarm-count').textContent = `${enabled.length} ${t('enabledCount')}`;
  list.innerHTML = state.alarms.length ? state.alarms.map((item) => {
    const { envelope } = item;
    const isEnabled = envelope.spec.enabled;
    return `<article class="alarm-card ${isEnabled ? '' : 'is-disabled'}" data-alarm-id="${escapeHtml(item.id)}">
      <div class="alarm-card-top">
        <div>
          <div class="alarm-time-row">
            <strong class="alarm-time">${formatTime(envelope.spec.schedule.time.hour, envelope.spec.schedule.time.minute)}</strong>
            <span class="soft-badge ${isEnabled ? 'is-good' : ''}">${escapeHtml(item.saved ? (isEnabled ? t('active') : t('off')) : t('localDraft'))}</span>
          </div>
          <div class="alarm-label">${escapeHtml(envelope.label)}</div>
        </div>
        <label class="toggle-control">
          <span class="visually-hidden">${escapeHtml(t('enabled'))}</span>
          <input type="checkbox" data-action="toggle-alarm" ${isEnabled ? 'checked' : ''} />
          <span class="toggle-track" aria-hidden="true"></span>
        </label>
      </div>
      <div class="alarm-card-bottom">
        <div>
          <div class="alarm-days">${escapeHtml(weekdaysLabel(envelope.spec.schedule.weekdays))}</div>
          <div class="alarm-task">${escapeHtml(taskLabel(envelope))}</div>
        </div>
        <div class="alarm-card-actions">
          <button class="mini-button" type="button" data-action="test-alarm">▶ ${escapeHtml(t('testNow'))}</button>
          <button class="mini-button" type="button" data-action="edit-alarm">${escapeHtml(t('edit'))}</button>
        </div>
      </div>
    </article>`;
  }).join('') : `<div class="empty-card">${escapeHtml(t('noAlarms'))}</div>`;

  const next = [...enabled].sort((a, b) => a.envelope.occurrence.scheduledForMs - b.envelope.occurrence.scheduledForMs)[0];
  $('#test-next-alarm').disabled = !next;
  if (!next) {
    $('#next-alarm-time').textContent = '—:—';
    $('#next-alarm-meta').textContent = t('noAlarmScheduled');
    $('#next-alarm-status').textContent = '—';
  } else {
    const schedule = next.envelope.spec.schedule;
    $('#next-alarm-time').textContent = formatTime(schedule.time.hour, schedule.time.minute);
    $('#next-alarm-meta').textContent = `${next.envelope.label} · ${weekdaysLabel(schedule.weekdays)}`;
    $('#next-alarm-status').textContent = next.saved ? t('active') : t('localDraft');
    $('#test-next-alarm').dataset.alarmId = next.id;
  }
}

function capabilityLabel(value) {
  const key = value === 'permission-required' ? 'permissionRequired'
    : value === 'not-run' ? 'notRun'
      : value === 'not-applicable' ? 'notApplicable'
        : value === 'passed' ? 'verified'
          : value === 'failed' ? 'capabilityFailed'
            : value;
  return t(key in copy[state.locale] ? key : 'unknown');
}

function renderCapabilities() {
  if (!state.capabilities) return;
  const capabilities = state.capabilities;
  const platform = $('#platform-summary');
  platform.innerHTML = `<span class="status-dot" aria-hidden="true"></span><span>${escapeHtml(capabilities.platform === 'web' ? t('browserPlatform') : `${t('nativePlatform')} · ${capabilities.platform}`)}</span>`;
  const fields = [
    ['scheduler', 'scheduler'], ['exactAlarm', 'exactAlarm'], ['notifications', 'notifications'],
    ['continuousAudio', 'continuousAudio'], ['rebootRestore', 'rebootRestore'], ['fullScreenIntent', 'fullScreenIntent'],
    ['selfTest', 'selfTest'],
  ];
  const readinessFields = fields.filter(([field]) => field !== 'selfTest');
  const available = readinessFields.filter(([field]) => capabilities[field] === 'available').length;
  $('#capability-score').textContent = capabilities.platform === 'web'
    ? 'PREVIEW'
    : capabilities.selfTest === 'passed'
      ? `${available}/${readinessFields.length}`
      : capabilityLabel(capabilities.selfTest);
  const rows = fields.map(([field, label]) => {
    const value = capabilities[field];
    const good = value === 'available' || value === 'passed';
    return `<div class="capability-row"><span>${escapeHtml(t(label))}</span><strong class="capability-state ${good ? 'is-good' : ''}">${escapeHtml(capabilityLabel(value))}</strong></div>`;
  }).join('');
  const notes = (capabilities.notes ?? []).length
    ? `<ul class="capability-notes">${capabilities.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>`
    : '';
  $('#capability-list').innerHTML = rows + notes;
}

async function probeCapabilities() {
  try {
    state.capabilities = await bridge.probe();
  } catch (error) {
    state.capabilities = { platform: 'unknown', scheduler: 'unknown', exactAlarm: 'unknown', notifications: 'unknown', fullScreenIntent: 'unknown', continuousAudio: 'unknown', rebootRestore: 'unknown', selfTest: 'failed', userSessionRequired: true, notes: [String(error)] };
  }
  renderCapabilities();
}

function openEditor(model = null) {
  const form = $('#alarm-form');
  const draft = model ? draftFromEnvelope(model.envelope) : defaultDraft();
  form.dataset.alarmId = model?.id ?? '';
  form.elements.namedItem('label').value = draft.label;
  form.elements.namedItem('time').value = formatTime(draft.hour, draft.minute);
  form.elements.namedItem('taskMode').value = draft.taskMode;
  form.elements.namedItem('maxFailedAttempts').value = String(draft.maxFailedAttempts);
  form.elements.namedItem('maxRingMinutes').value = String(draft.maxRingMinutes);
  form.elements.namedItem('maxSnoozes').value = String(draft.maxSnoozes);
  form.elements.namedItem('snoozeMinutes').value = String(draft.snoozeMinutes);
  form.elements.namedItem('enabled').checked = draft.enabled;
  renderWeekdays(draft.weekdays);
  $('#delete-alarm').hidden = !model;
  $('#editor-title').textContent = model ? draft.label : t('newAlarm');
  $('#alarm-editor').showModal();
}

function readEditorDraft() {
  const form = $('#alarm-form');
  const [hour, minuteValue] = form.elements.namedItem('time').value.split(':').map(Number);
  const weekdays = $$('input[name="weekday"]:checked', form).map((input) => Number(input.value));
  if (weekdays.length === 0) throw new Error(state.locale === 'ru' ? 'Выберите хотя бы один день' : 'Choose at least one weekday');
  return {
    id: form.dataset.alarmId || undefined,
    label: form.elements.namedItem('label').value,
    hour,
    minute: minuteValue,
    weekdays,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    taskMode: form.elements.namedItem('taskMode').value,
    maxFailedAttempts: Number(form.elements.namedItem('maxFailedAttempts').value),
    maxRingMinutes: Number(form.elements.namedItem('maxRingMinutes').value),
    maxSnoozes: Number(form.elements.namedItem('maxSnoozes').value),
    snoozeMinutes: Number(form.elements.namedItem('snoozeMinutes').value),
    enabled: form.elements.namedItem('enabled').checked,
  };
}

async function saveEditor(event) {
  event.preventDefault();
  try {
    const draft = readEditorDraft();
    const envelope = envelopeWithEnabled(draft);
    const definition = definitionFromEnvelope(envelope);
    // Disabled definitions are still persisted by the adapter; only the OS
    // schedule is removed. cancel() is reserved for an actual delete.
    await bridge.upsert(definition);
    const existing = state.alarms.findIndex((item) => item.id === envelope.spec.id);
    const model = { id: envelope.spec.id, envelope, definition, saved: true };
    if (existing >= 0) state.alarms.splice(existing, 1, model);
    else state.alarms.push(model);
    $('#alarm-editor').close();
    renderAlarms();
    toast(t('saved'));
  } catch (error) {
    toast(`${t('saveFailed')}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function toggleAlarm(model, enabled) {
  const draft = { ...draftFromEnvelope(model.envelope), enabled };
  const envelope = envelopeWithEnabled(draft);
  const definition = definitionFromEnvelope(envelope);
  try {
    await bridge.upsert(definition);
    Object.assign(model, { envelope, definition, saved: true });
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  }
  renderAlarms();
}

async function deleteEditorAlarm() {
  const id = $('#alarm-form').dataset.alarmId;
  if (!id) return;
  try { await bridge.cancel(id); } catch (error) { toast(String(error)); return; }
  state.alarms = state.alarms.filter((item) => item.id !== id);
  $('#alarm-editor').close();
  renderAlarms();
}

function clearChoiceTimer() {
  if (state.choiceTimer !== null) window.clearTimeout(state.choiceTimer);
  state.choiceTimer = null;
}

function challengeLimits(runtime) {
  if (!runtime) return '';
  const policy = runtime.spec;
  return [
    t('attemptsLeft', { failed: runtime.failedAttempts, max: policy.failSafe.maxFailedAttempts }),
    t('snoozesLeft', { used: runtime.snoozeCount, max: policy.snooze.maxSnoozes }),
    t('maxTime', { minutes: Math.round(policy.failSafe.maxContinuousRingMs / minute) }),
  ].map((value) => `<span class="limit-chip">${escapeHtml(value)}</span>`).join('');
}

function openChallenge(task, runtime) {
  clearChoiceTimer();
  if (task.gameId === 'choice_rt') {
    state.challenge = { kind: 'choice', trials: createChoiceTrials(task), index: 0, reactions: [], errors: 0, waiting: true, visibleAt: null, runtime };
    scheduleChoiceTrial();
  } else {
    state.challenge = { ...createSchulteChallenge(task, Date.now()), runtime, feedback: '' };
  }
  $('#challenge-layer').hidden = false;
  renderChallenge();
}

function scheduleChoiceTrial() {
  clearChoiceTimer();
  const challenge = state.challenge;
  if (!challenge || challenge.kind !== 'choice') return;
  challenge.waiting = true;
  challenge.visibleAt = null;
  renderChallenge();
  const trial = challenge.trials[challenge.index];
  if (!trial) return;
  state.choiceTimer = window.setTimeout(() => {
    if (state.challenge !== challenge) return;
    challenge.waiting = false;
    challenge.visibleAt = performance.now();
    renderChallenge();
  }, trial.delayMs);
}

function renderChallenge() {
  const challenge = state.challenge;
  if (!challenge) return;
  const runtime = state.activeAlarm?.snapshot() ?? challenge.runtime;
  $('#challenge-limits').innerHTML = challengeLimits(runtime);
  const stage = $('#challenge-stage');
  if (challenge.kind === 'schulte') {
    stage.innerHTML = `<div class="challenge-intro"><h3>${escapeHtml(t('challengeSchulteTitle'))}</h3><p>${escapeHtml(t('challengeSchulteHint', { next: Math.min(challenge.next, challenge.cells.length) }))}</p></div>
      <div class="schulte-grid" style="--side:${Math.sqrt(challenge.cells.length)}">${challenge.cells.map((value) => `<button class="schulte-cell ${value < challenge.next ? 'is-complete' : ''}" type="button" data-schulte-value="${value}" ${value < challenge.next ? 'disabled' : ''}>${value}</button>`).join('')}</div>
      <div class="challenge-feedback">${escapeHtml(challenge.feedback || '')}</div>`;
  } else {
    const trial = challenge.trials[challenge.index];
    const arrow = challenge.waiting ? '·' : trial?.direction === 'left' ? '←' : '→';
    stage.innerHTML = `<div class="challenge-intro"><h3>${escapeHtml(t('challengeChoiceTitle'))}</h3><p>${escapeHtml(t('challengeChoiceHint'))}</p></div>
      <div class="choice-stage ${challenge.waiting ? 'is-waiting' : ''}"><div class="choice-arrow" aria-live="assertive">${arrow}</div><p>${escapeHtml(challenge.waiting ? t('waiting') : `${challenge.index + 1}/${challenge.trials.length}`)}</p></div>
      <div class="choice-buttons"><button class="choice-button" type="button" data-choice="left" ${challenge.waiting ? 'disabled' : ''}>←</button><button class="choice-button" type="button" data-choice="right" ${challenge.waiting ? 'disabled' : ''}>→</button></div>
      <div class="challenge-feedback">${escapeHtml(challenge.feedback || '')}</div>`;
  }
  $('#challenge-snooze').disabled = Boolean(runtime && runtime.snoozeCount >= runtime.spec.snooze.maxSnoozes);
}

async function pressSchulte(value) {
  const challenge = state.challenge;
  if (!challenge || challenge.kind !== 'schulte') return;
  const previousNext = challenge.next;
  const updated = pressSchulteCell(challenge, value, Date.now());
  Object.assign(challenge, updated);
  if (updated.next === previousNext) {
    challenge.feedback = t('wrong');
    await state.activeAlarm?.failed();
  } else {
    challenge.feedback = t('correct');
  }
  if (updated.completedAtMs !== null) {
    challenge.feedback = t('passed');
    renderChallenge();
    await state.activeAlarm?.passed();
    return;
  }
  renderChallenge();
}

async function pressChoice(direction) {
  const challenge = state.challenge;
  if (!challenge || challenge.kind !== 'choice' || challenge.waiting) return;
  const trial = challenge.trials[challenge.index];
  if (!trial) return;
  challenge.waiting = true;
  renderChallenge();
  if (direction !== trial.direction) {
    challenge.errors += 1;
    challenge.feedback = t('wrong');
    await state.activeAlarm?.failed();
    if (state.challenge === challenge) scheduleChoiceTrial();
    return;
  }
  challenge.reactions.push(Math.max(0, Math.round(performance.now() - challenge.visibleAt)));
  challenge.feedback = t('correct');
  challenge.index += 1;
  if (challenge.index >= challenge.trials.length) {
    challenge.feedback = `${t('passed')} · median ${Math.round(median(challenge.reactions.length ? challenge.reactions : [0]))} ms`;
    renderChallenge();
    await state.activeAlarm?.passed();
    return;
  }
  scheduleChoiceTrial();
}

function closeChallenge() {
  clearChoiceTimer();
  $('#challenge-layer').hidden = true;
  state.challenge = null;
  state.activeAlarm?.dispose();
  state.activeAlarm = null;
}

function createAlarmSessionController() {
  return new AlarmSession(bridge, {
    onChallenge: (task, runtime) => openChallenge(task, runtime),
    onState: (runtime) => {
      if (state.challenge) state.challenge.runtime = runtime;
      if (!$('#challenge-layer').hidden) renderChallenge();
    },
    onStopped: (reason) => {
      closeChallenge();
      if (reason === 'passed') toast(t('passed'));
      else if (reason === 'escape') toast(t('escaped'));
      void refreshHistory();
      queueMicrotask(() => { void resumeNativeAlarm(); });
    },
    onSnoozed: () => { toast(t('snoozed')); },
    onContinueWarmup: () => showRechargeOffer(),
  });
}

async function testAlarm(model) {
  if (!model || state.activeAlarm) return;
  const now = Date.now();
  const occurrence = {
    alarmId: model.id,
    occurrenceId: `${model.id}:manual:${now}`,
    localDateKey: new Date(now).toISOString().slice(0, 10),
    scheduledForMs: now,
    snoozeIndex: 0,
  };
  const testEnvelope = { ...model.envelope, spec: { ...model.envelope.spec, enabled: true }, occurrence };
  const definition = definitionFromEnvelope(testEnvelope, occurrence);
  const trigger = { alarmId: model.id, occurrenceId: occurrence.occurrenceId, scheduledForMs: now, firedAtMs: now, source: 'manual-test' };
  state.activeAlarm = createAlarmSessionController();
  try {
    await state.activeAlarm.start(definition, trigger);
  } catch (error) {
    await bridge.stopAlert(occurrence.occurrenceId, 'adapter-error').catch(() => {});
    closeChallenge();
    toast(error instanceof Error ? error.message : String(error));
  }
}

let nativeDrainPromise = null;

async function resumeNativeAlarm() {
  if (state.activeAlarm) return;
  if (nativeDrainPromise) return nativeDrainPromise;
  nativeDrainPromise = (async () => {
    while (!state.activeAlarm) {
      const trigger = await bridge.takePendingTrigger();
      if (!trigger) break;
    // Native scheduling may already have advanced list() to the next weekly
    // occurrence. alarmId is the stable join key; AlarmSession reconstructs
    // the fired occurrence from this pending trigger.
    const model = state.alarms.find((item) => item.id === trigger.alarmId);
    if (!model) {
      toast(state.locale === 'ru' ? 'Получен сигнал без сохранённого определения' : 'A trigger arrived without a saved definition');
        await bridge.stopAlert(trigger.occurrenceId, 'adapter-error');
        continue;
    }
    const session = createAlarmSessionController();
    state.activeAlarm = session;
      try {
        await session.start(model.definition, trigger);
      } catch (error) {
        await bridge.stopAlert(trigger.occurrenceId, 'adapter-error').catch(() => {});
        closeChallenge();
        toast(error instanceof Error ? error.message : String(error));
      }
    }

    if (!state.activeAlarm) {
      for (const model of state.alarms.filter((item) => item.saved)) {
        const session = createAlarmSessionController();
        state.activeAlarm = session;
        await session.recover(model.definition);
        if (session.snapshot()?.phase === 'challenge') return;
        session.dispose();
        state.activeAlarm = null;
      }
    }
  })().finally(() => { nativeDrainPromise = null; });
  return nativeDrainPromise;
}

function showRechargeOffer() {
  clearOfferTimer();
  const layer = $('#recharge-offer');
  layer.hidden = false;
  let remaining = 8;
  $('#offer-countdown').textContent = String(remaining);
  state.offerTimer = window.setInterval(() => {
    remaining -= 1;
    $('#offer-countdown').textContent = String(Math.max(0, remaining));
    if (remaining <= 0) openRechargeFromOffer();
  }, 1000);
}

function clearOfferTimer() {
  if (state.offerTimer !== null) window.clearInterval(state.offerTimer);
  state.offerTimer = null;
}

function openRechargeFromOffer() {
  clearOfferTimer();
  $('#recharge-offer').hidden = true;
  if (state.recharge.selected.size === 0) state.recharge.selected.set('breathing', 'box');
  enforceBaselineBreathing();
  switchTab('recharge');
  renderCatalog();
  renderPlan();
}

function selectedPracticeItems() {
  return [...state.recharge.selected].map(([setId, programId]) => ({ setId, programId }));
}

function setIcon(setId) {
  const icons = {
    breathing: '○',
    'eye-gym': '◉',
    'face-speech': 'Aa',
    relaxation: '≈',
    'pelvic-floor': '◇',
    mobility: '↻',
    postures: '△',
    abdomen: 'V',
    isometrics: '◆',
    feldenkrais: '∿',
  };
  return icons[setId] ?? '＋';
}

function renderCatalog() {
  const container = $('#practice-catalog');
  if (!container) return;
  const query = state.recharge.search.trim().toLocaleLowerCase(state.locale);
  const ordered = [...PRACTICE_CATALOG].sort((left, right) => {
    const leftIndex = featuredSets.indexOf(left.id);
    const rightIndex = featuredSets.indexOf(right.id);
    if (leftIndex >= 0 || rightIndex >= 0) return (leftIndex < 0 ? 100 : leftIndex) - (rightIndex < 0 ? 100 : rightIndex);
    return catalogText(left.title, state.locale).localeCompare(catalogText(right.title, state.locale), state.locale);
  });
  const visible = ordered.filter((set) => !query || `${catalogText(set.title, state.locale)} ${catalogText(set.summary, state.locale)} ${set.programs.map((program) => catalogText(program.title, state.locale)).join(' ')}`.toLocaleLowerCase(state.locale).includes(query));
  container.innerHTML = visible.map((set) => {
    const selectedProgram = state.recharge.selected.get(set.id);
    const selected = Boolean(selectedProgram);
    const currentProgramId = selectedProgram ?? set.defaultProgramId;
    const currentProgram = set.programs.find((program) => program.id === currentProgramId) ?? set.programs[0];
    const currentStatus = getPracticeStatus(set.id, currentProgram.id);
    const blockVersion = getPracticeBlockVersion(set.id);
    const experimentalLocked = currentStatus === 'experimental' && !state.recharge.allowExperimental;
    const experienced = Boolean(currentProgram?.requiresPriorExperience);
    const baselineLocked = set.id === 'breathing' && state.recharge.mode !== 'solo';
    return `<article class="practice-card ${selected ? 'is-selected' : ''} ${currentStatus === 'experimental' ? 'is-experimental' : ''} ${experienced ? 'is-experienced' : ''}" data-set-id="${set.id}">
      <div class="practice-card-meta">
        <span class="practice-icon" aria-hidden="true">${escapeHtml(setIcon(set.id))}</span>
        <div class="practice-badges">
          <span class="practice-version" aria-label="${escapeHtml(t('blockVersion', { version: blockVersion }))}">v${escapeHtml(blockVersion)}</span>
          <span class="practice-badge is-${currentStatus === 'approved' ? 'approved' : 'allowed'}">${escapeHtml(t(statusKeys[currentStatus]))}</span>
          ${experienced ? `<span class="practice-badge">${escapeHtml(t('experienced'))}</span>` : ''}
          ${currentProgram?.soloOnly ? `<span class="practice-badge">${escapeHtml(t('soloOnly'))}</span>` : ''}
        </div>
      </div>
      <h3>${escapeHtml(catalogText(set.title, state.locale))}</h3>
      <p>${escapeHtml(catalogText(set.summary, state.locale))}</p>
      <div class="practice-card-footer">
        <label class="program-select"><span>${escapeHtml(t('program'))}</span><select data-program-select ${baselineLocked ? `disabled aria-label="${escapeHtml(t('alwaysOn'))}"` : ''}>${set.programs.map((program) => {
          const programStatus = getPracticeStatus(set.id, program.id);
          const suffix = programStatus === 'experimental' ? ` · ${t('experimental')}` : '';
          return `<option value="${escapeHtml(program.id)}" ${program.id === currentProgramId ? 'selected' : ''} ${programStatus === 'experimental' && !state.recharge.allowExperimental ? 'disabled' : ''}>${escapeHtml(`${catalogText(program.title, state.locale)}${suffix}`)}</option>`;
        }).join('')}</select></label>
        <button class="button ${selected ? 'button--secondary' : 'button--primary'} select-practice" type="button" data-action="select-practice" ${(experimentalLocked || baselineLocked) ? 'disabled' : ''}>${escapeHtml(baselineLocked ? t('alwaysOn') : selected ? t('selected') : t('select'))}</button>
      </div>
      ${experienced ? `<p class="experienced-note">${escapeHtml(t('experienceCopy'))}</p>` : ''}
    </article>`;
  }).join('');
  $('#catalog-count').textContent = t('catalogItems', { count: PRACTICE_CATALOG.length });
  $('#selection-summary').textContent = state.recharge.selected.size === 1 ? t('selectionsOne') : t('selectionsMany', { count: state.recharge.selected.size });
}

function planRequest({ acknowledge = false } = {}) {
  const selections = selectedPracticeItems();
  const warnings = getRequiredWarnings(selections);
  const experience = getRequiredPriorExperience(selections);
  const completions = Object.fromEntries(selections.map(({ setId }) => [setId, state.recharge.mastery ? 3 : 0]));
  return {
    mode: state.recharge.mode,
    selections,
    durationMs: state.recharge.durationMs,
    locale: state.locale,
    guideMode: state.recharge.guideMode,
    context: state.recharge.context,
    soloCompletions: completions,
    masteryThreshold: 3,
    acknowledgedWarnings: acknowledge && state.recharge.warningsAcknowledged ? warnings : [],
    confirmedPriorExperience: acknowledge && state.recharge.priorExperienceConfirmed ? experience : [],
    allowExperimental: state.recharge.allowExperimental,
    visualLeaderMode: 'full-screen-clock',
  };
}

function describePlanIssue(issue) {
  const message = catalogText(issue.message, state.locale);
  const names = [...new Set((issue.setIds ?? []).map((setId) => catalogText(getPracticeSet(setId).title, state.locale)))];
  return names.length > 0 ? `${message} ${t('affectedSets')}: ${names.join(', ')}.` : message;
}

function renderPlan() {
  const preview = $('#plan-preview');
  const gates = $('#safety-gates');
  if (!preview || !gates) return;
  const selections = selectedPracticeItems();
  const warnings = getRequiredWarnings(selections);
  const experience = getRequiredPriorExperience(selections);
  const request = planRequest({ acknowledge: true });
  const issues = validatePlanRequest(request);
  const needsMasteryConfirmation = issues.some((issue) => issue.code === 'MASTERY_REQUIRED');
  let plan = null;
  if (issues.length === 0) {
    try { plan = createPracticePlan(request); } catch (error) { issues.push(...(error?.issues ?? [])); }
  }
  state.recharge.plan = plan;
  const status = $('#plan-status');
  const start = $('#start-practice');
  const startLabel = start.querySelector('span:last-child');
  if (selections.length === 0) {
    status.textContent = t('planEmpty');
    status.className = 'plan-status is-error';
    preview.innerHTML = `<div class="empty-card">${escapeHtml(t('planEmpty'))}</div>`;
  } else if (plan) {
    status.textContent = t('planValid');
    status.className = 'plan-status is-ready';
    preview.innerHTML = `<div class="plan-blocks">${plan.blocks.map((block) => `<div class="plan-block"><span class="plan-block-time">${formatDuration(block.startMs)}–${formatDuration(block.endMs)}</span><strong class="plan-block-sets">${block.setIds.map((id) => escapeHtml(catalogText(getPracticeSet(id).title, state.locale))).join(' + ')}</strong></div>`).join('')}</div>`;
  } else {
    status.textContent = t('planBlocked');
    status.className = 'plan-status is-error';
    preview.innerHTML = `<ul class="issue-list">${issues.map((issue) => `<li><span>${escapeHtml(describePlanIssue(issue))}</span></li>`).join('')}</ul>`;
  }
  gates.innerHTML = [
    needsMasteryConfirmation ? `<article class="gate-card"><h3>${escapeHtml(t('masteryTitle'))}</h3><p>${escapeHtml(t('masteryCopy'))}</p><label class="gate-check"><input type="checkbox" data-gate="mastery" ${state.recharge.mastery ? 'checked' : ''}/><span>${escapeHtml(t('masteryTitle'))}</span></label></article>` : '',
    warnings.length ? `<article class="gate-card"><h3>${escapeHtml(t('warningsTitle'))}</h3><ul class="warning-list">${warnings.map((id) => `<li>${escapeHtml(catalogText(WARNING_TEXT[id], state.locale))}</li>`).join('')}</ul><label class="gate-check"><input type="checkbox" data-gate="warnings" ${state.recharge.warningsAcknowledged ? 'checked' : ''}/><span>${escapeHtml(t('readWarnings'))}</span></label></article>` : '',
    experience.length ? `<article class="gate-card is-experienced"><h3>${escapeHtml(t('experienceTitle'))}</h3><p>${escapeHtml(t('experienceCopy'))}</p><label class="gate-check"><input type="checkbox" data-gate="experience" ${state.recharge.priorExperienceConfirmed ? 'checked' : ''}/><span>${escapeHtml(t('confirmExperience'))}</span></label></article>` : '',
  ].join('');
  start.disabled = selections.length === 0;
  start.dataset.blocked = plan ? 'false' : 'true';
  start.setAttribute('aria-disabled', String(selections.length === 0));
  if (startLabel) startLabel.textContent = plan || selections.length === 0 ? t('startRecharge') : t('showRequired');
  start.title = plan ? '' : t('startBlocked');
}

function togglePractice(setId) {
  const set = getPracticeSet(setId);
  if (setId === 'breathing' && state.recharge.mode !== 'solo') {
    enforceBaselineBreathing();
    renderCatalog();
    renderPlan();
    return;
  }
  if (getPracticeStatus(setId, set.defaultProgramId) === 'experimental' && !state.recharge.allowExperimental) return;
  if (state.recharge.selected.has(setId)) {
    state.recharge.selected.delete(setId);
  } else if (state.recharge.mode === 'solo') {
    state.recharge.selected = new Map([[setId, set.defaultProgramId]]);
  } else {
    state.recharge.selected.set(setId, set.defaultProgramId);
  }
  state.recharge.warningsAcknowledged = false;
  state.recharge.priorExperienceConfirmed = false;
  renderCatalog();
  renderPlan();
}

function setPlanMode(mode) {
  state.recharge.mode = mode;
  if (mode === 'solo' && state.recharge.selected.size > 1) {
    const first = state.recharge.selected.entries().next().value;
    state.recharge.selected = first ? new Map([first]) : new Map();
  }
  enforceBaselineBreathing();
  $$('[data-plan-mode]').forEach((button) => button.classList.toggle('is-active', button.dataset.planMode === mode));
  renderCatalog();
  renderPlan();
}

function startPractice() {
  const plan = state.recharge.plan;
  if (!plan) {
    $('#plan-review')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => $('#safety-gates input:not(:checked)')?.focus({ preventScroll: true }), 280);
    toast(t('startBlocked'));
    return;
  }
  const now = Math.max(0, Math.round(performance.now()));
  state.practice = startPracticeSession(createPracticeSession(plan), now);
  state.practiceVisual = { eyeKey: null, eyePosition: null };
  document.body.classList.add('is-practice-running');
  $('#practice-cues').removeAttribute('data-render-key');
  $('#practice-layer').hidden = false;
  startImmersiveWatch();
  renderPractice();
  if (state.practiceTimer !== null) window.clearInterval(state.practiceTimer);
  state.practiceTimer = window.setInterval(tickPractice, 250);
}

/**
 * ПОГРУЖЕНИЕ: ХРОМ УХОДИТ САМ, ВОЗВРАЩАЕТСЯ НА ЛЮБОЕ ДВИЖЕНИЕ.
 *
 * Запрос Дениса 26.08.2026 по живой сборке: практика должна занимать весь экран,
 * а интерфейс не мешать. Прятать навсегда нельзя — практика идёт минутами, и
 * «Пауза» с «Выйти без записи» обязаны быть достижимы в любой момент. Поэтому
 * порядок видеоплеера: тишина три с половиной секунды — хром гаснет; любое
 * движение, касание или клавиша — возвращается немедленно.
 *
 * ⚠️ ТАЙМЕР СНИМАЕТСЯ ПРИ ЗАКРЫТИИ. Иначе он продолжал бы тикать после выхода из
 * практики и однажды навесил бы класс погружения на обычный экран.
 */
const IMMERSIVE_IDLE_MS = 3500;
let immersiveTimer = null;

function wakeImmersiveChrome() {
  document.body.classList.remove('is-practice-immersive');
  if (immersiveTimer !== null) window.clearTimeout(immersiveTimer);
  immersiveTimer = window.setTimeout(() => {
    // Прятать только пока практика идёт: на паузе человек читает и решает.
    if (!$('#practice-layer').hidden && state.practice?.phase === 'running') {
      document.body.classList.add('is-practice-immersive');
    }
  }, IMMERSIVE_IDLE_MS);
}

const IMMERSIVE_WAKE_EVENTS = ['pointermove', 'pointerdown', 'keydown', 'touchstart', 'wheel'];

function startImmersiveWatch() {
  for (const ev of IMMERSIVE_WAKE_EVENTS) window.addEventListener(ev, wakeImmersiveChrome, { passive: true });
  wakeImmersiveChrome();
}

function stopImmersiveWatch() {
  for (const ev of IMMERSIVE_WAKE_EVENTS) window.removeEventListener(ev, wakeImmersiveChrome);
  if (immersiveTimer !== null) window.clearTimeout(immersiveTimer);
  immersiveTimer = null;
  document.body.classList.remove('is-practice-immersive');
}

const TAU = Math.PI * 2;

function currentProgramStep(cue) {
  return getPracticeProgram(cue.setId, cue.programId).steps.find((step) => step.id === cue.stepId) ?? null;
}

function breathingCycleProgress(cue) {
  const program = getPracticeProgram(cue.setId, cue.programId);
  const phaseIndex = Math.max(0, program.steps.findIndex((step) => step.id === cue.stepId));
  const totalDuration = program.steps.reduce((sum, step) => sum + step.durationMs, 0);
  const completedDuration = program.steps.slice(0, phaseIndex).reduce((sum, step) => sum + step.durationMs, 0);
  const phaseDuration = program.steps[phaseIndex]?.durationMs ?? 0;
  return totalDuration > 0 ? (completedDuration + phaseDuration * cue.progress) / totalDuration : cue.progress;
}

function polygonBreathGeometry(shape, cue) {
  const points = shape === 'square'
    ? [[230, 580], [230, 40], [770, 40], [770, 580], [230, 580]]
    : [[220, 450], [500, 105], [780, 450], [220, 450]];
  const sideCount = points.length - 1;
  const program = getPracticeProgram(cue.setId, cue.programId);
  const phaseIndex = Math.max(0, program.steps.findIndex((step) => step.id === cue.stepId)) % sideCount;
  const start = points[phaseIndex];
  const end = points[phaseIndex + 1];
  return {
    points: points.map((point) => point.join(',')).join(' '),
    progressPoints: [...points.slice(0, phaseIndex + 1), [
      start[0] + (end[0] - start[0]) * cue.progress,
      start[1] + (end[1] - start[1]) * cue.progress,
    ]].map((point) => point.join(',')).join(' '),
    dotX: start[0] + (end[0] - start[0]) * cue.progress,
    dotY: start[1] + (end[1] - start[1]) * cue.progress,
  };
}

function circleArcPath(progress, radius = 205) {
  const bounded = Math.max(0.001, Math.min(0.999, progress));
  const centerX = 500;
  const centerY = 310;
  const startAngle = Math.PI / 2;
  const endAngle = startAngle - TAU * bounded;
  const startX = centerX + radius * Math.cos(startAngle);
  const startY = centerY + radius * Math.sin(startAngle);
  const endX = centerX + radius * Math.cos(endAngle);
  const endY = centerY + radius * Math.sin(endAngle);
  return `M ${startX} ${startY} A ${radius} ${radius} 0 ${bounded > 0.5 ? 1 : 0} 0 ${endX} ${endY}`;
}

function renderBreathingLayer(cue) {
  if (!cue) {
    return `<div class="breath-backdrop breath-backdrop--idle" aria-hidden="true"><span class="ambient-orb"></span></div>`;
  }
  const guide = getVisualGuideFrame(cue, 'full-screen-clock');
  const shape = guide.shape === 'square' || guide.shape === 'triangle' ? guide.shape : 'circle';
  const currentStep = currentProgramStep(cue);
  const remainingSeconds = Math.max(1, Math.ceil(((currentStep?.durationMs ?? 1_000) * (1 - cue.progress)) / 1_000));
  let geometry;
  if (shape === 'circle') {
    const cycleProgress = breathingCycleProgress(cue);
    const angle = Math.PI / 2 - TAU * cycleProgress;
    const radius = 205;
    geometry = `
      <circle class="breath-outline" cx="500" cy="310" r="205"></circle>
      <path class="breath-progress-line" d="${circleArcPath(cycleProgress, radius)}"></path>
      <circle class="breath-runner" cx="${500 + radius * Math.cos(angle)}" cy="${310 + radius * Math.sin(angle)}" r="12"></circle>`;
  } else {
    const polygon = polygonBreathGeometry(shape, cue);
    geometry = `
      <polyline class="breath-outline" points="${polygon.points}"></polyline>
      <polyline class="breath-progress-line" points="${polygon.progressPoints}"></polyline>
      <circle class="breath-runner" cx="${polygon.dotX}" cy="${polygon.dotY}" r="12"></circle>`;
  }
  return `
    <div class="breath-backdrop breath-backdrop--${shape}" aria-label="${escapeHtml(`${t('breathingLayer')}: ${cue.title}`)}">
      <svg class="breath-figure" viewBox="0 0 1000 620" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${geometry}</svg>
      <div class="breath-phase">
        <strong>${escapeHtml(cue.title)}</strong>
        <b>${escapeHtml(t('phaseSeconds', { count: remainingSeconds }))}</b>
      </div>
    </div>`;
}

function calculatedEyePosition(cue) {
  const progress = Math.max(0, Math.min(1, cue.progress));
  // The runtime stage is full-screen. Keep only a small optical safety inset so
  // the target exercises the widest useful gaze range without clipping.
  const horizontalRadius = 45;
  const verticalRadius = 38;
  const centerY = 46;
  if (cue.stepId === 'directions') {
    const directions = [[0, -1], [0.707, -0.707], [1, 0], [0.707, 0.707], [0, 1], [-0.707, 0.707], [-1, 0], [-0.707, -0.707]];
    const phase = progress * directions.length;
    const index = Math.floor(phase) % directions.length;
    const local = phase - Math.floor(phase);
    const from = directions[index];
    const to = directions[(index + 1) % directions.length];
    const eased = local * local * (3 - 2 * local);
    return {
      x: 50 + horizontalRadius * (from[0] + (to[0] - from[0]) * eased),
      y: centerY + verticalRadius * (from[1] + (to[1] - from[1]) * eased),
      variant: 'moving',
    };
  }
  if (cue.stepId === 'horizontal') {
    return { x: 50 + horizontalRadius * Math.sin(TAU * 3 * progress), y: centerY, variant: 'moving' };
  }
  if (cue.stepId === 'vertical') {
    return { x: 50, y: centerY + verticalRadius * Math.sin(TAU * 3 * progress), variant: 'moving' };
  }
  if (cue.stepId === 'circle') {
    const angle = TAU * 3 * progress;
    return { x: 50 + horizontalRadius * Math.cos(angle), y: centerY + verticalRadius * Math.sin(angle), variant: 'moving' };
  }
  if (cue.stepId === 'figure-eight') {
    const angle = TAU * 2 * progress;
    return { x: 50 + horizontalRadius * Math.sin(angle), y: centerY + verticalRadius * Math.sin(angle) * Math.cos(angle), variant: 'moving' };
  }
  if (cue.stepId === 'converge') {
    return { x: 50, y: 8 + 38 * progress, variant: 'focus' };
  }
  if (cue.stepId === 'far-focus') {
    return { x: 50, y: 42, variant: 'hidden' };
  }
  if (cue.stepId === 'focus') {
    return { x: 50, y: 42, variant: 'focus' };
  }
  return { x: 50, y: centerY, variant: cue.stepId === 'palming' ? 'hidden' : 'pulse' };
}

function resolvedEyePosition(cue, pauseAtTransition) {
  const eyeKey = `${cue.programId}/${cue.stepId}`;
  let position = calculatedEyePosition(cue);
  if (pauseAtTransition && state.practiceVisual.eyeKey === eyeKey && state.practiceVisual.eyePosition) {
    position = state.practiceVisual.eyePosition;
  } else {
    state.practiceVisual = { eyeKey, eyePosition: position };
  }
  return position;
}

function renderEyeLayer(cue, pauseAtTransition) {
  if (!cue) return '';
  const position = resolvedEyePosition(cue, pauseAtTransition);
  const target = position.variant === 'hidden' ? '' : `<span class="eye-target eye-target--${position.variant}" style="left:${position.x}%;top:${position.y}%" aria-hidden="true"><i></i></span>`;
  return `
    <div class="eye-guide" aria-label="${escapeHtml(`${t('eyeLayer')}: ${cue.title}. ${cue.cue}`)}">
      <span>${escapeHtml(t('eyeLayer'))}</span>
      <strong>${escapeHtml(cue.title)}</strong>
      <small>${escapeHtml(cue.cue)}</small>
    </div>
    ${target}`;
}

function activeVisualClass(active) {
  return active ? ' is-active' : '';
}

function renderCosmicEnergyCenters() {
  return `<div class="cosmic-energy-centers" aria-hidden="true">
    ${Array.from({ length: 7 }, (_, index) => `<i class="cosmic-energy-center cosmic-energy-center--${index + 1}"></i>`).join('')}
  </div>`;
}

function renderCosmicBodyVisual(view, overlay) {
  return `<div class="cosmic-body-visual cosmic-body-visual--${escapeHtml(view)}">
    <div class="cosmic-body-layer" aria-hidden="true">
      <img class="cosmic-body-master" src="${cosmicAssetRoot}/body-master-v1.webp" alt="" draggable="false">
      ${renderCosmicEnergyCenters()}
    </div>
    ${overlay}
  </div>`;
}

function renderFaceVisual(cue) {
  const regionByStep = {
    cheeks: 'cheeks', smile: 'mouth', pucker: 'mouth', brows: 'brows', 'eyes-soft': 'eyes', jaw: 'jaw', simhasana: 'tongue', ears: 'ears', forehead: 'brows',
    hum: 'throat', lips: 'mouth', vowels: 'throat', 'tongue-twister': 'tongue', 'smile-pucker': 'mouth', 'lip-circle': 'mouth', 'jaw-open-close': 'jaw',
    'tongue-tip': 'tongue', 'tongue-sides': 'tongue', syllables: 'tongue', phrase: 'throat', 'find-spot': 'tongue', 'palate-hold': 'tongue',
    'controlled-swallow': 'throat',
  };
  const region = regionByStep[cue.stepId] ?? 'release';
  const on = (name) => activeVisualClass(region === name);
  return renderCosmicBodyVisual('face', `<svg class="solo-svg cosmic-zone-overlay face-svg" viewBox="0 0 600 390" aria-hidden="true">
    <ellipse class="visual-zone face-ear${on('ears')}" cx="165" cy="194" rx="24" ry="42"></ellipse>
    <ellipse class="visual-zone face-ear${on('ears')}" cx="435" cy="194" rx="24" ry="42"></ellipse>
    <path class="visual-zone face-brow${on('brows')}" d="M220 135 Q255 112 280 136 M320 136 Q350 112 382 135"></path>
    <ellipse class="visual-zone face-eye${on('eyes')}" cx="252" cy="170" rx="25" ry="13"></ellipse>
    <ellipse class="visual-zone face-eye${on('eyes')}" cx="348" cy="170" rx="25" ry="13"></ellipse>
    <circle class="visual-zone face-cheek${on('cheeks')}" cx="230" cy="220" r="34"></circle>
    <circle class="visual-zone face-cheek${on('cheeks')}" cx="370" cy="220" r="34"></circle>
    <path class="visual-line" d="M300 170 Q286 216 304 222"></path>
    <path class="visual-zone face-mouth${on('mouth')}" d="M246 264 Q300 304 354 264 Q302 250 246 264 Z"></path>
    <path class="visual-zone face-tongue${on('tongue')}" d="M275 277 Q300 322 325 277"></path>
    <path class="visual-zone face-jaw${on('jaw')}" d="M212 273 Q300 350 388 273"></path>
    <path class="visual-zone face-throat${on('throat')}" d="M265 344 Q300 374 335 344"></path>
  </svg>`);
}

function renderRelaxationVisual(cue) {
  const regionByStep = {
    hands: 'hands', shoulders: 'shoulders', face: 'head', abdomen: 'torso', legs: 'legs', feet: 'feet', torso: 'torso', whole: 'whole',
    weight: 'legs', warmth: 'torso', breath: 'torso', settle: 'whole', return: 'whole', rest: 'whole',
  };
  const region = regionByStep[cue.stepId] ?? 'whole';
  const on = (name) => activeVisualClass(region === name || region === 'whole');
  return `<svg class="solo-svg body-scan-svg" viewBox="0 0 600 390" aria-hidden="true">
    <circle class="visual-zone body-head${on('head')}" cx="300" cy="62" r="38"></circle>
    <path class="visual-line" d="M300 102 L300 238 M300 126 L212 205 M300 126 L388 205 M300 238 L242 346 M300 238 L358 346"></path>
    <circle class="visual-zone body-joint${on('shoulders')}" cx="300" cy="128" r="48"></circle>
    <ellipse class="visual-zone body-torso${on('torso')}" cx="300" cy="198" rx="58" ry="78"></ellipse>
    <circle class="visual-zone body-hand${on('hands')}" cx="205" cy="211" r="22"></circle>
    <circle class="visual-zone body-hand${on('hands')}" cx="395" cy="211" r="22"></circle>
    <path class="visual-zone body-leg${on('legs')}" d="M276 236 L238 340 M324 236 L362 340"></path>
    <ellipse class="visual-zone body-foot${on('feet')}" cx="228" cy="352" rx="28" ry="13"></ellipse>
    <ellipse class="visual-zone body-foot${on('feet')}" cx="372" cy="352" rx="28" ry="13"></ellipse>
    <path class="body-scan-wave" d="M190 310 Q300 258 410 310"></path>
  </svg>`;
}

function renderPelvicVisual(cue) {
  const contracting = cue.stepId.includes('squeeze') || cue.stepId.includes('hold');
  const vectors = contracting
    ? `<path d="M300 142 L300 214 M286 198 L300 214 L314 198"></path>
       <path d="M300 346 L300 274 M286 290 L300 274 L314 290"></path>
       <path d="M166 244 L244 244 M228 230 L244 244 L228 258"></path>
       <path d="M434 244 L356 244 M372 230 L356 244 L372 258"></path>`
    : `<path d="M300 218 L300 142 M286 158 L300 142 L314 158"></path>
       <path d="M300 270 L300 346 M286 330 L300 346 L314 330"></path>
       <path d="M244 244 L166 244 M182 230 L166 244 L182 258"></path>
       <path d="M356 244 L434 244 M418 230 L434 244 L418 258"></path>`;
  const direction = contracting ? 'inward' : 'outward';
  return renderCosmicBodyVisual('pelvis', `<svg class="solo-svg cosmic-zone-overlay pelvic-svg${contracting ? ' is-contracting' : ' is-releasing'}" data-vector-direction="${direction}" viewBox="0 0 600 390" aria-hidden="true">
    <ellipse class="pelvic-ring pelvic-ring--outer" cx="300" cy="244" rx="112" ry="66"></ellipse>
    <ellipse class="pelvic-ring pelvic-ring--middle" cx="300" cy="244" rx="78" ry="46"></ellipse>
    <ellipse class="pelvic-ring pelvic-ring--inner" cx="300" cy="244" rx="42" ry="25"></ellipse>
    <g class="pelvic-vectors pelvic-vectors--${direction}">${vectors}</g>
    <circle class="pelvic-core" cx="300" cy="244" r="16"></circle>
  </svg>`);
}

function renderMobilityVisual(cue) {
  const zone = cue.programId.includes('neck') ? 'shoulders' : cue.programId.includes('thoracic') ? 'torso' : cue.programId.includes('ankle') ? 'ankles' : 'wrists';
  const on = (name) => activeVisualClass(zone === name);
  return `<svg class="solo-svg mobility-svg" viewBox="0 0 600 390" aria-hidden="true">
    <circle class="visual-line" cx="300" cy="61" r="36"></circle>
    <path class="visual-line" d="M300 97 L300 244 M300 127 L214 204 M300 127 L386 204 M300 244 L250 345 M300 244 L350 345"></path>
    <path class="mobility-arc${on('shoulders')}" d="M223 145 Q300 86 377 145"></path>
    <circle class="visual-zone mobility-joint${on('shoulders')}" cx="245" cy="137" r="25"></circle>
    <circle class="visual-zone mobility-joint${on('shoulders')}" cx="355" cy="137" r="25"></circle>
    <ellipse class="visual-zone mobility-torso${on('torso')}" cx="300" cy="205" rx="66" ry="72"></ellipse>
    <circle class="visual-zone mobility-joint${on('wrists')}" cx="208" cy="211" r="25"></circle>
    <circle class="visual-zone mobility-joint${on('wrists')}" cx="392" cy="211" r="25"></circle>
    <circle class="visual-zone mobility-joint${on('ankles')}" cx="244" cy="345" r="25"></circle>
    <circle class="visual-zone mobility-joint${on('ankles')}" cx="356" cy="345" r="25"></circle>
    <path class="mobility-orbit${on('wrists')}" d="M172 211 A36 36 0 1 0 244 211"></path>
    <path class="mobility-orbit${on('ankles')}" d="M208 345 A36 36 0 1 0 280 345"></path>
  </svg>`;
}

function renderPostureVisual(cue) {
  const pose = cue.programId.includes('horse')
    ? 'horse'
    : cue.programId.includes('cobbler')
      ? 'cobbler'
      : cue.programId.includes('lotus')
        ? 'lotus'
        : 'mountain';
  const releasing = cue.stepId.includes('release');
  return `<div class="cosmic-pose-visual cosmic-pose-visual--${pose}${releasing ? ' is-releasing' : ' is-holding'}" data-pose="${pose}" aria-hidden="true">
    <img src="${cosmicPostureAssets[pose]}" alt="" draggable="false">
  </div>`;
}

function renderIsometricVisual(cue) {
  const zone = cue.stepId === 'palms' ? 'palms' : cue.stepId === 'feet' ? 'feet' : cue.stepId === 'squeeze' ? 'glutes' : 'release';
  const on = (name) => activeVisualClass(zone === name);
  return `<svg class="solo-svg isometric-svg" viewBox="0 0 600 390" aria-hidden="true">
    <circle class="visual-line" cx="300" cy="62" r="34"></circle>
    <path class="visual-line" d="M300 96 L300 232 M300 142 L236 214 M300 142 L364 214 M300 232 L252 330 M300 232 L348 330"></path>
    <circle class="visual-zone iso-zone${on('palms')}" cx="230" cy="221" r="28"></circle>
    <circle class="visual-zone iso-zone${on('palms')}" cx="370" cy="221" r="28"></circle>
    <ellipse class="visual-zone iso-zone${on('glutes')}" cx="300" cy="246" rx="74" ry="42"></ellipse>
    <ellipse class="visual-zone iso-zone${on('feet')}" cx="240" cy="344" rx="38" ry="18"></ellipse>
    <ellipse class="visual-zone iso-zone${on('feet')}" cx="360" cy="344" rx="38" ry="18"></ellipse>
    <path class="iso-tension${zone === 'release' ? '' : ' is-active'}" d="M172 196 L428 196"></path>
  </svg>`;
}

function renderAbdomenVisual(cue) {
  const releasing = cue.stepId.includes('release') || cue.stepId.includes('recover') || cue.stepId.includes('finish');
  return renderCosmicBodyVisual('abdomen', `<svg class="solo-svg cosmic-zone-overlay abdomen-svg${releasing ? ' is-releasing' : ' is-engaging'}" viewBox="0 0 600 390" aria-hidden="true">
    <ellipse class="abdomen-zone" cx="300" cy="230" rx="94" ry="105"></ellipse>
    <ellipse class="abdomen-core" cx="300" cy="238" rx="54" ry="68"></ellipse>
    <path class="abdomen-arrow abdomen-arrow--left" d="M202 238 L252 238 M232 218 L252 238 L232 258"></path>
    <path class="abdomen-arrow abdomen-arrow--right" d="M398 238 L348 238 M368 218 L348 238 L368 258"></path>
    <path class="abdomen-breath" d="M246 122 Q300 88 354 122"></path>
  </svg>`);
}

function renderFeldenkraisVisual(cue) {
  const reverse = cue.stepId === 'other-side';
  return `<svg class="solo-svg feldenkrais-svg${reverse ? ' is-reverse' : ''}" viewBox="0 0 600 390" aria-hidden="true">
    <g class="felden-ghost"><circle cx="348" cy="78" r="32"></circle><path d="M348 110 L320 240 M320 150 L390 222 M320 240 L245 334 M320 240 L372 342"></path></g>
    <g class="felden-body"><circle cx="286" cy="68" r="32"></circle><path d="M286 100 L300 238 M300 145 L230 216 M300 238 L244 340 M300 238 L360 340"></path></g>
    <path class="felden-path" d="M232 78 Q302 22 376 80 M350 54 L376 80 L342 92"></path>
    <ellipse class="felden-base" cx="300" cy="350" rx="138" ry="20"></ellipse>
  </svg>`;
}

const soloVisualRenderers = {
  'face-speech': renderFaceVisual,
  relaxation: renderRelaxationVisual,
  'pelvic-floor': renderPelvicVisual,
  mobility: renderMobilityVisual,
  postures: renderPostureVisual,
  isometrics: renderIsometricVisual,
  abdomen: renderAbdomenVisual,
  feldenkrais: renderFeldenkraisVisual,
};

// Contraction/release programs have a real repeating phase cycle. Their
// timing runs around a square, matching the box-breathing clock. The other
// solo guides use a circular timer around the illustration for the current
// continuous movement/hold.
const soloSquareTimingSets = new Set(['pelvic-floor', 'isometrics', 'abdomen']);


/**
 * 🔴 ГРАНЬ = ФАЗА. Репорт Дениса 26.08.2026 по живой сборке: «грани сделаны
 * бесполезно, надо подогнать циклы под грани, чтобы ЛИНИЯ была таймером, а не
 * точка на линии».
 *
 * Что было: квадрат рисовался всегда, прогресс шёл по ВСЕМУ циклу одной длинной
 * заливкой, а границы фаз отмечались точками где придётся. Угол квадрата почти
 * никогда не совпадал со сменой фазы, поэтому грань ничего не означала — глазу
 * не за что зацепиться, и оставалось следить за бегунком.
 *
 * Что стало: сторон РОВНО столько, сколько фаз в программе. «Расслабление —
 * удержание — быстрое сжатие» это треугольник, четыре фазы — квадрат, пять —
 * пятиугольник. Идёт фаза — заполняется ЕЁ грань, от угла до угла. Пройденные
 * горят целиком, будущие ждут. Смена фазы всегда попадает в угол, потому что
 * угол и есть смена фазы.
 *
 * ⚠️ ФИГУРА НЕ МЕНЯЕТСЯ ПОСРЕДИ ПРАКТИКИ. Число сторон берётся из программы, а
 * программа на шаге одна — иначе многоугольник дёргался бы под ногами.
 * 🔴 ДВЕ ФАЗЫ — НЕ КРАЙ, А БОЛЬШИНСТВО, И ПЕРВАЯ РЕДАКЦИЯ ИХ ТЕРЯЛА.
 * Стоял порог «меньше трёх фаз — обычный круг», потому что двуугольника не
 * бывает. Замер по каталогу практик 26.08.2026 показал, чего это стоило:
 *   pelvic-floor  основная программа — 3+ фазы  → размечалась
 *   isometrics    `glute-seated`      — 2 фазы  → откатывалась к кругу
 *   abdomen       `level-1/3/4/5`     — 2 фазы  → откатывались к кругу
 * То есть у двух наборов из трёх жалоба «грани сделаны бесполезно» оставалась
 * в силе, а проба это поймала только потому, что упала на `isometrics`.
 * Теперь фигура делится на N частей при ЛЮБОМ N: три и больше — стороны
 * многоугольника, ровно две — две полудуги круга. Смена фазы всегда попадает
 * в точку стыка, что при двух фазах, что при восьми.
 *
 * ⚠️ РЕЖИМ НАЗЫВАЕТСЯ `phased`, А НЕ `polygon`. При двух фазах рисуется
 * рассечённый круг, и звать его многоугольником было бы неточно; суть режима —
 * «фигура разбита по фазам», а не «фигура угловатая».
 */
const PHASE_MIN = 2;
const PHASE_MAX = 8;
const TIMING_CX = 300;
const TIMING_CY = 210;
const TIMING_R = 184;

function phaseSteps(cue) {
  return getPracticeProgram(cue.setId, cue.programId)?.steps ?? [];
}

/**
 * Точки стыка фаз. При двух фазах это верх и низ круга, при трёх и более —
 * вершины правильного многоугольника.
 */
function phaseCorners(sides) {
  if (sides === 2) {
    return [
      { x: TIMING_CX, y: TIMING_CY - TIMING_R },
      { x: TIMING_CX, y: TIMING_CY + TIMING_R },
    ];
  }
  return polygonVertices(sides);
}

/**
 * Путь отрезка каждой фазы в порядке прохождения: при двух фазах — правая и
 * левая полудуги, при трёх и более — стороны многоугольника.
 * Возвращаются `d` для <path>, а не координаты для <line>, ровно чтобы обе
 * геометрии шли одним кодом рисования и одним кодом обновления на тике.
 */
function phaseSegmentPaths(sides) {
  if (sides === 2) {
    const top = `${TIMING_CX},${TIMING_CY - TIMING_R}`;
    const bottom = `${TIMING_CX},${TIMING_CY + TIMING_R}`;
    return [
      `M ${top} A ${TIMING_R},${TIMING_R} 0 0 1 ${bottom}`,
      `M ${bottom} A ${TIMING_R},${TIMING_R} 0 0 1 ${top}`,
    ];
  }
  const v = polygonVertices(sides);
  return v.map((a, i) => {
    const b = v[(i + 1) % sides];
    return `M ${a.x.toFixed(1)},${a.y.toFixed(1)} L ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
  });
}

/** Вершины правильного многоугольника: первая — сверху, дальше по часовой. */
function polygonVertices(sides) {
  const out = [];
  for (let i = 0; i < sides; i++) {
    const angle = -Math.PI / 2 + (TAU * i) / sides;
    out.push({ x: TIMING_CX + TIMING_R * Math.cos(angle), y: TIMING_CY + TIMING_R * Math.sin(angle) });
  }
  return out;
}

function soloTimingMode(cue) {
  if (!soloSquareTimingSets.has(cue.setId)) return 'circle';
  const n = phaseSteps(cue).length;
  return n >= PHASE_MIN && n <= PHASE_MAX ? 'phased' : 'circle';
}

function soloTimingProgress(cue, mode = soloTimingMode(cue)) {
  return mode === 'phased' ? breathingCycleProgress(cue) : cue.progress;
}

/** Где сейчас бегунок: на грани текущей фазы, на её собственной доле. */
function soloTimingPoint(mode, progress, cue) {
  const bounded = Math.max(0, Math.min(1, progress));
  if (mode !== 'phased') {
    const angle = -Math.PI / 2 + TAU * bounded;
    return { x: TIMING_CX + TIMING_R * Math.cos(angle), y: TIMING_CY + TIMING_R * Math.sin(angle) };
  }
  const steps = phaseSteps(cue);
  const sides = steps.length;
  const idx = Math.max(0, steps.findIndex((step) => step.id === cue.stepId));
  const t = Math.max(0, Math.min(1, cue.progress));
  if (sides === 2) {
    // Полудуга: фаза 0 идёт по правой половине, фаза 1 — по левой.
    const angle = -Math.PI / 2 + Math.PI * (idx + t);
    return { x: TIMING_CX + TIMING_R * Math.cos(angle), y: TIMING_CY + TIMING_R * Math.sin(angle) };
  }
  const v = polygonVertices(sides);
  const a = v[idx];
  const b = v[(idx + 1) % sides];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function renderSoloTimingFrame(cue, illustration) {
  const mode = soloTimingMode(cue);
  const progress = soloTimingProgress(cue, mode);
  const runner = soloTimingPoint(mode, progress, cue);

  let path;
  if (mode === 'phased') {
    const steps = phaseSteps(cue);
    const sides = steps.length;
    const idx = Math.max(0, steps.findIndex((step) => step.id === cue.stepId));
    const t = Math.max(0, Math.min(1, cue.progress));
    const seg = [];
    phaseSegmentPaths(sides).forEach((d, i) => {
      seg.push(`<path class="solo-timing-track" d="${d}" fill="none"></path>`);
      // Пройденные фазы горят целиком, текущая — на свою долю, будущие не видны.
      // ⚠️ Заливка рисуется у КАЖДОГО отрезка, даже нулевая: быстрое обновление
      // на тике находит их по индексу, и пропуск сдвинул бы всю нумерацию.
      const fill = i < idx ? 1 : i === idx ? t : 0;
      seg.push(`<path class="solo-timing-progress" d="${d}" fill="none" pathLength="1" stroke-dasharray="${Math.max(0.001, fill)} 1" opacity="${fill > 0 ? 1 : 0}"></path>`);
    });
    // Точки стыка — это и есть смены фаз, поэтому они помечены всегда.
    for (const pt of phaseCorners(sides)) seg.push(`<circle class="solo-timing-marker" cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="5"></circle>`);
    path = seg.join('');
  } else {
    const progressDash = `${Math.max(0.001, progress)} 1`;
    path = `<circle class="solo-timing-track" cx="${TIMING_CX}" cy="${TIMING_CY}" r="${TIMING_R}" pathLength="1"></circle><circle class="solo-timing-progress" cx="${TIMING_CX}" cy="${TIMING_CY}" r="${TIMING_R}" pathLength="1" transform="rotate(-90 ${TIMING_CX} ${TIMING_CY})" stroke-dasharray="${progressDash}"></circle>`;
  }

  return `<div class="solo-timing-visual solo-timing-visual--${mode}" data-timing-mode="${mode}" data-timing-progress="${progress}" data-phases="${mode === 'phased' ? phaseSteps(cue).length : 0}">
    <svg class="solo-timing-frame" viewBox="0 0 600 420" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      ${path}
      <circle class="solo-timing-runner" cx="${runner.x.toFixed(1)}" cy="${runner.y.toFixed(1)}" r="11"></circle>
    </svg>
    <div class="solo-visual-picture">${illustration}</div>
  </div>`;
}

function soloVisualProperties(progress) {
  const bounded = Math.max(0, Math.min(1, progress));
  const shift = (bounded - 0.5) * 24;
  const angle = (bounded - 0.5) * 10;
  return {
    '--solo-progress': String(bounded),
    '--solo-scale': String(0.9 + bounded * 0.12),
    '--solo-contract': String(1 - bounded * 0.24),
    '--solo-release': String(0.76 + bounded * 0.24),
    '--solo-shift': `${shift}px`,
    '--solo-shift-negative': `${-shift}px`,
    '--solo-angle': `${angle}deg`,
    '--solo-angle-negative': `${-angle}deg`,
    '--solo-dash': String(120 - bounded * 120),
  };
}

function soloVisualStyle(progress) {
  return Object.entries(soloVisualProperties(progress)).map(([name, value]) => `${name}:${value}`).join(';');
}

function renderSoloVisualization(cue) {
  const renderer = soloVisualRenderers[cue.setId];
  if (!renderer) return '';
  const step = currentProgramStep(cue);
  const remainingSeconds = Math.max(1, Math.ceil(((step?.durationMs ?? 1_000) * (1 - cue.progress)) / 1_000));
  const timingMode = soloTimingMode(cue);
  const blockVersion = getPracticeBlockVersion(cue.setId);
  return `<div class="solo-visual-stage solo-visual-stage--${escapeHtml(cue.setId)}" data-visual-set="${escapeHtml(cue.setId)}" data-step-id="${escapeHtml(cue.stepId)}" data-timing-mode="${timingMode}" style="${soloVisualStyle(cue.progress)}">
    <div class="solo-visual-heading">
      <div class="solo-visual-heading-meta">
        <span>${escapeHtml(catalogText(getPracticeSet(cue.setId).title, state.locale))}</span>
        <b class="solo-block-version" aria-label="${escapeHtml(t('blockVersion', { version: blockVersion }))}">v${escapeHtml(blockVersion)}</b>
      </div>
      <div class="solo-visual-heading-line">
        <strong>${escapeHtml(cue.title)}</strong>
        <b class="solo-inline-timer" aria-label="${escapeHtml(t('phaseSeconds', { count: remainingSeconds }))}"><em>${remainingSeconds}</em> ${escapeHtml(state.locale === 'ru' ? 'сек' : 'sec')}</b>
      </div>
      <small>${escapeHtml(cue.cue)}</small>
    </div>
    <div class="solo-visual-art">${renderSoloTimingFrame(cue, renderer(cue))}</div>
  </div>`;
}

function selectAuxiliaryCue(cues, elapsedMs) {
  if (!cues.length) return { cue: null, index: 0 };
  const transition = cues.find((cue) => cue.channel === 'tension' && (cue.progress < 0.14 || cue.progress > 0.88));
  if (transition) return { cue: transition, index: cues.indexOf(transition) };
  const index = Math.floor(elapsedMs / 4_000) % cues.length;
  return { cue: cues[index], index };
}

function renderAuxiliaryAdvice(cues, elapsedMs) {
  const { cue, index } = selectAuxiliaryCue(cues, elapsedMs);
  if (!cue) return '';
  return `
    <aside class="parallel-advice" data-advice-key="${escapeHtml(`${cue.setId}/${cue.programId}/${cue.stepId}`)}" aria-label="${escapeHtml(t('nextAdvice'))}">
      <span class="advice-icon" aria-hidden="true">${escapeHtml(setIcon(cue.setId))}</span>
      <div class="advice-copy">
        <span>${escapeHtml(catalogText(getPracticeSet(cue.setId).title, state.locale))}</span>
        <strong>${escapeHtml(cue.title)}</strong>
        <small>${escapeHtml(cue.cue)}</small>
      </div>
      ${cues.length > 1 ? `<b class="advice-count">${index + 1}/${cues.length}</b>` : ''}
    </aside>`;
}

function renderParallelFocus(cues, elapsedMs) {
  const { cue } = selectAuxiliaryCue(cues, elapsedMs);
  const renderer = cue ? soloVisualRenderers[cue.setId] : null;
  if (!cue || !renderer) return '';
  const focusKey = `${cue.setId}/${cue.programId}/${cue.stepId}`;
  return `<div class="parallel-focus-visual" data-focus-key="${escapeHtml(focusKey)}" data-focus-set="${escapeHtml(cue.setId)}" style="${soloVisualStyle(cue.progress)}" aria-hidden="true">
    <div class="parallel-focus-picture">${renderer(cue)}</div>
  </div>`;
}

function practiceRenderKey(frame) {
  return `${state.locale}:${frame.cues.map((cue) => `${cue.setId}/${cue.programId}/${cue.stepId}`).join('|')}`;
}

function updateBreathingLayer(root, cue) {
  if (!cue) return;
  const guide = getVisualGuideFrame(cue, 'full-screen-clock');
  const step = currentProgramStep(cue);
  const remainingSeconds = Math.max(1, Math.ceil(((step?.durationMs ?? 1_000) * (1 - cue.progress)) / 1_000));
  root.querySelector('.breath-fill-shape')?.style.setProperty('--breath-scale', String(guide.scale));
  const phaseSeconds = root.querySelector('.breath-phase b');
  if (phaseSeconds) phaseSeconds.textContent = t('phaseSeconds', { count: remainingSeconds });
  const runner = root.querySelector('.breath-runner');
  const progressLine = root.querySelector('.breath-progress-line');
  if (!runner || !progressLine) return;
  if (guide.shape === 'square' || guide.shape === 'triangle') {
    const polygon = polygonBreathGeometry(guide.shape, cue);
    progressLine.setAttribute('points', polygon.progressPoints);
    runner.setAttribute('cx', String(polygon.dotX));
    runner.setAttribute('cy', String(polygon.dotY));
    return;
  }
  const cycleProgress = breathingCycleProgress(cue);
  const radius = 205;
  const angle = Math.PI / 2 - TAU * cycleProgress;
  progressLine.setAttribute('d', circleArcPath(cycleProgress, radius));
  runner.setAttribute('cx', String(500 + radius * Math.cos(angle)));
  runner.setAttribute('cy', String(310 + radius * Math.sin(angle)));
}

function updateEyeLayer(root, cue, pauseAtTransition) {
  if (!cue) return;
  const target = root.querySelector('.eye-target');
  if (!target) return;
  const position = resolvedEyePosition(cue, pauseAtTransition);
  target.style.left = `${position.x}%`;
  target.style.top = `${position.y}%`;
}

function updateAuxiliaryAdvice(root, cues, elapsedMs) {
  const { cue } = selectAuxiliaryCue(cues, elapsedMs);
  if (!cue) return;
  const adviceKey = `${cue.setId}/${cue.programId}/${cue.stepId}`;
  const current = root.querySelector('.parallel-advice');
  if (current?.dataset.adviceKey === adviceKey) return;
  const markup = renderAuxiliaryAdvice(cues, elapsedMs);
  if (current) current.outerHTML = markup;
  else root.querySelector('.parallel-stage')?.insertAdjacentHTML('beforeend', markup);
}

function positionBreathingComposition(root) {
  const stage = root.querySelector('.parallel-stage.has-breathing');
  const svg = stage?.querySelector('.breath-figure');
  const phase = stage?.querySelector('.breath-phase');
  if (!stage || !svg || !phase) return;
  const matrix = svg.getScreenCTM();
  if (!matrix) return;

  const shape = stage.dataset.breathShape;
  const geometry = shape === 'circle'
    ? { left: 295, top: 105, right: 705, bottom: 515, adviceY: 440 }
    : shape === 'triangle'
      ? { left: 220, top: 105, right: 780, bottom: 450, adviceY: 390 }
      : { left: 230, top: 40, right: 770, bottom: 580, adviceY: 510 };
  const transformPoint = (x, y) => {
    const point = svg.createSVGPoint();
    point.x = x;
    point.y = y;
    return point.matrixTransform(matrix);
  };
  const stageRect = stage.getBoundingClientRect();
  const topLeft = transformPoint(geometry.left, geometry.top);
  const bottomRight = transformPoint(geometry.right, geometry.bottom);
  const contourWidth = Math.abs(bottomRight.x - topLeft.x);
  const contourHeight = Math.abs(bottomRight.y - topLeft.y);
  const contourCenterX = (topLeft.x + bottomRight.x) / 2;
  const contourCenterY = (topLeft.y + bottomRight.y) / 2;
  const phaseAnchor = transformPoint((geometry.left + geometry.right) / 2, geometry.bottom);
  phase.style.left = `${phaseAnchor.x - stageRect.left}px`;
  phase.style.top = `${phaseAnchor.y - stageRect.top}px`;

  // The breathing contour is the one and only frame. The auxiliary artwork
  // fills it directly instead of sitting in a second, smaller box.
  const focus = stage.querySelector('.parallel-focus-visual');
  if (focus) {
    const inset = Math.max(4, Math.min(10, contourWidth * 0.015));
    focus.style.left = `${contourCenterX - stageRect.left}px`;
    focus.style.top = `${contourCenterY - stageRect.top}px`;
    focus.style.width = `${Math.max(1, contourWidth - inset * 2)}px`;
    focus.style.height = `${Math.max(1, contourHeight - inset * 2)}px`;
  }

  const advice = stage.querySelector('.parallel-advice');
  if (!advice) return;
  const adviceAnchor = transformPoint((geometry.left + geometry.right) / 2, geometry.adviceY);
  advice.style.left = `${adviceAnchor.x - stageRect.left}px`;
  advice.style.top = `${adviceAnchor.y - stageRect.top}px`;
  advice.style.width = `${Math.max(160, Math.min(440, contourWidth - 36))}px`;
}

function updateParallelFocus(root, cues, elapsedMs) {
  const { cue } = selectAuxiliaryCue(cues, elapsedMs);
  const focus = root.querySelector('.parallel-focus-visual');
  const renderer = cue ? soloVisualRenderers[cue.setId] : null;
  if (!cue || !renderer) {
    focus?.remove();
    return;
  }
  const focusKey = `${cue.setId}/${cue.programId}/${cue.stepId}`;
  if (focus?.dataset.focusKey !== focusKey) {
    const markup = renderParallelFocus(cues, elapsedMs);
    if (focus) focus.outerHTML = markup;
    else root.querySelector('.breath-backdrop')?.insertAdjacentHTML('afterend', markup);
    return;
  }
  for (const [name, value] of Object.entries(soloVisualProperties(cue.progress))) focus.style.setProperty(name, value);
}

function updateSoloVisualization(root, cue) {
  const stage = root.querySelector('.solo-visual-stage');
  if (!stage) return false;
  const step = currentProgramStep(cue);
  const remainingSeconds = Math.max(1, Math.ceil(((step?.durationMs ?? 1_000) * (1 - cue.progress)) / 1_000));
  for (const [name, value] of Object.entries(soloVisualProperties(cue.progress))) stage.style.setProperty(name, value);
  const timer = stage.querySelector('.solo-inline-timer em');
  if (timer) timer.textContent = String(remainingSeconds);
  stage
    .querySelector('.solo-inline-timer')
    ?.setAttribute('aria-label', t('phaseSeconds', { count: remainingSeconds }));
  const timingVisual = stage.querySelector('.solo-timing-visual');
  const mode = timingVisual?.dataset.timingMode ?? soloTimingMode(cue);
  const progress = soloTimingProgress(cue, mode);
  const runner = soloTimingPoint(mode, progress, cue);
  timingVisual?.setAttribute('data-timing-progress', String(progress));

  /**
   * ⚠️ У ФИГУРЫ ПО ФАЗАМ ЗАЛИВОК НЕСКОЛЬКО — ПО ОДНОЙ НА ОТРЕЗОК. Прежний код правил
   * ровно одну `.solo-timing-progress` и с многоугольником обновлял бы только
   * первую грань: пройденные фазы гасли бы, а текущая стояла на месте. Здесь
   * каждая грань получает свою долю: пройденные — целиком, текущая — по времени,
   * будущие — ноль.
   */
  if (mode === 'phased') {
    const steps = phaseSteps(cue);
    const idx = Math.max(0, steps.findIndex((step) => step.id === cue.stepId));
    const t = Math.max(0, Math.min(1, cue.progress));
    const lines = stage.querySelectorAll('.solo-timing-progress');
    lines.forEach((line, i) => {
      const fill = i < idx ? 1 : i === idx ? t : 0;
      line.setAttribute('stroke-dasharray', `${Math.max(0.001, fill)} 1`);
      line.setAttribute('opacity', fill > 0 ? '1' : '0');
    });
  } else {
    stage.querySelector('.solo-timing-progress')?.setAttribute('stroke-dasharray', `${Math.max(0.001, progress)} 1`);
  }

  const timingRunner = stage.querySelector('.solo-timing-runner');
  timingRunner?.setAttribute('cx', String(runner.x));
  timingRunner?.setAttribute('cy', String(runner.y));
  return true;
}

function updateLayeredPractice(root, frame) {
  if (frame.cues.length === 1 && updateSoloVisualization(root, frame.cues[0])) return;
  const breathingCue = frame.cues.find((cue) => cue.setId === 'breathing') ?? null;
  const eyeCue = frame.cues.find((cue) => cue.setId === 'eye-gym') ?? null;
  const auxiliaryCues = frame.cues.filter((cue) => cue.setId !== 'breathing' && cue.setId !== 'eye-gym');
  const transitionActive = auxiliaryCues.some((cue) => cue.channel === 'tension' && (cue.progress < 0.14 || cue.progress > 0.88));
  root.querySelector('.parallel-stage')?.classList.toggle('is-transition', transitionActive);
  updateBreathingLayer(root, breathingCue);
  updateParallelFocus(root, auxiliaryCues, frame.elapsedMs);
  updateEyeLayer(root, eyeCue, transitionActive);
  updateAuxiliaryAdvice(root, auxiliaryCues, frame.elapsedMs);
}

function renderLayeredPractice(frame) {
  if (!frame.cues.length) return `<div class="practice-complete"><strong>✓</strong>${escapeHtml(t('practiceComplete'))}</div>`;
  if (frame.cues.length === 1 && soloVisualRenderers[frame.cues[0].setId]) {
    return renderSoloVisualization(frame.cues[0]);
  }
  const breathingCue = frame.cues.find((cue) => cue.setId === 'breathing') ?? null;
  const eyeCue = frame.cues.find((cue) => cue.setId === 'eye-gym') ?? null;
  const auxiliaryCues = frame.cues.filter((cue) => cue.setId !== 'breathing' && cue.setId !== 'eye-gym');
  const transitionActive = auxiliaryCues.some((cue) => cue.channel === 'tension' && (cue.progress < 0.14 || cue.progress > 0.88));
  const breathingShape = breathingCue ? getVisualGuideFrame(breathingCue, 'full-screen-clock').shape : 'none';
  const classes = [
    'parallel-stage',
    breathingCue ? 'has-breathing' : 'without-breathing',
    eyeCue ? 'has-eye-guide' : 'without-eye-guide',
    eyeCue?.stepId === 'palming' ? 'is-palming' : '',
    transitionActive ? 'is-transition' : '',
  ].filter(Boolean).join(' ');
  return `
    <div class="${classes}" data-breath-shape="${escapeHtml(breathingShape)}">
      ${renderBreathingLayer(breathingCue)}
      ${renderParallelFocus(auxiliaryCues, frame.elapsedMs)}
      ${renderEyeLayer(eyeCue, transitionActive)}
      ${renderAuxiliaryAdvice(auxiliaryCues, frame.elapsedMs)}
    </div>`;
}

function tickPractice() {
  if (!state.practice || state.practice.phase !== 'running') return;
  state.practice = tickPracticeSession(state.practice, Math.max(0, Math.round(performance.now())));
  renderPractice();
  if (state.practice.phase === 'completed') finishPractice();
}

function renderPractice() {
  const session = state.practice;
  if (!session) return;
  const now = Math.max(0, Math.round(performance.now()));
  const frame = getSessionFrame(session, session.phase === 'running' ? now : undefined);
  $('#practice-title').textContent = session.plan.mode === 'solo'
    ? t('soloPractice')
    : t('parallelPractice', { count: session.plan.selections.length });
  $('#practice-clock').textContent = formatDuration(session.plan.durationMs - frame.elapsedMs);
  $('#practice-progress-bar').style.width = `${Math.round(frame.progress * 100)}%`;
  $('.practice-progress').setAttribute('aria-valuenow', String(Math.round(frame.progress * 100)));
  const practiceCues = $('#practice-cues');
  const renderKey = practiceRenderKey(frame);
  if (practiceCues.dataset.renderKey !== renderKey) {
    practiceCues.innerHTML = renderLayeredPractice(frame);
    practiceCues.dataset.renderKey = renderKey;
  } else {
    updateLayeredPractice(practiceCues, frame);
  }
  positionBreathingComposition(practiceCues);
  window.requestAnimationFrame(() => {
    if (practiceCues.isConnected && !$('#practice-layer').hidden) positionBreathingComposition(practiceCues);
  });
  $('#practice-pause').textContent = session.phase === 'paused' ? t('resume') : t('pause');
}

function togglePracticePause() {
  if (!state.practice) return;
  const now = Math.max(0, Math.round(performance.now()));
  state.practice = state.practice.phase === 'running' ? pausePracticeSession(state.practice, now) : resumePracticeSession(state.practice, now);
  renderPractice();
}

function finishPractice() {
  if (!state.practice || state.practice.phase !== 'completed') return;
  if (state.practiceTimer !== null) window.clearInterval(state.practiceTimer);
  state.practiceTimer = null;
  state.practiceHistory.unshift({
    id: state.practice.plan.id,
    recordedAtMs: Date.now(),
    durationMs: state.practice.plan.durationMs,
    setIds: state.practice.result?.completedSetIds ?? state.practice.plan.selections.map((selection) => selection.setId),
  });
  $('#practice-layer').hidden = true;
  stopImmersiveWatch();
  document.body.classList.remove('is-practice-running');
  toast(t('practiceComplete'));
  state.practice = null;
  state.practiceVisual = { eyeKey: null, eyePosition: null };
  renderHistory();
}

function exitPractice() {
  if (state.practiceTimer !== null) window.clearInterval(state.practiceTimer);
  state.practiceTimer = null;
  if (state.practice) state.practice = disposePracticeSession(state.practice);
  state.practice = null;
  state.practiceVisual = { eyeKey: null, eyePosition: null };
  $('#practice-layer').hidden = true;
  stopImmersiveWatch();
  document.body.classList.remove('is-practice-running');
  toast(t('practiceNotRecorded'));
}

async function refreshHistory() {
  try { state.outcomes = [...await bridge.listOutcomes()]; } catch { state.outcomes = []; }
  renderHistory();
}

function renderHistory() {
  const stats = $('#history-stats');
  const list = $('#history-list');
  if (!stats || !list) return;
  const passed = state.outcomes.filter((item) => item.reason === 'passed').length;
  const safeStops = state.outcomes.filter((item) => item.reason !== 'passed' && item.reason !== 'snooze').length;
  stats.innerHTML = [
    ['☀', t('awakenings'), passed], ['↗', t('practices'), state.practiceHistory.length], ['∞', t('safeStops'), safeStops],
  ].map(([glyph, label, value]) => `<article class="stat-card surface-card"><span class="stat-glyph">${glyph}</span><strong>${value}</strong><span>${escapeHtml(label)}</span></article>`).join('');
  const events = [
    ...state.outcomes.map((item) => ({
      type: 'alarm',
      at: item.recordedAtMs,
      title: t('alarmEvent'),
      detail: t({ passed: 'reasonPassed', 'attempt-cap': 'reasonAttemptCap', 'time-cap': 'reasonTimeCap', 'total-time-cap': 'reasonTotalTimeCap', escape: 'reasonEscape', snooze: 'reasonSnooze', 'adapter-error': 'reasonAdapterError', 'clock-error': 'reasonClockError', dispose: 'reasonDispose', collision: 'reasonCollision' }[item.reason] ?? 'safeStopped'),
      badge: item.reason === 'passed' ? t('complete') : t('safeStopped'),
    })),
    ...state.practiceHistory.map((item) => ({ type: 'practice', at: item.recordedAtMs, title: t('practiceEvent'), detail: item.setIds.map((id) => catalogText(getPracticeSet(id).title, state.locale)).join(' + '), badge: t('complete') })),
  ].sort((left, right) => right.at - left.at);
  list.innerHTML = events.length ? events.map((event) => `<article class="history-row"><span class="history-icon">${event.type === 'alarm' ? '☀' : '↗'}</span><div class="history-main"><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(event.detail)}</span></div><span class="history-badge">${escapeHtml(event.badge)}</span><time class="history-time">${escapeHtml(new Intl.DateTimeFormat(state.locale, { dateStyle: 'short', timeStyle: 'short' }).format(event.at))}</time></article>`).join('') : `<div class="empty-card">${escapeHtml(t('noHistory'))}</div>`;
}

function bindEvents() {
  document.addEventListener('click', async (event) => {
    const tab = event.target.closest('[data-tab]');
    if (tab) { switchTab(tab.dataset.tab); return; }
    const mode = event.target.closest('[data-plan-mode]');
    if (mode) { setPlanMode(mode.dataset.planMode); return; }
    const alarmCard = event.target.closest('[data-alarm-id]');
    const model = alarmCard ? state.alarms.find((item) => item.id === alarmCard.dataset.alarmId) : null;
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'add-alarm') openEditor();
    else if (action === 'close-editor') $('#alarm-editor').close();
    else if (action === 'edit-alarm' && model) openEditor(model);
    else if (action === 'test-alarm' && model) await testAlarm(model);
    else if (action === 'select-practice') togglePractice(event.target.closest('[data-set-id]').dataset.setId);
    const schulte = event.target.closest('[data-schulte-value]');
    if (schulte) await pressSchulte(Number(schulte.dataset.schulteValue));
    const choice = event.target.closest('[data-choice]');
    if (choice) await pressChoice(choice.dataset.choice);
  });

  $('#language-toggle').addEventListener('click', () => { state.locale = state.locale === 'ru' ? 'en' : 'ru'; applyLocale(); });
  $('#theme-toggle').addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = state.theme;
    $('meta[name="theme-color"]').content = state.theme === 'dark' ? '#10141f' : '#f2f4fa';
  });
  $('#alarm-form').addEventListener('submit', saveEditor);
  $('#delete-alarm').addEventListener('click', deleteEditorAlarm);
  $('#alarm-list').addEventListener('change', async (event) => {
    if (!event.target.matches('[data-action="toggle-alarm"]')) return;
    const id = event.target.closest('[data-alarm-id]').dataset.alarmId;
    const model = state.alarms.find((item) => item.id === id);
    if (model) await toggleAlarm(model, event.target.checked);
  });
  $('#test-next-alarm').addEventListener('click', async (event) => { await testAlarm(state.alarms.find((item) => item.id === event.currentTarget.dataset.alarmId)); });
  $('#permissions-action').addEventListener('click', async () => {
    try {
      const result = await bridge.requestPermissions();
      state.capabilities = result.capabilities;
      renderCapabilities();
      toast(result.openedSettings || result.runtimeRequested ? t('permissionResult') : t('settingsOpened'));
    } catch (error) { toast(String(error)); }
  });
  $('#challenge-snooze').addEventListener('click', async () => { await state.activeAlarm?.snooze(); });
  $('#challenge-escape').addEventListener('click', async () => { await state.activeAlarm?.escape(); });
  $('#continue-recharge').addEventListener('click', openRechargeFromOffer);
  $('#dismiss-recharge').addEventListener('click', () => { clearOfferTimer(); $('#recharge-offer').hidden = true; });
  $('#catalog-search').addEventListener('input', (event) => { state.recharge.search = event.target.value; renderCatalog(); });
  $('#plan-duration').addEventListener('change', (event) => { state.recharge.durationMs = Number(event.target.value); renderPlan(); });
  $('#plan-context').addEventListener('change', (event) => { state.recharge.context = event.target.value; renderPlan(); });
  $('#plan-guide').addEventListener('change', (event) => { state.recharge.guideMode = event.target.value; renderPlan(); });
  $('#mastery-toggle').addEventListener('change', (event) => { state.recharge.mastery = event.target.checked; renderPlan(); });
  $('#experimental-toggle').addEventListener('change', (event) => {
    state.recharge.allowExperimental = event.target.checked;
    if (!state.recharge.allowExperimental) {
      for (const [setId, programId] of state.recharge.selected) {
        if (getPracticeStatus(setId, programId) === 'experimental') {
          state.recharge.selected.set(setId, getPracticeSet(setId).defaultProgramId);
        }
      }
    }
    renderCatalog(); renderPlan();
  });
  $('#practice-catalog').addEventListener('change', (event) => {
    if (!event.target.matches('[data-program-select]')) return;
    const setId = event.target.closest('[data-set-id]').dataset.setId;
    if (setId === 'breathing' && state.recharge.mode !== 'solo') {
      enforceBaselineBreathing();
      renderCatalog();
      renderPlan();
      return;
    }
    if (getPracticeStatus(setId, event.target.value) === 'experimental' && !state.recharge.allowExperimental) {
      renderCatalog();
      return;
    }
    state.recharge.selected.set(setId, event.target.value);
    state.recharge.warningsAcknowledged = false;
    state.recharge.priorExperienceConfirmed = false;
    renderCatalog(); renderPlan();
  });
  $('#safety-gates').addEventListener('change', (event) => {
    if (event.target.dataset.gate === 'mastery') {
      state.recharge.mastery = event.target.checked;
      $('#mastery-toggle').checked = event.target.checked;
    }
    if (event.target.dataset.gate === 'warnings') state.recharge.warningsAcknowledged = event.target.checked;
    if (event.target.dataset.gate === 'experience') state.recharge.priorExperienceConfirmed = event.target.checked;
    renderPlan();
  });
  $('#start-practice').addEventListener('click', startPractice);
  $('#practice-pause').addEventListener('click', togglePracticePause);
  $('#practice-stop').addEventListener('click', exitPractice);
  $('#practice-exit').addEventListener('click', exitPractice);
}

/**
 * 🔴 ПОРЯДОК ЗДЕСЬ ВАЖНЕЕ ЛЮБОГО `catch`.
 *
 * Раньше подписка на срабатывания и восстановление активного будильника стояли
 * ПОСЛЕ загрузки данных. Любой отказ загрузки — и до них не доходило: будильник
 * звонил, а отключить его было нечем.
 *
 * Теперь запуск разделён на две части, и они не равны по важности:
 *   1. СТРАХОВКА — подписка на срабатывания и подъём активного будильника. Это то,
 *      без чего звенящий будильник нечем остановить. Ставится ПЕРВОЙ и своим
 *      `try/catch` на каждый шаг.
 *   2. ДАННЫЕ — список, история, возможности платформы. Их отказ портит вид
 *      экрана, но не отнимает у человека кнопку.
 */
async function bootSafety() {
  try {
    state.nativeUnsubscribe = await bridge.subscribePendingTriggers(() => { void resumeNativeAlarm(); });
  } catch (error) {
    toast(`Подписка на срабатывания не встала: ${error instanceof Error ? error.message : String(error)}`);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void resumeNativeAlarm();
  });
  window.addEventListener('focus', () => { void resumeNativeAlarm(); });
  window.addEventListener('beforeunload', () => { void state.nativeUnsubscribe?.(); }, { once: true });
  try { await resumeNativeAlarm(); } catch (error) { toast(error instanceof Error ? error.message : String(error)); }
}

async function boot() {
  bindEvents();
  renderWeekdays();
  renderCatalog();
  renderPlan();
  renderHistory();
  // Сперва то, без чего звенящий будильник нечем остановить.
  await bootSafety();
  /**
   * ⚠️ `allSettled`, а не `all`: `all` отклоняется на первом же отказе и теряет
   * результаты остальных. Здесь три независимых источника, и отказ одного не
   * причина не показать два других.
   */
  const итоги = await Promise.allSettled([probeCapabilities(), loadAlarms(), refreshHistory()]);
  const павшие = итоги.filter((r) => r.status === 'rejected');
  if (павшие.length > 0) {
    toast(`Часть данных не загрузилась (${павшие.length} из 3). Будильники продолжают работать.`);
  }
  applyLocale();
}

/**
 * 🔴 ОТКАЗ ОБЯЗАН БЫТЬ ВИДЕН, А НЕ ОСТАВЛЯТЬ ЗАГЛУШКУ.
 *
 * Глобальных обработчиков не было НИ ОДНОГО (проверено поиском: ноль совпадений).
 * Поэтому 26.08.2026 приложение, не запустившееся из-за двойного объявления
 * переменной, выглядело точно так же, как загружающееся: строка «Проверяем
 * платформу…» и больше ничего. Молчание неотличимо от работы — это и есть цена.
 */
function показатьОтказЗапуска(причина) {
  const строка = причина instanceof Error ? причина.message : String(причина);
  const место = document.querySelector('#platform-summary');
  if (место) {
    место.replaceChildren();
    const точка = document.createElement('span');
    точка.className = 'status-dot';
    точка.setAttribute('aria-hidden', 'true');
    const текст = document.createElement('span');
    текст.textContent = `Приложение не запустилось: ${строка}`;
    место.append(точка, текст);
    место.setAttribute('role', 'alert');
  }
  try { toast(`Приложение не запустилось: ${строка}`); } catch { /* toast мог не подняться */ }
}

window.addEventListener('unhandledrejection', (event) => {
  показатьОтказЗапуска(event.reason);
});
window.addEventListener('error', (event) => {
  показатьОтказЗапуска(event.error ?? event.message);
});

void boot();
