// VER 4 · LOCAL 0.4 · 2026-09-12 · Five independent blue/red pickups, ramps, bridge supports.
import * as T from 'three';
import {ruleText} from './runner-levels.mjs';
import {numberScale,jumpHeight} from './runner-core.mjs';
import {createNumerals} from './runner-numerals.mjs';
const BG=0x57c7df, LANE=2.4;
const colors={add:0x86f4cb,subtract:0xffb891,multiply:0xd0acff,skip:0x65829d,gate:0xb8a3ff};
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
  const update=value=>{ctx.clearRect(0,0,512,256);if(background){ctx.fillStyle=background;ctx.beginPath();ctx.roundRect(5,7,502,242,36);ctx.fill();}
   ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`800 ${font}px system-ui`;ctx.fillStyle=color;
   if(!background){ctx.shadowBlur=28;ctx.shadowColor='#ac8bff';ctx.strokeStyle='#332255';ctx.lineWidth=9;ctx.strokeText(value,256,136,480);}
   ctx.fillText(value,256,136,480);ctx.shadowBlur=0;texture.needsUpdate=true;};
  update(text);return {sprite,update};
 }
 const numerals=createNumerals(),hero=new T.Group();let digit=numerals.make('1');hero.add(digit);scene.add(hero);
 let objects=new Map(),lastNumber=null,course,visualScale=1,lastTime=null,compactScale=1;
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
   if(row.kind==='pickups')row.items.forEach((item,index)=>{
    const mesh=numerals.make(item.value<0?`−${Math.abs(item.value)}`:item.value,item.value<0?0xff1839:0x443bff);
    mesh.scale.setScalar(Math.min(.98,1.03/mesh.userData.width));mesh.position.set(item.x*LANE,.08,0);mesh.userData.pickupIndex=index;group.add(mesh);
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
    for(let i=0;i<12;i++){const square=box(.6,.025,.8,i%2?0x202839:0xffffff);square.position.set(-3.3+i*.6,.015,0);group.add(square);}
   }else {
    const split=row.rules.length===3;
    for(let i=0;i<row.rules.length;i++){
     const middle=split?(i-1)*LANE:0,width=split?2.25:7.05;
     for(const x of [middle-width/2,middle+width/2]){const post=box(.1,2.9,.13,colors.gate);post.position.set(x,1.4,0);group.add(post);}
     const cross=box(width,.11,.13,colors.gate);cross.position.set(middle,2.83,0);group.add(cross);
     const tag=label(ruleText(row.rules[i]),{background:'#665399',w:split?2.24:3.35,h:split?1.18:1.3,font:105});tag.sprite.position.set(middle,2.25,0);group.add(tag.sprite);
    }
   }
   if(row.jump){
    const ramp=new T.Group();ramp.position.set(row.jump.lane*LANE,0,row.jump.launchOffset);
    const base=box(2.2,.23,2.5,0x93ef13);base.rotation.x=-.18;base.position.y=.12;ramp.add(base);
    for(const z of [-.65,.35])for(const sign of [-1,1]){const arrow=box(.16,.035,.75,0xffffff);arrow.rotation.y=sign*.65;arrow.position.set(sign*.22,.4,z);ramp.add(arrow);}
    const tag=label('ПРЫЖОК',{background:'#45780c',w:2.1,h:.65,font:80});tag.sprite.position.set(0,1,0);ramp.add(tag.sprite);root.add(ramp);
   }
   scene.add(root);return {row,group:root,items:group};
 }
 function syncRows(nextRow){
  // One trailing deck + six upcoming rows, not all168. Shared digit geometries.
  for(const [id,{group}] of objects)if(id<nextRow-1||id>=nextRow+6){dispose(group);objects.delete(id);}
  for(let i=Math.max(0,nextRow-1);i<Math.min(course.rows.length,nextRow+6);i++)if(!objects.has(i))objects.set(i,buildRow(course.rows[i]));
  renderer.domElement.dataset.rowObjects=String(objects.size);
 }
 function load(nextCourse){
  objects.forEach(({group})=>dispose(group));objects.clear();course=nextCourse;lastNumber=null;visualScale=numberScale(course.start);lastTime=null;syncRows(0);
 }
 const observer=new ResizeObserver(()=>{
  const w=container.clientWidth,h=container.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;
  // Keep the whole three-lane choice readable in a tall portrait viewport.
  camera.fov=camera.aspect<.62?65:55;camera.updateProjectionMatrix();
  compactScale=h<360?1.35:1;
 });observer.observe(container);
 function render(state,time){
  if(lastNumber!==state.sum){hero.remove(digit);digit=numerals.make(state.sum,state.sum<0?0xff1839:0x443bff);hero.add(digit);lastNumber=state.sum;}
  hero.position.x=state.x*LANE;hero.position.y=jumpHeight(state);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dt=lastTime===null?0:Math.max(0,Math.min(.1,(time-lastTime)/1000));lastTime=time;
  const targetScale=numberScale(state.sum);visualScale=reduced?targetScale:visualScale+(targetScale-visualScale)*(1-Math.exp(-dt*8));
  const size=1.12*visualScale*compactScale;digit.scale.set(Math.min(size,3.5/digit.userData.width),size,size);digit.position.y=.08+(!reduced&&state.status==='running'?Math.sin(time*.003)*.025:0);
  renderer.domElement.dataset.numberScale=visualScale.toFixed(3);
  renderer.domElement.dataset.jumpHeight=hero.position.y.toFixed(3);
  syncRows(state.nextRow);
  renderer.domElement.dataset.numeralGeometry='extruded';renderer.domElement.dataset.glyphPool=String(numerals.glyphCount);
  objects.forEach(({row,group,items})=>{group.position.z=state.z-row.z;group.visible=row.z-state.z<90;items.visible=row.id>=state.nextRow;
   if(row.kind==='pickups')for(const item of items.children)item.visible=row.id!==state.nextRow||!state.collected.includes(item.userData.pickupIndex);
  });
  startPlatform.position.z=state.z+9;startPlatform.visible=state.z<24;
  renderer.render(scene,camera);
 }
 function destroy(){observer.disconnect();for(const child of [...scene.children])dispose(child);numerals.destroy();renderer.dispose();renderer.domElement.remove();}
 return {load,render,destroy,canvas:renderer.domElement,dpr:renderer.getPixelRatio()};
}
