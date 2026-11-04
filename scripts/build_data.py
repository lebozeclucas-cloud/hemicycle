#!/usr/bin/env python3
"""
Hémicycle — récupère l'open data officiel de l'Assemblée nationale
(data.assemblee-nationale.fr) et le transforme en petits fichiers JSON
lisibles par l'appli.

Aucune dépendance externe : Python 3.9+ standard.

Usage :
    python scripts/build_data.py --out app/data
    python scripts/build_data.py --out app/data --local dossier_avec_les_zips   (test)
"""
import argparse
import io
import json
import os
import re
import shutil
import sys
import unicodedata
import urllib.request
import zipfile
from collections import defaultdict
from datetime import datetime, timezone

BASE = "https://data.assemblee-nationale.fr/static/openData/repository/{leg}"
SOURCES = {
    "scrutins": "/loi/scrutins/Scrutins.json.zip",
    "dossiers": "/loi/dossiers_legislatifs/Dossiers_Legislatifs.json.zip",
    "acteurs": "/amo/deputes_actifs_mandats_actifs_organes/AMO10_deputes_actifs_mandats_actifs_organes.json.zip",
}
UA = {"User-Agent": "hemicycle-app/1.0 (open data reader)"}
RECENT_VOTES_PER_DEPUTE = 80
TODAY = datetime.now(timezone.utc).date().isoformat()

# Thèmes détectés par mots-clés dans les titres officiels (transparent, sans jugement).
THEMES = {
    "economie": ["financ", "budget", "fiscal", "impôt", "impot", "taxe", "économ", "econom", "entreprise", "commerce", "banque", "dette"],
    "sante": ["santé", "sante", "médic", "medic", "hôpital", "hopital", "soins", "sécurité sociale", "securite sociale", "fin de vie", "maladie"],
    "education": ["éducation", "education", "école", "ecole", "enseignement", "université", "universite", "étudiant", "etudiant", "scolaire", "jeunesse"],
    "environnement": ["environnement", "climat", "énergie", "energie", "écolog", "ecolog", "eau", "biodiversité", "biodiversite", "pollution", "nucléaire", "nucleaire"],
    "securite": ["sécurité intérieure", "securite interieure", "police", "pénal", "penal", "justice", "terroris", "délinquance", "delinquance", "défense", "defense", "militaire", "armée", "armee"],
    "travail": ["travail", "emploi", "retraite", "salari", "chômage", "chomage", "syndica", "apprentissage"],
    "numerique": ["numérique", "numerique", "internet", "données", "donnees", "intelligence artificielle", "plateforme", "cyber"],
    "agriculture": ["agricul", "agricole", "alimentation", "pêche", "peche", "forêt", "foret", "rural"],
    "logement": ["logement", "loyer", "immobilier", "urbanisme", "habitat"],
    "institutions": ["constitution", "élection", "election", "électoral", "electoral", "collectivités", "collectivites", "outre-mer", "règlement de l'assemblée", "reglement de l'assemblee"],
    "immigration": ["immigration", "asile", "étrangers", "etrangers", "nationalité", "nationalite", "intégration", "integration"],
    "transports": ["transport", "mobilité", "mobilite", "ferroviaire", "routi", "aérien", "aerien"],
    "culture": ["culture", "patrimoine", "audiovisuel", "presse", "sport", "médias", "medias"],
    "international": ["accord", "convention", "traité", "traite", "ratification", "européen", "europeen", "international"],
}


# ---------- utilitaires ----------
def as_list(x):
    if x is None:
        return []
    return x if isinstance(x, list) else [x]


def txt(x):
    """Valeur texte, que le champ soit une chaîne ou {"#text": ...}."""
    if isinstance(x, dict):
        return x.get("#text") or x.get("$") or ""
    return x or ""


def d10(s):
    s = txt(s)
    return s[:10] if s else ""


def to_int(x):
    try:
        return int(txt(x))
    except (TypeError, ValueError):
        return 0


