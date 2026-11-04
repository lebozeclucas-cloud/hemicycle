#!/usr/bin/env python3
"""
Génère de FAUSSES données au format brut de l'Assemblée (mêmes structures JSON
que l'open data officiel) pour tester l'appli sans réseau.
Tous les noms sont fictifs.

    python scripts/make_sample.py sample_zips
    python scripts/build_data.py --local sample_zips --out app/data
"""
import json
import os
import random
import sys
import zipfile

random.seed(7)
out = sys.argv[1] if len(sys.argv) > 1 else "sample_zips"
os.makedirs(out, exist_ok=True)

GROUPES = [
    ("PO900001", "Groupe Alpha", "ALP", "#6B7A8F", 18),
    ("PO900002", "Groupe Bêta", "BET", "#C9A227", 14),
    ("PO900003", "Groupe Gamma", "GAM", "#4F8A8B", 12),
    ("PO900004", "Groupe Delta", "DEL", "#A5668B", 9),
    ("PO900005", "Non inscrits", "NI", "#9AA0A6", 3),
]
PRENOMS = ["Camille", "Lou", "Sacha", "Alex", "Noé", "Jules", "Maël", "Inès", "Léa", "Yanis", "Romane", "Tom"]
NOMS = ["Exemple", "Démo", "Fictif", "Test", "Modèle", "Essai", "Témoin", "Placeholder"]
DEPS = [("Finistère", "29"), ("Côtes-d'Armor", "22"), ("Ille-et-Vilaine", "35"), ("Morbihan", "56"), ("Paris", "75"), ("Rhône", "69")]

acteurs, organes = [], []
for gid, nom, sigle, coul, n in GROUPES:
    organes.append({"organe": {"uid": gid, "codeType": "GP", "libelle": nom, "libelleAbrev": sigle,
                               "couleurAssociee": coul, "viMoDe": {"dateDebut": "2024-07-18", "dateFin": None}, "legislature": "17"}})
    for i in range(n):
        pid = f"PA9{len(acteurs):05d}"
        dep, num = random.choice(DEPS)
        acteurs.append((pid, gid))
        a = {"acteur": {"uid": {"#text": pid}, "etatCivil": {"ident": {"civ": random.choice(["M.", "Mme"]),
             "prenom": random.choice(PRENOMS), "nom": f"{random.choice(NOMS)} {len(acteurs)}"}},
             "profession": {"libelleCourant": random.choice(["Enseignant", "Agricultrice", "Avocat", "Cadre", "Infirmière"])},
             "mandats": {"mandat": [
                 {"typeOrgane": "ASSEMBLEE", "dateFin": None, "organes": {"organeRef": "PO838901"},
                  "election": {"lieu": {"departement": dep, "numDepartement": num, "numCirco": str(random.randint(1, 8))}}},
                 {"typeOrgane": "GP", "dateFin": None, "organes": {"organeRef": gid}}]}}}
        organes.append(a)

with zipfile.ZipFile(os.path.join(out, "AMO10_deputes_actifs_mandats_actifs_organes.json.zip"), "w") as z:
    for o in organes:
        if "organe" in o:
            z.writestr(f"json/organe/{o['organe']['uid']}.json", json.dumps(o))
        else:
            z.writestr(f"json/acteur/{o['acteur']['uid']['#text']}.json", json.dumps(o))

TEXTES = [
    ("projet de loi de finances pour 2027", "Projet de loi de finances de l'année", True),
    ("proposition de loi visant à améliorer l'accès aux soins dans les territoires ruraux", "Proposition de loi ordinaire", False),
    ("projet de loi relatif à l'énergie et au climat", "Projet de loi ordinaire", False),
    ("proposition de loi relative au logement étudiant", "Proposition de loi ordinaire", True),
    ("projet de loi portant diverses dispositions d'adaptation au droit de l'Union européenne", "Projet de loi ordinaire", True),
    ("proposition de loi visant à encadrer l'usage de l'intelligence artificielle dans l'emploi", "Proposition de loi ordinaire", False),
    ("projet de loi d'orientation agricole", "Projet de loi ordinaire", False),
    ("proposition de loi relative à la sécurité dans les transports", "Proposition de loi ordinaire", False),
]
NAV = [("AN1", "1ère lecture (1ère assemblée saisie)"), ("SN1", "1ère lecture (2ème assemblée saisie)"),
       ("CMP", "Commission mixte paritaire"), ("ANLDEF", "Lecture définitive"), ("PROM", "Promulgation de la loi")]

