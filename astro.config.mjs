import { defineConfig } from "astro/config";

export default defineConfig({
  output: "static",
  site: "https://pocket-mood.pages.dev",
  build: {
    inlineStylesheets: "auto"
  },
  vite: {
    build: {
      assetsInlineLimit: 2048
    },
    ssr: {
      noExternal: ["gsap", "three"]
    }
  }
});