def norm(s):
    s = unicodedata.normalize("NFD", (s or "").lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


THEME_RE = {k: re.compile(r"\b(?:" + "|".join(re.escape(w) for w in ws) + ")", re.I) for k, ws in THEMES.items()}


def themes_for(title):
    t = title or ""
    return [k for k, rx in THEME_RE.items() if rx.search(t)]


def log(*a):
    print(*a, file=sys.stderr, flush=True)


# ---------- téléchargement ----------
def url_ok(url):
    try:
        req = urllib.request.Request(url, method="HEAD", headers=UA)
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status == 200
    except Exception:
        return False


def detect_legislature(explicit=None):
    if explicit:
        return explicit
    for leg in (19, 18, 17):
        if url_ok(BASE.format(leg=leg) + SOURCES["scrutins"]):
            return leg
    raise SystemExit("Impossible de trouver les données de l'Assemblée (site injoignable ?)")


def open_zip(kind, leg, local_dir=None):
    if local_dir:
        path = os.path.join(local_dir, os.path.basename(SOURCES[kind]))
        log(f"  lecture locale {path}")
        return zipfile.ZipFile(path)
    url = BASE.format(leg=leg) + SOURCES[kind]
    log(f"  téléchargement {url}")
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=300) as r:
        return zipfile.ZipFile(io.BytesIO(r.read()))


def iter_json(z, contains=None):
    for name in z.namelist():
        if not name.endswith(".json"):
            continue
        if contains and contains not in name:
            continue
        with z.open(name) as f:
            try:
                yield name, json.load(f)
            except json.JSONDecodeError:
                log(f"  JSON illisible ignoré : {name}")


# ---------- députés & groupes ----------
def parse_acteurs(z, leg):
    organes = {}
    for _, data in iter_json(z, "/organe/"):
        o = data.get("organe") or {}
        uid = txt(o.get("uid"))
        if uid:
            organes[uid] = o

    groupes = {}
    for uid, o in organes.items():
        if o.get("codeType") != "GP":
            continue
        fin = (o.get("viMoDe") or {}).get("dateFin")
        groupes[uid] = {
            "id": uid,
            "nom": o.get("libelle") or o.get("libelleEdition") or uid,
            "sigle": o.get("libelleAbrev") or o.get("libelleAbrege") or "",
            "couleur": o.get("couleurAssociee") or "",
            "actif": not fin,
        }

    deputes = {}
    for _, data in iter_json(z, "/acteur/"):
        a = data.get("acteur") or {}
        uid = txt(a.get("uid"))
        if not uid:
            continue
        ident = (a.get("etatCivil") or {}).get("ident") or {}
        mandats = as_list((a.get("mandats") or {}).get("mandat"))
        an = None
        gp = None
        for m in mandats:
            actif = not m.get("dateFin")
            org = as_list((m.get("organes") or {}).get("organeRef"))
            if m.get("typeOrgane") == "ASSEMBLEE" and (an is None or actif):
                an = m
            if m.get("typeOrgane") == "GP" and actif and org:
                gp = txt(org[0])
        lieu = ((an or {}).get("election") or {}).get("lieu") or {}
        deputes[uid] = {
            "id": uid,
            "civ": ident.get("civ") or "",
            "prenom": ident.get("prenom") or "",
            "nom": ident.get("nom") or "",
            "groupe": gp or "",
            "dep": lieu.get("departement") or "",
            "numDep": str(lieu.get("numDepartement") or ""),
            "circo": str(lieu.get("numCirco") or ""),
            "profession": txt(((a.get("profession") or {}).get("libelleCourant"))),
        }
    return deputes, groupes


# ---------- dossiers législatifs ----------
def walk_actes(actes, out):
    for a in as_list(actes):
        out.append(a)
        walk_actes((a.get("actesLegislatifs") or {}).get("acteLegislatif"), out)


def parse_dossiers(z, leg):
    dossiers = {}
    vote_to_dossier = {}
    for _, data in iter_json(z, "dossierParlementaire"):
        d = data.get("dossierParlementaire") or {}
        uid = txt(d.get("uid"))
        if not uid:
            continue
        titre_obj = d.get("titreDossier") or {}
        titre = titre_obj.get("titre") or ""
        top = as_list((d.get("actesLegislatifs") or {}).get("acteLegislatif"))
        etapes = []
        all_dates = []
        promulgue = False
        for t in top:
            sub = []
            walk_actes([t], sub)
            dates = sorted(x for x in (d10(s.get("dateActe")) for s in sub) if x and x <= TODAY)
            all_dates += dates
            code = t.get("codeActe") or ""
            if code.startswith("PROM") or any((s.get("codeActe") or "").startswith("PROM") for s in sub):
                promulgue = True
            for s in sub:
                for v in as_list((s.get("voteRefs") or {}).get("voteRef")):
                    vote_to_dossier[txt(v)] = uid
            lib = (t.get("libelleActe") or {})
            etapes.append({
                "code": code,
                "lib": lib.get("nomCanonique") or lib.get("libelleCourt") or code,
                "debut": dates[0] if dates else "",
                "fin": dates[-1] if dates else "",
            })
        proc = d.get("procedureParlementaire") or {}
        dossiers[uid] = {
            "id": uid,
            "titre": titre,
            "chemin": titre_obj.get("titreChemin") or "",
            "procedure": proc.get("libelle") or "",
            "etapes": etapes,
            "promulgue": promulgue,
            "maj": max(all_dates) if all_dates else "",
            "debut": min(all_dates) if all_dates else "",
            "themes": themes_for(titre),
            "scrutins": [],
        }
    return dossiers, vote_to_dossier


