import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { getSharedBuildConfig } from '../../config/vite-build'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  ...getSharedBuildConfig(),
})
