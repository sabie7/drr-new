     1	import { defineConfig } from 'vitest/config';
     2	
     3	export default defineConfig({
     4	  test: {
     5	    environment: 'node',
     6	    globals: true,
     7	    include: ['test/**/*.test.js'],
     8	    testTimeout: 30000,
     9	    hookTimeout: 120000,
    10	    sequence: {
    11	      concurrent: false,
    12	    },
    13	    pool: 'forks',
    14	    fileParallelism: false,
    15	  },
    16	});
    17	