/**
 * Фонемы: минимальные пары (Полиглот, game_id 'phoneme_pairs').
 * TTS произносит ОДНО слово из минимальной пары (ship/sheep) — игрок выбирает
 * услышанное из двух написаний. Тренировка фонематического слуха L2.
 * Лесенка: L1-5 лёгкая половина пар + показ прозвучавшего слова; L6-10 весь
 * список; L11+ слепой режим (только звук верно/неверно). Replay не штрафуется.
 */
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { speak, ttsAvailable, ttsCancel } from '@/src/services/tts';
import { sndCorrect, sndWrong } from '@/src/services/feedback';
import GameResult from '@/src/components/GameResult';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';

const GRADIENT = ['#f7971e', '#ffd200'];
const STORE_KEY = 'psygames_phoneme_pairs_targetlang';

type GamePhase = 'config' | 'playing' | 'cleared' | 'result';

// Минимальные пары. Порядок = сложность: ПЕРВАЯ половина списка — «лёгкие»
// (контраст хорошо различим в TTS), вторая — тоньше. Только пары, которые
// системный синтез реально произносит различимо.
const MINIMAL_PAIRS: Record<string, [string, string][]> = {
  en: [
    // easy half — чёткие гласные контрасты /æ e ʌ/ + разные слоги
    ['snack', 'snake'],
    ['paper', 'pepper'],
    ['walk', 'work'],
    ['fan', 'fun'],
    ['cat', 'cut'],
    ['hat', 'hut'],
    ['coat', 'caught'],
    ['pen', 'pan'],
    ['bad', 'bed'],
    // harder half — долгота /ɪ iː/, /ʊ uː/
    ['bat', 'bet'],
    ['men', 'man'],
    ['ship', 'sheep'],
    ['sit', 'seat'],
    ['live', 'leave'],
    ['cheap', 'chip'],
    ['full', 'fool'],
    ['pool', 'pull'],
    ['luck', 'lock'],
  ],
  es: [
    // easy half — гласные и звонкость
    ['casa', 'cosa'],
    ['mesa', 'misa'],
    ['peso', 'piso'],
    ['tos', 'dos'],
    ['cana', 'caña'],
    ['pena', 'peña'],
    // harder half — r/rr и ll
    ['pero', 'perro'],
    ['caro', 'carro'],
    ['coro', 'corro'],
    ['moro', 'morro'],
    ['polo', 'pollo'],
    ['vale', 'valle'],
  ],
  de: [
    // easy half — качество гласного (o/ö, e/ö) и явная долгота
    ['schon', 'schön'],
    ['kennen', 'können'],
    ['Beet', 'Bett'],
    ['Stadt', 'Staat'],
    ['Ofen', 'offen'],
    ['Wahl', 'Wall'],
    // harder half — долгота i/ü
    ['Miete', 'Mitte'],
    ['bieten', 'bitten'],
    ['Hüte', 'Hütte'],
    ['fühlen', 'füllen'],
    ['Höhle', 'Hölle'],
  ],
  pt: [
    // easy half — согласные/гласные с чётким контрастом (pt-BR)
    ['faca', 'vaca'],
    ['tia', 'dia'],
    ['mala', 'mola'],
    ['bola', 'bolo'],
    // harder half — r/rr, s/z, носовые, открытость гласного
    ['caro', 'carro'],
    ['casar', 'caçar'],
    ['pão', 'pau'],
    ['avô', 'avó'],
    ['vovô', 'vovó'],
  ],
  ru: [
    // easy half — глухость/звонкость, ы/и, у/ю
    ['дом', 'том'],
    ['почка', 'бочка'],
    ['шест', 'жест'],
    ['мышка', 'мишка'],
    ['лук', 'люк'],
    ['банка', 'банька'],
    // harder half — мягкость на конце / после согласной
    ['полка', 'полька'],
    ['мел', 'мель'],
    ['угол', 'уголь'],
    ['кров', 'кровь'],
    ['рад', 'ряд'],
    ['быть', 'бить'],
  ],
};

const LANG_NAMES: Record<string, string> = {
  en: 'English', es: 'Español', pt: 'Português', de: 'Deutsch', ru: 'Русский',
};
const TARGET_LANGS = Object.keys(MINIMAL_PAIRS);

