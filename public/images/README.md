# Portrait slots

Optional portrait frames for the ending cards.

- `portrait-01.webp`: 560 by 700, WebP.
- `portrait-02.webp`: 560 by 700, WebP.

Add `photo_index: 0` or `photo_index: 1` to a theme's `ending` block in `config.yaml` to show one there. Themes without `photo_index` stay photo-free.

A single override path in `config.yaml` can be used instead. Export a portrait crop around 560 by 700, strip metadata, and save as WebP under 100KB.
