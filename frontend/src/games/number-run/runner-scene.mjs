// VER 8 · 2026-09-16 · psygames-search-claude-mac: память в пути — знаки показа плывут над дорогой по одному, в ряду
// «вспомнить» знаки стоят вместо чисел (подписью, не цифровой геометрией); всплывает знак, а не ±1.
// VER 7 · 2026-09-16 · psygames-search-claude-mac: шкала поперёк дороги (станция «Мат. шкалы») — прямая с делениями и
// подписями, ворота с выражением; после проезда — флажок верного ответа. Ряд на арках рисуется теми же арками ответа.
// VER 6 · 2026-09-16 · psygames-search-claude-mac: станции уровней — арки с ответами и табло примера, числа-части «ровно N»
// (янтарные) с табло цели и счётчиком над числом, «Страж» — огромное число впереди и одна стена в финале вместо лестницы.
// VER 5 · 2026-09-16 · psygames-search-claude-mac, на основе VER 4 LOCAL 0.4 (psygames-codex-mac). Построения маршрута VER 4:
// числа по глубине, широкие стопки, столб, стены операций, большое красное под трамплином. Искры, осколки и всплывающие
// «+8 / −30» — по событиям ядра, не по своей догадке. Финиш клеткой и финальная лестница стен (render(state,time,finaleT)).
// Эффекты — один пул точек и шесть подписей на всю сцену: число объектов не растёт с длиной забега.
// VER 4 · LOCAL 0.4 · 2026-09-12 · Five independent blue/red pickups, ramps, bridge supports.
import * as T from 'three';
import {ruleText} from './runner-levels.mjs';
import {numberScale,jumpHeight} from './runner-core.mjs';
import {createNumerals} from './runner-numerals.mjs';
import {wallsBroken} from './runner-campaign.mjs';
const BG=0x57c7df, LANE=2.4, FINALE_GAP=5, FINALE_SPEED=12;
const colors={add:0x86f4cb,subtract:0xffb891,multiply:0xd0acff,skip:0x65829d,gate:0xb8a3ff};
const WALL={'−':0xff4d6d,'+':0x4f7bff,'×':0x9b6bff},LADDER=[0xffe14d,0xf4e84a,0xdcee52,0xbcf05c,0x98ec69,0x78e27c,0x5dd697,0x4fcab4,0x4cc0d1,0x53b5ea];
// Финал — лестница из десяти стен или одна стена «Стража» (уровень-босс). Сколько пробито — правило финала, не сцены.
const finaleWalls=course=>course.finale?.boss!==undefined?[course.finale.boss]:course.finale?.walls??null;
const finaleBroken=(course,value)=>course.finale?.boss!==undefined?(value>=course.finale.boss?1:0):wallsBroken(course.finale,value);
export function finaleDistance(course,state){
 const walls=finaleWalls(course);if(!walls)return 0;const broken=finaleBroken(course,state.sum);
 return broken===walls.length?FINALE_GAP*walls.length+6:FINALE_GAP*(broken+1)-1.4;
}
// Сколько секунд идёт финал: дорога до последней пробитой стены и секунда показать, где остановился.
export const finaleDuration=(course,state)=>course.finale?finaleDistance(course,state)/FINALE_SPEED+1.3:0;
export function createScene(container){
 const renderer=new T.WebGLRenderer({antialias:true,alpha:false});
 renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(BG);renderer.outputColorSpace=T.SRGBColorSpace;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;
 renderer.domElement.setAttribute('aria-hidden','true');container.prepend(renderer.domElement);
 const scene=new T.Scene();scene.fog=new T.Fog(BG,28,68);
 const camera=new T.PerspectiveCamera(55,1,.1,100);camera.position.set(0,8.2,11);camera.lookAt(0,0,-10);
 scene.add(new T.HemisphereLight(0xf1f4ff,0x59688a,1.8));const sun=new T.DirectionalLight(0xffffff,2.2);sun.position.set(-8,14,9);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-14;sun.shadow.camera.right=14;sun.shadow.camera.top=14;sun.shadow.camera.bottom=-14;sun.shadow.camera.far=65;sun.shadow.bias=-.001;scene.add(sun);
 function box(w,h,d,color){return new T.Mesh(new T.BoxGeometry(w,h,d),new T.MeshStandardMaterial({color,roughness:.35,metalness:.18}));}
 const sea=box(160,.1,160,0x18c4cf);sea.position.set(0,-6,-30);scene.add(sea);
 const startPlatform=box(7.2,.35,18,0xdce1ef);startPlatform.position.y=-.22;startPlatform.receiveShadow=true;scene.add(startPlatform);
 const starPositions=[];for(let i=0;i<95;i++)starPositions.push(Math.sin(i*18.4)*30,2+Math.abs(Math.cos(i*2.5))*22,-15-Math.abs(Math.sin(i*1.7))*65);
 const stars=new T.BufferGeometry();stars.setAttribute('position',new T.Float32BufferAttribute(starPositions,3));scene.add(new T.Points(stars,new T.PointsMaterial({color:0x8594c9,size:.07,transparent:true,opacity:.7})));
 function label(text,{color='#ffffff',background=null,w=2.1,h=1.1,font=125}={}){
  const c=document.createElement('canvas');c.width=512;c.height=256;const ctx=c.getContext('2d');
  const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;
  const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,depthTest:true,transparent:true}));sprite.scale.set(w,h,1);
  const update=(value,ink=color)=>{ctx.clearRect(0,0,512,256);if(background){ctx.fillStyle=background;ctx.beginPath();ctx.roundRect(5,7,502,242,36);ctx.fill();}
   ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`800 ${font}px system-ui`;ctx.fillStyle=ink;
   if(!background){ctx.shadowBlur=28;ctx.shadowColor='#ac8bff';ctx.strokeStyle='#332255';ctx.lineWidth=9;ctx.strokeText(value,256,136,480);}
   ctx.fillText(value,256,136,480);ctx.shadowBlur=0;texture.needsUpdate=true;};
  update(text);return {sprite,update};
 }
 const numerals=createNumerals(),hero=new T.Group();let digit=numerals.make('1');hero.add(digit);scene.add(hero);
 let objects=new Map(),lastNumber=null,course,visualScale=1,lastTime=null,compactScale=1,seenEvents=0,finale=null,bump=0,guard=null,partText='';
 const GUARD=0x7c3aed,PART=0xd97706;
 // ── Эффекты: пул искр/осколков и шесть всплывающих подписей ─────────────────────────────────────────────
 const SPARKS=280,sparkPosition=new Float32Array(SPARKS*3),sparkColor=new Float32Array(SPARKS*3),sparks=[];let sparkNext=0;
 const sparkGeometry=new T.BufferGeometry();sparkGeometry.setAttribute('position',new T.BufferAttribute(sparkPosition,3));sparkGeometry.setAttribute('color',new T.BufferAttribute(sparkColor,3));
 const sparkPoints=new T.Points(sparkGeometry,new T.PointsMaterial({size:.15,vertexColors:true,transparent:true,depthWrite:false}));sparkPoints.frustumCulled=false;scene.add(sparkPoints);
 for(let i=0;i<SPARKS;i++){sparks.push({life:0,vx:0,vy:0,vz:0});sparkPosition[i*3+1]=-60;}
 function burst(x,y,z,color,count,{spread=3.2,lift=4,drift=0}={}){
  const c=new T.Color(color);for(let n=0;n<count;n++){const i=sparkNext;sparkNext=(sparkNext+1)%SPARKS;const p=sparks[i],a=Math.random()*Math.PI*2;
   p.life=.45+Math.random()*.45;p.vx=Math.cos(a)*spread*Math.random();p.vz=Math.sin(a)*spread*Math.random()+drift;p.vy=lift*(.4+Math.random());
   sparkPosition.set([x,y,z],i*3);const shade=.75+Math.random()*.25;sparkColor.set([c.r*shade,c.g*shade,c.b*shade],i*3);}
 }
 function stepSparks(dt){
  for(let i=0;i<SPARKS;i++){const p=sparks[i];if(p.life<=0)continue;p.life-=dt;p.vy-=9*dt;
   sparkPosition[i*3]+=p.vx*dt;sparkPosition[i*3+1]=p.life<=0?-60:Math.max(-.2,sparkPosition[i*3+1]+p.vy*dt);sparkPosition[i*3+2]+=p.vz*dt;}
  sparkGeometry.attributes.position.needsUpdate=true;sparkGeometry.attributes.color.needsUpdate=true;
 }
 const popups=Array.from({length:6},()=>{const l=label('',{w:1.7,h:.85,font:140});l.sprite.visible=false;scene.add(l.sprite);return {...l,life:0};});
 const counter=label(' ',{background:'#78350f',w:1.9,h:.8,font:120});counter.sprite.visible=false;scene.add(counter.sprite);
 function popup(text,ink,x){const p=popups.reduce((a,b)=>a.life<=b.life?a:b);p.update(text,ink);p.life=.8;p.sprite.visible=true;p.sprite.position.set(x,2.2,0);}
 function stepPopups(dt){for(const p of popups){if(p.life<=0)continue;p.life-=dt;p.sprite.position.y+=dt*1.6;p.sprite.material.opacity=Math.max(0,Math.min(1,p.life/.3));if(p.life<=0)p.sprite.visible=false;}}
 function dispose(group){group.traverse(o=>{if(o.geometry&&!o.geometry.userData.shared)o.geometry.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])if(!m.userData.shared){m.map?.dispose();m.dispose();}});scene.remove(group);}
 function buildRow(row){const root=new T.Group(),group=new T.Group();root.add(group);
   const previous=course.rows[row.id-1],length=row.z-(previous?.z??0),span=row.span??0;
   for(let i=0;i<3;i++){
    const hole=span>0&&row.penalties[i]>0,deckLength=length-(hole?span:0),middle=(length+(hole?span:0))/2;
    const deck=box(LANE,.55,deckLength,row.id%2?0xf4f5fa:0xe3e8ef);deck.position.set((i-1)*LANE,-.32,middle);deck.receiveShadow=true;root.add(deck);
    if(span&&!hole){for(const dx of [-1.13,1.13]){
     const rail=box(.09,.12,span,0xffb345);rail.position.set((i-1)*LANE+dx,.7,span/2);root.add(rail);
     for(let z=.3;z<span;z+=2){const post=box(.09,.8,.09,0x456aa1);post.position.set((i-1)*LANE+dx,.3,z);root.add(post);}
    }
    if(row.terrain==='bridge')for(let z=.3;z<span;z+=.65){const plank=box(2.2,.035,.38,0xc3a780);plank.position.set((i-1)*LANE,-.02,z);root.add(plank);}
    }
   }
   if(row.kind==='pickups'&&row.show)row.show.symbols.forEach((symbol,i)=>{
    // Знак показа: не собирается и не сталкивается — висит над дорогой, пока ряд впереди.
    const tag=label(symbol,{background:'#0f766e',w:1.7,h:1.7,font:190});tag.sprite.position.set(0,2.7,-row.show.dzs[i]);group.add(tag.sprite);
   });
   if(row.kind==='pickups'&&row.recall)row.items.forEach((item,index)=>{
    const tag=label(item.symbol,{background:'#134e4a',w:1.35,h:1.35,font:180});tag.sprite.position.set(item.x*LANE,.85,-(item.dz??0));tag.sprite.userData.pickupIndex=index;group.add(tag.sprite);
   });
   else if(row.kind==='pickups')row.items.forEach((item,index)=>{
    const mesh=numerals.make(item.value<0?`−${Math.abs(item.value)}`:item.value,item.part?PART:item.value<0?0xff1839:0x443bff),half=item.half??.18;
    // Ширина числа — по его логической ширине: стопка в полдороги, большое красное через всю дорогу.
    const scale=half>=1?Math.min(2.7,5.6/mesh.userData.width):half>=.5?Math.min(1.2,1.6/mesh.userData.width):Math.min(.98,1.03/mesh.userData.width);
    mesh.scale.setScalar(scale);mesh.position.set(item.x*LANE,.08,-(item.dz??0));mesh.userData.pickupIndex=index;group.add(mesh);
   });
   else if(row.kind==='answer'){row.options.forEach((value,index)=>{
    // Арка ответа: въезд в неё и есть ответ. Пример — на табло над тремя арками (и строкой задания на экране).
    const lane=new T.Group();lane.position.x=(index-1)*LANE;lane.userData.answerLane=index-1;
    for(const x of [-1.05,1.05]){const post=box(.14,2.6,.14,0x3b82f6);post.position.set(x,1.3,0);lane.add(post);}
    const cross=box(2.24,.16,.16,0x3b82f6);cross.position.y=2.55;lane.add(cross);
    const tag=label(String(value).replace('-','−'),{background:'#1e3a8a',w:1.9,h:.95,font:130});tag.sprite.position.set(0,1.7,0);lane.add(tag.sprite);
    group.add(lane);
   });
    const board=label(row.prompt,{background:'#0f172a',w:7,h:1.45,font:112});board.sprite.position.set(0,3.6,0);group.add(board.sprite);
   }
   else if(row.kind==='scale'){
    // Прямая через всю дорогу: x = −1…1 ↔ min…max. Подписи — у каждого деления, если их до шести, иначе через одно.
    const toX=v=>((v-row.min)/(row.max-row.min)*2-1)*LANE,bar=box(2*LANE+.5,.07,.26,0xe0e7ff);bar.position.set(0,.06,0);group.add(bar);
    const every=row.ticks.length<=6?1:2,num=v=>String(Math.round(v*10)/10).replace('-','−');
    row.ticks.forEach((v,i)=>{const tick=box(.06,.03,.62,0x312e81);tick.position.set(toX(v),.1,0);group.add(tick);
     if(i%every===0||i===row.ticks.length-1){const tag=label(num(v),{background:'#312e81',w:1.25,h:.62,font:120});tag.sprite.position.set(toX(v),.75,.2);group.add(tag.sprite);}});
    for(const x of [-(LANE+.35),LANE+.35]){const post=box(.16,3.2,.16,0x6366f1);post.position.set(x,1.6,0);group.add(post);}
    const cross=box(2*LANE+.86,.16,.16,0x6366f1);cross.position.y=3.15;group.add(cross);
    const board=label(row.prompt,{background:'#1e1b4b',w:7,h:1.45,font:112});board.sprite.position.set(0,3.85,0);group.add(board.sprite);
    // Флажок верного ответа — в корне ряда: ворота после проезда гаснут, а флажок остаётся показать, где было надо.
    const flag=box(.12,1.6,.12,0x22c55e);flag.position.set(toX(row.answer),.8,.05);flag.visible=false;flag.userData.answerFlag=true;root.add(flag);
   }
   else if(row.kind==='operation'&&course.mode==='journey')row.options.forEach((operation,index)=>{
    // Стена во всю полосу: цвет — знак операции, надпись — сама операция. Проезд разбивает только твою.
    const lane=new T.Group();lane.position.x=(index-1)*LANE;lane.userData.wallLane=index-1;
    const wall=new T.Mesh(new T.BoxGeometry(2.3,1.95,.34),new T.MeshStandardMaterial({color:WALL[operation[0]]??WALL['×'],roughness:.42,metalness:.05,transparent:true,opacity:.9}));
    wall.position.y=.97;wall.castShadow=true;lane.add(wall);
    const tag=label(operation,{w:2.15,h:1.08,font:150});tag.sprite.position.set(0,1.02,.32);lane.add(tag.sprite);
    group.add(lane);
   });
   else if(row.kind==='operation')row.options.forEach((operation,index)=>{
    const lane=new T.Group();lane.position.x=(index-1)*LANE;
    const color=operation[0]==='−'?0xff1839:0x443bff;
    if(operation!=='→'){
     const number=numerals.make(operation.startsWith('+')?operation.slice(1):operation,color),scale=Math.min(1.05,1.8/number.userData.width);number.scale.setScalar(scale);number.position.y=.1;lane.add(number);
    }else{const dash=box(.6,.025,.12,0x90a2c6);dash.position.y=-.02;lane.add(dash);}
    group.add(lane);
   });
   else if(row.kind==='obstacle')row.penalties.forEach((damage,index)=>{
    const lane=new T.Group();lane.position.x=(index-1)*LANE;
    if(row.span){
     if(damage){for(const x of [-.75,0,.75]){const warning=box(.36,.025,.12,0xdf5473);warning.position.set(x,.01,row.span+.15);lane.add(warning);}}
    }else if(damage){
     const block=box(2.08,1.15,1.45,0xa63c51);block.position.y=.52;lane.add(block);
     for(const x of [-.64,0,.64]){const stripe=box(.16,1.08,.045,0xffb18b);stripe.rotation.z=-.45;stripe.position.set(x,.55,.75);lane.add(stripe);}
     const cap=box(2.15,.12,1.5,0xf28b7d);cap.position.y=1.13;lane.add(cap);
     const tag=label(`−${damage}`,{background:'#742e40',color:'#ffe7d7',w:1.85,h:.95,font:120});tag.sprite.position.set(0,1.52,.1);lane.add(tag.sprite);
    }else{const pass=box(1.85,.025,1.55,0x44615e);pass.position.y=-.02;lane.add(pass);}
    group.add(lane);
   });
   else if(row.checkpoint){
    // Последняя черта — финиш: клетка в два ряда. Промежуточные — одна строка, как было.
    const bands=row.id===course.rows.length-1?2:1;
    for(let r=0;r<bands;r++)for(let i=0;i<12;i++){const square=box(.6,.025,.8,(i+r)%2?0x202839:0xffffff);square.position.set(-3.3+i*.6,.015+r*.001,-r*.8);group.add(square);}
   }else {
    const split=row.rules.length===3;
    for(let i=0;i<row.rules.length;i++){
     const middle=split?(i-1)*LANE:0,width=split?2.25:7.05;
     for(const x of [middle-width/2,middle+width/2]){const post=box(.1,2.9,.13,colors.gate);post.position.set(x,1.4,0);group.add(post);}
     const cross=box(width,.11,.13,colors.gate);cross.position.set(middle,2.83,0);group.add(cross);
     const tag=label(ruleText(row.rules[i]),{background:'#665399',w:split?2.24:3.35,h:split?1.18:1.3,font:105});tag.sprite.position.set(middle,2.25,0);group.add(tag.sprite);
    }
   }
   if(row.exact&&!row.recall){const board=label(`= ${row.exact.target}`,{background:'#78350f',color:'#fef3c7',w:3.4,h:1.3,font:150});board.sprite.position.set(0,2.4,21);root.add(board.sprite);}
   if(row.divider){
    // Столб делит дорогу на время стопок: сторона выбрана там, где он начинается.
    const d=row.divider,length=d.toDz-d.fromDz,z=-(d.fromDz+d.toDz)/2;
    const pole=box(.24,1.7,length,0x6a45ff);pole.position.set(0,.8,z);pole.castShadow=true;root.add(pole);
    const cap=box(.26,.1,length,0x9d86ff);cap.position.set(0,1.68,z);root.add(cap);
   }
   if(row.jump){
    const ramp=new T.Group();ramp.position.set(row.jump.lane*LANE,0,row.jump.launchOffset);
    const base=box(2.2,.23,2.5,0x93ef13);base.rotation.x=-.18;base.position.y=.12;ramp.add(base);
    for(const z of [-.65,.35])for(const sign of [-1,1]){const arrow=box(.16,.035,.75,0xffffff);arrow.rotation.y=sign*.65;arrow.position.set(sign*.22,.4,z);ramp.add(arrow);}
    const tag=label('▲▲',{background:'#45780c',w:1.3,h:.65,font:110});tag.sprite.position.set(0,1,0);ramp.add(tag.sprite);root.add(ramp);
   }
   scene.add(root);return {row,group:root,items:group};
 }
 function buildFinale(){
  const root=new T.Group(),walls=finaleWalls(course),boss=course.finale.boss!==undefined,total=FINALE_GAP*(walls.length+1)+40;
  const deck=box(7.2,.55,total,0xeef1f7);deck.position.set(0,-.32,-total/2);deck.receiveShadow=true;root.add(deck);
  const slabs=walls.map((value,i)=>{const g=new T.Group();g.position.z=-FINALE_GAP*(i+1);
   const slab=box(7.1,boss?3.4:2.3,boss?1.2:.8,boss?GUARD:LADDER[i%LADDER.length]);slab.position.y=boss?1.7:1.15;slab.castShadow=true;g.add(slab);
   const tag=label(String(value),{w:boss?4.8:3.8,h:boss?2.4:1.9,font:170});tag.sprite.position.set(0,boss?1.8:1.25,boss?.68:.48);g.add(tag.sprite);
   root.add(g);return g;});
  scene.add(root);return {root,slabs,broken:0};
 }
 function syncRows(nextRow){
  // One trailing deck + six upcoming rows, not all168. Shared digit geometries.
  for(const [id,{group}] of objects)if(id<nextRow-1||id>=nextRow+6){dispose(group);objects.delete(id);}
  for(let i=Math.max(0,nextRow-1);i<Math.min(course.rows.length,nextRow+6);i++)if(!objects.has(i))objects.set(i,buildRow(course.rows[i]));
  renderer.domElement.dataset.rowObjects=String(objects.size);
 }
 function load(nextCourse){
  objects.forEach(({group})=>dispose(group));objects.clear();if(finale){dispose(finale.root);finale=null;}
  course=nextCourse;lastNumber=null;visualScale=numberScale(course.start);lastTime=null;seenEvents=0;bump=0;syncRows(0);
  renderer.domElement.dataset.seed=String(course.seed);renderer.domElement.dataset.level=String(course.levelId);
  if(guard){dispose(guard);guard=null;}
  // «Страж» виден весь уровень: огромное число над горизонтом — столько нужно набрать к финишу.
  if(course.finale?.boss!==undefined){guard=numerals.make(course.finale.boss,GUARD);guard.scale.setScalar(Math.min(2.6,7/guard.userData.width));guard.position.set(0,3.2,-52);
   // Страж далеко, в тумане он белел до нечитаемого: своим материалам туман выключен (общие цифры не трогаем).
   guard.traverse(o=>{if(o.isMesh)o.material=(Array.isArray(o.material)?o.material:[o.material]).map(m=>{const c=m.clone();c.fog=false;c.userData.shared=false;return c;});});
   scene.add(guard);}
 }
 const observer=new ResizeObserver(()=>{
  const w=container.clientWidth,h=container.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;
  // Keep the whole three-lane choice readable in a tall portrait viewport.
  camera.fov=camera.aspect<.62?65:55;camera.updateProjectionMatrix();
  compactScale=h<360?1.35:1;
 });observer.observe(container);
 // События ядра, случившиеся с прошлого кадра, — в искры и подписи. Смысл берётся из события, не из картинки.
 function react(state,reduced){
  if(state.events.length<seenEvents)seenEvents=0;
  for(const e of state.events.slice(seenEvents)){
   if(e.type==='pickup'&&e.part&&course.rows[e.id]?.recall){const it=course.rows[e.id].items[e.item];popup(it.symbol,it.value>0?'#bbf7d0':'#ffd6dc',state.x*LANE);if(!reduced)burst(state.x*LANE,.9,0,it.value>0?0x14b8a6:0xff2d55,8,{spread:2.4,lift:3.2});}
   else if(e.type==='pickup'&&e.part){popup(String(e.value),'#fde68a',state.x*LANE);if(!reduced)burst(state.x*LANE,.9,0,PART,6,{spread:2.4,lift:3.2});}
   else if(e.type==='pickup'){const good=e.value>0;popup(`${good?'+':'−'}${Math.abs(e.value)}`,good?'#dfe6ff':'#ffd6dc',state.x*LANE);if(!reduced)burst(state.x*LANE,.9+jumpHeight(state),0,good?0x5b6cff:0xff2d55,good?6:12,{spread:2.4,lift:3.2});}
   else if(e.type==='answer'){const o=objects.get(e.id);if(o)for(const lane of o.items.children)if(lane.userData.answerLane===e.lane)lane.visible=false;
    popup(`${e.ok?'✓ +':'✗ −'}${Math.abs(e.after-e.before)}`,e.ok?'#bbf7d0':'#ffd6dc',e.lane*LANE);if(!reduced)burst(e.lane*LANE,1.4,0,e.ok?0x22c55e:0xff2d55,26,{spread:4,lift:5,drift:6});}
   else if(e.type==='scale'){const o=objects.get(e.id);if(o)o.group.traverse(m=>{if(m.userData.answerFlag)m.visible=true;});
    const text=e.delta>0?`✓ +${e.delta}`:e.delta<0?`✗ −${-e.delta}`:'≈ 0';popup(text,e.delta>0?'#bbf7d0':e.delta<0?'#ffd6dc':'#e0e7ff',e.x*LANE);
    if(!reduced)burst(e.x*LANE,1,0,e.delta>0?0x22c55e:e.delta<0?0xff2d55:0x818cf8,24,{spread:4,lift:5,drift:6});}
   else if(e.type==='pickups'&&e.exact){const ok=e.exact.delta>0;popup(`${ok?'✓ +':'≠ −'}${Math.abs(e.exact.delta)}`,ok?'#bbf7d0':'#ffd6dc',state.x*LANE);if(!reduced)burst(state.x*LANE,1.2,0,ok?0x22c55e:0xff2d55,ok?30:16,{spread:4,lift:5});}
   else if(e.type==='operation'){const o=objects.get(e.id);if(o)for(const lane of o.items.children)if(lane.userData.wallLane===e.lane)lane.visible=false;
    popup(`${e.operation}`,e.operation[0]==='−'?'#ffd6dc':'#dfe6ff',e.lane*LANE);if(!reduced)burst(e.lane*LANE,1,0,WALL[e.operation[0]]??WALL['×'],26,{spread:4,lift:5,drift:6});}
   else if(e.type==='obstacle'&&e.damage>0){popup(`−${e.damage}`,'#ffd6dc',e.lane*LANE);if(!reduced)burst(e.lane*LANE,.8,0,0xa63c51,26,{spread:4,lift:4.5,drift:6});}
  }
  seenEvents=state.events.length;
 }
 function render(state,time,finaleT=0){
  if(lastNumber!==state.sum){hero.remove(digit);digit=numerals.make(state.sum,state.sum<0?0xff1839:0x443bff);hero.add(digit);lastNumber=state.sum;}
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dt=lastTime===null?0:Math.max(0,Math.min(.1,(time-lastTime)/1000));lastTime=time;
  const won=state.status==='won'&&course.finale,moving=state.status==='running'||won;
  // Финал: число едет дальше по лестнице стен, пока пробивает; двигает его время финала, которое держит адаптер.
  const along=won?Math.min(finaleDistance(course,state),finaleT*FINALE_SPEED):0,view=state.z+along;
  // В финале число съезжает на середину: четырёхзначное у края полосы уходило за край экрана.
  hero.position.x=state.x*LANE*(won?Math.max(0,1-finaleT/.5):1);hero.position.y=jumpHeight(state);
  const targetScale=numberScale(state.sum);visualScale=reduced?targetScale:visualScale+(targetScale-visualScale)*(1-Math.exp(-dt*8));
  const size=1.12*visualScale*compactScale;digit.scale.set(Math.min(size,3/digit.userData.width),size,size);digit.position.y=.08+(!reduced&&moving?Math.sin(time*.003)*.025:0);
  renderer.domElement.dataset.numberScale=visualScale.toFixed(3);
  renderer.domElement.dataset.jumpHeight=hero.position.y.toFixed(3);
  // Где забег — для живой проверки снаружи (тем же приёмом, что numberScale и jumpHeight выше).
  renderer.domElement.dataset.nextRow=String(state.nextRow);renderer.domElement.dataset.z=state.z.toFixed(2);renderer.domElement.dataset.status=state.status;
  syncRows(state.nextRow);react(state,reduced);
  renderer.domElement.dataset.numeralGeometry='extruded';renderer.domElement.dataset.glyphPool=String(numerals.glyphCount);
  objects.forEach(({row,group,items})=>{group.position.z=view-row.z;group.visible=row.z-view<90;items.visible=row.id>=state.nextRow||row.kind==='operation'&&course.mode==='journey';
   if(row.kind==='pickups')for(const item of items.children)item.visible=row.id!==state.nextRow||!state.collected.includes(item.userData.pickupIndex);
  });
  // Над числом — сколько частей уже взято в воротах «ровно N», пока их ряд впереди.
  const exactRow=course.rows[state.nextRow]?.exact?course.rows[state.nextRow]:null;
  const got=exactRow?state.collected.reduce((a,i)=>a+(exactRow.items[i].part?exactRow.items[i].value:0),0):0,text=exactRow&&state.collected.length?`${got} / ${exactRow.exact.target}`:'';
  if(text!==partText){partText=text;counter.update(text||' ','#fef3c7');counter.sprite.visible=!!text;}
  counter.sprite.position.set(hero.position.x,2.9+hero.position.y,0);
  // Высота стража — ниже строки задания экрана (кадр живого L6 16.09: на y 5,4 число пряталось под ней наполовину).
  // Пока впереди станция (те же 70 единиц, что у строки задания экрана), страж прячется: крупная строка станции
  // ложилась на его число (кадр живого L12 16.09: «Собери ровно 15» поверх «755»).
  const stationAhead=course.rows.slice(state.nextRow,state.nextRow+3).some(r=>(r.station||r.exact)&&r.z-view<=70);
  if(guard){guard.visible=course.length-view>=100&&!won&&!stationAhead;guard.position.y=3.2+(!reduced?Math.sin(time*.0015)*.2:0);}
  if(course.finale&&!finale&&course.length-view<100)finale=buildFinale();
  if(finale){finale.root.position.z=view-course.length;
   const broken=won?finaleBroken(course,state.sum):0;
   finale.slabs.forEach((slab,i)=>{if(slab.visible&&i<broken&&along>=FINALE_GAP*(i+1)-.9){slab.visible=false;finale.broken=i+1;if(!reduced)burst(0,1.2,-.6,course.finale.boss!==undefined?GUARD:LADDER[i%LADDER.length],course.finale.boss!==undefined?60:30,{spread:5,lift:6,drift:FINALE_SPEED});}});
   if(won&&broken<finale.slabs.length&&along>=finaleDistance(course,state)&&bump===0)bump=.001;
   renderer.domElement.dataset.finaleBroken=String(finale.broken);
  }
  if(bump>0){bump+=dt;hero.position.z=bump<.45?-Math.sin(bump/.45*Math.PI)*.35:0;}else hero.position.z=0;
  if(moving&&dt>0){stepSparks(dt);stepPopups(dt);}
  startPlatform.position.z=view+9;startPlatform.visible=view<24;
  renderer.render(scene,camera);
 }
 function destroy(){observer.disconnect();for(const child of [...scene.children])dispose(child);numerals.destroy();renderer.dispose();renderer.domElement.remove();}
 return {load,render,destroy,canvas:renderer.domElement,dpr:renderer.getPixelRatio(),finaleDuration:state=>finaleDuration(course,state)};
}
