/**
 * FeedbackWidget — плавающая кнопка «сообщить» для тестировщиков.
 *
 * Зачем: закрытый тест Google Play (12 тестировщиков). Человек открыл игру,
 * не понял что делать → жмёт кнопку → пишет «непонятно, добавьте справку» →
 * фидбек + скриншот падают в Supabase (app_feedback + бакет feedback-shots).
 *
 * Гейт: FEEDBACK_ENABLED в src/services/appFeedback.ts — выключить перед
 * публичным релизом (или оставить только для тест-канала).
 *
 * Позиция: слева снизу — «?»-справка (GameHelpOverlay) висит справа сверху,
 * не конфликтуем.
 *
 * ВАЖНО: скриншот снимается ДО открытия шторки, иначе в кадр попадёт сама
 * шторка, а не экран, на который жалуется тестировщик.
 */
import { textOn } from '@/src/services/onGradientText';
import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, TextInput,
  ActivityIndicator, ScrollView, DeviceEventEmitter, PanResponder,
} from 'react-native';
import {
  FAB_SIZE, FAB_BOTTOM, readSpot, toSpot, spotToPixels, isDrag, type FabSpot,
} from '@/src/services/fabPosition';
import { useScreenSize } from '@/src/hooks/useScreenWidth';

/** Где человек оставил кнопку отзыва. Доля экрана, не пиксели — см. fabPosition. */
const FAB_SPOT_KEY = 'psygames_feedback_fab_spot';
import { DEVCHAT_VISIBLE_EVENT } from '@/src/services/pet';
import { FEEDBACK_OPEN_EVENT } from '@/src/services/appFeedback';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useProfile } from '@/src/contexts/ProfileContext';
import {
  FEEDBACK_ENABLED, getDevChatVisible, captureScreenshot, sendFeedback,
  type FeedbackKind, type SendResult,
} from '@/src/services/appFeedback';
import { isRTLLang } from '@/src/services/rtl';
import { a11yModal } from '@/src/services/a11y';
import { getMyDialog, type DialogBubble } from '@/src/services/feedbackDialog';
import { staleWebViewMajor, canRecord, startRecording, shouldWarnSilent, SILENCE_PEAK, type Recorder, type VoiceNote } from '@/src/services/voiceNote';
import { holdGame } from '@/src/services/gamePause';

const KINDS: { key: FeedbackKind; emoji: string; labelKey: string }[] = [
  { key: 'confusion', emoji: '🤷', labelKey: 'fbKindConfusion' },
  { key: 'bug',       emoji: '🐞', labelKey: 'fbKindBug' },
  { key: 'idea',      emoji: '💡', labelKey: 'fbKindIdea' },
];

