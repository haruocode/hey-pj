import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';

// フロントエンド(React SPA)と Workers API を Cloudflare プラグインで統合する。
// スケジューリングのコアドメインは Cloudflare 固有 API に依存させない（docs/design.md §6）。
export default defineConfig({
  plugins: [react(), cloudflare()],
});
