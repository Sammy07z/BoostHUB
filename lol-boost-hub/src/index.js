// Boost Hub — Worker único (reemplaza la carpeta functions/ del modo Pages).
// Todas las rutas /api/* se resuelven aquí; todo lo demás lo sirve el
// binding de assets (la carpeta public/).

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function handleFriendsGet(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, name FROM friends ORDER BY name"
  ).all();
  return json(results);
}

async function handleFriendsPost(request, env) {
  const { name } = await request.json();
  if (!name || !name.trim()) {
    return json({ error: "Falta el nombre del amigo" }, 400);
  }
  try {
    const res = await env.DB.prepare("INSERT INTO friends (name) VALUES (?)")
      .bind(name.trim())
      .run();
    return json({ id: res.meta.last_row_id, name: name.trim() });
  } catch (e) {
    return json({ error: "Ese nombre ya existe" }, 409);
  }
}

async function handleEncargosGet(request, env) {
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

  return json(withCaptures);
}

async function handleEncargosPost(request, env) {
  const body = await request.json();
  const { friend, oferta, ingreso, descuento, notas } = body;

  if (!friend || ingreso == null || descuento == null) {
    return json({ error: "Faltan datos obligatorios: amigo, ingreso y descuento" }, 400);
  }

  const ingresoNum = Number(ingreso);
  const descuentoNum = Number(descuento);
  if (Number.isNaN(ingresoNum) || Number.isNaN(descuentoNum)) {
    return json({ error: "Ingreso y descuento deben ser números" }, 400);
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

  return json({ id: result.meta.last_row_id, total, fecha });
}

async function handleEncargoPatch(request, env, id) {
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
    return json({ error: "Nada que actualizar" }, 400);
  }
  values.push(id);

  await env.DB.prepare(`UPDATE encargos SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();

  return json({ ok: true });
}

async function handleEncargoDelete(env, id) {
  const capturas = await env.DB.prepare("SELECT r2_key FROM capturas WHERE encargo_id = ?")
    .bind(id)
    .all();
  for (const c of capturas.results) {
    await env.CAPTURES.delete(c.r2_key);
  }
  await env.DB.prepare("DELETE FROM capturas WHERE encargo_id = ?").bind(id).run();
  await env.DB.prepare("DELETE FROM encargos WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

async function handleCapturaPost(request, env, encargoId) {
  const formData = await request.formData();
  const file = formData.get("file");
  const tipo = formData.get("tipo");

  if (!file || typeof file === "string") {
    return json({ error: "Falta el archivo" }, 400);
  }
  if (!["antes", "despues"].includes(tipo)) {
    return json({ error: "El tipo debe ser 'antes' o 'despues'" }, 400);
  }
  if (!file.type || !file.type.startsWith("image/")) {
    return json({ error: "El archivo debe ser una imagen" }, 400);
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

  return json({ id: res.meta.last_row_id, key, tipo });
}

async function handleImgGet(env, key) {
  const obj = await env.CAPTURES.get(decodeURIComponent(key));
  if (!obj) return new Response("Captura no encontrada", { status: 404 });
  return new Response(obj.body, {
    headers: {
      "content-type": obj.httpMetadata?.contentType || "image/png",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}

async function handleResumenGet(env) {
  const { results } = await env.DB.prepare(
    `SELECT f.name as friend,
            COUNT(e.id) as encargos,
            COALESCE(SUM(e.total), 0) as total,
            COALESCE(SUM(CASE WHEN e.estado = 'en_curso' THEN 1 ELSE 0 END), 0) as en_curso
     FROM friends f
     LEFT JOIN encargos e ON e.friend_id = f.id
     GROUP BY f.id
     ORDER BY total DESC`
  ).all();

  const totalGeneral = results.reduce((acc, r) => acc + r.total, 0);
  const encargosTotales = results.reduce((acc, r) => acc + r.encargos, 0);

  return json({ porAmigo: results, totalGeneral, encargosTotales });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      // /api/friends
      if (path === "/api/friends") {
        if (method === "GET") return await handleFriendsGet(env);
        if (method === "POST") return await handleFriendsPost(request, env);
      }

      // /api/resumen
      if (path === "/api/resumen" && method === "GET") {
        return await handleResumenGet(env);
      }

      // /api/encargos
      if (path === "/api/encargos") {
        if (method === "GET") return await handleEncargosGet(request, env);
        if (method === "POST") return await handleEncargosPost(request, env);
      }

      // /api/encargos/:id/captura
      const capturaMatch = path.match(/^\/api\/encargos\/([^/]+)\/captura$/);
      if (capturaMatch && method === "POST") {
        return await handleCapturaPost(request, env, capturaMatch[1]);
      }

      // /api/encargos/:id
      const encargoMatch = path.match(/^\/api\/encargos\/([^/]+)$/);
      if (encargoMatch) {
        if (method === "PATCH") return await handleEncargoPatch(request, env, encargoMatch[1]);
        if (method === "DELETE") return await handleEncargoDelete(env, encargoMatch[1]);
      }

      // /api/img/:key
      const imgMatch = path.match(/^\/api\/img\/(.+)$/);
      if (imgMatch && method === "GET") {
        return await handleImgGet(env, imgMatch[1]);
      }

      // Cualquier otra ruta /api/* que no matcheó nada
      if (path.startsWith("/api/")) {
        return json({ error: "Ruta no encontrada" }, 404);
      }

      // Todo lo demás: sirve el frontend estático (carpeta public/)
      return env.ASSETS.fetch(request);
    } catch (err) {
      return json({ error: err.message || "Error inesperado" }, 500);
    }
  },
};