interface Trial {
  words: [string, string];   // порядок на кнопках (перемешан)
  correctIdx: 0 | 1;         // какое слово прозвучит
}

// Лесенка: L1-5 — 8 проб, лёгкая половина пар, после ответа показываем слово;
// L6-10 — 10 проб, весь список; L11+ — 12 проб, слепой режим (только звук).
function levelParams(level: number): { trials: number; easyOnly: boolean; showWord: boolean; blind: boolean } {
  if (level <= 5) return { trials: 8, easyOnly: true, showWord: true, blind: false };
  if (level <= 10) return { trials: 10, easyOnly: false, showWord: false, blind: false };
  return { trials: 12, easyOnly: false, showWord: false, blind: true };
}

function buildTrials(pairs: [string, string][], count: number): Trial[] {
  const out: Trial[] = [];
  for (let i = 0; i < count; i++) {
    const pair = pairs[Math.floor(Math.random() * pairs.length)];
    const swap = Math.random() < 0.5;
    const words: [string, string] = swap ? [pair[1], pair[0]] : [pair[0], pair[1]];
    out.push({ words, correctIdx: Math.random() < 0.5 ? 0 : 1 });
  }
  return out;
}

export default function PhonemePairsGame() {
  const { colors } = useTheme();
  const { language } = useLanguage();
  const lvl = usePersistentLevel('phoneme_pairs');
  const ru = language === 'ru';

  const { isPreset, str } = useGamePreset();

  const [phase, setPhase] = useState<GamePhase>('config');
  const [targetLang, setTargetLang] = useState<string>(() => {
    const p = str('targetLang', '');
    if (p && MINIMAL_PAIRS[p]) return p;
    return language === 'en' ? 'es' : 'en';
  });

  const [idx, setIdx] = useState(0);
  const [answered, setAnswered] = useState<0 | 1 | null>(null);
  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [clearedPassed, setClearedPassed] = useState(true);

  const trialsRef = useRef<Trial[]>([]);
  const hitsRef = useRef(0);
  const errorsRef = useRef(0);
  const replaysRef = useRef(0);
  const levelRef = useRef(1);
  const paramsRef = useRef(levelParams(1));
  const tgtRef = useRef('en');
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const advanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // язык тренировки не должен совпадать с языком интерфейса
  const tgt = targetLang === language ? (language === 'en' ? 'es' : 'en') : targetLang;
  const voiceOk = ttsAvailable(tgt);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (advanceRef.current) clearTimeout(advanceRef.current);
    ttsCancel();
  }, []);

  // восстановить сохранённый выбор языка (не в пресете — там параметры рулят)
  useEffect(() => {
    if (isPreset) return;
    AsyncStorage.getItem(STORE_KEY).then((v) => {
      if (v && MINIMAL_PAIRS[v]) setTargetLang(v);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет зарядки → авто-старт

  const pickLang = (code: string) => {
    setTargetLang(code);
    AsyncStorage.setItem(STORE_KEY, code).catch(() => {});
  };

  const startGame = () => {
    ttsCancel();
    if (advanceRef.current) clearTimeout(advanceRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    const p = levelParams(lvl.level);
    levelRef.current = lvl.level;
    paramsRef.current = p;
    tgtRef.current = tgt;
    const all = MINIMAL_PAIRS[tgt] || MINIMAL_PAIRS.en;
    const pool = p.easyOnly ? all.slice(0, Math.max(2, Math.ceil(all.length / 2))) : all;
    trialsRef.current = buildTrials(pool, p.trials);
    hitsRef.current = 0;
    errorsRef.current = 0;
    replaysRef.current = 0;
    setHits(0);
    setErrors(0);
    setAnswered(null);
    setIdx(0);
    setElapsedTime(0);
    const start = Date.now();
    startTimeRef.current = start;
    timerRef.current = setInterval(() => setElapsedTime((Date.now() - start) / 1000), 100);
    setPhase('playing');
  };

  // озвучка слова текущей пробы — эффектом, НЕ внутри setState
  useEffect(() => {
    if (phase !== 'playing') return;
    const tr = trialsRef.current[idx];
    if (!tr) return;
    const to = setTimeout(() => { speak(tr.words[tr.correctIdx], tgtRef.current, 0.85); }, 400);
    return () => clearTimeout(to);
  }, [phase, idx]);

  const replay = () => {
    const tr = trialsRef.current[idx];
    if (!tr || phase !== 'playing') return;
    replaysRef.current += 1;   // replay не штрафуется, только считаем
    speak(tr.words[tr.correctIdx], tgtRef.current, 0.85);
  };

  const finishRound = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const finalTime = (Date.now() - startTimeRef.current) / 1000;
    setElapsedTime(finalTime);
    const h = hitsRef.current;
    const e = errorsRef.current;
    const passed = e <= 1;
    if (isPreset) {
      setPhase(passed ? 'cleared' : 'result');
    } else {
      if (passed) lvl.reach(levelRef.current + 1);
      setClearedPassed(passed);
      setPhase('cleared');
    }
    try {
      await saveSession({
        game_type: 'phoneme_pairs',
        score: Math.max(0, h * 100 - e * 30),
        time_seconds: finalTime,
        difficulty: `L${levelRef.current}`,
        mode: tgtRef.current,
        errors: e,
        details: {
          hits: h,
          errors: e,
          trials: paramsRef.current.trials,
          target_lang: tgtRef.current,
          replays: replaysRef.current,
        },
      });
    } catch (err) { console.error('Error saving session:', err); }
  };

  const handleAnswer = (choice: 0 | 1) => {
    if (phase !== 'playing' || answered !== null) return;
    const tr = trialsRef.current[idx];
    if (!tr) return;
    const ok = choice === tr.correctIdx;
    if (ok) {
      sndCorrect();
      hitsRef.current += 1;
      setHits((h) => h + 1);
    } else {
      sndWrong();
      errorsRef.current += 1;
      setErrors((e) => e + 1);
    }
    setAnswered(choice);
    const delay = paramsRef.current.showWord ? 1100 : paramsRef.current.blind ? 450 : 700;
    advanceRef.current = setTimeout(() => {
      if (idx + 1 >= trialsRef.current.length) {
        finishRound();
      } else {
        setAnswered(null);
        setIdx(idx + 1);
      }
    }, delay);
  };

  const renderConfig = () => (
    <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.configCard}>
        <Ionicons name="ear" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{ru ? 'Фонемы: минимальные пары' : 'Phonemes: minimal pairs'}</Text>
        <Text style={styles.configDesc}>
          {ru ? 'Слушай слово и выбери, что прозвучало — ship или sheep? Тренировка фонематического слуха.'
              : 'Listen to the word and pick what you heard — ship or sheep? Trains phonemic hearing.'}
        </Text>
      </LinearGradient>
      <LevelProgressMap gameId="phoneme_pairs" currentLevel={lvl.level} colors={colors} language={language} />
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{ru ? 'Какой язык учим' : 'Language to train'}</Text>
        <View style={styles.optionButtons}>
          {TARGET_LANGS.filter((c) => c !== language).map((c) => (
            <TouchableOpacity
              key={c}
              style={[
                styles.langBtn,
                tgt === c
                  ? { backgroundColor: GRADIENT[0] }
                  : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
              ]}
              onPress={() => pickLang(c)}
            >
              <Text style={[styles.langBtnText, { color: tgt === c ? '#FFF' : colors.text }]}>{LANG_NAMES[c]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{ru ? 'Уровень' : 'Level'}</Text>
        <Text style={[styles.optionHint, { color: colors.textSecondary }]}>
          {ru ? `Ур. ${lvl.level} — растёт сам: больше проб → все пары → без подсказок`
              : `Lv ${lvl.level} — grows with results: more trials → all pairs → no visual hints`}
        </Text>
      </View>
      {!voiceOk && (
        <View style={[styles.warnCard, { backgroundColor: colors.surface, borderColor: '#f43f5e' }]}>
          <Ionicons name="volume-mute" size={22} color="#f43f5e" />
          <Text style={[styles.warnText, { color: colors.text }]}>
            {ru ? `Голос для языка «${LANG_NAMES[tgt]}» не найден на устройстве. Выбери другой язык.`
                : `No voice for “${LANG_NAMES[tgt]}” found on this device. Pick another language.`}
          </Text>
        </View>
      )}
      <TouchableOpacity style={[styles.startBtn, !voiceOk && { opacity: 0.4 }]} onPress={startGame} disabled={!voiceOk}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={styles.startBtnText}>{ru ? 'Начать' : 'Start'}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderPlaying = () => {
    const tr = trialsRef.current[idx];
    if (!tr) return null;
    const p = paramsRef.current;
    const total = trialsRef.current.length;
    const spokenWord = tr.words[tr.correctIdx];
    const wasCorrect = answered !== null && answered === tr.correctIdx;
    return (
      <View style={styles.playArea}>
        <View style={styles.statsRow}>
          <Text style={[styles.statText, { color: colors.text }]}>{idx + 1}/{total} · {ru ? 'Ур.' : 'Lv'}{levelRef.current}</Text>
          {!p.blind && <Text style={[styles.statText, { color: '#22c55e' }]}>✓ {hits}</Text>}
          {!p.blind && <Text style={[styles.statText, { color: '#f43f5e' }]}>✗ {errors}</Text>}
        </View>
        <Text style={[styles.hintText, { color: colors.textSecondary }]}>
          {ru ? 'Что прозвучало? Выбери слово.' : 'What did you hear? Pick the word.'}
        </Text>
        <View style={styles.pairCol}>
          {([0, 1] as const).map((i) => {
            let bg = colors.surface;
            let fg = colors.text;
            let border = colors.border;
            if (!p.blind && answered !== null) {
              if (i === tr.correctIdx) { bg = '#22c55e'; fg = '#FFF'; border = '#22c55e'; }
              else if (i === answered) { bg = '#f43f5e'; fg = '#FFF'; border = '#f43f5e'; }
            }
            return (
              <TouchableOpacity
                key={i}
                style={[styles.wordBtn, { backgroundColor: bg, borderColor: border }]}
                onPress={() => handleAnswer(i)}
                activeOpacity={0.8}
                disabled={answered !== null}
              >
                <Text style={[styles.wordBtnText, { color: fg }]}>{tr.words[i]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {p.showWord && answered !== null && (
          <Text style={[styles.revealText, { color: wasCorrect ? '#22c55e' : '#f43f5e' }]}>
            {(ru ? 'Прозвучало: ' : 'Played: ') + spokenWord}
          </Text>
        )}
        <TouchableOpacity
          style={[styles.replayBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={replay}
          disabled={answered !== null}
          activeOpacity={0.8}
        >
          <Text style={[styles.replayText, { color: colors.text }]}>🔊 {ru ? 'Ещё раз' : 'Play again'}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{ru ? 'Фонемы: пары' : 'Phoneme pairs'}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'cleared' && (
        <LevelCleared
          gameId="phoneme_pairs"
          level={levelRef.current}
          stars={errors === 0 ? 3 : errors <= 2 ? 2 : 1}
          gradient={GRADIENT}
          language={language}
          colors={colors}
          passed={clearedPassed}
          onContinue={() => startGame()}
          onStop={() => setPhase('config')}
        />
      )}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, hits * 100 - errors * 30)}
          time={elapsedTime}
          errors={errors}
          onPlayAgain={() => setPhase('config')}
          onGoHome={() => goBackOrHome()}
          gradient={GRADIENT as [string, string]}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, justifyContent: 'space-between' },
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  configScroll: { flex: 1 },
  configContainer: { padding: 16, gap: 14 },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: '#FFF', textAlign: 'center' },
  configDesc: { fontSize: 13, color: '#FFF', opacity: 0.9, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionHint: { fontSize: 13, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  langBtn: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8 },
  langBtnText: { fontSize: 13, fontWeight: '600' },
  warnCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1.5 },
  warnText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  playArea: { flex: 1, padding: 18, gap: 18, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center' },
  statText: { fontSize: 13, fontWeight: '700' },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 360 },
  pairCol: { width: '100%', maxWidth: 420, gap: 14, marginTop: 8 },
  wordBtn: { paddingVertical: 26, paddingHorizontal: 20, borderRadius: 16, borderWidth: 2, alignItems: 'center' },
  wordBtnText: { fontSize: 30, fontWeight: '800' },
  revealText: { fontSize: 16, fontWeight: '700' },
  replayBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 22, borderRadius: 12, borderWidth: 1, marginTop: 4 },
  replayText: { fontSize: 15, fontWeight: '700' },
});
