import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * 前端固定端口 5173；WS 直连 ws://localhost:3000（BFF），无需 proxy。
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
});
