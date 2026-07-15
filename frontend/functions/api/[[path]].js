// Pages Functions：将 /api/* 请求代理到 Cloudflare Worker
export async function onRequest(context) {
  const { request, env } = context
  const url = new URL(request.url)

  // Worker 部署后的地址，例如 https://ip-compass-api.your-subdomain.workers.dev
  const workerBase = env.API_WORKER_URL
  if (!workerBase) {
    return new Response(JSON.stringify({ ok: false, error: { code: 'CONFIG_ERROR', message: 'API_WORKER_URL not set' } }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const targetUrl = new URL(url.pathname + url.search, workerBase)
  const modified = new Request(targetUrl, request)

  try {
    return await fetch(modified)
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: { code: 'PROXY_ERROR', message: err.message } }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
