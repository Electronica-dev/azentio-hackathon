const API = (process.env.REGULA_API_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "")

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const response = await fetch(`${API}/api/org/documents/${encodeURIComponent(id)}/download`, {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    return new Response(await response.arrayBuffer(), {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
    })
  }

  const headers = new Headers({
    "content-type": response.headers.get("content-type") ?? "application/octet-stream",
    "content-disposition": response.headers.get("content-disposition") ?? 'attachment; filename="document"',
    "cache-control": "no-store",
  })
  return new Response(response.body, { headers })
}
