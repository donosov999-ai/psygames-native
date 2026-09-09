/* psygames-spatial-core-warmup · VER 1 · 09.09.2026 */
/* LOCAL REV spatial-lab/2026-09-09.2 · psygames-codex-mac · not an app release */
import type {PlaylistMeta} from '@/src/services/warmup';

// A local acceptance playlist, deliberately absent from the production catalog.
export function localSpatialHost(): boolean {
  return typeof location !== 'undefined' && ['127.0.0.1','localhost','[::1]'].includes(location.hostname);
}
export function spatialWarmupPlaylist(weekday: PlaylistMeta['weekday']): PlaylistMeta {
  return {
    duration_min: 5, weekday, weekday_name: 'Локальная проверка', track: 'training',
    track_label: 'Пространственная зарядка — без сохранения', est_total_sec: 180,
    steps: [
      {game_id:'spatial_twiddle',game_route:'/games/spatial-lab',mode:'twiddle',difficulty:'easy',settings:{level:1,seed:42,lang:'ru'},est_duration_sec:30},
      {game_id:'mental_rotation',game_route:'/games/mental-rotation',difficulty:'easy',trials:3,settings:{lang:'ru'},est_duration_sec:120},
      {game_id:'spatial_net',game_route:'/games/spatial-lab',mode:'net',difficulty:'easy',settings:{level:1,seed:42,lang:'ru'},est_duration_sec:30},
    ],
  };
}
