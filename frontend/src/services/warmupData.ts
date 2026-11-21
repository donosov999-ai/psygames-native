import type { Длительность, PlaylistStep, Weekday } from '@/src/services/warmup';
import type { WarmupPolicy } from '@/src/services/warmupPolicy';

interface LanguageWorkoutStep {
  id: string;
  route: string;
  секунд: number;
  ключУровня: string;
  ещё?: Record<string, string>;
}

interface WarmupData {
  редакция: string;
  политика: WarmupPolicy;
  языки: LanguageWorkoutStep[];
  темы: Record<'chess' | 'words', LanguageWorkoutStep[]>;
  переименования_наборов: Record<string, string>;
  запас: {
    ядро: PlaylistStep[];
    дни_ядра: Weekday[];
    утро_по_дням: Record<Weekday, PlaylistStep[]>;
    вечер_по_дням: Record<Weekday, PlaylistStep[]>;
    день: PlaylistStep[];
    ночь: PlaylistStep[];
    ночь_по_длине: Record<Длительность, PlaylistStep[]>;
    добор: PlaylistStep[];
    финал: PlaylistStep;
    дни_финала: Weekday[];
    финансы: PlaylistStep[];
    оценка: PlaylistStep[];
  };
}

// Same file that the profile importer sees. No second config in the web/native UI.
export const заводскойФайл = require('@/src/constants/defaultPlaylists.json');
export const заводскиеЗарядки = заводскойФайл.зарядки as WarmupData;
