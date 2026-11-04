#version 460 core
#include <flutter/runtime_effect.glsl>
uniform vec2 uSize;
uniform vec2 uSourceSize;
uniform vec4 uCaps;
uniform float uHue;
uniform float uSaturation;
uniform float uLightness;
uniform float uStrength;
uniform float uMask;
uniform float uDarkGlyph;
uniform sampler2D uImage;
uniform sampler2D uGlyphMask;
out vec4 fragColor;

float axis(float p, float dest, float src, float leading, float trailing) {
  if (leading + trailing < .001) return p / dest;
  if (p < leading) return p / src;
  if (p > dest - trailing) return (src - dest + p) / src;
  return (leading + (p-leading) * (src-leading-trailing) / max(.001,dest-leading-trailing)) / src;
}
vec3 toHSV(vec3 c) {
  float hi=max(c.r,max(c.g,c.b)), lo=min(c.r,min(c.g,c.b)), d=hi-lo;
  float h=0.;
  if(d>.0001) {
    if(hi==c.r) h=mod((c.g-c.b)/d,6.);
    else if(hi==c.g) h=(c.b-c.r)/d+2.;
    else h=(c.r-c.g)/d+4.;
    h=fract(h/6.+1.);
  }
  return vec3(h, hi<.0001 ? 0. : d/hi, hi);
}
vec3 fromHSV(vec3 c) {
  vec3 wave=abs(mod(c.x*6.+vec3(0.,4.,2.),6.)-3.);
  return c.z * mix(vec3(1.),clamp(wave-1.,0.,1.),c.y);
}
void main() {
  vec2 p=FlutterFragCoord().xy;
  vec2 uv=vec2(axis(p.x,uSize.x,uSourceSize.x,uCaps.x,uCaps.z),axis(p.y,uSize.y,uSourceSize.y,uCaps.y,uCaps.w));
  vec4 src=texture(uImage,uv);
  vec3 rgb=src.rgb/max(src.a,.0001);
  vec3 hsv=toHSV(rgb);
  // Only sapphire/cyan-blue regions. Gold/skin/white are NOT target materials.
  float mask=smoothstep(.47,.54,hsv.x)*(1.-smoothstep(.76,.84,hsv.x))*smoothstep(.08,.32,hsv.y);
  if(uMask>.5) { fragColor=vec4(vec3(mask)*src.a,src.a); return; }
  float hue=fract(uHue+(hsv.x-.64)*.35+1.);
  // Gamma changes the body of the stone, retaining black shadows and bright facets.
  // Neutral defaults preserve the existing shader exactly; not a flat white/black fill.
  float value=pow(hsv.z,exp2(-uLightness*3.));
  vec3 target=fromHSV(vec3(hue,clamp(hsv.y*uSaturation,0.,1.),value));
  vec3 result=mix(rgb,target,mask*uStrength);
  // Only the explicit extracted icon silhouette, not the stone's white glints.
  float glyph=texture(uGlyphMask,uv).r*uDarkGlyph;
  result=mix(result,vec3(.015),glyph);
  fragColor=vec4(result*src.a,src.a);
}
