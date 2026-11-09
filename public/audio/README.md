# Audio

Drop music here and point the config at it.

## Naming

Use short, kind names without spaces:

- `angry-kitten.mp3`
- `sad-cloud.mp3`
- `sweet-ask.mp3`
- `shopping-muse.mp3`
- `save-the-coins.mp3`
- `cozy-crochet.mp3`
- `just-for-fun.mp3`
- `question-one.mp3`

## Referencing a track

In `config.yaml`, add the path relative to `public/`:

```yaml
themes:
  cozy_crochet:
    music: "audio/cozy-crochet.mp3"
```

A single question can override the theme:

```yaml
questions:
  - id: "yarn_picker"
    music_override: "audio/question-one.mp3"
```

Set `music: null` for silence. The player fades in on the first real tap or key press, fades out on a scene change, and respects the volume in `global.music_volume`. Nothing autoplays before she touches the screen.

Keep files under a few megabytes. A soft loop in mono at 128 kbps is plenty.
