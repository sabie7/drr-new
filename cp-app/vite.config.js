import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  base: '/cp-assets/',
  build: {
    outDir: '../cp-dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 0
  }
});
