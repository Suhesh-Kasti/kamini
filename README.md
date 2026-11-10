# Pocket Mood

A tiny interactive theme template for social media trend pages.

One YAML file changes the type, layout, paper, motion, 3D scene, and ending. The whole experience is static, touch-first, and installable as an app. Built with Astro, GSAP, and Three.js.

## Quick start

```bash
npm install
npm run dev
```

```bash
npm run build
npm run preview
npm run check
npm run icons
```

## Change the mood

```yaml
active_theme: cozy_crochet
```

Presets: `angry_kitten`, `sad_cloud`, `sweet_ask`, `shopping_muse`, `save_the_coins`, `cozy_crochet`, `just_for_fun`.

Each preset is a complete little world:

| Preset | Type anchor | Layout | 3D set | Signature moment |
|---|---|---|---|---|
| angry_kitten | Instrument Serif, Caveat, Manrope | torn paper, asymmetric | kitten close to camera | claw marks |
| sad_cloud | Fraunces, Reenie Beanie | watercolor center | cloud bank and rain | rain on the glass |
| sweet_ask | Italiana, Shadows Into Light Two, Inter | chocolate editorial | chocolate flat lay | gold shimmer and a snap |
| shopping_muse | DM Serif Display, Kalam, Karla | magazine spread | bag, heels, perfume | foil sweep |
| save_the_coins | Fredoka, Nothing You Could Do, Sofia Sans | warm ledger | piggy bank and coins | coin counter |
| cozy_crochet | Yeseva One, Patrick Hand, Nunito Sans | woven page | yarn, hook, granny squares | thread-drawn note |
| just_for_fun | Bricolage Grotesque, Gochi Hand, Baloo 2 | scrapbook | cat and dog on a rug | keepsake sticker |

No two presets share a type pairing or a scene.

## Add a question

Questions live in `config.yaml`.

```yaml
questions:
  - id: "first_pick"
    eyebrow: "a small choice"
    text: "Pick the one you would keep."
    whispers:
      - "the wrong one is feeling shy"
    buttons:
      - label: "this one"
        role: "wrong"
        on_hover: "runaway"
        on_tap: "runaway"
        on_click: "swap_label"
        labels_cycle: ["this one", "wait", "not this one", "okay, keep it"]
      - label: "that one"
        role: "correct"
        on_hover: "grow"
        next: "second_pick"
    transition_out: "theme"
```

- `role`: `correct`, `wrong`, `trick`, or `neutral`.
- `next`: another question id, or `"ending"`.
- `theme_override`: swaps the whole preset for one question.
- `music_override`: a path under `public/`, or `null`.
- `text_by_theme`: optional wording per preset.

Behavior names: `runaway`, `shrink`, `grow`, `swap_label`, `swap_roles`, `dodge_then_accept`, `ghost`, `morph`, `disabled_polite`, `multi_stage`, `escape_forever`, `mirror`, `peek_a_boo`, `jelly`, `sneeze`, `hide_behind`, `puddle`, `spin_away`, `unravel`, `chase`, `sleepy`, `pop_up`, `thread_reel`.

Every behavior works with touch. On a phone, the tap behavior fires on pointer down, and pointer capture keeps activation reliable even after a button runs away.

## Add a theme

Every theme needs all six dimensions: type, layout, decor, motion, material, and scene.

```yaml
themes:
  studio_blue:
    label: "studio blue"
    mood: "quiet and close"
    colors:
      primary: "#8C9BB0"
      secondary: "#E8EDF2"
      accent: "#5E7188"
      ink: "#2F3A45"
      paper: "#F3F5F4"
      highlight: "#B8C6D6"
      background_gradient: ["#DDE6EE", "#C9D6E2", "#B3C4D4"]
    type:
      display: '"Fraunces", Georgia, serif'
      display_weight: 400
      hand: '"Reenie Beanie", cursive'
      hand_weight: 400
      body: '"Fraunces", Georgia, serif'
      body_weight: 400
    layout: "watercolor_center"
    decor: "rain_window"
    motion: "drift"
    material: "watercolor"
    scene: "cloud_bank"
    signature_moment: "rain_glass"
    music: null
    ending:
      animation: "clouds_part_bloom"
      note: "A tiny note goes here."
      signature: "quietly"
      hand_letter: "breathe"
    microcopy_flavor: "tender_quiet"
```