# ---------- scrutins ----------
POSITIONS = {"pour": "pour", "contre": "contre", "abstentions": "abst", "nonVotants": "nv"}


def kind_of(titre, type_lib):
    t = (titre or "").lower()
    if "motion de censure" in t or "motion de censure" in (type_lib or "").lower():
        return "censure"
    if t.startswith("l'ensemble") or t.startswith("l’ensemble"):
        return "ensemble"
    if "amendement" in t or "sous-amendement" in t:
        return "amendement"
    if t.startswith("l'article") or t.startswith("l’article"):
        return "article"
    if "motion" in t:
        return "motion"
    return "autre"


def parse_scrutins(z, leg, vote_to_dossier):
    index, details = [], {}
    for _, data in iter_json(z):
        s = data.get("scrutin")
        if not s:
            continue
        uid = txt(s.get("uid"))
        synth = s.get("syntheseVote") or {}
        dec = synth.get("decompte") or {}
        tv = s.get("typeVote") or {}
        titre = s.get("titre") or (s.get("objet") or {}).get("libelle") or ""
        sort = ((s.get("sort") or {}).get("code") or "").lower()
        groupes = []
        orga = ((s.get("ventilationVotes") or {}).get("organe")) or {}
        for g in as_list((orga.get("groupes") or {}).get("groupe")):
            v = g.get("vote") or {}
            dv = v.get("decompteVoix") or {}
            nomi = v.get("decompteNominatif") or {}
            noms = {}
            for raw, short in POSITIONS.items():
                bloc = nomi.get(raw) or {}
                ids = [txt(x.get("acteurRef")) for x in as_list(bloc.get("votant")) if isinstance(x, dict)]
                if ids:
                    noms[short] = ids
            groupes.append({
                "g": txt(g.get("organeRef")),
                "m": to_int(g.get("nombreMembresGroupe")),
                "maj": v.get("positionMajoritaire") or "",
                "pour": to_int(dv.get("pour")),
                "contre": to_int(dv.get("contre")),
                "abst": to_int(dv.get("abstentions")),
                "nv": to_int(dv.get("nonVotants")),
                "noms": noms,
            })
        num = to_int(s.get("numero"))
        item = {
            "id": uid,
            "n": num,
            "date": d10(s.get("dateScrutin")),
            "titre": titre,
            "sort": "adopte" if sort.startswith("adopt") else ("rejete" if sort.startswith("rejet") else sort),
            "type": tv.get("libelleTypeVote") or "",
            "k": kind_of(titre, tv.get("libelleTypeVote")),
            "pour": to_int(dec.get("pour")),
            "contre": to_int(dec.get("contre")),
            "abst": to_int(dec.get("abstentions")),
            "votants": to_int(synth.get("nombreVotants")),
            "exprimes": to_int(synth.get("suffragesExprimes")),
            "requis": to_int(synth.get("nbrSuffragesRequis")),
            "dossier": vote_to_dossier.get(uid, ""),
            "themes": themes_for(titre),
        }
        index.append(item)
        details[uid] = dict(item, demandeur=txt((s.get("demandeur") or {}).get("texte")), groupes=groupes)
    index.sort(key=lambda x: (x["date"], x["n"]), reverse=True)
    return index, details


# ---------- assemblage ----------
def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))


