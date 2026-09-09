/* psygames-spatial-core-dev-redirect · VER 1 · 09.09.2026 */
/* LOCAL REV spatial-lab/2026-09-09.1 · psygames-codex-mac · not an app release */
// Compatibility for the already-shared local preview URL. No storage changes.
import React from 'react';
import {Redirect} from 'expo-router';
export default function SpatialLabLegacy(){return <Redirect href={'/games/spatial-lab' as any}/>;}
