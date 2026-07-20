// GET /api/resumen -> total ganado por amigo + total general del hub
export async function onRequestGet({ env }) {
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

  return Response.json({ porAmigo: results, totalGeneral, encargosTotales });
}