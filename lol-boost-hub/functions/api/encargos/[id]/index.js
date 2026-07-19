// PATCH /api/encargos/:id -> actualizar estado ({ estado: 'completado' | 'en_curso' }) o notas
export async function onRequestPatch({ env, request, params }) {
  const body = await request.json();
  const fields = [];
  const values = [];

  if (body.estado) {
    fields.push("estado = ?");
    values.push(body.estado);
  }
  if (body.notas != null) {
    fields.push("notas = ?");
    values.push(body.notas);
  }
  if (!fields.length) {
    return Response.json({ error: "Nada que actualizar" }, { status: 400 });
  }
  values.push(params.id);

  await env.DB.prepare(`UPDATE encargos SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();

  return Response.json({ ok: true });
}

// DELETE /api/encargos/:id -> borrar un encargo y sus capturas
export async function onRequestDelete({ env, params }) {
  const capturas = await env.DB.prepare("SELECT r2_key FROM capturas WHERE encargo_id = ?")
    .bind(params.id)
    .all();
  for (const c of capturas.results) {
    await env.CAPTURES.delete(c.r2_key);
  }
  await env.DB.prepare("DELETE FROM capturas WHERE encargo_id = ?").bind(params.id).run();
  await env.DB.prepare("DELETE FROM encargos WHERE id = ?").bind(params.id).run();
  return Response.json({ ok: true });
}
