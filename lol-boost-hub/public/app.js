// ===== Estado =====
let currentFriend = null; // nombre del invocador activo

// Colores por rango, usados en la "escalera" de cada encargo
const RANK_COLORS = {
  hierro: "#C9BCB4", bronce: "#D9AE85", plata: "#C3D1DC", oro: "#EFC65E",
  platino: "#8FD3CB", esmeralda: "#8FD9AC", diamante: "#A9DCF2",
  maestro: "#D4B3EA", "gran maestro": "#F0AFC4", retador: "#F7E19B",
};

function rankColor(label) {
  const key = Object.keys(RANK_COLORS).find((r) => label.toLowerCase().includes(r));
  return key ? RANK_COLORS[key] : "#3A4756";
}

// ===== Helpers =====
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const money = (n) => `$${Number(n).toFixed(2)}`;

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: opts.body && !(opts.body instanceof FormData) ? { "Content-Type": "application/json" } : undefined,
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Error inesperado" }));
    throw new Error(err.error || "Error inesperado");
  }
  return res.json();
}

function showView(name) {
  ["landing", "dashboard", "resumen"].forEach((v) => {
    $(`#view-${v}`).hidden = v !== name;
  });
  $("#topnav").hidden = name === "landing";
  $$(".nav-btn").forEach((b) => b.classList.remove("active"));
  if (name === "dashboard") $("#navDashboard").classList.add("active");
  if (name === "resumen") $("#navResumen").classList.add("active");
}

// ===== Landing =====
async function loadFriends() {
  const friends = await api("/friends");
  const grid = $("#friendGrid");
  const tpl = $("#tpl-friend-card");
  grid.innerHTML = "";
  friends.forEach((f) => {
    const node = tpl.content.cloneNode(true);
    $(".friend-initial", node).textContent = f.name.slice(0, 2).toUpperCase();
    $(".friend-name", node).textContent = f.name;
    $(".friend-card", node).addEventListener("click", () => enterDashboard(f.name));
    grid.appendChild(node);
  });
}

$("#addFriendBtn").addEventListener("click", async () => {
  const name = prompt("Nombre del nuevo invocador:");
  if (!name || !name.trim()) return;
  try {
    await api("/friends", { method: "POST", body: JSON.stringify({ name: name.trim() }) });
    await loadFriends();
  } catch (e) {
    alert(e.message);
  }
});

// ===== Dashboard =====
async function enterDashboard(name) {
  currentFriend = name;
  $("#dashName").textContent = name;
  $("#navDashboard").textContent = name;
  showView("dashboard");
  await refreshDashboard();
}

async function refreshDashboard() {
  const encargos = await api(`/encargos?friend=${encodeURIComponent(currentFriend)}`);
  const total = encargos.reduce((a, e) => a + e.total, 0);
  const enCurso = encargos.filter((e) => e.estado === "en_curso").length;
  $("#dashTotal").textContent = money(total);
  $("#dashEnCurso").textContent = enCurso;
  renderEncargos(encargos);
}

