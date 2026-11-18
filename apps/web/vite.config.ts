/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiOrigin = `http://localhost:${Number(process.env.API_PORT) || 8787}`;

export default defineConfig({
  plugins: [
    // Must come before react(): generates src/routeTree.gen.ts from src/routes.
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  server: {
    // WEB_PORT/API_PORT let several checkouts run dev servers side by side.
    port: Number(process.env.WEB_PORT) || 5173,
    strictPort: true,
    proxy: {
      "/api": apiOrigin,
      "/auth": apiOrigin,
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
