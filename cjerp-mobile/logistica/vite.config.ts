import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  server: { port: 5174, host: true },
  resolve: {
    alias: {
      "@cjerp/shared": path.resolve(import.meta.dirname,"../shared/src/index.ts"),
    },
  },
});
