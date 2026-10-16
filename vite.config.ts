/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The base path decides where assets are loaded from on GitHub Pages.
// "./" (relative) works locally, on a user page (user.github.io) and in a
// project repository (user.github.io/MPC/) without hard-coding the repository
// name. Set VITE_BASE_PATH (e.g. "/MPC/") only if an absolute base is needed.
const base = process.env.VITE_BASE_PATH ?? "./";

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom", "zustand"],
          charts: ["recharts"],
        },
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? "0.0.0"),
  },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./src/tests/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
