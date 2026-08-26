/* psygames-faces-names-synthetic-face · VER 1 · 19.08.2026 */
import React from 'react';
import { View } from 'react-native';
import Svg, {
  Circle,
  Ellipse,
  Line,
  Path,
  Rect,
} from 'react-native-svg';
import {
  describeSyntheticFace,
  type FacesNamesLocale,
  type SyntheticFaceSpec,
} from './core/index';

export interface SyntheticFaceProps {
  face: SyntheticFaceSpec;
  locale: FacesNamesLocale;
  size?: number;
  accessible?: boolean;
}

function faceDimensions(shape: SyntheticFaceSpec['faceShape']): { rx: number; ry: number } {
  if (shape === 'round') return { rx: 29, ry: 30 };
  if (shape === 'long') return { rx: 24, ry: 36 };
  if (shape === 'angular') return { rx: 27, ry: 33 };
  return { rx: 27, ry: 34 };
}

function hairPath(style: SyntheticFaceSpec['hairStyle']): string {
  if (style === 'crop') return 'M24 38 C25 14 76 14 77 38 C67 29 35 29 24 38 Z';
  if (style === 'wave') return 'M20 42 C17 20 35 13 50 19 C64 8 84 25 79 47 C70 35 64 37 56 28 C48 39 35 27 20 42 Z';
  if (style === 'curve') return 'M22 43 C18 16 79 8 80 43 C68 28 35 24 22 43 Z';
  return 'M21 43 C21 16 77 13 79 43 C68 29 57 25 51 23 C44 32 31 31 21 43 Z';
}

export function SyntheticFace({
  face,
  locale,
  size = 180,
  accessible = true,
}: SyntheticFaceProps) {
  const dimensions = faceDimensions(face.faceShape);
  const leftEye = 50 - face.eyeSpacing;
  const rightEye = 50 + face.eyeSpacing;
  const mouthY = 68;
  const mouthControl = mouthY + face.mouthCurve;
  return (
    <View
      accessible={accessible}
      accessibilityRole={accessible ? 'image' : undefined}
      accessibilityLabel={accessible ? describeSyntheticFace(locale, face) : undefined}
      accessibilityElementsHidden={!accessible}
      importantForAccessibility={accessible ? 'auto' : 'no-hide-descendants'}
      style={{ width: size, height: size, borderRadius: size * 0.16, overflow: 'hidden' }}
    >
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Rect x="0" y="0" width="100" height="100" rx="16" fill={face.backgroundColor} />
        <Ellipse cx="50" cy="102" rx="35" ry="28" fill={face.accentColor} />
        <Circle cx={50 - dimensions.rx} cy="51" r="5" fill={face.faceTone} />
        <Circle cx={50 + dimensions.rx} cy="51" r="5" fill={face.faceTone} />
        {face.faceShape === 'angular' ? (
          <Path
            d="M50 17 C68 17 78 30 76 50 C75 68 65 82 50 87 C35 82 25 68 24 50 C22 30 32 17 50 17 Z"
            fill={face.faceTone}
          />
        ) : (
          <Ellipse cx="50" cy="51" rx={dimensions.rx} ry={dimensions.ry} fill={face.faceTone} />
        )}
        <Path d={hairPath(face.hairStyle)} fill={face.hairColor} />
        <Line x1={leftEye - 5} y1="43" x2={leftEye + 5} y2="42" stroke={face.hairColor} strokeWidth="1.8" strokeLinecap="round" />
        <Line x1={rightEye - 5} y1="42" x2={rightEye + 5} y2="43" stroke={face.hairColor} strokeWidth="1.8" strokeLinecap="round" />
        <Circle cx={leftEye} cy="49" r="2.2" fill="#24202b" />
        <Circle cx={rightEye} cy="49" r="2.2" fill="#24202b" />
        {face.glasses ? (
          <>
            <Circle cx={leftEye} cy="49" r="7" fill="none" stroke={face.accentColor} strokeWidth="1.8" />
            <Circle cx={rightEye} cy="49" r="7" fill="none" stroke={face.accentColor} strokeWidth="1.8" />
            <Line x1={leftEye + 7} y1="49" x2={rightEye - 7} y2="49" stroke={face.accentColor} strokeWidth="1.8" />
          </>
        ) : null}
        <Path d="M50 51 L47 60 Q50 62 53 60" fill="none" stroke="#8b5e49" strokeWidth="1.4" strokeLinecap="round" />
        <Path d={`M39 ${mouthY} Q50 ${mouthControl} 61 ${mouthY}`} fill="none" stroke="#8b3f4f" strokeWidth="2" strokeLinecap="round" />
      </Svg>
    </View>
  );
}
