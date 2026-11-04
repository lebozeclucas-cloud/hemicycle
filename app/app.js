/* Hémicycle — appli neutre de suivi de l'Assemblée nationale.
   Données : open data officiel (data.assemblee-nationale.fr), préparées par scripts/build_data.py */
"use strict";

const $view = document.getElementById("view");
const cache = new Map();
let LEG = 17;

/* ---------- utilitaires ---------- */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const fdate = (d) => { if (!d) return ""; const [y, m, j] = d.split("-"); return `${+j} ${MOIS[+m - 1]} ${y}`; };
const nf = (n) => Number(n || 0).toLocaleString("fr-FR");
const pct = (a, t) => (t ? (100 * a) / t : 0);

async function api(path, { fresh = false } = {}) {
  if (!fresh && cache.has(path)) return cache.get(path);
  const p = fetch("data/" + path, fresh ? { cache: "reload" } : {}).then((r) => {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  });
  cache.set(path, p);
  try { return await p; } catch (e) { cache.delete(path); throw e; }
}

const store = {
  get(k, def) { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const favs = () => store.get("favs", { textes: [], deputes: [] });
function toggleFav(kind, id) {
  const f = favs();
  const i = f[kind].indexOf(id);
  if (i >= 0) f[kind].splice(i, 1); else f[kind].unshift(id);
  store.set("favs", f);
  toast(i >= 0 ? "Retiré des favoris" : "Ajouté aux favoris");
  return i < 0;
}
const isFav = (kind, id) => favs()[kind].includes(id);

function toast(msg) {
  document.querySelectorAll(".toast").forEach((t) => t.remove());
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1800);
}

const anScrutin = (n) => `https://www.assemblee-nationale.fr/dyn/${LEG}/scrutins/${n}`;
const anDossier = (c) => `https://www.assemblee-nationale.fr/dyn/${LEG}/dossiers/${encodeURIComponent(c)}`;
const anDepute = (id) => `https://www.assemblee-nationale.fr/dyn/deputes/${id}`;

/* ---------- lexique ---------- */
const LEXIQUE = {
  "navette": ["Navette parlementaire", "Aller-retour d'un texte entre l'Assemblée nationale et le Sénat jusqu'à ce que les deux chambres adoptent la même version."],
  "lecture": ["Lecture", "Examen complet d'un texte par une assemblée. Un texte peut passer en 1ère, 2e ou nouvelle lecture selon l'avancée de la navette."],
  "cmp": ["Commission mixte paritaire (CMP)", "Réunion de 7 députés et 7 sénateurs chargée de proposer un texte commun quand les deux chambres ne sont pas d'accord."],
  "lecture définitive": ["Lecture définitive", "Après l'échec d'une CMP, le Gouvernement peut demander à l'Assemblée nationale de statuer en dernier."],
  "49.3": ["Article 49 alinéa 3", "Article de la Constitution permettant au Gouvernement de faire adopter un texte sans vote, sauf si une motion de censure est votée."],
  "motion de censure": ["Motion de censure", "Vote par lequel les députés peuvent renverser le Gouvernement. Elle doit réunir la majorité absolue des députés (289). Seuls les votes pour sont comptés."],
  "amendement": ["Amendement", "Proposition de modification d'un texte, déposée par un député, un groupe, une commission ou le Gouvernement."],
  "scrutin public": ["Scrutin public", "Vote où la position de chaque député est enregistrée et publiée. Il est ordinaire ou solennel (annoncé à l'avance, pour les textes importants)."],
  "promulgation": ["Promulgation", "Signature de la loi par le Président de la République. Elle est ensuite publiée au Journal officiel et entre en vigueur."],
  "projet de loi": ["Projet de loi", "Texte de loi proposé par le Gouvernement."],
  "proposition de loi": ["Proposition de loi", "Texte de loi proposé par un ou plusieurs parlementaires."],
  "suffrages exprimés": ["Suffrages exprimés", "Votes pour + votes contre. Les abstentions ne comptent pas dans les suffrages exprimés."],
  "majorité absolue": ["Majorité requise", "Nombre de voix nécessaires pour que le texte soit adopté : plus de la moitié des suffrages exprimés."],
  "non-votant": ["Non-votant", "Député présent qui ne prend pas part au vote, souvent en raison de sa fonction (par exemple la présidence de séance)."],
  "groupe": ["Groupe politique", "Rassemblement de députés par affinité politique. Il faut au moins 15 députés pour former un groupe."],
  "non inscrit": ["Non-inscrit", "Député qui n'appartient à aucun groupe politique."],
  "conseil constitutionnel": ["Conseil constitutionnel", "Institution qui peut être saisie pour vérifier qu'une loi respecte la Constitution avant sa promulgation."],
};
const term = (key, label) => `<span class="term" data-term="${esc(key)}">${esc(label || key)}</span>`;

function openSheet(title, body) {
  const s = document.getElementById("sheet");
  s.querySelector("#sheet-title").textContent = title;
  s.querySelector("#sheet-body").textContent = body;
  s.hidden = false;
}
document.addEventListener("click", (e) => {
  const t = e.target.closest(".term");
  if (t && LEXIQUE[t.dataset.term]) { e.preventDefault(); openSheet(...LEXIQUE[t.dataset.term]); }
  if (e.target.closest("[data-close]")) document.getElementById("sheet").hidden = true;
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") document.getElementById("sheet").hidden = true; });

/* ---------- thèmes ---------- */
const THEMES = {
  economie: "Économie", sante: "Santé", education: "Éducation", environnement: "Environnement",
  securite: "Sécurité & justice", travail: "Travail", numerique: "Numérique", agriculture: "Agriculture",
  logement: "Logement", institutions: "Institutions", immigration: "Immigration", transports: "Transports",
  culture: "Culture & sport", international: "Europe & international",
};

/* ---------- briques d'interface ---------- */
const ICON = {
  chev: `<svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>`,
  star: `<svg viewBox="0 0 24 24"><path d="M12 4l2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z"/></svg>`,
  search: `<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg>`,
  ext: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/></svg>`,
};

function voteBar(s, big) {
  const t = s.pour + s.contre + s.abst;
  return `<div class="vbar${big ? " big" : ""}" role="img" aria-label="${s.pour} pour, ${s.contre} contre, ${s.abst} abstentions">
    <i class="p" style="width:${pct(s.pour, t)}%"></i><i class="c" style="width:${pct(s.contre, t)}%"></i><i class="a" style="width:${pct(s.abst, t)}%"></i></div>`;
}
const sortBadge = (s) =>
  s.sort === "adopte" ? `<span class="badge adopte">Adopté</span>` :
  s.sort === "rejete" ? `<span class="badge rejete">Rejeté</span>` :
  `<span class="badge neutre">${esc(cap(s.sort) || "—")}</span>`;
const KIND = { ensemble: "Vote sur l'ensemble", censure: "Motion de censure", amendement: "Amendement", article: "Article", motion: "Motion", autre: "Autre vote" };

function scrutinCard(s) {
  return `<a class="card" href="#/scrutin/${esc(s.id)}">
    <div class="card-meta"><span>${fdate(s.date)}</span><span>·</span><span>Scrutin n° ${s.n}</span><span>·</span><span>${KIND[s.k] || ""}</span></div>
    <h3 class="card-title">${esc(cap(s.titre))}</h3>
    <div class="card-foot">${sortBadge(s)}${voteBar(s)}<span>${s.pour} · ${s.contre} · ${s.abst}</span></div>
  </a>`;
}

const STEP_ORDER = ["AN1", "SN1", "AN2", "SN2", "CMP", "ANNLEC", "SNNLEC", "ANLDEF", "CC", "PROM"];
function currentStep(d) {
  const e = d.etapes || [];
  return e.length ? e[e.length - 1] : null;
}
function dossierCard(d) {
  const cur = currentStep(d);
  const n = Math.min((d.etapes || []).length, 5);
  return `<a class="card" href="#/texte/${esc(d.id)}">
    <div class="card-meta"><span>${esc(d.procedure)}</span>${d.maj ? `<span>·</span><span>${fdate(d.maj)}</span>` : ""}</div>
    <h3 class="card-title">${esc(d.titre)}</h3>
    <div class="card-foot">
      ${d.promulgue ? `<span class="badge adopte">Promulguée</span>` : `<span class="badge accent">En cours</span>`}
      <span class="steps-mini">${[0, 1, 2, 3, 4].map((i) => `<i class="${i < n ? "on" : ""}"></i>`).join("")}</span>
      <span>${esc(cur ? cur.lib : "")}</span>
    </div>
  </a>`;
}

function initials(d) { return ((d.prenom || "")[0] || "") + ((d.nom || "")[0] || ""); }
function personRow(d, groupes, extra = "") {
  const g = groupes[d.groupe] || {};
  return `<a class="card person" href="#/depute/${esc(d.id)}">
    <span class="avatar" style="--g:${esc(g.couleur || "transparent")}">${esc(initials(d))}</span>
    <span style="flex:1;min-width:0"><span class="n">${esc(d.prenom)} ${esc(d.nom)}</span>
    <span class="s" style="display:block">${esc(g.sigle || g.nom || "—")} · ${esc(d.dep)}${d.circo ? ` (${esc(d.circo)}e circ.)` : ""}</span></span>${extra}
  </a>`;
}

const skeleton = (n = 5) => `<div class="sk" style="height:30px;width:55%;margin:18px 0 14px"></div>` + Array.from({ length: n }, () => `<div class="sk sk-card"></div>`).join("");
const empty = (msg) => `<div class="empty"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg><div>${msg}</div></div>`;
const errorBox = () => `<div class="empty"><div>Données indisponibles pour le moment.</div><div class="small" style="margin-top:6px">Vérifie ta connexion, puis tire vers le bas pour réessayer.</div></div>`;

function chips(items, current, attr) {
  return `<div class="chips">${items.map(([v, l]) => `<button class="chip${v === current ? " on" : ""}" data-${attr}="${esc(v)}">${esc(l)}</button>`).join("")}</div>`;
}

/* liste longue : rendu progressif */
function progressive(container, items, render, step = 30) {
  let i = 0;
  const more = () => {
    container.insertAdjacentHTML("beforeend", items.slice(i, i + step).map(render).join(""));
    i += step;
    if (i >= items.length) io.disconnect();
  };
  if (container.nextElementSibling?.classList.contains("sentinel")) container.nextElementSibling.remove();
  const sentinel = document.createElement("div");
  sentinel.className = "sentinel";
  container.after(sentinel);
  const io = new IntersectionObserver((es) => es[0].isIntersecting && more(), { rootMargin: "600px" });
  more();
  io.observe(sentinel);
}

/* ---------- vues ---------- */
const ui = { actuFilter: "finaux", actuTheme: "", textesFilter: "tous", textesTheme: "" };

async function viewActu() {
  $view.innerHTML = skeleton();
  const [list, meta] = await Promise.all([api("scrutins.json"), api("meta.json").catch(() => null)]);
  const filt = list.filter((s) =>
    (ui.actuFilter === "tous" || (ui.actuFilter === "finaux" ? s.k === "ensemble" || s.k === "censure" : s.k === ui.actuFilter)) &&
    (!ui.actuTheme || s.themes.includes(ui.actuTheme)));
  const used = Object.entries(THEMES).filter(([k]) => list.some((s) => s.themes.includes(k)));
  $view.innerHTML = `
    <h1 class="page-title">Derniers votes</h1>
    <p class="page-sub">${meta ? `${nf(meta.nb.scrutins)} ${term("scrutin public", "scrutins publics")} · mis à jour le ${new Date(meta.maj).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}` : ""}</p>
    ${chips([["finaux", "Votes finaux"], ["tous", "Tous les votes"], ["amendement", "Amendements"], ["article", "Articles"]], ui.actuFilter, "f")}
    ${chips([["", "Tous thèmes"], ...used], ui.actuTheme, "t")}
    <div id="list"></div>
    ${filt.length ? "" : empty("Aucun vote pour ce filtre.")}`;
  progressive($view.querySelector("#list"), filt, scrutinCard);
  $view.onclick = (e) => {
    const f = e.target.closest("[data-f]"), t = e.target.closest("[data-t]");
    if (f) { ui.actuFilter = f.dataset.f; render(); }
    if (t) { ui.actuTheme = t.dataset.t; render(); }
  };
}

async function viewScrutin(id) {
  $view.innerHTML = skeleton(3);
  const [s, groupes, deps] = await Promise.all([api(`scrutins/${id}.json`), api("groupes.json"), api("deputes.json")]);
  const byId = Object.fromEntries(deps.map((d) => [d.id, d]));
  let dossier = null;
  if (s.dossier) dossier = (await api("dossiers.json")).find((d) => d.id === s.dossier);
  const gs = [...s.groupes].sort((a, b) => b.m - a.m);
  const posLabel = { pour: "Pour", contre: "Contre", abst: "Abstention", nv: "Non-votants" };
  const majLabel = { pour: "majoritairement pour", contre: "majoritairement contre", abstention: "majoritairement abstention" };
  const nameOf = (pid) => { const d = byId[pid]; return d ? `<a href="#/depute/${esc(pid)}">${esc(d.prenom)} ${esc(d.nom)}</a>` : `<span class="muted">${esc(pid)}</span>`; };
  $view.innerHTML = `
    <div class="card-meta" style="margin-top:16px">${fdate(s.date)} · Scrutin n° ${s.n} · ${esc(KIND[s.k] || "")}</div>
    <h1 class="page-title" style="font-size:23px;margin-top:4px">${esc(cap(s.titre))}</h1>
    <div style="margin:12px 0 18px">${sortBadge(s)}</div>
    <div class="card">
      ${voteBar(s, true)}
      <div class="legend"><span><i class="dot p"></i>Pour <b>${s.pour}</b></span><span><i class="dot c"></i>Contre <b>${s.contre}</b></span><span><i class="dot a"></i>Abstention <b>${s.abst}</b></span></div>
      <dl class="kv" style="margin-top:14px">
        <dt>Votants</dt><dd>${s.votants}</dd>
        <dt>${term("suffrages exprimés", "Exprimés")}</dt><dd>${s.exprimes}</dd>
        <dt>${term("majorité absolue", "Requis")}</dt><dd>${s.requis}</dd>
        <dt>Type</dt><dd>${esc(cap(s.type))}</dd>
        ${s.demandeur ? `<dt>Demandé par</dt><dd>${esc(s.demandeur)}</dd>` : ""}
      </dl>
    </div>
    ${dossier ? `<h2 class="section-title">Texte concerné</h2>${dossierCard(dossier)}` : ""}
    <h2 class="section-title">Par ${term("groupe", "groupe politique")}</h2>
    <div class="card" id="grps">
      ${gs.map((g, i) => {
        const gi = groupes[g.g] || {};
        return `<div class="grp" data-i="${i}">
          <button class="grp-head" aria-expanded="false">
            <span class="gdot" style="background:${esc(gi.couleur || "var(--ink-3)")}"></span>
            <span class="grp-name">${esc(gi.nom || g.g)}<small>${g.m} membres · ${esc(majLabel[g.maj] || "")}</small></span>${ICON.chev}
          </button>
          ${voteBar(g)}
          <div class="grp-nums"><span>Pour ${g.pour}</span><span>Contre ${g.contre}</span><span>Abst. ${g.abst}</span>${g.nv ? `<span>${term("non-votant", "Non-votants")} ${g.nv}</span>` : ""}</div>
          <div class="grp-list">${Object.entries(g.noms || {}).map(([p, ids]) => `<h4>${posLabel[p]} (${ids.length})</h4><div>${ids.map(nameOf).join(", ")}</div>`).join("") || `<div class="muted">Pas de détail nominatif.</div>`}</div>
        </div>`;
      }).join("")}
    </div>
    <a class="btn link" href="${anScrutin(s.n)}" target="_blank" rel="noopener">Voir sur assemblee-nationale.fr ${ICON.ext}</a>
    <p class="notice">Les députés absents ne figurent pas dans le décompte.</p>`;
  $view.onclick = (e) => {
    const h = e.target.closest(".grp-head");
    if (h) { const g = h.parentElement; g.classList.toggle("open"); h.setAttribute("aria-expanded", g.classList.contains("open")); }
  };
}

async function viewTextes() {
  $view.innerHTML = skeleton();
  const list = await api("dossiers.json");
  const loi = list.filter((d) => /loi/i.test(d.procedure) || /loi/i.test(d.titre));
  const filt = loi.filter((d) =>
    (ui.textesFilter === "tous" || (ui.textesFilter === "prom" ? d.promulgue : !d.promulgue)) &&
    (!ui.textesTheme || d.themes.includes(ui.textesTheme)));
  const used = Object.entries(THEMES).filter(([k]) => loi.some((d) => d.themes.includes(k)));
  $view.innerHTML = `
    <h1 class="page-title">Textes de loi</h1>
    <p class="page-sub">${term("projet de loi", "Projets")} et ${term("proposition de loi", "propositions de loi")}, du plus récemment actif au plus ancien.</p>
    ${chips([["tous", "Tous"], ["cours", "En cours"], ["prom", "Promulgués"]], ui.textesFilter, "f")}
    ${chips([["", "Tous thèmes"], ...used], ui.textesTheme, "t")}
    <div id="list"></div>${filt.length ? "" : empty("Aucun texte pour ce filtre.")}`;
  progressive($view.querySelector("#list"), filt, dossierCard);
  $view.onclick = (e) => {
    const f = e.target.closest("[data-f]"), t = e.target.closest("[data-t]");
    if (f) { ui.textesFilter = f.dataset.f; render(); }
    if (t) { ui.textesTheme = t.dataset.t; render(); }
  };
}

async function viewTexte(id) {
  $view.innerHTML = skeleton(3);
  const [list, scrutins] = await Promise.all([api("dossiers.json"), api("scrutins.json")]);
  const d = list.find((x) => x.id === id);
  if (!d) { $view.innerHTML = empty("Texte introuvable."); return; }
  const votes = scrutins.filter((s) => s.dossier === id);
  const finals = votes.filter((s) => s.k === "ensemble");
  const fav = isFav("textes", id);
  const etapes = d.etapes || [];
  const termFor = (code) => code === "CMP" ? "cmp" : code === "ANLDEF" ? "lecture définitive" : code.startsWith("PROM") ? "promulgation" : code === "CC" ? "conseil constitutionnel" : "lecture";
  $view.innerHTML = `
    <div class="head-row" style="margin-top:16px">
      <div><div class="card-meta">${esc(d.procedure)}</div><h1 class="page-title" style="font-size:23px;margin-top:4px">${esc(d.titre)}</h1></div>
      <button class="star${fav ? " on" : ""}" id="fav" aria-pressed="${fav}" aria-label="Suivre ce texte">${ICON.star}</button>
    </div>
    <div style="margin:12px 0 4px">${d.promulgue ? `<span class="badge adopte">Loi promulguée</span>` : `<span class="badge accent">En cours d'examen</span>`}</div>
    <h2 class="section-title">Parcours du texte (${term("navette")})</h2>
    <div class="card"><ol class="timeline">
      ${etapes.map((e, i) => `<li class="${i < etapes.length - 1 || d.promulgue ? "done" : "current"}">
        <span class="node"></span><div class="t">${term(termFor(e.code), e.lib)}</div>
        <div class="d">${e.debut ? fdate(e.debut) : ""}${e.fin && e.fin !== e.debut ? ` → ${fdate(e.fin)}` : ""}</div></li>`).join("")}
      ${d.promulgue ? "" : `<li class="todo"><span class="node"></span><div class="t">${term("promulgation")}</div><div class="d">Pas encore</div></li>`}
    </ol></div>
    ${finals.length ? `<h2 class="section-title">Votes sur l'ensemble</h2>${finals.map(scrutinCard).join("")}` : ""}
    ${votes.length > finals.length ? `<h2 class="section-title">Autres scrutins (${votes.length - finals.length})</h2><div id="other"></div>` : ""}
    ${d.chemin ? `<a class="btn link" href="${anDossier(d.chemin)}" target="_blank" rel="noopener">Dossier complet sur assemblee-nationale.fr ${ICON.ext}</a>` : ""}`;
  const other = $view.querySelector("#other");
  if (other) progressive(other, votes.filter((s) => s.k !== "ensemble"), scrutinCard, 15);
  $view.querySelector("#fav").onclick = (e) => { const on = toggleFav("textes", id); e.currentTarget.classList.toggle("on", on); e.currentTarget.setAttribute("aria-pressed", on); };
}

function depFromPostal(cp) {
  cp = (cp || "").replace(/\D/g, "");
  if (cp.length < 2) return "";
  if (cp.startsWith("20")) return cp.length >= 3 && +cp.slice(0, 3) >= 202 ? "2B" : "2A";
  if (cp.startsWith("97") || cp.startsWith("98")) return cp.slice(0, 3);
  return cp.slice(0, 2);
}
const sameDep = (a, b) => String(a).replace(/^0+/, "").toUpperCase() === String(b).replace(/^0+/, "").toUpperCase();

async function viewDeputes() {
  $view.innerHTML = skeleton();
  const [deps, groupes] = await Promise.all([api("deputes.json"), api("groupes.json")]);
  const gs = Object.values(groupes).filter((g) => g.sieges > 0).sort((a, b) => b.sieges - a.sieges);
  const total = gs.reduce((s, g) => s + g.sieges, 0);
  $view.innerHTML = `
    <h1 class="page-title">Députés</h1>
    <p class="page-sub">${deps.length} députés en exercice.</p>
    <div class="card">
      <div class="seats">${gs.map((g) => `<i title="${esc(g.nom)}" style="width:${pct(g.sieges, total)}%;background:${esc(g.couleur || "var(--ink-3)")}"></i>`).join("")}</div>
      <div class="seat-legend">${gs.map((g) => `<span><i class="gdot" style="display:inline-block;width:9px;height:9px;background:${esc(g.couleur || "var(--ink-3)")};margin-right:4px"></i>${esc(g.sigle || g.nom)} ${g.sieges}</span>`).join("")}</div>
      <p class="notice" style="margin-top:8px">Groupes classés par nombre de sièges.</p>
    </div>
    <div class="row2">
      <div class="field"><input id="q" type="search" placeholder="Nom du député" autocomplete="off"></div>
      <div class="field"><input id="cp" inputmode="numeric" maxlength="5" placeholder="Code postal" autocomplete="postal-code"></div>
    </div>
    <p class="notice" id="hint" style="margin:0 0 10px"></p>
    <div id="list"></div>`;
  const $list = $view.querySelector("#list"), $q = $view.querySelector("#q"), $cp = $view.querySelector("#cp"), $hint = $view.querySelector("#hint");
  const draw = () => {
    const q = norm($q.value.trim()), dep = depFromPostal($cp.value);
    const res = deps.filter((d) => (!q || norm(`${d.prenom} ${d.nom}`).includes(q)) && (!dep || sameDep(d.numDep, dep)));
    $hint.textContent = dep ? `Département ${dep} : ${res.length} député(s). La circonscription exacte dépend de ta commune.` : "";
    $list.innerHTML = "";
    if (!res.length) { $list.innerHTML = empty("Aucun député trouvé."); return; }
    progressive($list, res, (d) => personRow(d, groupes), 40);
  };
  $q.oninput = draw; $cp.oninput = draw;
  draw();
}

async function viewDepute(id) {
  $view.innerHTML = skeleton(3);
  const [d, groupes, scrutins] = await Promise.all([api(`deputes/${id}.json`), api("groupes.json"), api("scrutins.json")]);
  const byId = Object.fromEntries(scrutins.map((s) => [s.id, s]));
  const g = groupes[d.groupe] || {};
  const fav = isFav("deputes", id);
  const cnt = { pour: 0, contre: 0, abst: 0, nv: 0 };
  d.votes.forEach((v) => (cnt[v.p] = (cnt[v.p] || 0) + 1));
  const lab = { pour: "Pour", contre: "Contre", abst: "Abstention", nv: "Non-votant" };
  $view.innerHTML = `
    <div class="head-row" style="margin-top:18px">
      <div class="person"><span class="avatar" style="--g:${esc(g.couleur || "transparent")};width:56px;height:56px;font-size:18px">${esc(initials(d))}</span>
        <div><h1 class="page-title" style="font-size:24px;margin:0">${esc(d.prenom)} ${esc(d.nom)}</h1>
        <div class="muted small">${esc(g.nom || "—")}</div></div></div>
      <button class="star${fav ? " on" : ""}" id="fav" aria-pressed="${fav}" aria-label="Suivre ce député">${ICON.star}</button>
    </div>
    <div class="card" style="margin-top:16px"><dl class="kv">
      <dt>Circonscription</dt><dd>${esc(d.dep)}${d.circo ? ` · ${esc(d.circo)}e` : ""}</dd>
      ${d.profession ? `<dt>Profession</dt><dd>${esc(d.profession)}</dd>` : ""}
      <dt>${term("groupe", "Groupe")}</dt><dd>${esc(g.sigle || "")} ${g.sigle ? "·" : ""} ${esc(g.nom || "—")}</dd>
    </dl></div>
    <h2 class="section-title">Ses ${d.votes.length} derniers votes enregistrés</h2>
    <div class="card"><div class="legend" style="margin:0"><span><i class="dot p"></i>Pour <b>${cnt.pour}</b></span><span><i class="dot c"></i>Contre <b>${cnt.contre}</b></span><span><i class="dot a"></i>Abstention <b>${cnt.abst}</b></span>${cnt.nv ? `<span>Non-votant <b>${cnt.nv}</b></span>` : ""}</div></div>
    <div id="list"></div>
    ${d.votes.length ? "" : empty("Aucun vote enregistré récemment.")}
    <a class="btn link" href="${anDepute(id)}" target="_blank" rel="noopener">Fiche officielle ${ICON.ext}</a>
    <p class="notice">Seuls les scrutins publics enregistrent la position de chaque député. Les absences n'apparaissent pas.</p>`;
  progressive($view.querySelector("#list"), d.votes.filter((v) => byId[v.s]), (v) => {
    const s = byId[v.s];
    return `<a class="card" href="#/scrutin/${esc(s.id)}"><div class="card-meta"><span>${fdate(s.date)}</span><span>·</span><span>${KIND[s.k] || ""}</span></div>
      <h3 class="card-title" style="font-size:15.5px">${esc(cap(s.titre))}</h3>
      <div class="card-foot"><span class="badge neutre">A voté : ${lab[v.p]}</span><span>Résultat : ${s.sort === "adopte" ? "adopté" : s.sort === "rejete" ? "rejeté" : esc(s.sort)}</span></div></a>`;
  }, 20);
  $view.querySelector("#fav").onclick = (e) => { const on = toggleFav("deputes", id); e.currentTarget.classList.toggle("on", on); e.currentTarget.setAttribute("aria-pressed", on); };
}

async function viewFavoris() {
  const f = favs();
  if (!f.textes.length && !f.deputes.length) {
    $view.innerHTML = `<h1 class="page-title">Favoris</h1><div class="empty"><svg viewBox="0 0 24 24"><path d="M12 4l2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z"/></svg>
      <div>Rien pour l'instant.</div><div class="small" style="margin-top:6px">Touche l'étoile sur un texte ou un député pour le suivre ici.</div></div>`;
    return;
  }
  $view.innerHTML = skeleton(3);
  const [dos, deps, groupes] = await Promise.all([api("dossiers.json"), api("deputes.json"), api("groupes.json")]);
  const T = f.textes.map((id) => dos.find((d) => d.id === id)).filter(Boolean);
  const D = f.deputes.map((id) => deps.find((d) => d.id === id)).filter(Boolean);
  $view.innerHTML = `<h1 class="page-title">Favoris</h1>
    ${T.length ? `<h2 class="section-title">Textes suivis</h2>${T.map(dossierCard).join("")}` : ""}
    ${D.length ? `<h2 class="section-title">Députés suivis</h2>${D.map((d) => personRow(d, groupes)).join("")}` : ""}
    <p class="notice">Tes favoris restent uniquement sur ce téléphone.</p>`;
}

async function viewRecherche(q0 = "") {
  $view.innerHTML = `<h1 class="page-title">Recherche</h1>
    <div class="field">${ICON.search}<input id="q" type="search" placeholder="Un texte, un vote, un député…" value="${esc(q0)}" autocomplete="off" enterkeyhint="search"></div>
    <div id="res"><p class="page-sub">Exemples : « retraites », « budget », « logement », un nom de député.</p></div>`;
  const $q = $view.querySelector("#q"), $res = $view.querySelector("#res");
  let data;
  try { data = await Promise.all([api("scrutins.json"), api("dossiers.json"), api("deputes.json"), api("groupes.json")]); }
  catch { $res.innerHTML = errorBox(); return; }
  const [sc, dos, deps, groupes] = data;
  let timer;
  const run = () => {
    const words = norm($q.value.trim()).split(/\s+/).filter((w) => w.length > 1);
    history.replaceState(null, "", "#/recherche" + (words.length ? "/" + encodeURIComponent($q.value.trim()) : ""));
    if (!words.length) { $res.innerHTML = `<p class="page-sub">Exemples : « retraites », « budget », « logement », un nom de député.</p>`; return; }
    const hit = (s) => words.every((w) => norm(s).includes(w));
    const D = deps.filter((d) => hit(`${d.prenom} ${d.nom} ${d.dep}`)).slice(0, 8);
    const T = dos.filter((d) => hit(d.titre)).slice(0, 10);
    const S = sc.filter((s) => hit(s.titre)).slice(0, 20);
    $res.innerHTML = (!D.length && !T.length && !S.length) ? empty("Aucun résultat.") :
      (D.length ? `<h2 class="section-title">Députés</h2>${D.map((d) => personRow(d, groupes)).join("")}` : "") +
      (T.length ? `<h2 class="section-title">Textes</h2>${T.map(dossierCard).join("")}` : "") +
      (S.length ? `<h2 class="section-title">Scrutins</h2>${S.map(scrutinCard).join("")}` : "");
  };
  $q.oninput = () => { clearTimeout(timer); timer = setTimeout(run, 150); };
  if (q0) run(); else setTimeout(() => $q.focus(), 50);
}

function viewLexique() {
  const entries = Object.values(LEXIQUE).sort((a, b) => a[0].localeCompare(b[0], "fr"));
  $view.innerHTML = `<h1 class="page-title">Lexique</h1>
    <p class="page-sub">Les mots soulignés en pointillés dans l'appli renvoient ici.</p>
    <dl class="lex">${entries.map(([t, d]) => `<dt>${esc(t)}</dt><dd>${esc(d)}</dd>`).join("")}</dl>
    <h2 class="section-title">À propos</h2>
    <p class="muted small">Hémicycle affiche uniquement les données publiées par l'Assemblée nationale (data.assemblee-nationale.fr), sans commentaire ni classement. Les thèmes sont attribués automatiquement à partir de mots du titre officiel. Appli indépendante, non affiliée à l'Assemblée nationale.</p>`;
}

/* ---------- routeur ---------- */
const ROUTES = [
  [/^#?\/?$/, "actu", viewActu],
  [/^#\/scrutin\/(.+)$/, "actu", viewScrutin],
  [/^#\/textes$/, "textes", viewTextes],
  [/^#\/texte\/(.+)$/, "textes", viewTexte],
  [/^#\/deputes$/, "deputes", viewDeputes],
  [/^#\/depute\/(.+)$/, "deputes", viewDepute],
  [/^#\/favoris$/, "favoris", viewFavoris],
  [/^#\/recherche(?:\/(.*))?$/, "recherche", (q) => viewRecherche(q ? decodeURIComponent(q) : "")],
  [/^#\/lexique$/, "", viewLexique],
];
const scrollMem = {};
let lastHash = location.hash;

async function render() {
  const h = location.hash || "#/";
  const [re, tab, fn] = ROUTES.find(([r]) => r.test(h)) || ROUTES[0];
  const m = h.match(re) || [];
  document.querySelectorAll(".tabs a").forEach((a) => a.classList.toggle("on", a.dataset.tab === tab));
  $view.onclick = null;
  try { await fn(m[1]); }
  catch (e) { console.error(e); $view.innerHTML = errorBox(); }
}

function navigate() {
  scrollMem[lastHash] = scrollY;
  const back = scrollMem[location.hash];
  lastHash = location.hash;
  const go = () => render().then(() => scrollTo(0, back || 0));
  if (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) document.startViewTransition(go);
  else go();
}
addEventListener("hashchange", navigate);
document.querySelector(".tabs").addEventListener("click", (e) => {
  const a = e.target.closest("a");
  if (a && a.getAttribute("href") === location.hash) { e.preventDefault(); scrollTo({ top: 0, behavior: "smooth" }); }
});
addEventListener("scroll", () => document.querySelector(".top").classList.toggle("scrolled", scrollY > 4), { passive: true });

/* ---------- tirer pour rafraîchir ---------- */
(() => {
  const ptr = document.getElementById("ptr");
  let y0 = null, dy = 0;
  addEventListener("touchstart", (e) => { if (scrollY <= 0 && document.getElementById("sheet").hidden) { y0 = e.touches[0].clientY; dy = 0; } }, { passive: true });
  addEventListener("touchmove", (e) => {
    if (y0 === null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    const d = Math.min(dy * 0.5, 80);
    ptr.style.opacity = Math.min(d / 50, 1);
    ptr.style.transform = `translate(-50%, ${d - 60}px) rotate(${d * 4}deg)`;
  }, { passive: true });
  addEventListener("touchend", async () => {
    if (y0 === null) return;
    y0 = null;
    if (dy * 0.5 > 60) {
      ptr.classList.add("loading");
      ptr.style.transform = "translate(-50%, 12px)";
      cache.clear();
      try { await api("meta.json", { fresh: true }); await api("scrutins.json", { fresh: true }); await api("dossiers.json", { fresh: true }); } catch {}
      await render();
      toast("Données à jour");
      ptr.classList.remove("loading");
    }
    ptr.style.opacity = 0;
    ptr.style.transform = "translate(-50%, -60px)";
  });
})();

/* ---------- démarrage ---------- */
api("meta.json").then((m) => { LEG = m.legislature || LEG; }).catch(() => {});
render();
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
