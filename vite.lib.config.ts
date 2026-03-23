import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
      include: ['src'], 
    }),
  ],
  build: {
    lib: {
      entry: {
		rigger: resolve(__dirname, 'src/module.ts'),
		meshcap: resolve(__dirname, 'src/meshcap/meshcap.ts'),
	  },
      formats: ['es'], 
    },
    rollupOptions: {
      external: [/^three(\/.*)?$/, /@mediapipe\/.*/, /^fflate(\/.*)?$/],
      output: {
        globals: {
          three: 'THREE',
        },
      },
    },
	copyPublicDir:false,
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
});
