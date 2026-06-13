import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves at https://<user>.github.io/B.bubbles/
// so all asset URLs need to be prefixed with /B.bubbles/.
export default defineConfig({
  plugins: [react()],
  base: '/B.bubbles/',
})
