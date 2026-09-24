import { champion, currentTable, hydrate } from "./engine.js";
import { Bus } from "./bus.js";
import { applyCamera, cameraTransform, celebrateActive, renderBracket, renderHero } from "./render.js";

const bus = new Bus("display");
const hero = document.getElementById("hero");
const inner = document.getElementById("bracketInner");
const stage = document.getElementById("stage");
let state = null;
let winTimer = 0;

function paint() {
  hero.innerHTML = renderHero(state);
  inner.innerHTML = renderBracket(state);
  inner.querySelectorAll("button").forEach((b) => {
    b.disabled = true;
  });
  const champ = !!(state && champion(state));
  const phase = state?.view?.phase || "editing";
  const scheme = !!state?.view?.hallScheme;
  const win = celebrateActive(state);
  const splash = !state || phase === "editing";
  const isFinal =
    !splash &&
    !scheme &&
    !win &&
    !champ &&
    phase === "fight" &&
    currentTable(state)?.stage === "final";
  document.body.classList.toggle("is-splash", splash && !scheme);
  document.body.classList.toggle("is-champ", champ && !scheme && !win && !splash);
  document.body.classList.toggle("is-win", win && !scheme && !splash);
  document.body.classList.toggle("is-final", isFinal);
  document.body.classList.toggle("phase-bracket", scheme || (!splash && !champ && !win && !isFinal && phase !== "fight"));
  document.body.classList.toggle("phase-fight", !splash && !scheme && !win && !champ && !isFinal && phase === "fight");
  clearTimeout(winTimer);
  if (win) {
    const c = state.view.celebrate;
    const left = Number(c.at) + Number(c.ms || 5500) - Date.now();
    if (left > 0) winTimer = setTimeout(paint, left + 30);
  }
  requestAnimationFrame(fitCamera);
}

function fitCamera() {
  if (!inner.scrollWidth) return;
  const fight = document.body.classList.contains("phase-fight");
  const id = fight ? currentTable(state)?.id : null;
  const el = id ? inner.querySelector(`[data-match-id="${id}"]`) : null;
  applyCamera(inner, cameraTransform(stage, inner, el, fight && el ? "focus" : "overview"));
}

function accept(next) {
  if (!next) {
    state = null;
    paint();
    return;
  }
  try {
    state = hydrate(next);
    paint();
  } catch {
    state = next;
    paint();
  }
}

bus.on((msg) => {
  if (msg?.type === "state") accept(msg.state);
});
paint();

let lastRev = state?.rev ?? -1;
let lastReload = Number(sessionStorage.getItem("hallReload") || 0);
async function pullServer() {
  try {
    const res = await fetch("/api/state", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    const n = Number(data.hallReload || 0);
    if (sessionStorage.getItem("hallReload") != null && n > lastReload) {
      sessionStorage.setItem("hallReload", String(n));
      location.reload();
      return;
    }
    lastReload = n;
    sessionStorage.setItem("hallReload", String(n));
    const next = data.state;
    if (!next) return;
    if (next.rev === lastRev) return;
    lastRev = next.rev ?? lastRev;
    accept(next);
  } catch {
    /* last frame */
  }
}
setInterval(pullServer, 250);
pullServer();

window.addEventListener("resize", fitCamera);
function toggleHallFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.();
}

document.addEventListener("keydown", (e) => {
  if (e.key === "F11" || e.code === "F11") {
    e.preventDefault();
    toggleHallFullscreen();
    return;
  }
  if (e.key !== "Escape") return;
  e.preventDefault();
  if (document.fullscreenElement) {
    document.exitFullscreen?.();
    return;
  }
  window.close();
});
document.addEventListener("dblclick", () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
});
