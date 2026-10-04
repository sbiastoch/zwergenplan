import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { BASE } from "./site.config.ts";

export default defineConfig({
  base: BASE,
  plugins: [react(), tailwindcss()],
  // E2E-Build (Fixtures) getrennt vom Deploy-Build, damit nie Testdaten live gehen.
  build: {
    target: "es2023",
    sourcemap: true,
    outDir: process.env["ZWERGENPLAN_DATA"] === "fixture" ? "dist-e2e" : "dist",
  },
  preview: { port: 4173 },
});