def build(out, leg=None, local=None):
    leg = 17 if (local and not leg) else detect_legislature(leg)
    log(f"Législature : {leg}")

    log("Députés et groupes…")
    deputes, groupes = parse_acteurs(open_zip("acteurs", leg, local), leg)
    log(f"  {len(deputes)} députés, {len(groupes)} groupes")

    log("Dossiers législatifs…")
    dossiers, vote_to_dossier = parse_dossiers(open_zip("dossiers", leg, local), leg)
    log(f"  {len(dossiers)} dossiers")

    log("Scrutins…")
    index, details = parse_scrutins(open_zip("scrutins", leg, local), leg, vote_to_dossier)
    log(f"  {len(index)} scrutins")

    # rattachement par titre pour les scrutins sans lien officiel
    # (ex. « l'amendement n° 12 … du projet de loi de finances pour 2027 (première lecture) »)
    def key(s):
        s = norm(s).replace("’", "'")
        s = re.sub(r"\s*\((premiere|deuxieme|nouvelle|troisieme)[^)]*\)\s*", " ", s)
        return re.sub(r"[\s.]+$", "", re.sub(r"\s+", " ", s)).strip()

    by_title = defaultdict(list)
    for d in dossiers.values():
        by_title[key(d["titre"])].append(d["id"])
    rx = re.compile(r"((?:projet|proposition) de (?:loi|resolution)[^()]*)")
    for it in index:
        if it["dossier"]:
            continue
        m = rx.search(key(it["titre"]))
        if m:
            ids = by_title.get(m.group(1).strip(), [])
            if len(ids) == 1:
                it["dossier"] = ids[0]
                details[it["id"]]["dossier"] = ids[0]

    # liens dossier -> scrutins
    for it in index:
        if it["dossier"] in dossiers:
            dossiers[it["dossier"]]["scrutins"].append(it["id"])

    # historique par député
    histo = defaultdict(list)
    for it in index:  # du plus récent au plus ancien
        for g in details[it["id"]]["groupes"]:
            for pos, ids in g["noms"].items():
                for pid in ids:
                    if len(histo[pid]) < RECENT_VOTES_PER_DEPUTE:
                        histo[pid].append({"s": it["id"], "p": pos})

    tmp = out + ".tmp"
    shutil.rmtree(tmp, ignore_errors=True)
    os.makedirs(tmp)

    for uid, d in details.items():
        write_json(os.path.join(tmp, "scrutins", uid + ".json"), d)
    write_json(os.path.join(tmp, "scrutins.json"), index)

    dos_list = sorted(dossiers.values(), key=lambda d: d["maj"], reverse=True)
    write_json(os.path.join(tmp, "dossiers.json"), dos_list)

    dep_list = sorted(deputes.values(), key=lambda d: norm(d["nom"] + " " + d["prenom"]))
    write_json(os.path.join(tmp, "deputes.json"), dep_list)
    for uid, d in deputes.items():
        write_json(os.path.join(tmp, "deputes", uid + ".json"), dict(d, votes=histo.get(uid, [])))

    # nombre de sièges par groupe (députés en exercice)
    sieges = defaultdict(int)
    for d in deputes.values():
        sieges[d["groupe"]] += 1
    for gid, g in groupes.items():
        g["sieges"] = sieges.get(gid, 0)
    write_json(os.path.join(tmp, "groupes.json"), groupes)

    write_json(os.path.join(tmp, "meta.json"), {
        "legislature": leg,
        "maj": datetime.now(timezone.utc).isoformat(timespec="minutes"),
        "source": "data.assemblee-nationale.fr",
        "nb": {"scrutins": len(index), "dossiers": len(dossiers), "deputes": len(deputes)},
    })

    shutil.rmtree(out, ignore_errors=True)
    os.replace(tmp, out)
    log(f"OK → {out}")


def make_icons(icons_dir):
    """Dessine les icônes PNG de l'appli (pur Python, sans dépendance)."""
    import struct
    import zlib

    os.makedirs(icons_dir, exist_ok=True)
    bg, fg, mid = (27, 28, 30), (246, 244, 239), (150, 149, 146)
    for size in (192, 512):
        path = os.path.join(icons_dir, f"icon-{size}.png")
        if os.path.exists(path):
            continue
        k = size / 512
        cx, cy, w = 256 * k, 340 * k, 17 * k
        rings = ((160 * k, fg), (88 * k, mid))
        rows = []
        for y in range(size):
            row = bytearray(b"\x00")
            for x in range(size):
                c = bg
                dx, dy = x + 0.5 - cx, y + 0.5 - cy
                r = (dx * dx + dy * dy) ** 0.5
                for rr, col in rings:
                    if dy <= 0 and abs(r - rr) <= w:
                        c = col
                    for ex in (cx - rr, cx + rr):
                        if (x + 0.5 - ex) ** 2 + dy * dy <= w * w:
                            c = col
                if r <= 26 * k:
                    c = fg
                row += bytes(c)
            rows.append(bytes(row))

        def chunk(t, d):
            return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

        png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
        png += chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b"")
        with open(path, "wb") as f:
            f.write(png)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--out", default="app/data")
    p.add_argument("--legislature", type=int)
    p.add_argument("--local", help="dossier contenant les zips (pour tester sans réseau)")
    a = p.parse_args()
    make_icons(os.path.join(os.path.dirname(os.path.abspath(a.out)), "icons"))
    build(a.out, a.legislature, a.local)
