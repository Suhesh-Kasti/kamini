# Kamini

A small handmade world, built to be reused whenever words alone are not enough. It is a static Astro site with a YAML config, GSAP motion, procedural Three.js characters, a hidden local settings panel, and seven hand-choreographed endings.

No backend. No database. No tracking. Deploys to Cloudflare Pages as-is.

## Quick start

```bash
npm install
npm run dev
```

Then open the local URL on your phone or in a narrow browser window. Mobile is the primary experience.

```bash
npm run build
npm run preview
```

`npm run icons` regenerates the PNG home screen icons.

## Change the mood for a visit

Open `config.yaml` and set one line:

```yaml
active_theme: cozy_crochet
```

Options: `angry_kitten`, `sad_cloud`, `sweet_ask`, `shopping_muse`, `save_the_coins`, `cozy_crochet`, `just_for_fun`.

Push. Cloudflare rebuilds. That is the whole switch.

## Change her name and the small stuff

```yaml
global:
  her_name: "Kamini"
  show_her_name: "rarely"      # always | rarely | never
  music_volume: 0.35
  reduced_motion_fallback: true
  easter_egg_enabled: true
  install_prompt: true
  max_pixel_ratio: 2
  secret_taps: 2
```

`show_her_name: rarely` keeps it out of the browser tab and lets the ending carry the personal note instead.

## Add or replace questions

Questions live entirely in `config.yaml`. The engine never hardcodes flow.

```yaml
questions:
  - id: "photo_delete"
    eyebrow: "about those photos"
    text: "Do you want me to delete these photos?"
    whispers:
      - "that button is feeling shy"
    buttons:
      - label: "Yes"
        role: "wrong"
        on_hover: "runaway"
        on_tap: "runaway"
        on_click: "swap_label"
        labels_cycle: ["Yes", "wait no", "please no"]
      - label: "No"
        role: "correct"
        on_hover: "grow"
        next: "photo_confirm"
    transition_out: "fade_soft"
```

- `role`: `correct`, `wrong`, `trick`, or `neutral`. A correct button advances after its click behavior.
- `next`: a question id, or `"ending"`. If omitted, the next question in the list is used.
- `on_hover`, `on_tap`, `on_click`: behavior names. Hover runs only with a fine pointer. Tap runs on finger down. Click runs on activation.
- `labels_cycle`: rotates labels on wrong taps, and on `swap_label` or `sneeze`.
- `theme_override`: changes palette and 3D scene for that question only.
- `music_override`: a path under `public/`, or `null`.
- `text_by_theme`: optional per-theme wording for the same question.
- `transition_out`: `fade_soft`, `bounce_warm`, `thread_pull`, or `ending_glow`.

### Behavior library

All names live in `src/scripts/behaviors.ts`:

`runaway`, `shrink`, `grow`, `swap_label`, `swap_roles`, `dodge_then_accept`, `ghost`, `morph`, `disabled_polite`, `multi_stage`, `escape_forever`, `mirror`, `peek_a_boo`, `jelly`, `sneeze`, `hide_behind`, `puddle`, `spin_away`, `unravel`, `chase`, `sleepy`, `pop_up`, `thread_reel`.

Every behavior has a touch path. On a phone, the tap behavior fires on pointer down, and pointer capture keeps the activation reliable even after a button runs away.

The tiny lines a behavior whispers live in `behavior_lines` near the top of `config.yaml`, so even those stay editable without touching code.

## Add a theme

Copy a theme block in `config.yaml`:

```yaml
themes:
  rainy_afternoon:
    label: "rainy afternoon"
    mood: "quiet and close"
    colors:
      primary: "#A9B8D6"
      secondary: "#F4F1EA"
      accent: "#8296C4"
      ink: "#3F4557"
      soft: "#DDE3F2"
      background_gradient: ["#F2F4FA", "#E4E8F4", "#D3DAED"]
    three_d:
      clouds: true
      cat: true
      dog: false
      particles: true
      yarn_balls: false
      crochet_hook: false
      piggy_bank: false
      shopping_bag: false
      coins: false
      envelope: false
      hearts: false
      flower: true
    music: null
    ending:
      animation: "clouds_part_bloom"
      note: "Your own note here."
      signature: "quietly yours"
    microcopy_flavor: "tender_quiet"
```

