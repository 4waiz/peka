import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // honour an assigned port (e.g. preview tooling); Vite falls back to the next free port
    port: Number(process.env.PORT) || 5173,
  },
  build: {
    chunkSizeWarningLimit: 1600,
  },
});
