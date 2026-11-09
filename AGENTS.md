THE MISSION (READ FIRST)

I am building a website for my girlfriend Kamini. It is not a one-off love letter. I will reuse it many times across many situations: when she is angry, when she is sad, when I need a favor, when I want to gently save money, when she wants to go shopping, when she is in a crochet mood, and when I just want to see her smile.

It has to feel handcrafted, warm, human, and personal. It must not look like an AI template. It must not use stock layouts, generic confetti endings, or cliche love letter screens. Every easing curve, every handwritten note, every idle animation on a cat or a yarn ball should feel like someone spent real hours on it, because I did, and I am trusting you to build it with the same care.

She will mostly open this on her phone. Mobile is the primary experience. Touch is the primary input. Design and test for that first. But shemight also open it in desktop as she is most of the time in her lapyop watching series and stuff so we should be prepared for all displays all sorts of resolutions.

---

TECHNICAL STACK (NON NEGOTIABLE)

· Astro JS, static output, no backend needed. Hosted on Cloudflare Pages. Better if you can make it a PWA from start so she can have it as an app in her homescreen anytime she misses me. she gets a notification at the end to install this experience as an app.
· GSAP with CustomEase, ScrollTrigger if useful, SplitText if available, and any other official plugins needed. Elastic, back, custom beziers, no linear easing anywhere.
· ETA or GSAP CustomEase for extra easing curves.
· Three.js via Astro for 3D scenes and idle character animations.
· Font Awesome for icons. Absolute rule: no emojis anywhere, not in UI, not in config, not in copy, not in comments.
· Free licensed 3D assets like Poly Pizza, Sketchfab free, Quaternius, Kenney, three.js examples, or hand-built geometry in Three.js. Choose cute low poly or rounded 3D styles that match soft pastel visuals. if needed use paid ones that are free to use for personal projects. it should be the best one available.
· One YAML config file drives everything user-facing. Build-time loading is fine (Cloudflare rebuilds on push). Write the config layer so it could later be swapped to runtime fetch without refactor. 
· Responsive and touch-first. Every hover behavior must have a tap equivalent. Buttery smooth. Efficient. 60fps on mobile is the target, with graceful degradation only and only if needed otherwise smoothness all the time in both phone and desktop.


---

DESIGN LANGUAGE

Soft pastel pinks as the base across most themes, with per-theme color shifts into blush, peach, lavender, mint, cream, caramel, wool white, dusty sage, and warm gold. Layered gradients, subtle noise texture, pillow-soft rounded corners, no sharp edges.

Typography: modern calligraphy for headings (choose from Dancing Script, Parisienne, Great Vibes, or any other true modern calligraphy that reads beautifully on mobile) paired with a soft rounded sans for body (Quicksand, Nunito, Poppins). Mix them with intent. Some lines should feel like a handwritten whisper, some like a warm spoken sentence. Use at most two heading faces and one body face to keep it cohesive.

Motion: organic, alive, buttery. Buttons breathe slightly when idle. Clouds drift. Text reveals word by word, not in one block. Hovering a button feels like a small breath of life. Every click rewards with a small playful reaction, never a stock pop. Nothing linear. Nothing mechanical. Nothing janky.

3D elements: soft clouds, cute low-poly cats and dogs (no breed preference, just cute), floating particles like fairy dust, small thematic props per theme (yarn balls, a crochet hook, a shopping bag, a piggy bank, a tissue box). Each character idles with subtle life: blink, tail wag, head tilt, breathing scale. Soft ambient and directional lighting, gentle shadows, seamless blend with 2D pastel backgrounds.

Subtle human teasing woven through microcopy and behavior. Warm, playful, never mean, never sprayed. Remind her she is beautiful in earned moments, not in every sentence. Examples of tone to calibrate (write fresh ones, do not copy): "nice try", "you really want to do that?", "I saw that", "okay okay, you win", "you are a menace and I adore you", "still the prettiest person in the room", "hm. try again", "you cannot escape me". No em dashes anywhere in copy or code. Use commas, periods, colons, parentheses.

---

THE THEMES (EACH FULLY BUILT)

Each theme is a complete personality: colors, fonts, microcopy tone, default music slot, 3D scene mood, and a unique ending animation. All endings are hand choreographed, 4 to 8 seconds, no confetti, no generic love letter screens, no "happy birthday" style bursts. Every ending feels like a small handmade moment.

