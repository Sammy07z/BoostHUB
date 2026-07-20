// Boost Hub — Worker. Sirve public/ vía ASSETS y resuelve /api/*.
// Rutas de solo lectura (GET) son públicas. Rutas que escriben datos
// requieren el header X-Admin-Password igual a ADMIN_PASSWORD de abajo.

// 👉 Para cambiar la contraseña de admin, solo edita esta línea y sube el archivo de nuevo.
const ADMIN_PASSWORD = "101997";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function isAdmin(request) {
  const pw = request.headers.get("x-admin-password");
  return !!pw && pw === ADMIN_PASSWORD;
}

function requireAdmin(request) {
  if (!isAdmin(request)) {
    return json({ error: "Contraseña de admin incorrecta o faltante" }, 401);
  }
  return null;
}

async function handleAdminVerify(request) {
  if (!isAdmin(request)) return json({ error: "Contraseña incorrecta" }, 401);
  return json({ ok: true });
}

async function handleFriendsGet(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, name FROM friends ORDER BY name"
  ).all();
  return json(results);
}

async function handleFriendsPost(request, env) {
  const denied = requireAdmin(request);
  if (denied) return denied;

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
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.min(Number(limitParam) || 20, 100) : null;

  let query = friend
    ? `SELECT e.*, f.name as friend_name FROM encargos e
       JOIN friends f ON e.friend_id = f.id
       WHERE f.name = ?
       ORDER BY e.created_at DESC`
    : `SELECT e.*, f.name as friend_name FROM encargos e
       JOIN friends f ON e.friend_id = f.id
       ORDER BY e.created_at DESC`;
  if (limit) query += ` LIMIT ${limit}`;

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
  const denied = requireAdmin(request);
  if (denied) return denied;

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
  const denied = requireAdmin(request);
  if (denied) return denied;

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

async function handleEncargoDelete(request, env, id) {
  const denied = requireAdmin(request);
  if (denied) return denied;

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
  const denied = requireAdmin(request);
  if (denied) return denied;

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

// Saldo pendiente = encargos posteriores a la última liquidación de cada amigo.
async function handleResumenGet(env) {
  const { results } = await env.DB.prepare(
    `SELECT f.id as friend_id,
            f.name as friend,
            COUNT(e.id) as encargos,
            COALESCE(SUM(CASE WHEN e.created_at > COALESCE(lq.ultima, '') THEN e.total ELSE 0 END), 0) as total,
            COALESCE(SUM(e.total), 0) as total_historico,
            COALESCE(SUM(CASE WHEN e.estado = 'en_curso' THEN 1 ELSE 0 END), 0) as en_curso,
            lq.ultima as ultima_liquidacion
     FROM friends f
     LEFT JOIN encargos e ON e.friend_id = f.id
     LEFT JOIN (SELECT friend_id, MAX(created_at) as ultima FROM liquidaciones GROUP BY friend_id) lq
       ON lq.friend_id = f.id
     GROUP BY f.id
     ORDER BY total DESC`
  ).all();

  const totalGeneral = results.reduce((acc, r) => acc + r.total, 0);
  const encargosTotales = results.reduce((acc, r) => acc + r.encargos, 0);

  return json({ porAmigo: results, totalGeneral, encargosTotales });
}

// Liquidar: registra que se le pagó a un amigo su saldo pendiente actual,
// dejándolo en $0 sin borrar el historial de encargos.
async function handleLiquidarPost(request, env) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const { friend } = await request.json();
  if (!friend) return json({ error: "Falta el amigo a liquidar" }, 400);

  const friendRow = await env.DB.prepare("SELECT id FROM friends WHERE name = ?")
    .bind(friend)
    .first();
  if (!friendRow) return json({ error: "Amigo no encontrado" }, 404);

  const lastLq = await env.DB.prepare(
    "SELECT MAX(created_at) as ultima FROM liquidaciones WHERE friend_id = ?"
  ).bind(friendRow.id).first();
  const desde = lastLq?.ultima || "";

  const pendiente = await env.DB.prepare(
    "SELECT COALESCE(SUM(total), 0) as monto FROM encargos WHERE friend_id = ? AND created_at > ?"
  ).bind(friendRow.id, desde).first();

  const monto = pendiente?.monto || 0;
  if (monto <= 0) {
    return json({ error: "Este invocador no tiene saldo pendiente" }, 400);
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO liquidaciones (friend_id, monto, created_at) VALUES (?, ?, ?)"
  ).bind(friendRow.id, monto, now).run();

  return json({ ok: true, monto, fecha: now });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      if (path === "/api/admin/verify" && method === "POST") {
        return await handleAdminVerify(request);
      }

      if (path === "/api/friends") {
        if (method === "GET") return await handleFriendsGet(env);
        if (method === "POST") return await handleFriendsPost(request, env);
      }

      if (path === "/api/resumen" && method === "GET") {
        return await handleResumenGet(env);
      }

      if (path === "/api/liquidaciones" && method === "POST") {
        return await handleLiquidarPost(request, env);
      }

      if (path === "/api/encargos") {
        if (method === "GET") return await handleEncargosGet(request, env);
        if (method === "POST") return await handleEncargosPost(request, env);
      }

      const capturaMatch = path.match(/^\/api\/encargos\/([^/]+)\/captura$/);
      if (capturaMatch && method === "POST") {
        return await handleCapturaPost(request, env, capturaMatch[1]);
      }

      const encargoMatch = path.match(/^\/api\/encargos\/([^/]+)$/);
      if (encargoMatch) {
        if (method === "PATCH") return await handleEncargoPatch(request, env, encargoMatch[1]);
        if (method === "DELETE") return await handleEncargoDelete(request, env, encargoMatch[1]);
      }

      const imgMatch = path.match(/^\/api\/img\/(.+)$/);
      if (imgMatch && method === "GET") {
        return await handleImgGet(env, imgMatch[1]);
      }

      if (path.startsWith("/api/")) {
        return json({ error: "Ruta no encontrada" }, 404);
      }

      return env.ASSETS.fetch(request);
    } catch (err) {
      return json({ error: err.message || "Error inesperado" }, 500);
    }
  },
};
