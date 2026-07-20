// ===== Estado =====
let currentFriend = null; // invocador activo dentro del modo admin
let adminPassword = localStorage.getItem("bh_admin_pw") || null;
const DESCUENTO_FIJO = 0.2; // 20%, fijo para todos los encargos

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

function rankLadderHTML(oferta) {
  const parts = (oferta || "").split(/\s*-\s*/);
  if (parts.length === 2 && parts[0] && parts[1]) {
    return `
      <span class="rank-pip" style="background:${rankColor(parts[0])}">${parts[0]}</span>
      <span class="rank-arrow">→</span>
      <span class="rank-pip" style="background:${rankColor(parts[1])}">${parts[1]}</span>`;
  }
  return `<span class="rank-plain">${oferta || "Sin título"}</span>`;
}

// ===== Helpers =====
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const money = (n) => `$${Number(n).toFixed(2)}`;

async function api(path, opts = {}) {
  const headers = {};
  if (opts.body && !(opts.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (adminPassword) headers["X-Admin-Password"] = adminPassword;
  const res = await fetch(`/api${path}`, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Error inesperado" }));
    throw new Error(err.error || "Error inesperado");
  }
  return res.json();
}

function slugFriend(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function clearFriendThemeClasses() {
  [...document.body.classList]
    .filter((c) => c.startsWith("friend-"))
    .forEach((c) => document.body.classList.remove(c));
}

function showView(name) {
  ["public", "adminlogin", "landing", "dashboard"].forEach((v) => {
    $(`#view-${v}`).hidden = v !== name;
  });
  const isAdminView = name === "landing" || name === "dashboard";
  $("#topnav").hidden = !isAdminView;
  $("#adminEntryBtn").hidden = isAdminView || name === "adminlogin";
  $$(".nav-btn").forEach((b) => b.classList.remove("active"));
  if (name === "dashboard") $("#navDashboard").classList.add("active");

  if (name === "dashboard" && currentFriend) {
    document.body.classList.add("theme-dashboard");
    clearFriendThemeClasses();
    document.body.classList.add("friend-" + slugFriend(currentFriend));
  } else {
    document.body.classList.remove("theme-dashboard");
    clearFriendThemeClasses();
  }
}

// ===== Vista pública =====
async function loadPublicView() {
  const { porAmigo, totalGeneral } = await api("/resumen");
  $("#publicTotal").textContent = money(totalGeneral);

  const board = $("#publicLeaderboard");
  board.innerHTML = "";
  if (!porAmigo.length) {
    board.innerHTML = `<div class="empty-state">Todavía no hay datos para mostrar.</div>`;
  } else {
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

  const encargos = await api("/encargos?limit=10");
  const recent = $("#publicRecent");
  recent.innerHTML = "";
  if (!encargos.length) {
    recent.innerHTML = `<div class="empty-state">Todavía no se ha registrado ningún trabajo.</div>`;
    return;
  }
  const tpl = $("#tpl-public-encargo-card");
  encargos.forEach((e) => {
    const node = tpl.content.cloneNode(true);
    $(".public-friend-name", node).textContent = e.friend_name;
    $(".rank-ladder", node).innerHTML = rankLadderHTML(e.oferta);
    const pill = $(".estado-pill", node);
    pill.textContent = e.estado === "completado" ? "Completado" : "En curso";
    pill.classList.add(e.estado);
    $(".n-total", node).textContent = money(e.total);
    $(".n-fecha", node).textContent = e.fecha || "—";
    recent.appendChild(node);
  });
}

$("#adminEntryBtn").addEventListener("click", () => showView("adminlogin"));
$("#adminCancelBtn").addEventListener("click", () => showView("public"));

// ===== Login de admin =====
$("#adminLoginForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const pw = $("#adminPasswordInput").value;
  $("#adminLoginError").hidden = true;
  try {
    const res = await fetch("/api/admin/verify", {
      method: "POST",
      headers: { "X-Admin-Password": pw },
    });
    if (!res.ok) throw new Error("bad password");
    adminPassword = pw;
    localStorage.setItem("bh_admin_pw", pw);
    $("#adminPasswordInput").value = "";
    await loadFriends();
    showView("landing");
  } catch {
    $("#adminLoginError").hidden = false;
  }
});

$("#navSalirAdmin").addEventListener("click", () => {
  adminPassword = null;
  currentFriend = null;
  localStorage.removeItem("bh_admin_pw");
  showView("public");
  loadPublicView();
});

// ===== Landing admin (elegir invocador) =====
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

$("#navCambiar").addEventListener("click", async () => {
  await loadFriends();
  showView("landing");
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
  const [encargos, resumen] = await Promise.all([
    api(`/encargos?friend=${encodeURIComponent(currentFriend)}`),
    api("/resumen"),
  ]);
  const row = resumen.porAmigo.find((r) => r.friend === currentFriend);
  const pendiente = row ? row.total : 0;
  const ultimaLiquidacion = row ? row.ultima_liquidacion : null;

  $("#dashTotal").textContent = money(pendiente);
  $("#dashEnCurso").textContent = row ? row.en_curso : 0;

  const liquidarBtn = $("#liquidarBtn");
  const liquidarInfo = $("#liquidarInfo");
  if (pendiente > 0) {
    liquidarBtn.disabled = false;
    liquidarInfo.textContent = `Pendiente por pagarle a ${currentFriend}: ${money(pendiente)}`;
  } else {
    liquidarBtn.disabled = true;
    liquidarInfo.textContent = ultimaLiquidacion
      ? `Ya está al día — todo liquidado.`
      : `Sin saldo pendiente por liquidar.`;
  }

  renderEncargos(encargos, ultimaLiquidacion);
}

function renderEncargos(encargos, ultimaLiquidacion) {
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

    $(".rank-ladder", node).innerHTML = rankLadderHTML(e.oferta);

    const pill = $(".estado-pill", node);
    const pagado = ultimaLiquidacion && e.created_at <= ultimaLiquidacion;
    pill.textContent = pagado ? "Pagado" : e.estado === "completado" ? "Completado" : "En curso";
    pill.classList.add(pagado ? "pagado" : e.estado);

    $(".n-ingreso", node).textContent = money(e.ingreso);
    $(".n-descuento", node).textContent = `${(e.descuento * 100).toFixed(0)}%`;
    $(".n-total", node).textContent = money(e.total);
    $(".n-fecha", node).textContent = e.fecha || "—";
    $(".encargo-notas", node).textContent = e.notas || "";

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

$("#liquidarBtn").addEventListener("click", async () => {
  if (!confirm(`¿Confirmas que ya le pagaste a ${currentFriend} su saldo pendiente? Esto lo deja en $0.00 (el historial no se borra).`)) return;
  try {
    const res = await api("/liquidaciones", { method: "POST", body: JSON.stringify({ friend: currentFriend }) });
    alert(`Listo, se registró el pago de ${money(res.monto)} a ${currentFriend}.`);
    await refreshDashboard();
  } catch (e) {
    alert(e.message);
  }
});

// Total en vivo del formulario
function updatePreview() {
  const ingreso = parseFloat($("#fIngreso").value) || 0;
  const total = ingreso - ingreso * DESCUENTO_FIJO;
  $("#fTotalPreview").textContent = money(total);
}
$("#fIngreso").addEventListener("input", updatePreview);

$("#encargoForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const body = {
    friend: currentFriend,
    oferta: $("#fOferta").value.trim(),
    ingreso: parseFloat($("#fIngreso").value),
    descuento: DESCUENTO_FIJO,
    notas: $("#fNotas").value.trim(),
  };
  try {
    const created = await api("/encargos", { method: "POST", body: JSON.stringify(body) });

    const antesFile = $("#fCapturaAntes").files[0];
    const despuesFile = $("#fCapturaDespues").files[0];
    if (antesFile) {
      const fd = new FormData();
      fd.append("file", antesFile);
      fd.append("tipo", "antes");
      await api(`/encargos/${created.id}/captura`, { method: "POST", body: fd });
    }
    if (despuesFile) {
      const fd = new FormData();
      fd.append("file", despuesFile);
      fd.append("tipo", "despues");
      await api(`/encargos/${created.id}/captura`, { method: "POST", body: fd });
    }

    ev.target.reset();
    updatePreview();
    await refreshDashboard();
  } catch (e) {
    alert(e.message);
  }
});

// ===== Init =====
updatePreview();
loadPublicView();
showView("public");