1. angry_kitten — for when she is annoyed. Blush pinks and warm cream. Scene has a small kitten. Ending: kitten walks in slowly, sits, looks up, blinks, and a handwritten note unfolds with a soft warm glow.
2. sad_cloud — for when she is sad. Lavender, misty blue, cream. Scene has gathering clouds and gentle raindrops. Ending: clouds part slowly, warm light breaks through, a cat stretches and yawns, small flowers bloom at the bottom of the screen, and a comforting handwritten note appears.
3. sweet_ask — for asking a favor. Warm peach sunset. A cute puppy in scene. Ending: puppy runs in with a small envelope, drops it, envelope opens, handwritten note slides out, soft hearts drift up.
4. shopping_muse — for shopping moods. Candy pink and gold. A shopping bag and small floating coins in 3D. Ending: a cat bats a shopping bag across the screen, coins gently bounce out in slow motion, a handwritten note slides in like a receipt.
5. save_the_coins — for gently suggesting saving money. Mint green, cream, soft pink. A piggy bank and a coin jar. Ending: piggy bank wiggles, a coin drops in with a soft clink, a flower sprouts beside it, a handwritten note unfolds.
6. cozy_crochet — for her crochet mood. Warm cream, dusty rose, sage, wool white, caramel. Scene has floating yarn balls, a crochet hook, half-finished granny squares, and a cozy crocheted cat amigurumi. Ending: a yarn ball unwinds gently, thread travels across the screen and weaves itself into a handwritten note line by line, the crocheted cat tilts its head and blinks, a soft blanket edge animates in at the bottom.
7. just_for_fun — default playful theme. Cotton candy pinks and cream. A cat and a dog chasing each other gently. Ending: cat knocks a pastel object off a shelf in slow motion, dog catches it, both turn to look at her with innocent eyes, handwritten silly note appears.
8. You can inject your creativity as well. it should never look AI. every font every design everything should look custom designed by a world class designer. 


Each theme stores its full definition in YAML so I can add new ones later. The engine registers endings by name so new endings can be dropped in as new components without touching the engine.

THE QUESTION ENGINE (CORE)

Questions live entirely in YAML. I can add as many as I want, in any order, with any combination of behaviors. No question flow is hardcoded.

Each question has:

· text: shown in calligraphy
· buttons: list of button definitions
· transition_out: how this scene exits
· optional theme_override and music_override

Each button has:

· label
· role: correct, wrong, trick, neutral
· on_hover, on_click, on_tap: behavior names, overridable per input type
· labels_cycle: optional array of labels to cycle through on repeated interaction
· next: what to do after click (advance, stay, restart, jump to ending)

Behavior library, configurable per button. Implement all of these:

· runaway — dodges the pointer or finger, relocates, comes back after a beat
· shrink / grow — small or big on hover or focus
· swap_label — cycles through labels_cycle on each interaction
· swap_roles — clicking a wrong button activates the correct one (the classic trap)
· dodge_then_accept — runs, gives up, accepts with a sad shake
· ghost — fades out, reappears elsewhere
· morph — visually morphs into another button
· disabled_polite — click does nothing, small wiggle, soft microcopy whisper
· multi_stage — advances to a follow-up question
· escape_forever — after N attempts, floats away permanently
· mirror — mirrors the other button's movement (one moves, the other mirrors)
· peek_a_boo — hides behind the other button, peeks out on repeat attempts
· jelly — wiggles like jelly on tap, refuses to activate
· sneeze — a tiny "achoo" wiggle sends it flying, it returns
· hide_behind — hides behind another button, peeking out
· puddle — melts into a soft puddle of color on hover or tap, reforms elsewhere
· spin_away — spins and returns rotated with a silly label
· unravel — theme-flexible unraveling animation, perfect for crochet contexts, thread-like dissolve and re-form
· chase — the correct button chases the wrong one away
· sleepy — the wrong button yawns, lays down, refuses to move
· pop_up — correct button pops up in a random new location on each wrong attempt
· thread_reel — for crochet themes, wrong button is threaded and reels away, correct button stays grounded

Every behavior must have a touch equivalent. Test them all on a phone-sized viewport.

---

STARTER QUESTION SET (SHIP 6 EXAMPLES IN YAML)

Ship these ready to use, fully commented, easy to swap:

1. Photo delete (from my real intent): "Do you want me to delete these photos?" Wrong button labeled "Yes" uses runaway plus swap_label cycling through ["Yes", "wait no", "please no", "I did not mean it", "okay stop"]. Correct button labeled "No" uses grow. Advances to question 2.
2. Are you sure?: "Are you sure?" Big "No" button and small "Yes". Tapping No uses swap_roles and flips to Yes with a playful bounce. She gets trapped into saying no. Advances to question 3.
3. Yarn color picker (crochet themed, cozy_crochet override): "Help me pick a yarn color." Three yarn ball buttons. Wrong ones unravel into soft puddles on tap. The right one glows and stays. Advances to question 4.
4. Compliment trap: "You are the cutest." Buttons "I know" (wrong, uses peek_a_boo behind the other) and "You are cuter" (correct, uses grow). Advances to question 5.
5. Sneeze button: "Want to see something silly?" Wrong button uses sneeze and flies off-screen with a tiny wiggle, comes back with a new silly label each time. Correct button uses jelly then accepts. Advances to question 6.
6. Gentle final ask for the active theme: a soft question ending with a big warm grow button that pulses. Advances to the ending animation for the active theme.

