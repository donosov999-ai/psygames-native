// VER 1 · LOCAL 0.3 · 2026-09-12 · Real extruded numeral meshes, shared glyph pool.
import * as T from 'three';
import {FontLoader} from 'three/addons/loaders/FontLoader.js';
import {TextGeometry} from 'three/addons/geometries/TextGeometry.js';
import fontData from 'three/examples/fonts/helvetiker_bold.typeface.json' with {type:'json'};
// Font data retains Magenta's copyright and full permission notice; see public/runner-font-license.txt.
export function createNumerals(){
 const font=new FontLoader().parse(fontData),glyphs=new Map(),materials=new Map();
 for(const char of '0123456789+-x'){
  const geometry=new TextGeometry(char,{font,size:1,depth:.22,curveSegments:3,bevelEnabled:true,bevelThickness:.025,bevelSize:.018,bevelSegments:1,steps:1});
  geometry.computeBoundingBox();const bounds=geometry.boundingBox;
  const width=bounds.max.x-bounds.min.x;geometry.translate(-bounds.min.x,0,-.11);geometry.userData.shared=true;glyphs.set(char,{geometry,width});
 }
 function material(color){if(!materials.has(color)){
  const front=new T.MeshStandardMaterial({color,roughness:.32,metalness:.12});
  const side=new T.MeshStandardMaterial({color:new T.Color(color).multiplyScalar(.6),roughness:.42,metalness:.12});
  for(const m of [front,side])m.userData.shared=true;materials.set(color,[front,side]);
 }return materials.get(color);}
 function make(text,color=0x7857ed){
  const normalized=String(text).replaceAll('−','-').replaceAll('×','x');const group=new T.Group();let x=0;
  for(const char of normalized){const glyph=glyphs.get(char);if(!glyph)throw Error(`Unsupported numeric glyph ${char}`);
   const mesh=new T.Mesh(glyph.geometry,material(color));mesh.position.x=x;mesh.castShadow=true;group.add(mesh);x+=glyph.width+.07;
  }
  const width=Math.max(.1,x-.07);for(const mesh of group.children)mesh.position.x-=width/2;
  group.userData.width=width;group.userData.height=1.08;group.userData.extruded=true;return group;
 }
 function destroy(){for(const g of glyphs.values())g.geometry.dispose();for(const list of materials.values())for(const m of list)m.dispose();}
 return {make,destroy,glyphCount:glyphs.size};
}
