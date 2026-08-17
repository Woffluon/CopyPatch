import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/__copypatch/api': {
        target: 'http://localhost:4040',
        changeOrigin: true,
      },
    },
  },
});
