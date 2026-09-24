import {
  ROUND_NAMES,
  applyAnswer,
  champion,
  createTournament,
  currentNominal,
  currentTable,
  ensureFight,
  fightDone,
  finishTable,
  getTheme,
  hydrate,
  nextTable,
  serializeTeams,
  setThemeName,
  skipQuestion,
  startTable,
  stats,
  teamById,
  undo,
} from "./engine.js";
import { Bus, loadState } from "./bus.js";
import { escapeHtml } from "./render.js";

const bus = new Bus("operator");
const namesEl = document.getElementById("names");
const shuffleEl = document.getElementById("shuffle");
const statusEl = document.getElementById("status");
const nowEl = document.getElementById("now");
const toastEl = document.getElementById("toast");
const teamCountEl = document.getElementById("teamCount");
const buildBtn = document.getElementById("build");
const startBtn = document.getElementById("startBtn");
const undoBtn = document.getElementById("undoBtn");
const stopBtn = document.getElementById("stopBtn");
const schemeBtn = document.getElementById("schemeBtn");

let state = null;

function teamWord(n) {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return "команда";
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return "команды";
  return "команд";
}

function countTeams() {
  return namesEl.value
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean).length;
}

function updateTeamCount() {
  const n = countTeams();
  teamCountEl.textContent = `${n} ${teamWord(n)}`;
}

function toast(msg, ok) {
  toastEl.textContent = msg || "";
  toastEl.classList.toggle("is-on", !!msg);
  if (ok) toastEl.classList.add("is-on");
}

function phaseOf(st) {
  if (!st) return "editing";
  return st.view?.phase || "bracket";
}

function paint() {
  const st = state ? stats(state) : null;
  if (!state) {
    statusEl.innerHTML = "Вставьте названия и сформируйте таблицу.";
  } else if (st.champ) {
    statusEl.innerHTML = `Чемпион: <strong>${escapeHtml(st.champ.name)}</strong> · боёв: <strong>${st.total}</strong>`;
  } else {
    statusEl.innerHTML = `${st.teamCount} команд · боёв: <strong>${st.total}</strong> · осталось: <strong>${st.remaining}</strong>`;
  }
  const ph = phaseOf(state);
  const locked = ph === "bracket" || ph === "fight";
  namesEl.readOnly = false;
  shuffleEl.disabled = locked;
  buildBtn.hidden = locked;
  startBtn.hidden = !(ph === "bracket" && !st?.champ);
  undoBtn.hidden = ph !== "fight";
  undoBtn.disabled = !state?.history?.length;
  stopBtn.hidden = !state || ph === "editing";
  const schemeOn = !!state?.view?.hallScheme;
  schemeBtn.hidden = !state || ph === "editing";
  schemeBtn.textContent = schemeOn ? "К текущему бою" : "Схема турнира";
  renderNow();
}