The `ending.animation` must match a registered ending: `kitten_apology`, `clouds_part_bloom`, `puppy_envelope`, `cat_shopping_bag`, `piggy_bank_bloom`, `yarn_weave_note`, `cat_dog_chaos`. You can reuse an ending for a new theme until you build its own.

## Add a new ending animation

1. Create `src/components/endings/MyEnding.astro`. Start from an existing component. Include `HandwrittenNote`, a `[data-note-text]` target, and any character markup you want.
2. Register it in `src/components/scenes/EndingScene.astro` in the `endings` array.
3. Add a player in `src/scripts/endings.ts` and register it in the `players` object under the same name.
4. Point a theme at it in `config.yaml`.

Endings run 4 to 8 seconds. Use `gsap` with the shared eases `pillow`, `hush`, `lift`, `unfurl`, `breath`. The note is filled from YAML. `reduced` is passed in, so keep a fade-only path.

## Add music

See `public/audio/README.md`. Short version:

```yaml
themes:
  just_for_fun:
    music: "audio/just-for-fun.mp3"
```

The track fades in on the first gesture, fades out on a scene change, and respects `global.music_volume`. The button in the top left toggles mute. Nothing autoplays before she touches the screen.

## Change fonts and colors

Fonts are named in `config.yaml`:

```yaml
fonts:
  heading: "Dancing Script"
  subheading: "Parisienne"
  body: "Quicksand"
```

The self-hosted files are imported in `src/layouts/BaseLayout.astro`. If you choose a different family, add the matching `@fontsource` package and import its weights there. Two heading faces maximum, one body face.

Colors are per theme under `colors`. `primary`, `secondary`, `accent`, `ink`, `soft`, and a three stop `background_gradient` feed the whole room, the 3D scene, and the note paper.

## The tiny secret

There is a small star in the top right corner. It is deliberately quiet.

- Tap it `easter_egg.unlock_after_taps` times, `2` by default.
- A soft sheet slides up with her theme, music volume, and motion preference.
- She can replay the last ending or start again.
- Every choice is stored in `localStorage` under `kamini.prefs.v1`. It never leaves her device.
- The build still decides the default theme. Her choice applies on top, per device.

## Three.js and performance

The 3D layer is hand-built from primitives in `src/scripts/three-scene.ts`. No external model downloads. That keeps the page light and avoids broken asset links.

- The renderer is loaded after the first idle moment, not on the critical path.
- Pixel ratio is capped by `global.max_pixel_ratio`.
- The scene rebuilds only when the theme changes.
- Idle motion pauses when the tab is hidden.
- Reduced motion lowers amplitudes and removes pointer parallax.
- Actors are simple low-poly meshes with soft lighting and no shadow maps.

If a phone is struggling, lower `max_pixel_ratio` to `1.5` or turn off `particles` for that theme.

## PWA

`public/manifest.webmanifest`, `public/sw.js`, and `public/icons/` make it installable. The service worker caches the shell and same origin assets. After the ending, a soft prompt invites her to add it to her home screen, once, and never nagging.

Service worker registration is skipped on plain HTTP except localhost, and the install prompt only appears when the browser offers it or on iOS where the share sheet is the only route.

## Project map

```
src/
  components/
    scenes/      QuestionScene, EndingScene
    endings/     seven ending components
    ui/          HandwrittenNote, MusicToggle, EasterEggPanel
  layouts/       BaseLayout
  pages/         index
  scripts/       app, behaviors, animations, endings, three-scene, audio, config, storage
  styles/        global, endings
  lib/           types, build-time config loader
config.yaml
public/
  icons/
  audio/
```

## A note on the absolute rules

No emojis. No em dashes. No confetti. No hardcoded question flow. No backend. No stock celebration screens. Every question, color, note, and ending is meant to be changed from `config.yaml` and the ending components, not by rewriting the engine.

Make it for her, then make it again next week.
