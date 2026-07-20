// GET /api/encargos?friend=Trolo -> encargos de un amigo (o todos si no se pasa friend)
export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  const friend = url.searchParams.get("friend");

  const query = friend
    ? `SELECT e.*, f.name as friend_name FROM encargos e
       JOIN friends f ON e.friend_id = f.id
       WHERE f.name = ?
       ORDER BY e.created_at DESC`
    : `SELECT e.*, f.name as friend_name FROM encargos e
       JOIN friends f ON e.friend_id = f.id
       ORDER BY e.created_at DESC`;

  const stmt = env.DB.prepare(query);
  const { results } = friend ? await stmt.bind(friend).all() : await stmt.all();

  // Adjuntar capturas de cada encargo
  const ids = results.map((r) => r.id);
  let capturas = [];
  if (ids.length) {
    const placeholders = ids.map(() => "?").join(",");
    const capRes = await env.DB.prepare(
      `SELECT * FROM capturas WHERE encargo_id IN (${placeholders})`
    ).bind(...ids).all();
    capturas = capRes.results;
  }

  const withCaptures = results.map((r) => ({
    ...r,
    capturas: capturas.filter((c) => c.encargo_id === r.id),
  }));

  return Response.json(withCaptures);
}

// POST /api/encargos -> crear un nuevo encargo
// body: { friend, oferta, ingreso, descuento, notas }
export async function onRequestPost({ env, request }) {
  const body = await request.json();
  const { friend, oferta, ingreso, descuento, notas } = body;

  if (!friend || ingreso == null || descuento == null) {
    return Response.json(
      { error: "Faltan datos obligatorios: amigo, ingreso y descuento" },
      { status: 400 }
    );
  }

  const ingresoNum = Number(ingreso);
  const descuentoNum = Number(descuento);
  if (Number.isNaN(ingresoNum) || Number.isNaN(descuentoNum)) {
    return Response.json({ error: "Ingreso y descuento deben ser números" }, { status: 400 });
  }
  const total = ingresoNum - ingresoNum * descuentoNum;

  let friendRow = await env.DB.prepare("SELECT id FROM friends WHERE name = ?")
    .bind(friend)
    .first();
  if (!friendRow) {
    const res = await env.DB.prepare("INSERT INTO friends (name) VALUES (?)")
      .bind(friend)
      .run();
    friendRow = { id: res.meta.last_row_id };
  }

  const now = new Date();
  const fecha = now.toISOString().slice(0, 10);

  const result = await env.DB.prepare(
    `INSERT INTO encargos (friend_id, oferta, ingreso, descuento, total, notas, fecha, estado, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'en_curso', ?)`
  )
    .bind(friendRow.id, oferta || "", ingresoNum, descuentoNum, total, notas || "", fecha, now.toISOString())
    .run();

  return Response.json({ id: result.meta.last_row_id, total, fecha });
}