function renderEncargos(encargos) {
  const list = $("#encargosList");
  list.innerHTML = "";
  if (!encargos.length) {
    list.innerHTML = `<div class="empty-state">Todavía no hay encargos registrados. Usa el formulario de arriba para agregar el primero.</div>`;
    return;
  }
  const tpl = $("#tpl-encargo-card");
  encargos.forEach((e) => {
    const node = tpl.content.cloneNode(true);
    const card = $(".encargo-card", node);
    card.dataset.id = e.id;

    // Escalera de rango: si la oferta trae "X - Y", se muestran como tramo
    const ladder = $(".rank-ladder", node);
    const parts = (e.oferta || "").split(/\s*-\s*/);
    if (parts.length === 2 && parts[0] && parts[1]) {
      ladder.innerHTML = `
        <span class="rank-pip" style="background:${rankColor(parts[0])}">${parts[0]}</span>
        <span class="rank-arrow">→</span>
        <span class="rank-pip" style="background:${rankColor(parts[1])}">${parts[1]}</span>`;
    } else {
      ladder.innerHTML = `<span class="rank-plain">${e.oferta || "Sin título"}</span>`;
    }

    const pill = $(".estado-pill", node);
    pill.textContent = e.estado === "completado" ? "Completado" : "En curso";
    pill.classList.add(e.estado);

    $(".n-ingreso", node).textContent = money(e.ingreso);
    $(".n-descuento", node).textContent = `${(e.descuento * 100).toFixed(0)}%`;
    $(".n-total", node).textContent = money(e.total);
    $(".n-fecha", node).textContent = e.fecha || "—";
    $(".encargo-notas", node).textContent = e.notas || "";

    // Capturas
    $$(".captura-slot", node).forEach((slot) => {
      const tipo = slot.dataset.tipo;
      const existing = e.capturas.find((c) => c.tipo === tipo);
      const preview = $(".captura-preview", slot);
      if (existing) {
        slot.classList.add("filled");
        preview.innerHTML = `<img src="/api/img/${encodeURIComponent(existing.r2_key)}" alt="Captura ${tipo}" />`;
      } else {
        preview.textContent = "Toca para subir";
      }
      const input = $("input", slot);
      slot.addEventListener("click", () => input.click());
      input.addEventListener("change", async () => {
        const file = input.files[0];
        if (!file) return;
        preview.textContent = "Subiendo...";
        try {
          const fd = new FormData();
          fd.append("file", file);
          fd.append("tipo", tipo);
          await api(`/encargos/${e.id}/captura`, { method: "POST", body: fd });
          await refreshDashboard();
        } catch (err) {
          alert(err.message);
        }
      });
    });

    const toggleBtn = $(".btn-toggle-estado", node);
    toggleBtn.textContent = e.estado === "completado" ? "Marcar en curso" : "Marcar completado";
    toggleBtn.addEventListener("click", async () => {
      const nuevoEstado = e.estado === "completado" ? "en_curso" : "completado";
      await api(`/encargos/${e.id}`, { method: "PATCH", body: JSON.stringify({ estado: nuevoEstado }) });
      await refreshDashboard();
    });

    $(".btn-delete", node).addEventListener("click", async () => {
      if (!confirm("¿Eliminar este encargo y sus capturas?")) return;
      await api(`/encargos/${e.id}`, { method: "DELETE" });
      await refreshDashboard();
    });

    list.appendChild(node);
  });
}

// Total en vivo del formulario
function updatePreview() {
  const ingreso = parseFloat($("#fIngreso").value) || 0;
  const descuento = parseFloat($("#fDescuento").value) || 0;
  const total = ingreso - ingreso * descuento;
  $("#fTotalPreview").textContent = money(total);
}
$("#fIngreso").addEventListener("input", updatePreview);
$("#fDescuento").addEventListener("input", updatePreview);

$("#encargoForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const body = {
    friend: currentFriend,
    oferta: $("#fOferta").value.trim(),
    ingreso: parseFloat($("#fIngreso").value),
    descuento: parseFloat($("#fDescuento").value),
    notas: $("#fNotas").value.trim(),
  };
  try {
    await api("/encargos", { method: "POST", body: JSON.stringify(body) });
    ev.target.reset();
    $("#fDescuento").value = 0.2;
    updatePreview();
    await refreshDashboard();
  } catch (e) {
    alert(e.message);
  }
});

// ===== Resumen =====
async function loadResumen() {
  const { porAmigo, totalGeneral } = await api("/resumen");
  $("#resumenTotal").textContent = money(totalGeneral);
  const board = $("#leaderboard");
  board.innerHTML = "";
  if (!porAmigo.length) {
    board.innerHTML = `<div class="empty-state">Todavía no hay datos para mostrar.</div>`;
    return;
  }
  porAmigo.forEach((row, i) => {
    const el = document.createElement("div");
    el.className = "lb-row";
    el.innerHTML = `
      <span class="lb-rank">#${i + 1}</span>
      <span class="lb-name">${row.friend}</span>
      <span class="lb-count">${row.encargos} encargo${row.encargos === 1 ? "" : "s"} · ${row.en_curso} en curso</span>
      <span class="lb-total">${money(row.total)}</span>`;
    board.appendChild(el);
  });
}

// ===== Nav =====
$("#navDashboard").addEventListener("click", () => showView("dashboard"));
$("#navResumen").addEventListener("click", async () => {
  showView("resumen");
  await loadResumen();
});
$("#navSalir").addEventListener("click", () => {
  currentFriend = null;
  showView("landing");
  loadFriends();
});

// ===== Init =====
updatePreview();
loadFriends();
