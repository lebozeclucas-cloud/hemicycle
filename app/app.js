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

/* ---------- graphiques (SVG/HTML maison, hors ligne) ---------- */
function hemiLayout(n) {
  const rows = Math.max(3, Math.min(12, Math.round(Math.sqrt(n / 2.4))));
  const radii = Array.from({ length: rows }, (_, i) => 0.36 + (0.64 * i) / Math.max(rows - 1, 1));
  const tot = radii.reduce((a, b) => a + b, 0);
  const counts = radii.map((r) => Math.max(1, Math.round((n * r) / tot)));
  counts[rows - 1] += n - counts.reduce((a, b) => a + b, 0);
  const seats = [];
  let dot = 1;
  radii.forEach((r, i) => {
    const k = counts[i];
    if (k > 0) dot = Math.min(dot, (Math.PI * r) / Math.max(k, 1) / 2.25, 0.64 / rows / 2.25);
    for (let j = 0; j < k; j++) {
      const a = k === 1 ? Math.PI / 2 : Math.PI * (1 - j / (k - 1));
      seats.push({ a, x: Math.cos(a) * r, y: -Math.sin(a) * r });
    }
  });
  seats.sort((p, q) => q.a - p.a);
  return { seats, dot };
}
/* items : [{c: couleur, t: info-bulle, g: id de groupe}] dans l'ordre gauche → droite */
function hemicycle(items, { bands = [] } = {}) {
  if (!items.length) return "";
  const { seats, dot } = hemiLayout(items.length);
  const ranges = {};
  items.forEach((it, i) => { if (it.g) { const a = seats[i].a; const r = (ranges[it.g] ||= [a, a]); r[0] = Math.min(r[0], a); r[1] = Math.max(r[1], a); } });
  const arc = (a0, a1, R) => `M${Math.cos(a1) * R},${-Math.sin(a1) * R} A${R},${R} 0 0 1 ${Math.cos(a0) * R},${-Math.sin(a0) * R}`;
  return `<svg class="hemi" viewBox="-1.1 -1.12 2.2 1.18" role="img" aria-label="Hémicycle">
    ${bands.map((b) => ranges[b.g] ? `<path d="${arc(ranges[b.g][0] - 0.012, ranges[b.g][1] + 0.012, 1.07)}" style="stroke:${esc(b.c)}" stroke-width=".035" fill="none" stroke-linecap="round"><title>${esc(b.t)}</title></path>` : "").join("")}
    ${items.map((it, i) => `<circle cx="${seats[i].x.toFixed(4)}" cy="${seats[i].y.toFixed(4)}" r="${dot.toFixed(4)}" style="fill:${esc(it.c)}"><title>${esc(it.t)}</title></circle>`).join("")}
  </svg>`;
}
function hbars(rows, { max = 100, unit = "%", color } = {}) {
  return `<div class="hbars">${rows.map((r) => `<a class="hbar" ${r.href ? `href="${r.href}"` : ""}>
    <span class="hb-l">${r.dot ? `<i class="gdot" style="background:${esc(r.dot)}"></i>` : ""}${esc(r.l)}</span>
    <span class="hb-t"><i style="width:${Math.max(0, Math.min(100, (100 * (r.v || 0)) / max))}%;background:${esc(r.c || color || "var(--ink)")}"></i></span>
    <b>${r.v == null ? "—" : String(r.v).replace(".", ",") + unit}</b></a>`).join("")}</div>`;
}
function monthBars(mois, { stacked = true } = {}) {
  if (!mois.length) return "";
  const max = Math.max(...mois.map((m) => m.n || m[1] || 0), 1);
  const M = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  return `<div class="mbars">${mois.map((m) => {
    const key = m.m || m[0], n = m.n ?? m[1];
    const [y, mo] = key.split("-");
    const tip = `${MOIS[+mo - 1]} ${y} : ${n}`;
    const seg = stacked && m.n ? `<i class="c" style="height:${(100 * m.rejete) / max}%"></i><i class="p" style="height:${(100 * m.adopte) / max}%"></i><i class="a" style="height:${(100 * (m.n - m.adopte - m.rejete)) / max}%"></i>`
      : `<i class="p" style="height:${(100 * n) / max}%"></i>`;
    return `<div class="mb" title="${esc(tip)}"><div class="mb-col">${seg}</div><span>${+mo === 1 ? y.slice(2) : M[+mo - 1]}</span></div>`;
  }).join("")}</div>`;
}
function donut(parts, label) {
  const tot = parts.reduce((s, p) => s + p.v, 0) || 1;
  let off = 0;
  const C = 2 * Math.PI * 15.9155;
  return `<div class="donut-wrap"><svg viewBox="0 0 42 42" class="donut">
    <circle cx="21" cy="21" r="15.9155" fill="none" style="stroke:var(--surface-2)" stroke-width="6"/>
    ${parts.map((p) => { const len = (C * p.v) / tot; const s = `<circle cx="21" cy="21" r="15.9155" fill="none" style="stroke:${p.c}" stroke-width="6" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off + C / 4}"><title>${esc(p.l)} : ${p.v}</title></circle>`; off += len; return s; }).join("")}
    <text x="21" y="22.5" text-anchor="middle" class="donut-t">${esc(label)}</text></svg>
    <div class="legend" style="flex-direction:column;gap:6px">${parts.map((p) => `<span><i class="dot" style="background:${p.c}"></i>${esc(p.l)} <b>${nf(p.v)}</b> <span class="muted">(${Math.round((100 * p.v) / tot)} %)</span></span>`).join("")}</div></div>`;
}
function compositionHemi(gs) {
  return hemicycle(gs.flatMap((g) => Array.from({ length: g.sieges }, () => ({ c: g.couleur || "var(--ink-3)", t: `${g.nom} · ${g.sieges} sièges` })))) +
    `<div class="seat-legend">${gs.map((g) => `<a href="#/groupe/${esc(g.id)}"><i class="gdot" style="display:inline-block;width:9px;height:9px;background:${esc(g.couleur || "var(--ink-3)")};margin-right:4px"></i>${esc(g.sigle || g.nom)} <b>${g.sieges}</b></a>`).join("")}</div>`;
}
const tile = (v, l, sub) => `<div class="tile"><b>${v}</b><span>${l}</span>${sub ? `<small>${sub}</small>` : ""}</div>`;
const fpct = (v) => (v == null ? "—" : String(v).replace(".", ",") + " %");
const howto = (txt) => `<details class="howto"><summary>Comment c'est calculé ?</summary><p>${txt}</p></details>`;

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
      ${hemicycle(gs.flatMap((g) => {
        const gi = groupes[g.g] || {}, name = gi.sigle || gi.nom || "";
        const ids = g.noms || {};
        const vot = ["pour", "contre", "abst", "nv"].reduce((n, p) => n + (ids[p] ? ids[p].length : g[p] || 0), 0);
        const col = { pour: "var(--pour)", contre: "var(--contre)", abst: "var(--abst)", nv: "var(--nv)" };
        const lab = { pour: "Pour", contre: "Contre", abst: "Abstention", nv: "Non-votant" };
        const seatsOf = (p) => (ids[p] || Array.from({ length: g[p] || 0 })).map((pid) => ({ c: col[p], g: g.g, t: `${byId[pid] ? byId[pid].prenom + " " + byId[pid].nom : name} · ${lab[p]}` }));
        return [...seatsOf("pour"), ...seatsOf("contre"), ...seatsOf("abst"), ...seatsOf("nv"),
          ...Array.from({ length: Math.max(0, g.m - vot) }, () => ({ c: "var(--absent)", g: g.g, t: `${name} · n'a pas voté` }))];
      }), { bands: gs.map((g) => ({ g: g.g, c: (groupes[g.g] || {}).couleur || "var(--ink-3)", t: (groupes[g.g] || {}).nom || "" })) })}
      <div class="legend" style="justify-content:center;margin:2px 0 14px"><span><i class="dot p"></i>Pour</span><span><i class="dot c"></i>Contre</span><span><i class="dot a"></i>Abstention</span><span><i class="dot" style="background:var(--absent)"></i>N'a pas voté</span></div>
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
          <div class="grp-list"><a href="#/groupe/${esc(g.g)}" class="small">Voir le groupe →</a>${Object.entries(g.noms || {}).map(([p, ids]) => `<h4>${posLabel[p]} (${ids.length})</h4><div>${ids.map(nameOf).join(", ")}</div>`).join("") || `<div class="muted">Pas de détail nominatif.</div>`}</div>
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
      ${compositionHemi(gs)}
      <p class="notice" style="margin-top:8px">${total} sièges occupés · groupes classés par nombre de sièges. Touche un groupe pour le détail.</p>
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
      <dt>${term("groupe", "Groupe")}</dt><dd><a href="#/groupe/${esc(d.groupe)}" style="text-decoration:underline">${esc(g.sigle || "")} ${g.sigle ? "·" : ""} ${esc(g.nom || "—")}</a></dd>
      ${d.debut ? `<dt>Mandat depuis</dt><dd>${fdate(d.debut)}</dd>` : ""}
    </dl></div>
    <div class="tiles">
      ${tile(fpct(d.part), "Participation", `${nf(d.nb)} votes sur ${nf(d.depuis)} scrutins`)}
      ${tile(fpct(d.loyaute), "Vote comme son groupe", "position majoritaire")}
    </div>
    ${howto("Participation : nombre de scrutins publics auxquels le député a pris part (pour, contre ou abstention) divisé par le nombre de scrutins publics depuis le début de son mandat. Les travaux en commission, les délégations et les absences justifiées ne sont pas pris en compte. « Vote comme son groupe » : part de ses votes identiques à la position majoritaire de son groupe lors du même scrutin.")}
    ${d.mois && d.mois.length ? `<h2 class="section-title">Votes par mois</h2><div class="card">${monthBars(d.mois, { stacked: false })}</div>` : ""}
    ${Object.keys(d.accords || {}).length ? `<h2 class="section-title">Proximité de vote avec chaque groupe</h2>
      <div class="card">${hbars(Object.entries(d.accords).filter(([gid]) => groupes[gid]).sort((a, b) => b[1] - a[1]).map(([gid, v]) => ({ l: groupes[gid].sigle || groupes[gid].nom, v, c: groupes[gid].couleur, href: `#/groupe/${gid}` })))}</div>
      ${howto("Part des scrutins où ce député a voté comme la position majoritaire de chaque groupe. Calculé sur les scrutins où le député a voté (au moins 20).")}` : ""}
    <h2 class="section-title">Ses ${d.votes.length} derniers votes enregistrés</h2>
    <div class="card">${donut([{ l: "Pour", v: cnt.pour, c: "var(--pour)" }, { l: "Contre", v: cnt.contre, c: "var(--contre)" }, { l: "Abstention", v: cnt.abst, c: "var(--abst)" }], String(d.votes.length))}</div>
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

const KIND_COLORS = { ensemble: "var(--ink)", amendement: "var(--contre)", article: "var(--abst)", censure: "var(--accent)", motion: "#b8a88a", autre: "var(--line)" };

async function viewAnalyses() {
  $view.innerHTML = skeleton(4);
  const [st, groupes, meta] = await Promise.all([api("stats.json"), api("groupes.json"), api("meta.json").catch(() => null)]);
  const gs = Object.values(groupes).filter((g) => g.sieges > 0).sort((a, b) => b.sieges - a.sieges);
  const mois = st.mois.slice(-18);
  const tot = st.sort.adopte + st.sort.rejete;
  const th = Object.entries(st.themes).filter(([k]) => THEMES[k]).sort((a, b) => b[1].textes - a[1].textes);
  const thMax = Math.max(...th.map(([, v]) => v.textes), 1);
  $view.innerHTML = `
    <h1 class="page-title">Analyses</h1>
    <p class="page-sub">Chiffres calculés à partir des ${nf(meta?.nb.scrutins || tot)} ${term("scrutin public", "scrutins publics")} de la ${meta?.legislature || LEG}e législature.</p>
    <div class="tiles">
      ${tile(nf(meta?.nb.scrutins || tot), "Scrutins")}
      ${tile(fpct(Math.round((1000 * st.sort.adopte) / (tot || 1)) / 10), "Adoptés")}
      ${tile(nf(meta?.nb.dossiers || 0), "Dossiers")}
      ${tile(nf(gs.length), "Groupes")}
    </div>
    <h2 class="section-title">Composition de l'Assemblée</h2>
    <div class="card">${compositionHemi(gs)}</div>

    <h2 class="section-title">Scrutins par mois</h2>
    <div class="card">${monthBars(mois)}
      <div class="legend" style="margin-top:12px"><span><i class="dot p"></i>Adoptés</span><span><i class="dot c"></i>Rejetés</span></div></div>

    <h2 class="section-title">Types de votes</h2>
    <div class="card">${donut(Object.entries(st.types).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ l: KIND[k] || k, v, c: KIND_COLORS[k] || "var(--line)" })), nf(Object.values(st.types).reduce((a, b) => a + b, 0)))}</div>

    <h2 class="section-title">Cohésion des groupes</h2>
    <div class="card">${hbars(gs.map((g) => ({ l: g.sigle || g.nom, v: g.cohesion, c: g.couleur, href: `#/groupe/${g.id}` })))}</div>
    ${howto("Pour chaque scrutin, part des membres votants du groupe qui ont suivi la position majoritaire du groupe, puis moyenne sur tous les scrutins. 100 % = tous les votants du groupe votent toujours pareil.")}

    <h2 class="section-title">Participation moyenne aux scrutins</h2>
    <div class="card">${hbars(gs.map((g) => ({ l: g.sigle || g.nom, v: g.participation, c: g.couleur, href: `#/groupe/${g.id}` })))}</div>
    ${howto("Pour chaque scrutin, nombre de membres du groupe ayant voté divisé par l'effectif du groupe, puis moyenne. Beaucoup de scrutins ont lieu en même temps que des réunions de commission : une participation basse ne veut pas dire absence de travail.")}

    <h2 class="section-title">Accords entre groupes</h2>
    <div class="card" style="overflow-x:auto">${heatmap(gs, st.accords)}</div>
    ${howto("Part des scrutins où les deux groupes ont eu la même position majoritaire (pour, contre ou abstention). Plus la case est foncée, plus les deux groupes votent souvent pareil.")}

    ${th.length ? `<h2 class="section-title">Textes par thème</h2>
    <div class="card">${hbars(th.map(([k, v]) => ({ l: THEMES[k], v: v.textes, c: "var(--accent)" })), { max: thMax, unit: "" })}
    <p class="notice">Thèmes détectés automatiquement à partir des mots du titre officiel.</p></div>` : ""}
  `;
}

function heatmap(gs, acc) {
  const cell = (a, b) => {
    if (a.id === b.id) return `<span class="hm-c self"></span>`;
    const v = (acc[a.id] || {})[b.id];
    return `<span class="hm-c${v != null && v >= 55 ? " dk" : ""}" title="${esc(a.sigle)} / ${esc(b.sigle)} : ${fpct(v)}" style="--v:${v == null ? 0 : v / 100}">${v == null ? "" : Math.round(v)}</span>`;
  };
  return `<div class="hm" style="grid-template-columns:auto repeat(${gs.length}, minmax(24px,1fr))">
    <span></span>${gs.map((g) => `<span class="hm-h" style="border-color:${esc(g.couleur)}">${esc(g.sigle || g.nom)}</span>`).join("")}
    ${gs.map((a) => `<span class="hm-r"><i class="gdot" style="background:${esc(a.couleur)}"></i>${esc(a.sigle || a.nom)}</span>${gs.map((b) => cell(a, b)).join("")}`).join("")}
  </div>`;
}

async function viewGroupe(id) {
  $view.innerHTML = skeleton(4);
  const [groupes, deps, st] = await Promise.all([api("groupes.json"), api("deputes.json"), api("stats.json")]);
  const g = groupes[id];
  if (!g) { $view.innerHTML = empty("Groupe introuvable."); return; }
  const membres = deps.filter((d) => d.groupe === id);
  const others = Object.entries(st.accords[id] || {}).filter(([o]) => groupes[o] && groupes[o].sieges > 0).sort((a, b) => b[1] - a[1]);
  const gs = Object.values(groupes).filter((x) => x.sieges > 0).sort((a, b) => b.sieges - a.sieges);
  const parts = membres.map((d) => d.part).filter((v) => v != null).sort((a, b) => a - b);
  const med = parts.length ? parts[Math.floor(parts.length / 2)] : null;
  $view.innerHTML = `
    <div class="person" style="margin-top:18px"><span class="gbig" style="background:${esc(g.couleur || "var(--ink-3)")}">${esc((g.sigle || g.nom).slice(0, 4))}</span>
      <div><h1 class="page-title" style="font-size:23px;margin:0">${esc(g.nom)}</h1><div class="muted small">${esc(g.sigle)} · ${g.sieges} députés</div></div></div>
    <div class="card" style="margin-top:16px">${hemicycle(gs.flatMap((x) => Array.from({ length: x.sieges }, () => ({ c: x.id === id ? x.couleur || "var(--ink)" : "var(--absent)", t: x.nom }))))}
      <p class="notice" style="text-align:center;margin:4px 0 0">${pct(g.sieges, gs.reduce((s, x) => s + x.sieges, 0)).toFixed(1).replace(".", ",")} % des sièges</p></div>
    <div class="tiles">
      ${tile(fpct(g.cohesion), "Cohésion", "votants alignés sur la majorité du groupe")}
      ${tile(fpct(g.participation), "Participation moyenne", med != null ? `médiane des membres : ${fpct(med)}` : "")}
    </div>
    ${others.length ? `<h2 class="section-title">Vote comme…</h2>
      <div class="card">${hbars(others.map(([o, v]) => ({ l: groupes[o].sigle || groupes[o].nom, v, c: groupes[o].couleur, href: `#/groupe/${o}` })))}</div>
      ${howto("Part des scrutins où la position majoritaire de ce groupe a été la même que celle de l'autre groupe.")}` : ""}
    <h2 class="section-title">Membres (${membres.length})</h2>
    <div class="chips" id="sort">${[["nom", "Nom"], ["part", "Participation"], ["loyaute", "Vote comme le groupe"]].map(([k, l], i) => `<button class="chip${i ? "" : " on"}" data-s="${k}">${l}</button>`).join("")}</div>
    <div id="list"></div>`;
  const draw = (key) => {
    const list = [...membres].sort((a, b) => key === "nom" ? norm(a.nom).localeCompare(norm(b.nom)) : (b[key] ?? -1) - (a[key] ?? -1));
    $view.querySelector("#list").innerHTML = list.map((d) => personRow(d, groupes, `<span class="muted small" style="text-align:right">${key === "loyaute" ? fpct(d.loyaute) : fpct(d.part)}<br><span style="font-size:11px">${key === "loyaute" ? "avec le groupe" : "participation"}</span></span>`)).join("");
  };
  draw("nom");
  $view.onclick = (e) => {
    const s = e.target.closest("[data-s]");
    if (s) { $view.querySelectorAll("#sort .chip").forEach((c) => c.classList.toggle("on", c === s)); draw(s.dataset.s); }
  };
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
  [/^#\/favoris$/, "", viewFavoris],
  [/^#\/analyses$/, "analyses", viewAnalyses],
  [/^#\/groupe\/(.+)$/, "analyses", viewGroupe],
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