These six demonstrate the full range of the engine. Users can swap, extend, or replace them freely from YAML.

---

ENDING ANIMATIONS (PER THEME)

Built as reusable Astro components, registered by name, referenced from YAML. Each one is unique choreography, 4 to 8 seconds, smooth, handmade feeling, with a handwritten note content sourced from YAML. Endings must be extensible: a user can add a new component and register it.

Requirements:

· No confetti. No cliche love letter screens. No generic bursts.
· Each ending uses a small character moment (a cat, a dog, a yarn ball, a piggy bank, clouds) plus a handwritten note revealing at the right pace.
· Soft music swell where configured.
· Endings should make her smile, not be "wowed" by a stock celebration.

---

EASTER EGG SETTINGS (LOCAL ONLY)

Hide a small, lovely easter egg somewhere subtle on the page, for example a tiny star in a corner, a cat that appears only after a specific tap, or a soft ribbon she has to notice. When she taps it:

· A gentle settings panel slides in from the bottom with the same soft design language.
· She can override the active theme locally, adjust music volume, toggle reduced motion, and replay the last ending.
· Her overrides save to localStorage on her device only. They never touch a server.
· The main theme (what I control for a given use) still comes from the YAML build. Her overrides apply on top, per device.
· The panel itself should feel like a reward she discovered, cute and cozy, not a technical settings page.

---

MUSIC

· Support per-theme and per-question music files in public/audio/.
· Ship the folder empty with a .gitkeep and a short README explaining naming and how to reference files in YAML.
· Fade in softly on first interaction. Fade out gently on scene or theme change. Volume configurable in YAML.
· Small elegant mute toggle in a corner using a Font Awesome icon, no emoji.

---

CONFIG (YAML)

One well-documented config.yaml at the project root, heavily commented and human-readable. Provide the exact schema described above, including:

```
# ================================================
# PLAYFUL SITE CONFIG
# Change anything here. No code edits needed.
# ================================================

active_theme: angry_kitten

global:
  her_name: Kamini
  show_her_name: rarely      # always | rarely | never
  music_volume: 0.35
  reduced_motion_fallback: true
  easter_egg_enabled: true

fonts:
  heading: "Dancing Script"
  subheading: "Parisienne"
  body: "Quicksand"

themes:
  angry_kitten:
    mood: "gentle apology"
    colors:
      primary: "#FFB6C1"
      secondary: "#FFE4E1"
      accent: "#FF69B4"
      background_gradient: ["#FFE4E1", "#FFD1DC", "#FFB6C1"]
    three_d: { clouds: true, cat: true, dog: false, particles: true }
    music: null
    ending:
      animation: "kitten_apology"
      note: "I am sorry. You are beautiful even when you are annoyed."
    microcopy_flavor: "apologetic_playful"

  cozy_crochet:
    mood: "cozy handmade"
    colors:
      primary: "#E8C4B8"
      secondary: "#F4E9DC"
      accent: "#A8B89A"
      background_gradient: ["#F4E9DC", "#E8C4B8", "#D9C4B0"]
    three_d: { clouds: true, cat: true, yarn_balls: true, crochet_hook: true, particles: true }
    music: null
    ending:
      animation: "yarn_weave_note"
      note: "Handmade things take time. So does loving you right."
    microcopy_flavor: "warm_playful"

  # ship all other themes in the same shape

questions:
  - id: "photo_delete"
    text: "Do you want me to delete these photos?"
    buttons:
      - label: "Yes"
        role: "wrong"
        on_hover: "runaway"
        on_tap: "runaway"
        on_click: "swap_label"
        labels_cycle: ["Yes", "wait no", "please no", "I did not mean it", "okay stop"]
      - label: "No"
        role: "correct"
        on_hover: "grow"
        next: "photo_confirm"
    transition_out: "fade_soft"

  - id: "photo_confirm"
    text: "Are you sure?"
    buttons:
      - label: "No"
        role: "correct"
        on_click: "swap_roles"
        next: "yarn_picker"
      - label: "Yes"
        role: "wrong"
        on_hover: "shrink"
    transition_out: "bounce_warm"

  # ...five more as described above

easter_egg:
  trigger: "tiny_star_corner"
  unlock_after_taps: 2
  panel_title: "secret settings"
  # local only, saved to localStorage
```

