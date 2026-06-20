import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "apps/client",
  envDir: "../..",
  plugins: [react()],
  server: {
    port: 5173,
    host: "0.0.0.0"
  },
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true
  }
});