Layouts: `torn_left`, `watercolor_center`, `chocolate_editorial`, `magazine_spread`, `warm_ledger`, `woven_page`, `scrapbook`.

Decor sets: `kraft_notes`, `rain_window`, `gold_foil`, `fashion_editorial`, `wood_coins`, `stitched`, `stickers`.

Motion families: `snap`, `drift`, `shimmer`, `shutter`, `spring`, `stitch`, `bounce`.

Scenes: `kitten_close`, `cloud_bank`, `chocolate_flatlay`, `studio_accessories`, `piggy_desk`, `yarn_corner`, `rug_play`.

Signature moments: `claw_marks`, `rain_glass`, `chocolate_snap`, `foil_shimmer`, `coin_counter`, `stitch_note`, `sticker_keepsake`.

## Fonts

Type is per theme. Add a Fontsource package, import its Latin weights in `src/layouts/BaseLayout.astro`, then name the family in `config.yaml`.

```bash
npm install @fontsource/gloock
```

```ts
import "@fontsource/gloock/latin-400.css";
```

Keep three faces per theme: one display anchor, one handwritten voice, one readable body.

## Portrait slots

The ending cards can show a portrait above the note. Drop an image in `public/images/` and add an optional index to one theme:

```yaml
themes:
  just_for_fun:
    ending:
      photo_index: 0
```

Themes without `photo_index` stay photo-free. Add a set of options under `global` and pick one by index. Use `photo_indices` for a small side-by-side strip. A single override path works too. See `public/images/README.md`.

## Music

```yaml
global:
  music: "audio/music.mp3"
```

A theme or a question can override it with `music` or `music_override`. Set `null` to fall through. The player loops, fades in on the first gesture, fades out on a scene change, respects `global.music_volume`, and obeys the corner mute toggle. Nothing autoplays before the first tap.

## Add an ending

1. Create `src/components/endings/MyEnding.astro`, starting from an existing one.
2. Register it in `src/components/scenes/EndingScene.astro`.
3. Add a player in `src/scripts/endings.ts`.
4. Point a theme at it in `config.yaml`.

The note and optional portrait are filled from YAML. Keep a fade-only path for reduced motion.

## The tiny secret

A small star in the top right corner. Tap it a few times to open a local settings sheet for theme, volume, and motion. It can replay the last ending or start over. Choices live in `localStorage` on the device and never leave it.

## 3D and performance

The 3D layer is hand-built Three.js: rounded geometry, PBR materials, procedural wood, wool, chocolate, leather, and paper, a generated PMREM environment, one soft key light, a rim light, contact shadows, and subtle bloom on the gold and chocolate scenes.

- One GSAP ticker drives the DOM and the renderer.
- Three.js is a lazy chunk. The active scene is built after first paint.
- Scenes are cached. Three are kept, older ones are disposed.
- Repeated geometry uses `InstancedMesh`.
- Clouds are merged into a few opaque meshes.
- DPR is capped at 1.5 on mobile and 2 on desktop.
- Shadows are desktop only. Mobile uses baked blob shadows.
- Rendering pauses when the tab is hidden.
- Reduced motion lowers amplitudes and removes pointer parallax.

## PWA

`public/manifest.webmanifest`, `public/sw.js`, and `public/icons/` make it installable. The shell and same-origin assets are cached. After the ending, a soft prompt invites an install, once.

## Project map

```
src/
  components/
    endings/      seven ending components
    scenes/       QuestionScene, EndingScene
    ui/           note, letter, photo, music, secret panel, theme chrome
  layouts/        BaseLayout
  pages/          index
  scripts/        app, behaviors, animations, endings, three-scene, audio, config, storage
  styles/         global, themes, endings
  lib/            types, build-time config loader
config.yaml
public/
  audio/
  images/
  icons/
```

## Deploy

Static output. Point Cloudflare Pages at the repo, build with `npm run build`, and publish `dist/`.

Keep the site static and config-driven. No backend. No emojis in the interface. No em dashes in copy or code.
