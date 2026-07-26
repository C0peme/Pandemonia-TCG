/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Bind to all interfaces so LAN opponents can open the app at http://<host-ip>:5173
  // (the multiplayer WS server runs separately on port 8787 — see `npm run server`).
  server: { host: true },
  resolve: {
    alias: {
      '@engine': fileURLToPath(new URL('./src/engine', import.meta.url)),
      '@cards': fileURLToPath(new URL('./src/cards', import.meta.url)),
      '@ui': fileURLToPath(new URL('./src/ui', import.meta.url)),
      '@net': fileURLToPath(new URL('./src/net', import.meta.url)),
      '@adventure': fileURLToPath(new URL('./src/adventure', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    globals: true,
  },
});
