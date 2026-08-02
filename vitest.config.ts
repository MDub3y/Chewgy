import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      // Lets pipeline code that imports `vscode` run outside an editor host.
      {
        find: /^vscode$/,
        replacement: fileURLToPath(new URL('./src/test/mocks/vscode.ts', import.meta.url)),
      },
    ],
  },
  test: {
    include: ['src/test/**/*.test.ts'],
    environment: 'node',
  },
});
