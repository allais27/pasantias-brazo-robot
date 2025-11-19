import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/pasantias-brazo-robot/',   // 👈 usa EXACTAMENTE el nombre del repo
})
