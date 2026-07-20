// POST /api/encargos/:id/captura -> subir captura antes/después
// multipart/form-data: file, tipo ('antes' | 'despues')
export async function onRequestPost({ env, request, params }) {
  const encargoId = params.id;
  const formData = await request.formData();
  const file = formData.get("file");
  const tipo = formData.get("tipo");

  if (!file || typeof file === "string") {
    return Response.json({ error: "Falta el archivo" }, { status: 400 });
  }
  if (!["antes", "despues"].includes(tipo)) {
    return Response.json({ error: "El tipo debe ser 'antes' o 'despues'" }, { status: 400 });
  }
  if (!file.type || !file.type.startsWith("image/")) {
    return Response.json({ error: "El archivo debe ser una imagen" }, { status: 400 });
  }

  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const key = `encargo-${encargoId}/${tipo}-${Date.now()}.${ext}`;

  await env.CAPTURES.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });

  const now = new Date().toISOString();
  const res = await env.DB.prepare(
    `INSERT INTO capturas (encargo_id, tipo, r2_key, created_at) VALUES (?, ?, ?, ?)`
  )
    .bind(encargoId, tipo, key, now)
    .run();

  return Response.json({ id: res.meta.last_row_id, key, tipo });
}