# Image-effects provenance and release boundary

## Local research reference

The requested effect inventory was checked against Denis and Claude's local
research prototype. It is not vendored into this module:

- `/Users/denisonosov/Downloads/Code claude/wirechanger-effects/generator.html`
  — SHA-256 `277f19719ec37366551af0bf6a844e7340e90b26fe7e8f178d051ce3ba0e80d9`;
- `/Users/denisonosov/Downloads/Code claude/wirechanger-effects/EFFECTS_REF.md`
  — SHA-256 `9f7979fb89e1721e3df57789b9ba5831d84826892ca95b86d08476041ad68cf6`;
- `/Users/denisonosov/Downloads/Code claude/wirechanger-effects/_source_SpecialEffects.wpt`
  — SHA-256 `4f1ecdf9adbaeb2d5dbf8242c581679d791c1d7cf6bd593450ee72b31b98ae11`.

That directory has no license granting redistribution, and its historical WPT
input is not a source PsyGames may ship. The lab therefore includes only newly
written implementations of generic image operations. It does not include the
binary/preset, original source, artwork, frames, copy, product name, or visual
identity. The result is not represented as a faithful WireChanger port.

## Background assets

No photographic background was added. Browser evidence uses a procedural
gradient/checker generated at runtime, so it has no third-party asset license.
A release background remains blocked until its manifest records at least:

- source/provider URL or internal generation record;
- author and exact license/version;
- retrieval/generation date and commercial modification/offline-distribution
  permission;
- original and derived SHA-256;
- required attribution and model/property release when people or property are
  recognisable.

## Performance evidence boundary

Headless Chromium render timings are a regression proxy, not battery evidence.
They do not establish energy use or Android WebView reliability. Release
approval requires a real target-device trace against a static-background
baseline, including steady-state frame timing, long tasks, memory/GC,
temperature and power consumption, plus pause/background/dispose recovery.