export default function FeedbackWidget() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const { profile } = useProfile();
  const pathname = usePathname() || '';
  // RTL: кнопка зеркалится к правому краю (а «?»-справка уходит влево) — не конфликтуем
  const rtl = isRTLLang(language);

  const [open, setOpen] = React.useState(false);
  /**
   * ДИАЛОГ С РАЗРАБОТЧИКОМ (репорт NZT-48 «а где окно диалогов?», расшифровка
   * Дениса 28.08): вкладка-лента «мои сообщения ⇄ ответы», как в мессенджере.
   * Ответы — dev_reply (просто ответ) и fix_note с версией (ответ-починка).
   */
  const [tab, setTab] = React.useState<'form' | 'dialog'>('form');
  const [dialog, setDialog] = React.useState<DialogBubble[] | null>(null);
  React.useEffect(() => {
    if (!open || tab !== 'dialog') return;
    let alive = true;
    getMyDialog().then((d) => { if (alive) setDialog(d); }).catch(() => { if (alive) setDialog([]); });
    return () => { alive = false; };
  }, [open, tab]);

  /**
   * ПЕРЕТАСКИВАНИЕ КНОПКИ. Просьба тестировщика 17.07.2026: «Кнопку чата для
   * отправки репорта можно сделать перемещаемой: нажимаем держим таким. Позиция
   * запомнилась». Кнопка висит на КАЖДОМ экране и у каждого закрывает своё:
   * жалоба пришла из игры, где она легла на поле.
   *
   * ⚠️ ПОКА НЕ ПЕРЕТАСКИВАЛИ — НИЧЕГО НЕ МЕНЯЕТСЯ. `spot === null` оставляет
   * ровно прежние стили (левый нижний угол, отступ от системной панели). Так
   * правка не может сдвинуть кнопку тем, кто её не трогал.
   */
  const [spot, setSpot] = React.useState<FabSpot | null>(null);
  const [drag, setDrag] = React.useState<{ dx: number; dy: number } | null>(null);
  /**
   * ⚠️ РАЗМЕР ЭКРАНА — ТОЛЬКО ЧЕРЕЗ ОБЩИЙ ХУК. Своя подписка на `Dimensions`
   * здесь уже стояла и уже сломалась: на первом кадре размер нулевой, доля
   * умножалась на ноль, и после перезагрузки перетащенная кнопка оказывалась
   * в левом верхнем углу (проверено живьём 21.08.2026: 344×360 → 6×6).
   */
  const win = useScreenSize();
  React.useEffect(() => {
    AsyncStorage.getItem(FAB_SPOT_KEY).then((raw) => setSpot(readSpot(raw))).catch(() => {});
  }, []);

  /** Где кнопка сейчас — с учётом пальца, который её ведёт. */
  const placed = spot ? spotToPixels(spot, win, insets) : null;
  const live = placed && drag
    ? { left: placed.left + drag.dx, top: placed.top + drag.dy }
    : placed;

  /**
   * ⚠️ ПОРОГ, А НЕ УДЕРЖАНИЕ ПО ТАЙМЕРУ. Обычный тап обязан открывать окно
   * отзыва; забирать жест по таймеру значит делать открытие лотереей «успел
   * отпустить». Пока палец не сдвинулся на порог, жест целиком остаётся у
   * кнопки, и `onPress` срабатывает как раньше.
   */
  const spotRef = React.useRef<FabSpot | null>(null);
  spotRef.current = spot;
  const baseRef = React.useRef<{ left: number; top: number } | null>(null);
  const winRef = React.useRef(win);
  winRef.current = win;
  const insetsRef = React.useRef(insets);
  insetsRef.current = insets;

  const pan = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      /**
       * 🔴 ПЕРЕХВАТ, А НЕ ОБЫЧНЫЙ ЗАПРОС. Жест начинается на самой кнопке, и
       * ответчиком становится она — обычный `onMoveShouldSetPanResponder` у
       * родителя в этом случае не спрашивают вовсе. Проверено живьём: с ним
       * кнопка не двигалась ни на пиксель, а перетаскивание засчитывалось как
       * тап и открывало окно отзыва. Перехват на фазе всплытия вниз забирает
       * жест у кнопки, но ТОЛЬКО после порога — тап по-прежнему её.
       */
      onMoveShouldSetPanResponderCapture: (_e, g) => isDrag(g.dx, g.dy),
      onPanResponderGrant: () => {
        const w = winRef.current;
        const i = insetsRef.current;
        baseRef.current = spotRef.current
          ? spotToPixels(spotRef.current, w, i)
          // Первый перенос: отсчитываем от того места, где кнопка висела по умолчанию.
          : { left: 14, top: w.h - i.bottom - FAB_BOTTOM - FAB_SIZE };
      },
      onPanResponderMove: (_e, g) => setDrag({ dx: g.dx, dy: g.dy }),
      onPanResponderRelease: (_e, g) => {
        const b = baseRef.current;
        setDrag(null);
        if (!b) return;
        const next = toSpot(b.left + g.dx, b.top + g.dy, winRef.current);
        setSpot(next);
        AsyncStorage.setItem(FAB_SPOT_KEY, JSON.stringify(next)).catch(() => {});
      },
      onPanResponderTerminate: () => setDrag(null),
    }),
  ).current;

  /**
   * 🔴 ПОКА ОТКРЫТ ОТЗЫВ — ИГРА ЗАМИРАЕТ. Репорт 18.08.2026: «пока я писала
   * отзыв, игра моя закончилась… несправедливость». Репорт не должен стоить
   * человеку партии: это единственный канал, по которому мы узнаём о проблемах.
   *
   * ЕДИНСТВЕННЫЙ ИСТОЧНИК ПАУЗЫ. Рядом жили ещё четыре ручных `emit` булева
   * эвента — открыли «да», три закрытия «нет». Пятый выход (свайп, системный
   * «назад») никто бы не вспомнил, и игра осталась бы замороженной. Эффект по
   * `open` снимает паузу сам: и на закрытии, и на размонтировании виджета.
   */
  React.useEffect(() => {
    if (!open) return;
    const release = holdGame();
    return release;
  }, [open]);
  const [kind, setKind] = React.useState<FeedbackKind>('confusion');
  const [text, setText] = React.useState('');
  const [shot, setShot] = React.useState<Blob | null>(null);
  // v1.166 (идея Дениса «нажал и записал: нихуя не понимаю что делать»):
  // голосовая заметка РЯДОМ с текстом. Валя диктует всё голосом, и до нас
  // доезжает распознавание её телефона — «глубоко запечатательное дыхание»
  // вместо «диафрагмальное». Оригинал звука снимает этот слой потерь.
  const [rec, setRec] = React.useState<Recorder | null>(null);
  /**
   * 🔴 ЖИВОЙ УРОВЕНЬ, А НЕ ТОЛЬКО СЕКУНДЫ.
   *
   * До этого во время записи было видно ровно одно — бегущее время. Немая запись
   * выглядела ТОЧНО ТАК ЖЕ, как говорящая: те же цифры, тот же красный кружок.
   * Замер по боевой базе 20.08.2026: с одного устройства 13 голосовых из 16 —
   * цифровая тишина (235 байт/с против 6300–15000 у нормальной речи), и человек
   * узнавал об этом никогда. Полоска уровня отвечает на единственный вопрос,
   * который у него есть: «меня слышно?»
   *
   * `peak` — максимум за всю запись, а не мгновенный: подпись не должна мигать
   * «слышим / не слышим» в паузах между словами.
   */
  const [lvl, setLvl] = React.useState({ sec: 0, level: 0, peak: 0 });
  const [note, setNote] = React.useState<VoiceNote | null>(null);
  const [micDenied, setMicDenied] = React.useState(false);
  /** Запись получилась, но звука в ней нет — микрофон не отдал сэмплы. */
  const [micSilent, setMicSilent] = React.useState(false);
  /** Человек увидел предупреждение о немой записи и решил отправить как есть. */
  const [silentAck, setSilentAck] = React.useState(false);
  /** Запись остановилась сама, упершись в потолок длины. */
  const [ceilingHit, setCeilingHit] = React.useState(false);

  /** Проигрывание записи перед отправкой — единственная честная проверка, что голос попал. */
  const [playing, setPlaying] = React.useState(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  React.useEffect(() => () => {
    // URL блоба живёт до отзыва: не отзовём — утечёт память на каждой перезаписи.
    try { audioRef.current?.pause(); } catch { /* уже мёртв */ }
    if (audioRef.current?.src) URL.revokeObjectURL(audioRef.current.src);
  }, []);

  const playNote = () => {
    if (!note) return;
    if (audioRef.current && playing) { try { audioRef.current.pause(); } catch { /* */ } setPlaying(false); return; }
    try {
      if (audioRef.current?.src) URL.revokeObjectURL(audioRef.current.src);
      const a = audioRef.current ?? new Audio();
      a.src = URL.createObjectURL(note.blob);
      a.onended = () => setPlaying(false);
      a.onerror = () => setPlaying(false);
      audioRef.current = a;
      a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } catch { setPlaying(false); }
  };

  /**
   * Забрать запись и оценить её. Отдельно от кнопки, потому что остановить может
   * не только человек: запись упирается в потолок длины и глохнет сама, и тогда
   * заметку надо подобрать ровно так же, иначе интерфейс останется «записывающим»
   * при мёртвом рекордере — ровно то, что случилось с заметкой на 648 секунд.
   */
  const recRef = React.useRef<Recorder | null>(null);
  const finishRecording = async () => {
    const r = recRef.current;
    if (!r) return;
    recRef.current = null;
    const v = await r.stop();
    setRec(null); setLvl({ sec: 0, level: 0, peak: 0 });
    if (v) setNote(v);
    // Немая запись — не молчим об этом. Две Валины заметки уехали полностью
    // немыми (замер: −91 дБ, цифровая тишина), и по интерфейсу это выглядело
    // как успешная отправка. Лучше сказать сразу, чем принять три минуты в пустоту.
    //
    // ⚠️ ТОЛЬКО ЕСЛИ УРОВЕНЬ ВООБЩЕ ЗАМЕРЯЛСЯ. `measured: false` означает, что
    // анализатор не отработал ни разу (нет AudioContext, или он не проснулся), и
    // тогда peak = 0 — это «не знаем», а не «тишина». Обвинить исправный микрофон
    // хуже, чем промолчать: человек полезет в настройки разрешений на пустом месте.
    //
    // ⚠️ ВТОРОЙ, НЕЗАВИСИМЫЙ ПОВОД — САМА ДОРОЖКА. Пик это вывод из сэмплов, а
    // `muted` — прямой ответ устройства «звук не отдаю». Он не требует ни
    // анализатора, ни проснувшегося AudioContext, поэтому работает там, где
    // замер невозможен, и именно он ловит случай «микрофон отобрали посреди
    // записи»: на старте было тихо-нормально, а в файле половина пустоты.
    setMicSilent(shouldWarnSilent(v));
  };

  const toggleRecord = async () => {
    if (recRef.current) { await finishRecording(); return; }
    setMicDenied(false); setMicSilent(false); setSilentAck(false); setCeilingHit(false);
    try {
      setNote(null);
      const r = await startRecording(
        (sec, level) => setLvl((p) => ({ sec, level, peak: Math.max(p.peak, level) })),
        () => { setCeilingHit(true); void finishRecording(); },
      );
      recRef.current = r;
      setRec(r);
    } catch {
      // Отказ в микрофоне — не ошибка: человек просто пишет текстом.
      setMicDenied(true);
    }
  };

  /** Убрать запись (крестик или выбор «напишу текстом») — вместе со всеми её ярлыками. */
  const dropNote = () => { setNote(null); setMicSilent(false); setSilentAck(false); setCeilingHit(false); };
  const [attachShot, setAttachShot] = React.useState(true);
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  // Что именно уехало — показываем на экране «спасибо». Без этого голосовой
  // репорт уходил вслепую: значок 🙏 выглядел одинаково и когда запись дошла,
  // и когда потерялась (репорт Rulon, v1.170).
  const [outcome, setOutcome] = React.useState<SendResult | null>(null);
  // html2canvas снимает 1-3 сек. Без индикации тестировщик решит, что кнопка
  // не сработала, и натыкает ещё (проверено вживую) → спиннер + защита от дабл-тапа.
  const [capturing, setCapturing] = React.useState(false);
  // Уровень запущенной игры для контекста репорта. Приближение: читаем сам
  // ключ прогресса usePersistentLevel (`psygames_<gameId>_level_<profileId>`),
  // а не живое состояние экрана — обычно совпадает. null = не игра/нет прогресса.
  const [level, setLevel] = React.useState<number | null>(null);
  // v1.125.0: пользователь может скрыть кнопку галочкой в настройках («кнопка мешается
  // в игре»). Перечитываем при навигации; v1.148 — плюс живое событие из настроек
  // (репорт Rulon: тумблер «не работал», пока не уйдёшь с экрана).
  const [hidden, setHidden] = React.useState(false);
  React.useEffect(() => {
    getDevChatVisible().then((on) => setHidden(!on)).catch(() => {});
  }, [pathname]);
  React.useEffect(() => {
    const sub = DeviceEventEmitter.addListener(DEVCHAT_VISIBLE_EVENT, (on: boolean) => setHidden(!on));
    return () => sub.remove();
  }, []);

  /**
   * 🔴 Подписка на «открой виджет» ДОЛЖНА стоять ДО возврата ниже.
   *
   * Раньше она была под ним, и это роняло ВСЁ ПРИЛОЖЕНИЕ, стоило человеку выключить
   * кнопку отзыва в настройках: пока кнопка видна, хуков больше; скрыли — на два
   * меньше, число не сходится, и React валит экран «Rendered fewer hooks than
   * expected». Не только виджет — весь экран, на любом маршруте.
   *
   * Замер 12.08.2026: чистый браузер, единственное действие — psygames_devchat_on=0.
   * Главная падает сразу. Нашлось при съёмке скриншотов для магазина, когда кнопку
   * потребовалось убрать из кадра.
   *
   * Через ref, а не прямым захватом openSheet: подписка живёт одна на всё время жизни
   * виджета, а openSheet читает текущий экран, игру и уровень. Захвати мы его напрямую
   * с пустыми зависимостями — репорт уезжал бы с данными первого рендера, то есть
   * с чужой игрой и чужим уровнем.
   */
  const openSheetRef = React.useRef<() => void>(() => {});
  React.useEffect(() => {
    const sub = DeviceEventEmitter.addListener(FEEDBACK_OPEN_EVENT, () => { openSheetRef.current(); });
    return () => sub.remove();
  }, []);

  if (!FEEDBACK_ENABLED || hidden) return null;

  const gameId = pathname.startsWith('/games/')
    ? pathname.replace('/games/', '').replace(/\/+$/, '') || undefined
    : undefined;

  const openSheet = async () => {
    if (capturing) return;                 // защита от дабл-тапа во время съёмки
    setCapturing(true);
    const s = await captureScreenshot();   // снимаем ДО показа шторки
    setCapturing(false);
    setShot(s);
    // Читаем сохранённый уровень запущенной игры по тому же ключу, что и
    // usePersistentLevel — чтобы в репорт попало «на каком уровне застряли».
    let lvl: number | null = null;
    if (gameId) {
      try {
        const raw = await AsyncStorage.getItem(`psygames_${gameId}_level_${profile.id}`);
        const n = parseInt(raw ?? '', 10);
        if (Number.isFinite(n)) lvl = n;
      } catch {}
    }
    setLevel(lvl);
    setKind('confusion');
    // Текст НЕ чистим при открытии — только после успешной отправки.
    // «Начал писать — решил посмотреть экран — вернулся, а поле пустое»: репорт
    // с v1.121. Человек закрывает окно именно чтобы свериться с тем, на что
    // жалуется, и терять из-за этого написанное — ровно то поведение, из-за
    // которого перестают писать вообще.
    setAttachShot(true);
    setSent(false);
    setOpen(true);   // пауза наступает от эффекта по `open`, см. выше
  };

  /**
   * Открытие снаружи: из окна правил, которое накрывает плавающую кнопку собой.
   *
   * Через ref, а не прямым захватом openSheet: подписка живёт одна на всё время
   * жизни виджета, а openSheet читает текущий экран, игру и уровень. Захвати мы
   * его напрямую с пустыми зависимостями — репорт уезжал бы с данными первого
   * рендера, то есть с чужой игрой и чужим уровнем.
   */
  openSheetRef.current = openSheet;

  /**
   * Показать выбор вместо кнопки «Отправить»: запись есть, звука в ней нет, и
   * человек ещё не сказал, что делать. Не «заблокировать отправку» — именно
   * развилка, потому что порог отличает тишину от звука, но не голос от шума,
   * а говорить могли шёпотом.
   */
  const askSilent = !!note && micSilent && !silentAck;

  /**
   * @param ackSilent человек увидел «мы вас не слышим» и выбрал отправить как есть.
   *
   * ⚠️ ЯВНЫМ АРГУМЕНТОМ, А НЕ ЧТЕНИЕМ `silentAck`. Кнопка согласия ставит флаг и
   * тут же зовёт отправку — состояние к этому моменту ещё не перерисовалось, и
   * чтение `silentAck` вернуло бы старое `false`. Отправка молча не произошла бы.
   */
  const submit = async (ackSilent = false) => {
    // Голосом БЕЗ текста — полноценный репорт: ради этого запись и делали.
    // Раньше здесь стояло `if (!text.trim())`, а кнопка при этом была активна,
    // если есть запись, — человек жал «Отправить», не происходило ничего, и он
    // решал, что отзывы не уходят (репорт Rulon, v1.170). Условие должно
    // совпадать с условием доступности кнопки, иначе кнопка врёт.
    if ((!text.trim() && !note) || sending) return;
    /**
     * 🔴 НЕМУЮ ЗАПИСЬ НЕ ОТПРАВЛЯЕМ МОЛЧА.
     *
     * Мы ЗНАЕМ в момент отправки, что микрофон не отдал звук — уровень замерен и
     * лежит в `audio_peak`. Раньше это знание уходило в базу, а человеку не
     * доставалось: он жал «отправить», видел «спасибо» и уходил уверенный, что
     * рассказал. Ровно против этого и заводился обратный контур.
     *
     * Запрета тут нет и быть не может: человек мог говорить шёпотом или в шумном
     * месте, а порог различает тишину и звук, но не голос и шум. Поэтому —
     * предупреждение и ВЫБОР, а решает он.
     */
    if (note && micSilent && !silentAck && !ackSilent) return;
    setSending(true);
    const res = await sendFeedback({
      kind,
      // Пустое сообщение читается в выгрузке как «потерялось»; ставим явную
      // пометку, чтобы было видно: смысл в записи, расшифровать её.
      message: text.trim() || '[голосом, без текста]',
      screen: pathname,
      gameId,
      shot: attachShot ? shot : null,
      // ⚠️ peak ОБЯЗАТЕЛЕН. Здесь собирали объект из трёх полей и роняли четвёртое,
      // поэтому `audio_peak` в контексте репорта был null у ВСЕХ 26 голосовых: замер,
      // ради которого в v1.190 заводили AnalyserNode, до базы не доезжал ни разу.
      // Уровень со стороны сервера считает ffmpeg, но это уже посмертно — а нужен
      // ответ на вопрос «телефон отдал звук или нет» в момент отправки.
      audio: note ? { blob: note.blob, seconds: note.seconds, mime: note.mime, peak: note.peak, measured: note.measured, track: note.track, source: note.source, access: note.access, micGate: note.micGate } : null,
      // profile/level — чтобы в репорте было видно, под каким профилем и на
      // каком уровне игры это словили (не гадать по скриншоту).
      context: {
        language, theme: colors.background,
        profile: profile.id, profileName: profile.display_name,
        level,
      },
    });
    setSending(false);
    // Очередь — тоже успех для человека: написанное сохранено и уйдёт само.
    // Ошибкой считаем только случай, когда не сохранили вообще ничего.
    if (res.ok || res.queued) {
      setOutcome(res);
      setSent(true);
      setText('');   // единственное место, где черновик стирается — после доставки
      setNote(null); setMicSilent(false); setSilentAck(false); setCeilingHit(false);
      /**
       * Дольше 1.3 с: тут теперь есть что прочитать, а не один значок.
       * Закрыть можно и раньше — крестик остаётся на месте.
       *
       * ⚠️ ПЛОХУЮ НОВОСТЬ ЧИТАЮТ ДОЛЬШЕ ХОРОШЕЙ. «Спасибо» узнаётся по значку за
       * долю секунды, а «запись не загрузилась — дошёл только текст» надо прочесть
       * и понять, что делать дальше. Отдавать на это те же 3.2 секунды — почти то
       * же самое, что не сказать: человек увидит, что шторка мигнула, и не успеет.
       */
      setTimeout(() => { setOpen(false); setShot(null); }, res.audioLost ? 9000 : 3200);
    } else {
      setText((t) => t);   // оставляем текст, чтобы не потерять написанное
      alert(t('feedbackSendFailed'));
    }
  };

  return (
    <>
      <View
        {...pan.panHandlers}
        style={[
          styles.fab,
          live
            ? { left: live.left, top: live.top }
            : [rtl ? { right: 14 } : { left: 14 }, { bottom: insets.bottom + FAB_BOTTOM }],
        ]}
      >
      <TouchableOpacity
        accessibilityRole="button"
        onPress={openSheet}
        activeOpacity={0.85}
        accessibilityLabel={t('feedbackFabLabel')}
        style={[styles.fabInner, { backgroundColor: '#ef4444' }, drag ? { opacity: 1 } : null]}
      >
        {capturing
          ? <ActivityIndicator size="small" color={textOn('#ef4444')} />
          : <Ionicons name="chatbubble-ellipses" size={19} color={textOn('#ef4444')} />}
      </TouchableOpacity>
      </View>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View {...a11yModal} style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
            <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
              <View style={styles.header}>
                <Text style={[styles.title, { color: colors.text }]}>
                  {t('feedbackTitle')}
                </Text>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('close')}
                  onPress={() => setOpen(false)} style={{ padding: 4 }}>
                  <Ionicons name="close-circle" size={28} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Две вкладки: написать / диалог. Диалог — то самое «окно диалогов». */}
              <View style={styles.tabRow}>
                {([['form', 'feedbackTabWrite'], ['dialog', 'feedbackTabDialog']] as const).map(([id, key]) => (
                  <TouchableOpacity
                    key={id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: tab === id }}
                    testID={`fb-tab-${id}`}
                    onPress={() => setTab(id)}
                    style={[styles.tabBtn, {
                      backgroundColor: tab === id ? colors.primary : 'transparent',
                      borderColor: tab === id ? colors.primary : colors.border,
                    }]}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '700', color: tab === id ? '#fff' : colors.text }}>{t(key)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {tab === 'dialog' && (
                <View style={styles.dialogWrap} testID="fb-dialog">
                  {dialog === null && <Text style={{ color: colors.textSecondary, textAlign: 'center', padding: 16 }}>…</Text>}
                  {dialog !== null && dialog.length === 0 && (
                    <Text style={{ color: colors.textSecondary, textAlign: 'center', padding: 16, lineHeight: 20 }}>{t('dialogEmpty')}</Text>
                  )}
                  {dialog !== null && dialog.map((b) => (
                    <View key={b.key} style={[styles.bubble, b.who === 'me'
                      ? { alignSelf: 'flex-end', backgroundColor: colors.primary }
                      : { alignSelf: 'flex-start', backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }]}
                    >
                      {b.fixedIn && (
                        <Text style={[styles.bubbleBadge, { color: b.who === 'me' ? 'rgba(255,255,255,0.85)' : colors.primary }]}>
                          ✅ {t('dialogFixedIn').replace('{v}', b.fixedIn)}
                        </Text>
                      )}
                      <Text style={{ fontSize: 13.5, lineHeight: 19, color: b.who === 'me' ? '#fff' : colors.text }}>
                        {b.text || `🎤 ${t('dialogVoiceNote')}`}
                      </Text>
                      <Text style={[styles.bubbleAt, { color: b.who === 'me' ? 'rgba(255,255,255,0.7)' : colors.textSecondary }]}>
                        {(b.at || '').slice(0, 16).replace('T', ' ')}
                      </Text>
                    </View>
                  ))}
                  <TouchableOpacity accessibilityRole="button" onPress={() => setTab('form')}
                    style={[styles.dialogWriteBtn, { borderColor: colors.primary }]}>
                    <Ionicons name="create-outline" size={16} color={colors.primary} />
                    <Text style={{ fontSize: 13.5, fontWeight: '700', color: colors.primary }}>{t('feedbackTabWrite')}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {tab === 'form' && (<>

              {sent ? (
                <View style={styles.thanks}>
                  <Text style={{ fontSize: 44 }}>{outcome?.audioLost ? '⚠️' : '🙏'}</Text>
                  <Text style={[styles.title, { color: colors.text, textAlign: 'center' }]}>
                    {outcome?.queued ? t('feedbackQueued') : t('feedbackThanks')}
                  </Text>
                  {/* Судьба записи — отдельной строкой и словами. «Спасибо» само
                      по себе не отличает «голос у нас» от «голос потерялся». */}
                  {outcome?.audioSent && (
                    <Text style={[styles.outcomeLine, { color: colors.textSecondary }]}>
                      🎤 {t('feedbackAudioSent')}
                    </Text>
                  )}
                  {outcome?.audioLost && (
                    <Text style={[styles.outcomeLine, { color: '#e0574a' }]}>
                      {t('feedbackAudioLost')}
                    </Text>
                  )}
                </View>
              ) : (
                <>
                  {/* Контекст репорта: профиль · игра · уровень — тестировщику
                      видно, что уедет вместе с текстом (и это же летит в context). */}
                  <Text numberOfLines={1} style={[styles.ctx, { color: colors.textSecondary }]}>
                    {[
                      `👤 ${profile.display_name}`,
                      gameId ? `🎮 ${gameId}` : null,
                      gameId && level != null ? `${t('unitLevelShort')} ${level}` : null,
                    ].filter(Boolean).join('  ·  ')}
                  </Text>
                  <Text style={[styles.hint, { color: colors.textSecondary }]}>
                    {t('feedbackHint')}
                  </Text>

                  <View style={styles.kinds}>
                    {KINDS.map((k) => {
                      const on = kind === k.key;
                      return (
                        <TouchableOpacity
                          accessibilityRole="button"
                          key={k.key}
                          onPress={() => setKind(k.key)}
                          style={[
                            styles.kindBtn,
                            on ? { backgroundColor: '#ef4444', borderColor: '#ef4444' }
                               : { backgroundColor: colors.card, borderColor: colors.border },
                          ]}
                        >
                          <Text style={{ fontSize: 15 }}>{k.emoji}</Text>
                          {/* flexShrink+numberOfLines: при крупном шрифте подпись
                              усекается внутри трети-кнопки, а не ломает ряд */}
                          <Text numberOfLines={1} style={{ color: on ? textOn('#ef4444') : colors.text, fontWeight: '700', fontSize: 12, flexShrink: 1 }}>
                            {t(k.labelKey)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <TextInput
                    value={text}
                    onChangeText={setText}
                    multiline
                    autoFocus
                    placeholder={t('feedbackPlaceholder')}
                    placeholderTextColor={colors.textSecondary}
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
                  />

                  {canRecord() && (
                    <View style={{ gap: 6 }}>
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={rec ? t('voiceStop') : t('voiceRecord')}
                        onPress={toggleRecord}
                        style={[styles.shotRow, { borderColor: rec ? '#ef4444' : colors.border }]}
                      >
                        <Ionicons
                          name={rec ? 'stop-circle' : note ? 'checkmark-circle' : 'mic-outline'}
                          size={20}
                          color={rec ? '#ef4444' : note ? '#22c55e' : colors.textSecondary}
                        />
                        <Text style={{ color: colors.text, fontSize: 13, flex: 1 }}>
                          {rec
                            ? `${t('voiceStop')} · ${Math.floor(lvl.sec / 60)}:${String(lvl.sec % 60).padStart(2, '0')}`
                            : note
                              ? `${t('voiceAttached')} · ${note.seconds} ${t('secShort')}`
                              : t('voiceRecord')}
                        </Text>
                        {note && !rec && (
                          <Ionicons
                            name="close-circle-outline" size={19} color={colors.textSecondary}
                            onPress={dropNote}
                          />
                        )}
                      </TouchableOpacity>

                      {/* 🔴 ЖИВОЙ УРОВЕНЬ — ПОКА ЧЕЛОВЕК ГОВОРИТ, А НЕ ПОСЛЕ.
                          Единственный вопрос, который у него есть в этот момент, —
                          «меня слышно?». Раньше ответа не было вообще: тишина и речь
                          выглядели одинаково (бегущие секунды), и 13 заметок из 16 с
                          одного устройства уехали немыми, а человек об этом не узнал.
                          Ширина с запасом ×140: обычная речь даёт пик 0.3–0.7, и без
                          усиления полоска еле шевелилась бы. */}
                      {rec && !rec.native && (
                        <View
                          accessibilityRole="progressbar"
                          accessibilityLabel={t('voiceLevelLabel')}
                          style={[styles.levelTrack, { backgroundColor: colors.card, borderColor: colors.border }]}
                        >
                          <View
                            style={[styles.levelFill, {
                              width: `${Math.max(2, Math.min(100, Math.round(lvl.level * 140)))}%`,
                              backgroundColor: lvl.peak >= SILENCE_PEAK ? '#22c55e' : '#b45309',
                            }]}
                          />
                        </View>
                      )}
                      {/* Подпись по ПИКУ за запись, а не по мгновенному уровню: иначе
                          она мигала бы «слышим / не слышим» в паузах между словами.
                          Про тишину говорим не сразу — первые секунды человек ещё
                          подносит телефон и молчит. */}
                      {/* Нативная запись за мостом: уровня физически нет — говорим
                          «идёт запись» вместо полоски, которая показала бы ложную тишину. */}
                      {rec?.native && (
                        <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700' }}>
                          {t('voiceRecordingNative')}
                        </Text>
                      )}
                      {rec && !rec.native && (lvl.peak >= SILENCE_PEAK || lvl.sec >= 3) && (
                        <Text style={{
                          color: lvl.peak >= SILENCE_PEAK ? '#22c55e' : '#b45309',
                          fontSize: 12, fontWeight: '700',
                        }}>
                          {lvl.peak >= SILENCE_PEAK ? t('voiceLevelHearing') : t('voiceLevelSilence')}
                        </Text>
                      )}
                      {/* Потолок длины: запись глохнет сама, и об этом надо сказать —
                          иначе человек продолжает говорить в мёртвый рекордер. Именно
                          так вышли заметки на 495, 540 и 648 секунд при потолке 180. */}
                      {ceilingHit && !rec && (
                        <Text style={{ color: '#b45309', fontSize: 12, fontWeight: '700' }}>
                          {t('voiceCeilingReached')}
                        </Text>
                      )}
                      {/* Прослушать ДО отправки. Пороги громкости отличают тишину от звука,
                          но не голос от шума: четыре заметки от 07.08 имели пик −1.2 дБ и не
                          содержали речи — щелчки и шорох рук. Человек говорил больше минуты
                          и получил «спасибо» за пустоту. Ухо решает это за секунду, никакой
                          порог не нужен. */}
                      {note && !rec && (
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel={t('voicePlay')}
                          onPress={playNote}
                          style={[styles.shotRow, { borderColor: colors.border }]}
                        >
                          <Ionicons
                            name={playing ? 'pause-circle' : 'play-circle'}
                            size={20}
                            color={colors.textSecondary}
                          />
                          <Text style={{ color: colors.text, fontSize: 13, flex: 1 }}>{t('voicePlay')}</Text>
                        </TouchableOpacity>
                      )}
                      {micDenied && (
                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{t('voiceDenied')}</Text>
                      )}
                      {micSilent && !micDenied && !askSilent && (
                        <Text style={{ color: '#b45309', fontSize: 12, fontWeight: '700' }}>
                          {staleWebViewMajor() !== null ? t('voiceStaleWebView').replace('{v}', String(staleWebViewMajor())) : t('voiceSilent')}
                        </Text>
                      )}
                      {note && !rec && !micSilent && (
                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{t('voiceCheckHint')}</Text>
                      )}
                    </View>
                  )}

                  {shot && (
                    <TouchableOpacity
                      accessibilityRole="button"
                      onPress={() => setAttachShot((v) => !v)}
                      style={[styles.shotRow, { borderColor: colors.border }]}
                    >
                      <Ionicons
                        name={attachShot ? 'checkbox' : 'square-outline'}
                        size={20}
                        color={attachShot ? '#22c55e' : colors.textSecondary}
                      />
                      <Text style={{ color: colors.text, fontSize: 13, flex: 1 }}>
                        {t('feedbackAttachShot')}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {askSilent ? (
                    /* 🔴 РАЗВИЛКА ВМЕСТО «ОТПРАВИТЬ». Кнопка отправки здесь не просто
                       отключена — её нет: отключённая кнопка при живом намерении врёт
                       ровно так же, как молчаливая отправка (этим уже обжигались,
                       см. комментарий в submit). Человек видит, ПОЧЕМУ, и выбирает. */
                    <View style={[styles.silentBox, { borderColor: '#b45309', backgroundColor: colors.card }]}>
                      <Text style={[styles.silentTitle, { color: '#b45309' }]}>⚠️ {t('voiceSilentTitle')}</Text>
                      {/* Замер 28.08: все 45 немых записей — один OnePlus с WebView Chrome/90
                          при ВЫДАННОМ разрешении. Совет «проверьте разрешение» там ложный;
                          называем настоящую причину и настоящий шаг — обновить WebView. */}
                      <Text style={{ color: colors.text, fontSize: 12.5, lineHeight: 17 }}>
                        {staleWebViewMajor() !== null ? t('voiceStaleWebView').replace('{v}', String(staleWebViewMajor())) : t('voiceSilent')}
                      </Text>
                      <View style={styles.silentBtns}>
                        <TouchableOpacity
                          accessibilityRole="button"
                          onPress={dropNote}
                          style={[styles.silentBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                        >
                          <Text numberOfLines={2} style={[styles.silentBtnText, { color: colors.text }]}>
                            {t('voiceWriteInstead')}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          accessibilityRole="button"
                          onPress={() => { setSilentAck(true); void submit(true); }}
                          disabled={sending}
                          style={[styles.silentBtn, { borderColor: '#b45309', backgroundColor: '#b45309' }]}
                        >
                          {sending
                            ? <ActivityIndicator color="#fff" />
                            : <Text numberOfLines={2} style={[styles.silentBtnText, { color: '#fff' }]}>
                                {t('voiceSendAnyway')}
                              </Text>}
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity
                      accessibilityRole="button"
                      onPress={() => submit()}
                      disabled={(!text.trim() && !note) || sending}
                      style={[styles.send, { backgroundColor: (text.trim() || note) ? '#ef4444' : colors.border }]}
                    >
                      {sending
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={styles.sendText}>{t('send')}</Text>}
                    </TouchableOpacity>
                  )}
                </>
              )}
              </>)}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Вкладки «написать/диалог» и лента-мессенджер (окно диалогов, NZT-48)
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tabBtn: { flex: 1, minHeight: 44, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dialogWrap: { gap: 8, paddingBottom: 8 },
  bubble: { maxWidth: '86%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, gap: 3 },
  bubbleBadge: { fontSize: 11.5, fontWeight: '800' },
  bubbleAt: { fontSize: 10.5 },
  dialogWriteBtn: {
    flexDirection: 'row', gap: 6, alignSelf: 'center', alignItems: 'center', justifyContent: 'center',
    minHeight: 44, paddingHorizontal: 16, borderRadius: 11, borderWidth: 1, marginTop: 6,
  },
  // Слева (в RTL — справа, сторона задаётся в рендере) и ПОДНЯТА над нижними CTA
  // («Справка»/«Начать» на интро-экранах игр — проверено вживую: на bottom+16
  // кнопка налезала на «Справку»). «?»-оверлей висит с противоположной стороны
  // сверху — туда не лезем.
  /** Обёртка держит МЕСТО и жест переноса; вид — у `fabInner`. */
  fab: {
    position: 'absolute',
    width: 48,
    height: 48,
    zIndex: 100,
  },
  fabInner: {
    /**
     * ⚠️ 48 — общий минимум попадания пальцем. Кнопка висит на КАЖДОМ экране
     * приложения, и промах по ней означает не «не нажалось», а тап по тому, что
     * под ней: по игровому полю или по кнопке рядом. Замер 19.08.2026: было 42.
     */
    width: 48,
    height: 48,
    borderRadius: 21,
    opacity: 0.92,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '88%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  title: { fontSize: 19, fontWeight: '800' },
  ctx: { fontSize: 12, fontWeight: '700', marginBottom: 4 },   // строка контекста: профиль · игра · уровень
  hint: { fontSize: 12, marginBottom: 12, lineHeight: 17 },
  kinds: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  kindBtn: { minHeight: 48,
    flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 10, borderRadius: 16, borderWidth: 1.5,
  },
  input: {
    borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 15,
    minHeight: 110, textAlignVertical: 'top', marginBottom: 12,
  },
  shotRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 14,
  },
  // Полоска живого уровня микрофона. Тонкая и во всю ширину — она отвечает на
  // «меня слышно?», а не претендует на место в вёрстке.
  levelTrack: {
    height: 10, borderRadius: 5, borderWidth: 1, overflow: 'hidden',
    marginBottom: 2, justifyContent: 'center',
  },
  levelFill: { height: '100%', borderRadius: 5 },
  silentBox: { borderWidth: 1.5, borderRadius: 12, padding: 12, gap: 8 },
  silentTitle: { fontSize: 14, fontWeight: '800' },
  silentBtns: { flexDirection: 'row', gap: 8, marginTop: 2 },
  // minHeight 48 — тот же минимум попадания пальцем, что и у плавающей кнопки.
  silentBtn: {
    flex: 1, minWidth: 0, minHeight: 48, borderWidth: 1.5, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 10,
  },
  silentBtnText: { fontWeight: '800', fontSize: 12.5, textAlign: 'center' },
  send: { paddingVertical: 15, borderRadius: 12, alignItems: 'center' },
  sendText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  thanks: { alignItems: 'center', gap: 10, paddingVertical: 30 },
  outcomeLine: { fontSize: 13.5, fontWeight: '700', textAlign: 'center', paddingHorizontal: 16 },
});
