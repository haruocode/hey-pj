// Cloudflare Workers API のエントリポイント（調整レイヤー）。
// スケジューリングロジックはここに埋め込まず、domain/scheduling のエンジンを呼び出す設計とする
// （docs/design.md §5, §6）。フェーズ4以降で Durable Objects / D1 バインディングを追加する。
export interface Env {
  // 例（フェーズ4以降）:
  // DB: D1Database;
  // PROJECT: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return Response.json({ status: 'ok', app: 'HeyPJ!' });
    }

    return new Response('Not Found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
