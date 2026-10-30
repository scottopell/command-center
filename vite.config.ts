import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ root: 'packages/ui', base: './', plugins: [react()], resolve:{dedupe:['react','react-dom','@tanstack/react-query','zod']}, build: { outDir: '../../dist/web', emptyOutDir: true } });
