import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// custom plugin to replace __BUILD_VERSION__ in sw.js after build
function replaceServiceWorkerVersion() {
  return {
    name: 'replace-sw-version',
    closeBundle() {
      const swPath = path.resolve('dist/sw.js');
      if (fs.existsSync(swPath)) {
        const packageJsonPath = path.resolve('package.json');
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const version = `${packageJson.version}-${Date.now()}`;
        let content = fs.readFileSync(swPath, 'utf8');
        content = content.replace(/__BUILD_VERSION__/g, version);
        fs.writeFileSync(swPath, content, 'utf8');
        console.log(`\n[PWA] Service Worker version updated to: ${version}`);
      }
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), replaceServiceWorkerVersion()],
})
