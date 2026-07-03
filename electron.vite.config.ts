import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        // pi package is CJS-friendly ESM; keep it external so Node resolves it at runtime
        external: ["@earendil-works/pi-coding-agent"],
      },
    },
  },
  preload: {
    build: {
      // Sandboxed preload must be CommonJS; this package is "type: module",
      // so force a .cjs output instead of the default .mjs.
      rollupOptions: {
        output: { format: "cjs", entryFileNames: "index.cjs" },
      },
    },
  },
  renderer: {
    root: "src/renderer",
    build: {
      rollupOptions: { input: resolve(__dirname, "src/renderer/index.html") },
    },
    plugins: [react()],
  },
});
