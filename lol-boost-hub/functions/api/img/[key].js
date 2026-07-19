// GET /api/img/:key -> sirve una captura guardada en R2
// nota: el key real incluye una "/" (encargo-ID/tipo-timestamp.ext), así que
// el front la manda URL-encoded y aquí la decodificamos.
export async function onRequestGet({ env, params }) {
  const key = decodeURIComponent(params.key);
  const obj = await env.CAPTURES.get(key);
  if (!obj) {
    return new Response("Captura no encontrada", { status: 404 });
  }
  return new Response(obj.body, {
    headers: {
      "content-type": obj.httpMetadata?.contentType || "image/png",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
