# Cosmic-body visual set · local manifest

## Boundary

These raster assets were generated specifically for the local Smart Alarm
prototype with Codex Desktop built-in ImageGen. No stock/reference image from
the discussion is packaged in the application. The files remain local to
`/Users/denisonosov/dev/psygames-game-lab`; they have not been published or
submitted to a store.

## Shared style

- dark cosmic/aura background;
- luminous blue-violet anatomical figure;
- fine multicolour energy filaments;
- seven unlabelled energy-centre lights;
- no text, logo, watermark or medical claim;
- pose variants keep a phone visible in one hand because the user follows the
  practice from the screen.

## Files

| File | Pixels | Use |
|---|---:|---|
| `body-master-v1.webp` | 1024×1536 RGBA | One reusable standing figure, cropped by CSS for face, abdomen and pelvic-floor zones. |
| `pose-horse-phone-v1.webp` | 1402×1122 RGB | Shallow horse stance with knees aligned over the feet and phone at chest height. |
| `pose-cobbler-phone-v1.webp` | 1024×1536 RGB | Upright cobbler/bound-angle pose, soles together, phone in one hand. |
| `pose-lotus-phone-v1.webp` | 1024×1536 RGB | Symmetric comfortable lotus, phone in one hand, free hand relaxed. |
| `pose-mountain-phone-v1.webp` | 1024×1536 RGB | Neutral standing alignment with phone in one hand. |

The RGB pose assets intentionally use a near-black field and are composited
with CSS `mix-blend-mode: screen`. `body-master-v1.webp` has real transparency.

## Generated-source provenance

The master output retained by Codex Desktop is:

`/Users/denisonosov/.codex/generated_images/01a00bd7-7b65-7130-a62a-2cdc1e6ee88f/exec-0faad85e-e60c-43ad-84cf-66879c931bda.png`

Prompt constraints for the four pose variants explicitly required correct
yoga alignment, anatomically plausible limbs and a visible phone-compatible
hand position. The packaged files above are the acceptance sources; no remote
URL is required at runtime.
