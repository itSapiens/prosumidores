import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// En producción eliminamos todos los `console.*` y `debugger` del bundle:
// - evita filtrar nombres de tablas/errores internos por la devtools del navegador
// - deja la consola limpia para ver los errores genuinos (excepciones no capturadas)
// - reduce algo el tamaño del JS final
//
// En dev (`npm run dev`) se conservan, necesarios para debug local.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  build: { outDir: 'dist' },
  esbuild: {
    drop: mode === 'production' ? ['console', 'debugger'] : [],
  },
}))
