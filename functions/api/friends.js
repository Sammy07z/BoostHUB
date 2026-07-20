// GET /api/friends -> lista de amigos para el selector de la landing
export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    "SELECT id, name FROM friends ORDER BY name"
  ).all();
  return Response.json(results);
}

// POST /api/friends -> agregar un nuevo amigo al hub { name }
export async function onRequestPost({ env, request }) {
  const { name } = await request.json();
  if (!name || !name.trim()) {
    return Response.json({ error: "Falta el nombre del amigo" }, { status: 400 });
  }
  try {
    const res = await env.DB.prepare("INSERT INTO friends (name) VALUES (?)")
      .bind(name.trim())
      .run();
    return Response.json({ id: res.meta.last_row_id, name: name.trim() });
  } catch (e) {
    return Response.json({ error: "Ese nombre ya existe" }, { status: 409 });
  }
}