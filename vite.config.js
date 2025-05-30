import { defineConfig } from 'vite'
import dir2json from "vite-plugin-dir2json";
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  assetsInclude: ['**/*.gpx'],
  plugins: [react(), dir2json(/* options */)],
})
