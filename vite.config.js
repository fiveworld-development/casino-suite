import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './', // relative paths: works on GitHub Pages (/casino-suite/) and in any subfolder
  build: {
    rollupOptions: {
      input: {
        lobby: resolve(__dirname, 'index.html'),
        krakensHoard: resolve(__dirname, 'krakens-hoard.html'),
        hazeKings: resolve(__dirname, 'haze-kings.html'),
        blackjack: resolve(__dirname, 'blackjack.html'),
        poker: resolve(__dirname, 'poker.html'),
      },
    },
  },
});

