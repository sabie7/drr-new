     1	import { fileURLToPath, URL } from 'node:url';
     2	import { defineConfig } from 'vite';
     3	
     4	export default defineConfig({
     5	  root: fileURLToPath(new URL('./client', import.meta.url)),
     6	  base: '/',
     7	  build: {
     8	    outDir: 'dist',
     9	    emptyOutDir: true,
    10	    assetsInlineLimit: 200 * 1024,
    11	    rollupOptions: {
    12	      input: fileURLToPath(new URL('./client/js/app.js', import.meta.url)),
    13	      output: {
    14	        entryFileNames: 'assets/app.[hash].js',
    15	        chunkFileNames: 'assets/[name].[hash].js',
    16	        assetFileNames: 'assets/[name].[hash][extname]'
    17	      }
    18	    }
    19	  }
    20	});
    21	