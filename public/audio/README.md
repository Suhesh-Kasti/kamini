# Audio

The shipped track is `music.mp3`, wired as the global fallback:

```yaml
global:
  music: "audio/music.mp3"
```

A theme or a question can override it:

```yaml
themes:
  cozy_crochet:
    music: "audio/cozy-crochet.mp3"
```

```yaml
questions:
  - id: "yarn_picker"
    music_override: "audio/question-one.mp3"
```

Use MP3 at 128kbps, 44.1kHz, stereo for the widest support. Keep files under a few megabytes. The player loops, fades in on the first gesture, fades out on a scene change, and respects `global.music_volume`. Nothing autoplays before the first gesture.

The original `.m4a` is kept in `assets/originals/` and is not deployed.
