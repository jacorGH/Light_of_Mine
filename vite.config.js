import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  base: '/Light_of_Mine/',  // GitHub Pages serves from repo name
  build: {
    outDir: 'dist',
  },
  server: {
    host: true,
    port: 3000,
  },
});
