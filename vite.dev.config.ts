import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: "/three-mediapipe-rig/",
  server: {
    open: true,
    port: 3000,
  },
  build: {
    target: "es2022",
	outDir: 'web',
    emptyOutDir: false,
  },
  esbuild: {
    target: "es2022"
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "es2022"
    }, 
  },
  resolve: {
    alias: {
      "three-mediapipe-rig": resolve(__dirname, "./src/module.ts"),
    },
  },
});