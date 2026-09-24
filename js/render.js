const ROUND_NAMES = ["Светлый", "Полутёмный", "Тёмный"];

export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function celebrateActive(state) {
  const c = state?.view?.celebrate;
  if (!c) return false;
  const left = Number(c.at) + Number(c.ms || 5500) - Date.now();
  return left > 0;
}

function teamName(state, id) {
  if (!id) return "—";
  return state.teams.find((t) => t.id === id)?.name || "—";
}

function tableHasScore(table) {
  return Object.values(table?.scores || {}).some((n) => Number(n) !== 0) || (table?.fight?.events || []).length > 0;
}

export function renderHero(state) {
  const phase = state?.view?.phase || "editing";
  const splash = !state || phase === "editing";
  const scheme = !!state?.view?.hallScheme;
  const win = celebrateActive(state);
  const champ = state?.tables?.find((t) => t.stage === "final" && t.status === "done");
  if (splash && !scheme) {
    return `<div class="splash"><p class="splash-title">Эрудит-Квартет</p></div>`;
  }
  if (win && !scheme) {
    const c = state.view.celebrate;
    const dest =
      c.dest === "чемпион"
        ? "чемпион"
        : c.dest === "выбывает"
          ? "выбывает"
          : `→ ${escapeHtml(c.dest)}`;
    const second = c.second ? `<p class="win-second">2. ${escapeHtml(c.second)}</p>` : "";
    return `<div class="win-hero"><p class="kicker">Бой завершён</p><h1>${escapeHtml(c.winner)}</h1><p class="win-dest">${dest}</p>${second}</div>`;
  }
  if (champ && !scheme && !win) {
    const first = champ.ranks.find((r) => r.place === 1);
    const name = teamName(state, first?.teamId);
    return `<div class="champ-hero"><p class="kicker">Чемпион</p><h1>${escapeHtml(name)}</h1></div>`;
  }
  if (scheme || phase === "bracket") return "";
  const table = state.tables.find((t) => t.status === "live") || state.tables.find((t) => t.id === state.currentTableId);
  if (!table || phase !== "fight") return "";
  const show = tableHasScore(table);
  const cards = (table.teamIds || [])
    .filter(Boolean)
    .map((id) => {
      const t = state.teams.find((x) => x.id === id);
      const sc = show ? String(table.scores[id] || 0) : "";
      return `<div class="hall-team"><div class="hall-name">${escapeHtml(t?.name || "")}</div><div class="hall-score">${escapeHtml(sc)}</div></div>`;
    })
    .join("");
  const tone = ROUND_NAMES[(state.tone || table.fight?.round || 1) - 1] || "";
  const ti = Number(table.fight?.themeIndex || 0);
  const themeN = ti > 3 ? 4 : ti + 1;
  return `<div class="hall-fight"><p class="hall-table">${escapeHtml(table.title)}</p><p class="hall-tone">${escapeHtml(tone)}</p><p class="hall-theme">Тема ${themeN} из 4</p><div class="hall-grid n-${(table.teamIds || []).filter(Boolean).length}">${cards}</div></div>`;
}

export function renderBracket(state) {
  if (!state?.tables) return "";
  const phase = state?.view?.phase || "editing";
  if (!state.view?.hallScheme && phase === "fight") return "";
  if (!state || phase === "editing") return "";
  const groups = state.tables.filter((t) => t.stage === "group");
  const sfs = state.tables.filter((t) => t.stage === "sf");
  const fin = state.tables.filter((t) => t.stage === "final");
  const cur = state.tables.find((t) => t.status === "live")?.id || state.currentTableId;
  const lane = (title, cls, tables) => {
    if (!tables.length) return "";
    return `<div class="lane ${cls} eq-stage"><div class="lane-h">${escapeHtml(title)}</div><div class="eq-row">${tables.map((t) => tableCard(state, t, cur)).join("")}</div></div>`;
  };
  return `<div class="board eq-board">
    ${lane("Группы", "lane-w", groups)}
    ${lane("Полуфинал", "lane-l", sfs)}
    ${lane("Финал", "lane-gf", fin)}
  </div>`;
}

function tableCard(state, table, curId) {
  const cur = table.id === curId && table.status !== "done" ? " is-current" : "";
  const done = table.status === "done" ? " is-done" : "";
  const ids = (table.teamIds || []).slice();
  ids.sort((a, b) => {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    const sa = Number(table.scores?.[a] || 0);
    const sb = Number(table.scores?.[b] || 0);
    if (sb !== sa) return sb - sa;
    const pa = Number(table.plus?.[a] || 0);
    const pb = Number(table.plus?.[b] || 0);
    if (pb !== pa) return pb - pa;
    return (table.teamIds || []).indexOf(a) - (table.teamIds || []).indexOf(b);
  });
  const slots = ids
    .map((id) => {
      const name = teamName(state, id);
      const rank = table.ranks?.find((r) => r.teamId === id);
      const place = rank ? rank.place : 0;
      const played = table.status === "done";
      const gold = place === 1 && played ? " is-gold" : "";
      const muted = played && place > 2 ? " is-muted" : "";
      const score = played || tableHasScore(table) ? table.scores[id] ?? "" : "";
      const scoreHtml = score === "" || id == null ? "" : `<span class="slot-score">${score}</span>`;
      return `<div class="slot${gold}${muted}"><span class="slot-name">${escapeHtml(name)}</span>${scoreHtml}</div>`;
    })
    .join("");
  return `<article class="match${cur}${done}" data-match-id="${escapeHtml(table.id)}">
    <div class="match-tag">${escapeHtml(table.title)}</div>
    ${slots}
  </article>`;
}

export function cameraTransform(stage, inner, matchEl, mode) {
  inner.style.transform = "none";
  void inner.offsetWidth;
  const stageBox = stage.getBoundingClientRect();
  const innerBox = inner.getBoundingClientRect();
  const pad = mode === "focus" ? 80 : 40;
  let box = innerBox;
  if (mode === "focus" && matchEl) box = matchEl.getBoundingClientRect();
  const w = Math.max(box.width, 1);
  const h = Math.max(box.height, 1);
  const scale = Math.min((stageBox.width - pad * 2) / w, (stageBox.height - pad * 2) / h, mode === "focus" ? 1.6 : 1.15);
  const cx = box.left - innerBox.left + w / 2;
  const cy = box.top - innerBox.top + h / 2;
  const x = stageBox.width / 2 - cx * scale;
  const y = stageBox.height / 2 - cy * scale;
  return { x, y, scale };
}

export function applyCamera(inner, t) {
  inner.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.scale})`;
}