scrutins, dossiers = [], []
num = 1400
for i, (titre, proc, fini) in enumerate(TEXTES):
    did = f"DLR5L17N9{i:04d}"
    nb_etapes = 5 if fini else random.randint(1, 3)
    actes = []
    month = 3 + i % 6
    votes_ids = []
    for k, (code, lib) in enumerate(NAV[:nb_etapes]):
        date = f"2026-{min(month + k, 10):02d}-{random.randint(1, 27):02d}T00:00:00.000+02:00"
        sub = []
        if code.startswith("AN"):
            for j in range(random.randint(2, 4)):
                num += 1
                vid = f"VTANR5L17V{num}"
                votes_ids.append((vid, date, j == 0, titre))
            sub.append({"codeActe": code + "-DEBATS-DEC", "dateActe": date, "voteRefs": {"voteRef": [v[0] for v in votes_ids[-3:]]}})
        actes.append({"codeActe": code, "libelleActe": {"nomCanonique": lib}, "dateActe": date,
                      "actesLegislatifs": {"acteLegislatif": sub} if sub else None})
    dossiers.append({"dossierParlementaire": {"uid": did, "legislature": "17",
                     "titreDossier": {"titre": titre[0].upper() + titre[1:], "titreChemin": f"exemple_{i}"},
                     "procedureParlementaire": {"libelle": proc},
                     "actesLegislatifs": {"acteLegislatif": actes}}})
    for vid, date, ensemble, t in votes_ids:
        objet = f"l'ensemble du {t}" if ensemble else f"l'amendement n° {random.randint(10, 900)} de M. Exemple à l'article {random.randint(1, 20)} du {t}"
        scrutins.append((vid, int(vid.split('V')[-1]), date, objet))

for x in range(6):
    num += 1
    scrutins.append((f"VTANR5L17V{num}", num, f"2026-10-{20 + x:02d}T00:00:00.000+02:00",
                     f"l'amendement n° {random.randint(10, 900)} de Mme Démo après l'article {x + 2} du projet de loi de finances pour 2027"))

with zipfile.ZipFile(os.path.join(out, "Scrutins.json.zip"), "w") as z:
    for vid, n, date, objet in scrutins:
        lean = {g[0]: random.choice(["pour", "contre", "abstention"]) for g in GROUPES}
        groupes, tot = [], {"pour": 0, "contre": 0, "abstentions": 0}
        for gid, _, _, _, size in GROUPES:
            members = [p for p, g in acteurs if g == gid]
            nomi = {"pour": [], "contre": [], "abstentions": [], "nonVotants": []}
            for p in members:
                r = random.random()
                if r < 0.25:
                    continue
                pos = lean[gid] if r < 0.9 else random.choice(["pour", "contre", "abstention"])
                key = "abstentions" if pos == "abstention" else pos
                nomi[key].append({"acteurRef": p, "mandatRef": "PM0", "parDelegation": "false"})
            dv = {k: str(len(v)) for k, v in nomi.items()}
            for k in tot:
                tot[k] += len(nomi[k])
            groupes.append({"organeRef": gid, "nombreMembresGroupe": str(size),
                            "vote": {"positionMajoritaire": lean[gid], "decompteVoix": dv,
                                     "decompteNominatif": {k: ({"votant": v if len(v) != 1 else v[0]} if v else None) for k, v in nomi.items()}}})
        exp = tot["pour"] + tot["contre"]
        adopte = tot["pour"] > tot["contre"]
        s = {"scrutin": {"uid": vid, "numero": str(n), "legislature": "17", "dateScrutin": date[:10],
             "typeVote": {"codeTypeVote": "SPO", "libelleTypeVote": "scrutin public ordinaire"},
             "sort": {"code": "adopté" if adopte else "rejeté"}, "titre": objet,
             "demandeur": {"texte": "Président du groupe « Groupe Alpha »"},
             "syntheseVote": {"nombreVotants": str(exp + tot["abstentions"]), "suffragesExprimes": str(exp),
                              "nbrSuffragesRequis": str(exp // 2 + 1),
                              "decompte": {"pour": str(tot["pour"]), "contre": str(tot["contre"]), "abstentions": str(tot["abstentions"]), "nonVotants": "0"}},
             "ventilationVotes": {"organe": {"organeRef": "PO838901", "groupes": {"groupe": groupes}}}}}
        z.writestr(f"json/{vid}.json", json.dumps(s, ensure_ascii=False))

with zipfile.ZipFile(os.path.join(out, "Dossiers_Legislatifs.json.zip"), "w") as z:
    for d in dossiers:
        z.writestr(f"json/dossierParlementaire/{d['dossierParlementaire']['uid']}.json", json.dumps(d, ensure_ascii=False))

print(f"Données fictives écrites dans {out}/")
