import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Прокси сокетов и контента поля на сервер (порт 3001) в dev-режиме
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/socket.io': { target: 'http://localhost:3001', ws: true },
      '/shared': { target: 'http://localhost:3001' },
    },
  },
  build: { outDir: 'dist' },
});