function renderNow() {
  if (!state) {
    nowEl.innerHTML = `<p class="kicker">Текущий бой</p><h2>Сетка не собрана</h2>`;
    return;
  }
  if (phaseOf(state) === "editing") {
    nowEl.innerHTML = `<p class="kicker">Игра остановлена</p><h2>Можно добавить команды и сформировать таблицу</h2>`;
    return;
  }
  const champ = champion(state);
  if (champ) {
    nowEl.innerHTML = `<p class="kicker">Турнир завершён</p><h2>${escapeHtml(champ.name)}</h2>`;
    return;
  }
  if (phaseOf(state) === "bracket") {
    nowEl.innerHTML = `<p class="kicker">Таблица готова</p><h2>На зале — сетка. Старт — первый бой</h2>`;
    return;
  }
  const table = currentTable(state);
  if (!table) {
    nowEl.innerHTML = `<p class="kicker">Текущий бой</p><h2>Нет готового боя</h2>`;
    return;
  }
  const fight = ensureFight(state, table);
  const roundName = ROUND_NAMES[(fight.round || state.tone || 1) - 1] || "";
  const nxt = nextTable(state);
  const nextOther = nxt && nxt.id !== table.id ? nxt : playablePreview(table);
  if (fightDone(fight) && table.status === "live") {
    nowEl.innerHTML = `<p class="kicker">${escapeHtml(table.title)} · ${escapeHtml(roundName || ROUND_NAMES[(state.tone || 1) - 1] || "")}</p>
      <h2>Раунд сыгран</h2>
      ${rankPreview(table)}
      <button class="btn btn-primary" type="button" id="finishBtn">Следующий стол</button>`;
    nowEl.querySelector("#finishBtn")?.addEventListener("click", () => {
      finishTable(state, table);
      const n = currentTable(state);
      if (n && n.status !== "done") startTable(state, n);
      afterChange();
    });
    return;
  }
  const nom = currentNominal(fight);
  const teams = table.teamIds.filter(Boolean).map((id) => teamById(state, id)).filter(Boolean);
  const rows = teams
    .map((t) => {
      const sc = table.scores[t.id] || 0;
      return `<div class="eq-seat">
        <div class="fight-name" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</div>
        <input class="eq-seat-score" data-score="${t.id}" type="number" step="1" value="${sc}">
        <div class="eq-pm">
          <button class="btn" type="button" data-ans="${t.id}" data-sign="-1">−${nom}</button>
          <button class="btn" type="button" data-ans="${t.id}" data-sign="1">+${nom}</button>
        </div>
      </div>`;
    })
    .join("");
  let nextHtml = "";
  if (nextOther) {
    const names = (nextOther.teamIds || []).filter(Boolean).map((id) => teamById(state, id)?.name || "…");
    nextHtml = `<div class="next-fight"><p class="kicker">Следующий бой</p><p>${escapeHtml(nextOther.title)}: ${escapeHtml(names.join(" · "))}</p></div>`;
  }
  nowEl.innerHTML = `<p class="kicker">${escapeHtml(table.title)} · ${escapeHtml(roundName)} · тема ${fight.themeIndex + 1}/4</p>
    <div class="vs-box">
      <p class="kicker">Номинал ${nom}</p>
      <div class="eq-line">${rows}</div>
    </div>
    <div class="win-box">
      <div class="win-row">
        <button class="btn" type="button" id="undoStep">Отменить</button>
        <button class="btn" type="button" id="skipBtn">Дальше / снять</button>
        <button class="btn" type="button" id="finishEarly">Завершить раунд</button>
      </div>
    </div>
    ${nextHtml}`;
  nowEl.querySelectorAll("[data-ans]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!applyAnswer(state, table, btn.dataset.ans, Number(btn.dataset.sign))) {
        toast("Эта команда уже отвечала на этот вопрос.");
        return;
      }
      afterChange();
    });
  });
  nowEl.querySelectorAll("[data-score]").forEach((inp) => {
    inp.addEventListener("change", () => {
      const n = parseInt(String(inp.value).replace(",", ""), 10);
      table.scores[inp.dataset.score] = Number.isFinite(n) ? n : 0;
      pushLive();
    });
  });
  nowEl.querySelector("#undoStep")?.addEventListener("click", () => {
    if (!state?.history?.length) {
      toast("Нечего отменять.");
      return;
    }
    undo(state);
    if (state.view) state.view.celebrate = null;
    afterChange();
    toast("Шаг отменён.");
  });
  nowEl.querySelector("#skipBtn")?.addEventListener("click", () => {
    skipQuestion(state, table);
    afterChange();
  });
  nowEl.querySelector("#finishEarly")?.addEventListener("click", (e) => {
    const btn = e.currentTarget;
    if (btn.dataset.sure !== "1") {
      btn.dataset.sure = "1";
      btn.textContent = "Точно завершить?";
      btn.classList.add("is-warn");
      toast("Ещё раз — раунд этого стола закроется.");
      setTimeout(() => {
        if (btn.dataset.sure === "1") {
          btn.dataset.sure = "";
          btn.textContent = "Завершить раунд";
          btn.classList.remove("is-warn");
        }
      }, 4000);
      return;
    }
    finishTable(state, table);
    const n = currentTable(state);
    if (n && n.status !== "done") startTable(state, n);
    afterChange();
  });
}

function playablePreview(except) {
  return (state.tables || []).find((t) => t.id !== except.id && t.status !== "done" && (t.teamIds || []).every(Boolean));
}

function rankPreview(table) {
  const ranks = (table.ranks || []).length
    ? table.ranks
    : table.teamIds.filter(Boolean).map((id) => ({ teamId: id, score: table.scores[id] || 0 }));
  const rows = ranks
    .map((r, i) => {
      const t = teamById(state, r.teamId);
      return `<p>${i + 1}. ${escapeHtml(t?.name || "")} · ${r.score ?? table.scores[r.teamId] || 0}</p>`;
    })
    .join("");
  return `<div class="next-fight">${rows}</div>`;
}

function pushLive() {
  if (!state) return;
  state.rev = (state.rev || 0) + 1;
  bus.publish(state);
}

function afterChange() {
  toast("");
  if (state) {
    const cur = currentTable(state);
    state.view = state.view || { phase: "fight" };
    state.view.focusMatchId = cur?.id || null;
    state.rev = (state.rev || 0) + 1;
  }
  paint();
  if (state) bus.publish(state);
}

