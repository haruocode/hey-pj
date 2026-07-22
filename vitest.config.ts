import { defineConfig } from 'vitest/config';

// ドメイン（特にスケジューリングエンジン）は純粋・決定論的なので node 環境で単体テストする。
// Cloudflare ランタイム外でテスト可能に保つため、ここでは cloudflare プラグインを読み込まない。
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
  },
});
