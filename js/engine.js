export const ROUND_NAMES = ["Светлый", "Полутёмный", "Тёмный"];
export const NOMINALS = [10, 20, 30, 40, 50];
const LETTERS = "ABCD";

export function parseTeams(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return lines.map((line, i) => {
    const name = line || `Команда ${i + 1}`;
    return { id: `t${i + 1}`, name };
  });
}

export function groupCount(n) {
  if (n < 6) throw new Error("Нужно от 6 до 16 команд. Меньше 6 — не играем.");
  if (n > 16) throw new Error("Максимум 16 команд.");
  if (n <= 8) return 2;
  if (n <= 11) return 3;
  return 4;
}

function distribute(n, g) {
  const sizes = Array(g).fill(Math.floor(n / g));
  let rem = n - sizes.reduce((a, b) => a + b, 0);
  for (let i = 0; i < rem; i++) sizes[i] += 1;
  return sizes;
}

function shuffleInPlace(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeTable(id, stage, title, teamIds, order) {
  return {
    id,
    stage,
    title,
    teamIds,
    order,
    status: "pending",
    scores: {},
    plus: {},
    ranks: [],
    fight: null,
    lastPlayedAt: 0,
    rest: 0,
    tonesDone: {},
  };
}

function emptyFight() {
  return {
    round: 1,
    themeIndex: 0,
    qIndex: 0,
    themes: {},
    darkOrder: {},
    events: [],
  };
}

export function themeKey(round, themeIndex) {
  return `${round}-${themeIndex}`;
}

export function currentNominal(fight) {
  return NOMINALS[fight?.qIndex || 0] || 10;
}

export function fightDone(fight) {
  if (!fight) return false;
  return fight.themeIndex > 3;
}

export function currentTone(st) {
  const n = Number(st?.tone) || 1;
  return n < 1 ? 1 : n > 3 ? 3 : n;
}

export function toneName(st, fight) {
  const t = fight?.round || currentTone(st);
  return ROUND_NAMES[t - 1] || "";
}

export function currentStage(st) {
  const tables = st.tables || [];
  const groups = tables.filter((t) => t.stage === "group");
  if (groups.some((t) => t.status !== "done")) return "group";
  const sfs = tables.filter((t) => t.stage === "sf");
  if (sfs.length && sfs.some((t) => t.status !== "done")) return "sf";
  return "final";
}

export function createTournament(text, opts = {}) {
  let teams = parseTeams(text);
  if (opts.shuffle !== false) teams = shuffleInPlace(teams).map((t, i) => ({ ...t, id: `t${i + 1}` }));
  const n = teams.length;
  const g = groupCount(n);
  const sizes = distribute(n, g);
  let idx = 0;
  const tables = [];
  for (let i = 0; i < g; i++) {
    const slice = teams.slice(idx, idx + sizes[i]).map((t) => t.id);
    idx += sizes[i];
    tables.push(makeTable(`G${i + 1}`, "group", `Группа ${LETTERS[i]}`, slice, i));
  }
  if (g > 2) {
    const per = g === 3 ? 3 : 4;
    tables.push(makeTable("SF1", "sf", "Полуфинал 1", Array(per).fill(null), 100));
    tables.push(makeTable("SF2", "sf", "Полуфинал 2", Array(per).fill(null), 101));
  }
  tables.push(makeTable("F", "final", "Финал", [null, null, null, null], 200));
  const state = {
    rev: 0,
    teams,
    tables,
    currentTableId: tables[0].id,
    history: [],
    shuffle: opts.shuffle !== false,
    tone: 1,
    view: { phase: "bracket", hallScheme: false, celebrate: null, camera: "overview" },
  };
  return state;
}

export function hydrate(raw) {
  if (!raw) return raw;
  const st = structuredClone ? structuredClone(raw) : JSON.parse(JSON.stringify(raw));
  st.teams = st.teams || [];
  st.tables = st.tables || [];
  st.history = st.history || [];
  st.view = st.view || { phase: "editing" };
  if (!st.tone) st.tone = 1;
  for (const t of st.tables) {
    t.tonesDone = t.tonesDone || {};
  }
  return st;
}

export function teamById(st, id) {
  return st.teams.find((t) => t.id === id) || null;
}

export function tableById(st, id) {
  return st.tables.find((t) => t.id === id) || null;
}

export function currentTable(st) {
  if (!st) return null;
  const live = st.tables.find((t) => t.status === "live");
  if (live) return live;
  return tableById(st, st.currentTableId) || playableTables(st)[0] || null;
}

export function tableReady(table) {
  if (!table || table.status === "done") return false;
  const ids = table.teamIds || [];
  return ids.length >= 3 && ids.every(Boolean);
}

export function playableTables(st) {
  return (st.tables || []).filter(tableReady);
}

export function nextTable(st) {
  const tone = currentTone(st);
  const stage = currentStage(st);
  const ready = (st.tables || []).filter((t) => {
    if (t.stage !== stage) return false;
    if (t.status === "done" || t.status === "live") return false;
    if ((t.tonesDone || {})[tone]) return false;
    return tableReady(t);
  });
  if (!ready.length) return null;
  ready.sort((a, b) => {
    const ra = Number(a.rest || 0);
    const rb = Number(b.rest || 0);
    if (rb !== ra) return rb - ra;
    return a.order - b.order;
  });
  return ready[0];
}

function bumpRest(st, playedIds) {
  const set = new Set(playedIds.filter(Boolean));
  for (const table of st.tables) {
    if (table.status === "done") continue;
    const ids = (table.teamIds || []).filter(Boolean);
    if (!ids.length) continue;
    if (ids.some((id) => set.has(id))) table.rest = 0;
    else table.rest = (table.rest || 0) + 1;
  }
}

export function stats(st) {
  const total = (st.tables || []).length;
  const played = (st.tables || []).filter((t) => t.status === "done").length;
  const remaining = total - played;
  return {
    teamCount: st.teams.length,
    total,
    remaining,
    champ: champion(st),
  };
}

export function champion(st) {
  const fin = (st.tables || []).find((t) => t.stage === "final" && t.status === "done");
  if (!fin || !fin.ranks?.length) return null;
  const first = fin.ranks.find((r) => r.place === 1);
  return first ? teamById(st, first.teamId) : null;
}

export function snapshot(st) {
  const copy = JSON.parse(JSON.stringify(st));
  delete copy.history;
  return copy;
}

export function pushHistory(st) {
  st.history = st.history || [];
  st.history.push(snapshot(st));
  if (st.history.length > 80) st.history.shift();
}

export function undo(st) {
  const prev = (st.history || []).pop();
  if (!prev) return st;
  const hist = st.history;
  Object.keys(st).forEach((k) => {
    if (k !== "history") delete st[k];
  });
  Object.assign(st, prev);
  st.history = hist;
  return st;
}

export function ensureFight(st, table) {
  if (!table.fight) table.fight = emptyFight();
  for (const id of table.teamIds.filter(Boolean)) {
    if (table.scores[id] == null) table.scores[id] = 0;
    if (table.plus[id] == null) table.plus[id] = 0;
  }
  return table.fight;
}

export function startTable(st, table) {
  if (!table || !tableReady(table)) return;
  for (const t of st.tables) {
    if (t.status === "live" && t.id !== table.id) t.status = "pending";
  }
  table.status = "live";
  st.currentTableId = table.id;
  const f = ensureFight(st, table);
  const tone = currentTone(st);
  if (f.round !== tone || f.themeIndex > 3) {
    f.round = tone;
    f.themeIndex = 0;
    f.qIndex = 0;
  }
}

export function getTheme(table, round, themeIndex) {
  const fight = table.fight || emptyFight();
  const key = themeKey(round, themeIndex);
  fight.themes = fight.themes || {};
  if (!fight.themes[key]) fight.themes[key] = { name: "", lineup: {} };
  table.fight = fight;
  return fight.themes[key];
}

export function setThemeName(table, name) {
  const f = table.fight;
  if (!f) return;
  getTheme(table, f.round, f.themeIndex).name = name;
}

export function applyAnswer(st, table, teamId, sign) {
  const f = ensureFight(st, table);
  if (fightDone(f)) return false;
  const already = (f.events || []).some(
    (e) =>
      e.teamId === teamId &&
      e.round === f.round &&
      e.themeIndex === f.themeIndex &&
      e.qIndex === f.qIndex &&
      !e.skip
  );
  if (already) return false;
  const nom = currentNominal(f);
  const delta = sign * nom;
  pushHistory(st);
  table.scores[teamId] = (table.scores[teamId] || 0) + delta;
  if (delta > 0) table.plus[teamId] = (table.plus[teamId] || 0) + delta;
  f.events.push({
    teamId,
    delta,
    round: f.round,
    themeIndex: f.themeIndex,
    qIndex: f.qIndex,
  });
  if (sign > 0) advanceQuestion(table);
  return true;
}

export function skipQuestion(st, table) {
  const f = ensureFight(st, table);
  if (fightDone(f)) return;
  pushHistory(st);
  f.events.push({
    teamId: null,
    delta: 0,
    skip: true,
    round: f.round,
    themeIndex: f.themeIndex,
    qIndex: f.qIndex,
  });
  advanceQuestion(table);
}

export function advanceQuestion(table) {
  const f = table.fight;
  if (!f) return;
  f.qIndex += 1;
  if (f.qIndex > 4) {
    f.qIndex = 0;
    f.themeIndex += 1;
  }
}

export function rankTable(table) {
  const ids = (table.teamIds || []).filter(Boolean);
  const sorted = ids.slice().sort((a, b) => {
    const ds = (table.scores[b] || 0) - (table.scores[a] || 0);
    if (ds) return ds;
    const dp = (table.plus[b] || 0) - (table.plus[a] || 0);
    if (dp) return dp;
    return ids.indexOf(a) - ids.indexOf(b);
  });
  table.ranks = sorted.map((teamId, i) => ({ teamId, place: i + 1, score: table.scores[teamId] || 0 }));
  return table.ranks;
}

function placeOf(table, place) {
  return table.ranks?.find((r) => r.place === place)?.teamId || null;
}

export function fillDownstream(st) {
  const groups = st.tables.filter((t) => t.stage === "group");
  const g = groups.length;
  const sf1 = tableById(st, "SF1");
  const sf2 = tableById(st, "SF2");
  const fin = tableById(st, "F");
  const G = (i) => groups[i];
  const done = (t) => t && t.status === "done";

  function setSlot(table, index, teamId) {
    if (!table || table.status === "done" || table.status === "live") return;
    table.teamIds[index] = teamId;
  }

  if (g === 2 && fin) {
    if (done(G(0))) {
      setSlot(fin, 0, placeOf(G(0), 1));
      setSlot(fin, 2, placeOf(G(0), 2));
    }
    if (done(G(1))) {
      setSlot(fin, 1, placeOf(G(1), 1));
      setSlot(fin, 3, placeOf(G(1), 2));
    }
    return;
  }

  if (g === 3 && sf1 && sf2) {
    if (done(G(0))) {
      setSlot(sf1, 0, placeOf(G(0), 1));
      setSlot(sf2, 0, placeOf(G(0), 2));
    }
    if (done(G(1))) {
      setSlot(sf1, 1, placeOf(G(1), 2));
      setSlot(sf2, 1, placeOf(G(1), 1));
    }
    if (done(G(2))) {
      setSlot(sf1, 2, placeOf(G(2), 1));
      setSlot(sf2, 2, placeOf(G(2), 2));
    }
  }

  if (g === 4 && sf1 && sf2) {
    if (done(G(0))) {
      setSlot(sf1, 0, placeOf(G(0), 1));
      setSlot(sf2, 0, placeOf(G(0), 2));
    }
    if (done(G(1))) {
      setSlot(sf1, 1, placeOf(G(1), 2));
      setSlot(sf2, 1, placeOf(G(1), 1));
    }
    if (done(G(2))) {
      setSlot(sf1, 2, placeOf(G(2), 1));
      setSlot(sf2, 2, placeOf(G(2), 2));
    }
    if (done(G(3))) {
      setSlot(sf1, 3, placeOf(G(3), 2));
      setSlot(sf2, 3, placeOf(G(3), 1));
    }
  }

  if (fin && done(sf1) && done(sf2)) {
    setSlot(fin, 0, placeOf(sf1, 1));
    setSlot(fin, 1, placeOf(sf2, 1));
    setSlot(fin, 2, placeOf(sf1, 2));
    setSlot(fin, 3, placeOf(sf2, 2));
  }
}

export function finishTable(st, table) {
  pushHistory(st);
  const tone = currentTone(st);
  const f = ensureFight(st, table);
  f.themeIndex = 4;
  f.round = tone;
  table.tonesDone = table.tonesDone || {};
  table.tonesDone[tone] = true;
  table.status = "pending";
  table.lastPlayedAt = Date.now();
  bumpRest(st, table.teamIds);

  const allTones = !!(table.tonesDone[1] && table.tonesDone[2] && table.tonesDone[3]);
  if (allTones) {
    rankTable(table);
    table.status = "done";
  }

  const stage = table.stage;
  const peers = (st.tables || []).filter((t) => t.stage === stage);
  const active = peers.filter((t) => t.status === "done" || tableReady(t) || (t.tonesDone || {})[tone]);
  const allToneDone = active.length && active.every((t) => (t.tonesDone || {})[tone] || t.status === "done");

  st.view = st.view || {};
  st.view.celebrate = null;
  st.view.hallScheme = false;

  if (allToneDone) {
    if (tone < 3) {
      st.tone = tone + 1;
    } else {
      for (const t of peers) {
        if (t.status !== "done" && ((t.teamIds || []).filter(Boolean).length >= 3 || (t.tonesDone || {})[3])) {
          rankTable(t);
          t.status = "done";
        }
      }
      fillDownstream(st);
      st.tone = 1;
      if (table.stage === "final" && table.ranks?.length) {
        const first = table.ranks[0];
        const second = table.ranks[1];
        st.view.celebrate = {
          at: Date.now(),
          ms: 5500,
          winner: teamById(st, first?.teamId)?.name || "",
          second: teamById(st, second?.teamId)?.name || "",
          dest: "чемпион",
          tableId: table.id,
        };
      }
    }
  }

  const nxt = nextTable(st);
  st.currentTableId = nxt?.id || table.id;
  if (nxt && st.view.phase === "fight") startTable(st, nxt);
}

export function remainingTables(st) {
  return (st.tables || []).filter((t) => t.status !== "done").length;
}

export function serializeTeams(st) {
  return (st.teams || []).map((t) => t.name).join("\n");
}
