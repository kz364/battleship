import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The site is served from https://<user>.github.io/battleship/, so every asset URL
// needs that prefix. Relative paths keep `npm run dev` and `npm run preview` working
// from the root at the same time.
export default defineConfig({
  base: "./",
  plugins: [react()],
});