The config layer should be designed so that later it could be fetched at runtime from a static YAML file (no backend, still Cloudflare-hosted) without refactoring, in case I want zero-rebuild config changes. Build-time by default.

```
/
  src/
    components/
      scenes/
        QuestionScene.astro
        EndingScene.astro
      endings/
        KittenApology.astro
        CloudsPartBloom.astro
        PuppyEnvelope.astro
        CatShoppingBag.astro
        PiggyBankBloom.astro
        YarnWeaveNote.astro
        CatDogChaos.astro
      three/
        CloudField.astro
        CatActor.astro
        DogActor.astro
        YarnScene.astro
        Particles.astro
      ui/
        BehaviorButton.astro
        MusicToggle.astro
        HandwrittenNote.astro
        EasterEggPanel.astro
    scripts/
      animations.ts
      behaviors.ts
      three-scene.ts
      config.ts
      storage.ts
    layouts/
      BaseLayout.astro
    pages/
      index.astro
    styles/
      global.css
  public/
    audio/.gitkeep
    audio/README.md
    images/
    models/
  config.yaml
  astro.config.mjs
  package.json
  README.md
```

README must explain how to swap the active theme, add questions, add a new ending animation, add music, change fonts and colors, and how the easter egg works.

---

ASSETS AND QUALITY BAR

· Source only high quality free licensed assets. Prefer low poly or rounded 3D styles. Do not use flat emoji style clipart if a cute 3D asset is available.
· Models needed across themes: soft clouds, a cute cat, a cute dog, yarn balls, a crochet hook, a half-finished granny square, a small envelope, coins, a shopping bag, a piggy bank, hearts, sparkles, a small flower, a cozy blanket edge.
· Every 3D model must idle with subtle life (blink, tail wag, breathing scale, head tilt). No rigging required. Simple transforms on sub-meshes are fine.
· Soft lighting, no harsh shadows, gentle ambient. Optimize for mobile. Total page weight should stay light and fast.

---

RESPONSIVE, TOUCH, PERFORMANCE

· Mobile first. Test everything on a phone viewport.
· Every hover interaction has a tap equivalent. Verify runaway, shrink, grow, peek_a_boo, sneeze, unravel, and every other behavior works by touch.
· Generous tap targets.
· 3D scenes degrade gracefully on low end phones. Cap DPR. Lazy load heavy models. Offer reduced motion.
· Respect prefers-reduced-motion. Keep the charm but soften motion.
· 60fps on mid-range phones. No janky frames.

---

WHAT SUCCESS LOOKS LIKE

Kamini opens the link. Soft pink clouds drift, fairy dust floats, a handwritten line asks a silly question with two soft buttons. She reaches for the wrong one, it runs away. She tries again, the label changes to "wait no". She laughs. She taps the other, it grows and glows. Next question. "Are you sure?" She taps No. It flips into Yes with a playful bounce. She grins. Later a crochet-themed question, yarn balls unravel on tap. She notices a tiny star hidden in a corner, taps it twice, and a cozy secret panel slides up letting her switch to her favorite theme. She does. The ending plays, a yarn ball unwinds and weaves her a handwritten note, a crocheted cat tilts its head and blinks, soft music fades in from a file I added. She puts her phone down smiling. That is the whole point.

Next week I change the theme in YAML, push, Cloudflare rebuilds, and it feels brand new again.

---

ABSOLUTE RULES (DO NOT VIOLATE)

1. No emojis anywhere.
2. No em dashes anywhere.
3. No confetti endings. No generic love letter screens. Every ending is a unique, handmade moment.
4. No hardcoded question flows. Everything from YAML.
5. No AI-looking design. No stock gradients, no template layouts, no default card buttons. Every element feels handmade.
6. No janky animations. GSAP, custom easing, 60fps on mobile.
7. Mobile first. Touch fully supported for every behavior.
8. Everything customizable from config.yaml.
9. No backend. Static site, Cloudflare Pages friendly.
10. Her local settings via the easter egg are stored in localStorage only, never on a server.

Build this with the care of someone making a gift for the person they love most. Every pixel, every easing curve, every line of microcopy should feel like it was chosen on purpose.


I am trusting you with something i care more than I love than my Life and i need you to make everything custom. give your best use as much token as much thinking as much stuff as you want but you need to provide me witg the absolute best custom feeling site ever made by humans to express love. this has to be more important than banking and other crutial critical sites so give it your highest priority and best performance. It shouldnt look AI it should look customm designed.

THANK YOU.
