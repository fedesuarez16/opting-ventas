import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Mismo alias que `tsconfig.json`: sin esto, cualquier módulo bajo test que importe
  // por `@/...` no resuelve y el archivo de test falla entero antes de correr.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
