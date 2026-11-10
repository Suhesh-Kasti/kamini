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

## Quiz beats and variants

Questions are fixed story beats. Each beat has three or more delivery variants, so the wording, button labels, entrance motion, microcopy, and minigame pool can change between visits without moving the story.

```yaml
questions:
  - id: "first_pick"
    sequence_index: 1
    eyebrow: "a small choice"
    variants:
      - id: "gentle"
        text: "Pick the one you would keep."
        buttons:
          - label: "this one"
            role: "wrong"
            personality: "scaredy"
          - label: "that one"
            role: "correct"
            on_hover: "grow"
            on_click: "grow"
            next: "second_pick"
        minigame_pool: ["buttons"]
        microcopy: ["the wrong one is feeling shy"]
        animation: "pillow"
      - id: "playful"
        text: "Choose before I change my mind."
        minigame_pool: ["catch_object", "drag_to_target"]
        microcopy: ["it is faster than you", "caught it yet"]
        animation: "snap"
```

The session planner weights variants by `1 / (1 + times_seen)`, stores counts in `localStorage`, and keeps a fixed beat order. The settings sheet has a shuffle action that clears the seen log and rerolls the current session. A tiny sparkle appears when unseen variants exist.

## Wrong-button personalities

Wrong buttons are escape targets. Hovering one on desktop or touching one on a phone makes it dodge away, its label never changes, and a click or keyboard activation is ignored. Give each wrong button a `personality` for its idle motion, taunt microcopy, and character reaction.

Personalities: `scaredy`, `sleepy`, `showoff`, `clumsy`, `sassy`, `confused`, `hungry`, `shy`, `hyper`, `proud`, `sneaky`, `peekaboo`.

The engine assigns unique personalities across the session. The correct button always advances on the first tap. No wrong button can ever be activated into the correct role.

## Minigames

The `minigames` registry in `config.yaml` is the single roster. Every entry has a display name, description, supported devices, permissions, fallback, default state, optional theme affinity, and `status: ready` or `status: coming_soon`.

```yaml
minigames:
  - id: "scratch_card"
    name: "scratch the card"
    description: "rub the soft cover until the picture underneath peeks through."
    device_support: ["touch", "mouse"]
    permissions: ["none"]
    fallback_game_id: "choose_item"
    enabled_by_default: true
    status: "ready"
```

All eighteen registered games are playable: scratch card, catch the camera, catch the little heart, drag to target, tilt pour, hold to fill, sort bins, pet the character, wipe fog, memory match, choose an item, pull the thread, blow the cloud away, tap on the beat, trace the line, shake to reveal, feed the cat, and spin the wheel.

The planner never chooses the same minigame twice in one session. If a pool is exhausted it picks another unused game, then falls back to a tap, never a repeat.

The planner intersects the variant pool with enabled games, device capabilities, permissions, and theme affinity. If a game cannot run it falls back along `fallback_game_id`, then to a built-in tap, so a question never stalls. The settings sheet lists every game with device icons and a switch. Disabling a game removes it from the session pool.

Scratch cards require 85 percent cleared, show a progress arc, and pulse gently after a pause below the threshold.

## Permissions and camera

Camera, microphone, and motion games show a designed pre-permission card before the browser prompt. Saying no falls back to another game with a short note in the site voice. Camera photos stay in memory unless `keep me` is tapped, where they are stored as a local data URL only. Nothing is uploaded, and delete removes the stored copy.

The camera game is loaded lazily only when chosen. The custom permission card always comes first with a clear camera-permission label. After permission is granted, the game is a small drifting camera target. There is no countdown. The still is captured only when she catches the camera icon, then shown back to her with a teasing note, keep me, and delete. The camera preview stays hidden. Nothing is saved until she taps keep me.

## Keep me and print

When a photo is shown, a small `keep me` pill opens a print layout containing only the photo, a handwritten caption, and a signature. Use `global.print_caption` and `global.print_signature` in YAML. The print stylesheet hides the rest of the site.

## Debugging

Open the site with `?debug=1` for an overlay showing state, resolved theme, question, variant, game, capabilities, permissions, activation locks, and scene. In debug mode the console logs theme reads and writes, activation gates, and recovery events. A `window.__pocketMood` helper exposes `state()`, `plan()`, `skip()`, `forceVariant()`, and `forceGame()` for local verification only.

## Add a theme

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

Themes without `photo_index` stay photo-free. Add a set of options under `global` and pick one by index. Use `photo_indices` for a small side-by-side strip. A single override path works too. Any displayed ending photo gets the keep me print control. See `public/images/README.md`.

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

A small star in the top right corner. Tap it a few times to open a local settings sheet for theme, volume, motion, minigame toggles, and a session shuffle. It can replay the last ending or start over. Choices live in `localStorage` on the device and never leave it.

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
  scripts/        app, variants, minigames, personalities, device, camera, print,
                  behaviors, animations, endings, three-scene, audio, config, storage
  styles/         global, themes, endings, minigames
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

A Cloudflare Worker could later assign variant combinations per session, so the experience varies even after clearing local storage. That is optional. The current build keeps variant selection, the seen log, permissions, and minigames entirely client-side for zero cold starts and no backend to maintain.
