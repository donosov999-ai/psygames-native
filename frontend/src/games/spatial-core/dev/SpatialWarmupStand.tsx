/* psygames-spatial-core-dev-warmup-stand · VER 1 · 09.09.2026 */
/* LOCAL REV spatial-lab/2026-09-09.3 · psygames-codex-mac · not an app release */
import React,{useSyncExternalStore} from 'react';
import {View,Text,Pressable} from 'react-native';
import {useWarmup} from '@/src/contexts/WarmupContext';
import {localSpatialHost} from '@/src/games/spatial-core/warmup';
const subscribeHost=()=>()=>{};
const serverHost=()=>false;

export default function SpatialWarmup() {
  const warmup=useWarmup();
  const local=useSyncExternalStore(subscribeHost,localSpatialHost,serverHost);
  if (!local) return <Text>Только локальная лаборатория.</Text>;
  const complete=warmup.localSpatial&&warmup.active&&!warmup.currentStep;
  return <View style={{flex:1,padding:24,justifyContent:'center',gap:20,backgroundColor:'#f5f5fa'}}>
    <Text style={{fontSize:24,fontWeight:'700'}}>Пространственная зарядка</Text>
    <Text>Поворот чисел → Ментальная ротация → Сеть труб. Проверка настоящих переходов без записи сессий, наград и истории.</Text>
    {complete&&<View testID="spatial-warmup-complete">
      <Text>Завершено: {warmup.results.length}/3</Text>
      {warmup.results.map((r,i)=><Text key={i}>{i+1}. {r.game_type} · {r.time_seconds.toFixed(1)} с · ошибок {r.errors}</Text>)}
    </View>}
    {warmup.active?<Pressable accessibilityRole="button" onPress={()=>void warmup.stopWarmup(false)} style={{minHeight:48,padding:16,backgroundColor:'#e1d4fa'}}><Text>Закрыть проверку</Text></Pressable>
      :<Pressable accessibilityRole="button" testID="spatial-warmup-start" onPress={warmup.startSpatialLab} style={{minHeight:48,padding:16,backgroundColor:'#e1d4fa'}}><Text>Запустить три упражнения</Text></Pressable>}
  </View>;
}
