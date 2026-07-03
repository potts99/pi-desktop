import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Renderer-only server for visual preview (no Electron / no window.pi).
// The app degrades to an empty shell without the preload bridge.
export default defineConfig({
  root: "src/renderer",
  plugins: [react()],
  build: { rollupOptions: { input: resolve(__dirname, "src/renderer/index.html") } },
});