function applyBuild() {
  try {
    state = createTournament(namesEl.value, { shuffle: shuffleEl.checked });
    state.view = { phase: "bracket", camera: "overview", hallScheme: false, celebrate: null };
    afterChange();
    toast("Таблица готова. Старт — первый бой");
  } catch (err) {
    toast(err && err.message ? err.message : String(err));
  }
}
window.applyBuild = applyBuild;
window.eqTakeState = function (st) {
  state = st;
  window.__eqState = st;
  state.view = state.view || {
    phase: "bracket",
    camera: "overview",
    hallScheme: false,
    celebrate: null,
  };
  afterChange();
  toast("Таблица готова. Старт — первый бой");
};

function hallToast(info) {
  const n = info.monitors?.length || "?";
  const m = (info.monitor ?? 0) + 1;
  const size = info.bounds ? ` · ${info.bounds.width}×${info.bounds.height}` : "";
  if (info.moved) {
    toast(`Зал переключён на монитор ${m}`);
    return;
  }
  if (n === 1) {
    toast(`Виден только один монитор. Зал открыт в браузере по умолчанию.${size} Esc закрывает. Ещё раз — другой монитор.`);
    return;
  }
  const placed = info.placed === false ? " Не удалось перенести автоматически — перетащите." : "";
  toast(`Зал: браузер по умолчанию, монитор ${m} из ${n}${size}. Esc закрывает.${placed} Ещё раз — другой монитор.`);
}

async function showHall() {
  toast("Открываю зал…");
  try {
    const st = await fetch("/api/status", { cache: "no-store" }).then((r) => r.json());
    const path = st.display_alive ? "/api/cycle-display" : "/api/open-display";
    const info = await fetch(path, { cache: "no-store" }).then((r) => r.json());
    if (info.ok) {
      hallToast(info);
      if (state) {
        bus.publish(state);
        setTimeout(() => state && bus.publish(state), 400);
        setTimeout(() => state && bus.publish(state), 1200);
      }
      return;
    }
    toast(info.error || "Не удалось открыть экран зала через лаунчер.");
  } catch {
    toast("Нет лаунчера. Запустите EruditQuartet.bat, не открывайте файл напрямую.");
  }
}

namesEl.addEventListener("input", () => {
  updateTeamCount();
  try {
    localStorage.setItem("erudit-quartet-names-v1", namesEl.value);
  } catch {
    /* ignore */
  }
});
window.eqDoStart = function () {
  if (!state) return;
  state.view = state.view || {};
  state.view.phase = "fight";
  state.view.hallScheme = false;
  state.view.celebrate = null;
  const table = currentTable(state) || nextTable(state);
  if (table) startTable(state, table);
  afterChange();
};
startBtn.addEventListener("click", () => window.eqDoStart());
window.eqDoScheme = function () {
  if (!state) return;
  state.view = state.view || {};
  state.view.hallScheme = !state.view.hallScheme;
  const on = state.view.hallScheme;
  afterChange();
  toast(on ? "На зале — полная схема." : "На зале — текущий бой.");
};
schemeBtn.addEventListener("click", () => window.eqDoScheme());
window.eqDoStop = function () {
  if (state) {
    state.view = state.view || {};
    state.view.phase = "editing";
    state.view.hallScheme = false;
    state.view.celebrate = null;
    afterChange();
  } else {
    buildBtn.hidden = false;
    startBtn.hidden = true;
    stopBtn.hidden = true;
    schemeBtn.hidden = true;
    undoBtn.hidden = true;
    nowEl.innerHTML = `<p class="kicker">Игра остановлена</p><h2>Можно добавить команды и сформировать таблицу</h2>`;
  }
};
stopBtn.addEventListener("click", () => window.eqDoStop());
undoBtn.addEventListener("click", (e) => {
  e.preventDefault();
  if (!state) return;
  undo(state);
  if (state.view) state.view.celebrate = null;
  afterChange();
});

const saved = loadState();
if (saved?.teams) {
  try {
    state = hydrate(saved);
    if (!state.view) state.view = {};
    if (!state.view.phase) state.view.phase = state.history?.length ? "fight" : "bracket";
    if (!namesEl.value.trim()) namesEl.value = serializeTeams(state);
    shuffleEl.checked = state.shuffle !== false;
    paint();
    window.__eqState = state;
    if (phaseOf(state) !== "editing") toast("Турнир восстановлен. «Остановить игру» — начать заново.");
  } catch {
    state = null;
    paint();
  }
} else {
  paint();
}
updateTeamCount();
