#!/usr/bin/env python3
"""Génère les images stub du pipeline d'assets ATG (voir docs/ASSET_PIPELINE.md).

COUVERTURE COMPLÈTE du catalogue v0 (DESIGN_GUIDE §5.1/§8/§10, GAMEBOOK §25) :
bâtiments (tous, 3 niveaux, adaptations climat), vaisseaux (9 coques + personnel
+ sonde, upgrades PAR COQUE selon les règles de slots), unités sol, portraits
(matrice complète peuples × rôles — n'importe quelle race, n'importe quel rôle),
cartes (bâtiments + PNJ + objets), ressources (liste maîtresse), planètes
(4 climats × 3 tailles + météo partout), étoiles.

Chaque asset :  {name}.png  +  {name}.bump.png  +  {name}.light.png
Sorties annexes : manifest.json + gallery.html (galerie auto-générée).

Relancer :  python3 docs/design/props/generate_stubs.py
Les vrais assets remplacent les stubs AU MÊME CHEMIN, même nom.
"""
import json, os
from PIL import Image, ImageDraw

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
ROOT = os.path.join(REPO, "assets", "game")

BG = (17, 26, 48, 255); BORDER = (36, 49, 79, 255); HATCH = (42, 27, 82, 120)
TXT = (242, 244, 250, 255); ACCENT = (217, 207, 74, 255); STUB = (169, 180, 206, 255)
manifest = []

def _label_block(lines, colors, scale=1):
    tmp = Image.new("RGBA", (420, 14 * len(lines) + 4), (0, 0, 0, 0))
    d = ImageDraw.Draw(tmp); wmax = 0
    for i, s in enumerate(lines):
        d.text((2, 2 + i * 12), s, fill=colors[i]); wmax = max(wmax, int(d.textlength(s)) + 4)
    tmp = tmp.crop((0, 0, wmax, tmp.height))
    if scale > 1:
        tmp = tmp.resize((tmp.width * scale, tmp.height * scale), Image.NEAREST)
    return tmp

def _to_gif_frames(frames):
    """RGBA -> frames P avec transparence binaire (alpha<128 = transparent)."""
    out = []
    for fr in frames:
        alpha = fr.getchannel("A")
        p = fr.convert("RGB").convert("P", palette=Image.ADAPTIVE, colors=255)
        mask = alpha.point(lambda a: 255 if a < 128 else 0)
        p.paste(255, mask=mask)
        p.info["transparency"] = 255
        out.append(p)
    return out

def _save(relpath, frames):
    """PNG statique pour les cartes, GIF animé (2 frames) pour tout le reste."""
    p = os.path.join(ROOT, relpath)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    if relpath.startswith("cards/"):
        frames[0].save(p, optimize=True)
        return relpath
    gp = os.path.splitext(p)[0] + ".gif"
    fr = _to_gif_frames(frames)
    fr[0].save(gp, save_all=True, append_images=fr[1:], duration=600, loop=0,
               disposal=2, transparency=255, optimize=False)
    return os.path.relpath(gp, ROOT)

def _frame_stub(w, h, label, desc, overlay, blink):
    if overlay:
        im = Image.new("RGBA", (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
        col = (217, 207, 74, 220 if blink else 140)
        d.rectangle([1, 1, w - 2, h - 2], outline=col, width=1)
        for x in range(-h, w, max(24, w // 8)):
            d.line([(x, h), (x + h, 0)], fill=(74, 45, 140, 60), width=1)
        im.alpha_composite(_label_block([f"[OV] {label}"], [ACCENT], scale=max(1, w // 512 + 1)), (4, 4))
    else:
        im = Image.new("RGBA", (w, h), BG); d = ImageDraw.Draw(im)
        for x in range(-h, w, max(24, w // 12)):
            d.line([(x, h), (x + h, 0)], fill=HATCH, width=1)
        d.rectangle([0, 0, w - 1, h - 1], outline=BORDER, width=max(1, w // 256))
        lines = [f"[STUB] {label}", f"{w}x{h}"] + ([desc[:44]] if w >= 160 else [])
        cols = [ACCENT if not blink else (242, 236, 155, 255), TXT, STUB][:len(lines)]
        block = _label_block(lines, cols, scale=max(1, w // 512))
        im.alpha_composite(block, ((w - block.width) // 2, (h - block.height) // 2))
    return im

def stub(relpath, w, h, label, desc, overlay=False):
    saved = _save(relpath, [_frame_stub(w, h, label, desc, overlay, b) for b in (False, True)])
    manifest.append({"file": f"assets/game/{saved}", "size": f"{w}x{h}", "label": label,
                     "overlay": overlay, "animated": not relpath.startswith("cards/"),
                     "expected_art": desc})

def _frame_bump(w, h, phase):
    im = Image.new("RGBA", (w, h), (128, 128, 128, 255)); d = ImageDraw.Draw(im)
    g = 168 if not phase else 176
    d.ellipse([w * .25, h * .25, w * .75, h * .75], fill=(g, g, g, 255))
    d.rectangle([0, 0, w - 1, h - 1], outline=(96, 96, 96, 255))
    return im

def bump(relpath, w, h):
    _save(relpath, [_frame_bump(w, h, b) for b in (False, True)])

def _frame_light(w, h, phase):
    # GIF: transparence binaire -> intensité portée par la LUMINOSITÉ du pixel
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    for i in range(3):
        cx = int(w * (0.3 + 0.2 * i)); cy = int(h * (0.4 + 0.15 * (i % 2)))
        r = max(2, w // 64)
        v = 255 if (i + int(phase)) % 2 == 0 else 190
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(v, v, v, 255))
    return im

def light(relpath, w, h):
    _save(relpath, [_frame_light(w, h, b) for b in (False, True)])

def full(relpath, w, h, label, desc):
    stub(relpath, w, h, label, desc, overlay=(".ov." in relpath))
    base, _ = os.path.splitext(relpath)
    bump(base + ".bump.png", w, h); light(base + ".light.png", w, h)

# ================= PLANÈTES : 4 climats × 3 tailles + météo PARTOUT =================
PSIZE = {"s": 128, "m": 256, "l": 512}
CLIMATES = ["hot", "cold", "temperate", "poison"]
CONDITIONS = ["smog", "ice", "burn", "poison", "radio"]
for climate in CLIMATES:
    for size, px in PSIZE.items():
        full(f"planets/planet_{climate}_{size}.png", px, px,
             f"PLANET {climate} {size.upper()}", f"pixel-sprite {climate} planet")
        for cond in CONDITIONS:
            full(f"planets/planet_{climate}_{size}.ov.{cond}.png", px, px,
                 f"{cond} {size.upper()}", f"transparent weather overlay: {cond} only")

# ================= ÉTOILES (2048) =================
for key, desc in [("cold", "cold star, blue-white"), ("hot", "hot star, orange-violet"),
                  ("gas", "gas giant star")]:
    full(f"stars/star_{key}.png", 2048, 2048, f"STAR {key}", f"{desc}, emissive")
full("stars/blackhole.png", 2048, 2048, "BLACK HOLE", "black hole, accretion ring, junk sink")

# ================= BÂTIMENTS : catalogue complet, 3 niveaux, climat hot/cold =================
BUILDINGS = {  # key: description de l'art attendu
    "telescope": "telescope mast array", "probe_pad": "probe launch pad",
    "depot": "storage depot, stacked containers", "mine": "basic mine, ore carts",
    "farm": "hydroponic farm domes", "waterworks": "water synthesis plant",
    "smelter": "steel smelter, glowing furnace", "crystal_extractor": "crystal extractor rig",
    "refinery": "crystal refinery, fuel cells scattered", "fuelcell_plant": "industrial fuel-cell plant",
    "spaceport": "spaceport landing pads (dock size grows w/ level)",
    "workshop": "repair workshop, sparks and cranes", "market": "market hall with stalls",
    "residential": "residential habitat blocks", "lab": "medical/science lab",
    "obs_station": "ground OBS targeting dome", "shipyard": "shipyard gantry (hull size grows w/ level)",
    "military_district": "military district, barracks and banners",
    "weapon_foundry": "weapon foundry, beam-laser parts", "research_center": "research center, antennae",
    "diplomatic_district": "diplomatic district, embassy hall",
    "casino": "wager-house casino, neon and gold", "commerce_district": "business and commerce district",
    "faction_hq": "faction HQ, giant banner mast", "stargate_yard": "stargate assembly yard",
    "terraformer": "terraforming facility, atmosphere processors",
    "artificial_planet_yard": "artificial-planet construction yard (endgame)",
    "warehouse": "vehicle+item warehouse, big doors, parked tanks and crates",
}
for key, desc in BUILDINGS.items():
    for lvl in [1, 2, 3]:
        full(f"buildings/building_{key}_l{lvl}.png", 512, 256,
             f"BLDG {key} L{lvl}", f"{desc} (level {lvl})")
        for clim in ["hot", "cold"]:
            full(f"buildings/building_{key}_l{lvl}.ov.{clim}.png", 512, 256,
                 f"{key} L{lvl} {clim}", f"transparent {clim}-climate adaptation only")

# ================= VAISSEAUX : coques + upgrades PAR COQUE selon slots =================
# Slots (DESIGN_GUIDE §8.1) : E/A/F/OBS/W/Acc/C — armes=Combat only, cargo=Cargo only.
HULLS = {
    ("combat", "s"): dict(obs=False, weapons=True,  cargo=False, desc="bee — small fighter"),
    ("combat", "m"): dict(obs=True,  weapons=True,  cargo=False, desc="bird — medium fighter"),
    ("combat", "l"): dict(obs=True,  weapons=True,  cargo=False, desc="star crusader"),
    ("cargo",  "s"): dict(obs=False, weapons=False, cargo=True,  desc="small freighter"),
    ("cargo",  "m"): dict(obs=False, weapons=False, cargo=True,  desc="medium freighter"),
    ("cargo",  "l"): dict(obs=False, weapons=False, cargo=True,  desc="large freighter"),
    ("civil",  "s"): dict(obs=False, weapons=False, cargo=False, desc="small civil transport"),
    ("civil",  "m"): dict(obs=False, weapons=False, cargo=False, desc="medium civil/settler transport"),
    ("civil",  "l"): dict(obs=False, weapons=False, cargo=False, desc="large civil/colony transport"),
}
ACCESSORIES = [("harvest", "star-harvest rig"), ("junk_collector", "junk collector rig"),
               ("claim_rig", "salvage claim rig"), ("scanner", "survey scanner"),
               ("shield_hot", "hot-climate shield"), ("shield_cold", "cold-climate shield"),
               ("shield_radio", "radiation shield")]
for (cat, size), cfg in HULLS.items():
    base = f"ships/ship_{cat}_{size}"
    full(f"{base}.png", 512, 256, f"SHIP {cat} {size.upper()}", f"{cfg['desc']}, bare hull")
    ovs = [("engine_1", "engine L1 glow"), ("engine_2", "engine L2 glow"),
           ("armor_1", "armor plates L1"), ("armor_2", "armor plates L2"),
           ("fuel_1", "external tank L1"), ("fuel_2", "external tank L2")]
    if cfg["obs"]:
        ovs += [("obs_1", "OBS dish L1"), ("obs_2", "OBS dish L2")]
    if cfg["weapons"]:
        ovs += [("weapon_a2a_1", "air-to-air weapon L1"), ("weapon_a2a_2", "air-to-air weapon L2"),
                ("weapon_a2g_1", "air-to-ground weapon L1"), ("weapon_a2g_2", "air-to-ground weapon L2")]
    if cfg["cargo"]:
        ovs += [("cargo_1", "extra containers L1"), ("cargo_2", "extra containers L2")]
    ovs += ACCESSORIES
    if cat == "civil" and size in ("m", "l"):
        ovs += [("colony_fitting", "colony fitting: terraform core mounts")]
    for ov, d in ovs:
        full(f"{base}.ov.{ov}.png", 512, 256, f"{cat[:3]}{size.upper()} {ov}",
             f"transparent overlay: {d} only, fits {cat}_{size}")
# vaisseau personnel (invulnérable) + sonde (voile solaire)
full("ships/ship_personal.png", 512, 256, "PERSONAL SHIP", "the Sovereign's vessel, unique, no upgrades")
full("ships/ship_probe.png", 512, 256, "PROBE", "crewless solar-sail probe, integrated scanner")

# ================= UNITÉS SOL (256², catalogue Silviu ~10, niveaux) =================
UNITS = {
    "turret_light": ("light turret", 2), "turret_heavy": ("heavy turret", 2),
    "cannon": ("long-range cannon", 2), "tank_ground": ("ground-attack tank", 3),
    "tank_antiair": ("anti-air tank", 3), "tank_combined": ("combined ground+air tank", 3),
}
for key, (desc, levels) in UNITS.items():
    for lvl in range(1, levels + 1):
        full(f"units/unit_{key}_l{lvl}.png", 512, 256, f"UNIT {key} L{lvl}",
             f"{desc} (level {lvl}), placed like a building, isometric")

# ================= PORTRAITS : matrice complète peuples × rôles =================
# RÈGLE : n'importe quel peuple peut tenir N'IMPORTE QUEL rôle (gouverneur compris).
PEOPLES = {"human": "human", "forged": "robot (the Forged)", "vess": "rich alien (the Vess)"}
ROLES = {"pilot": "pilot", "engineer": "engineer", "merchant": "merchant",
         "diplomat": "diplomat", "soldier": "soldier", "scientist": "scientist"}
for p_key, p_desc in PEOPLES.items():
    for r_key, r_desc in ROLES.items():
        full(f"portraits/portrait_{p_key}_{r_key}_01.png", 512, 1024,
             f"{p_key} {r_key}", f"{p_desc} {r_desc}; any people can hold any role")

# ================= CARTES : art 512² pour chaque bâtiment, rôle PNJ, objet =================
for key in BUILDINGS:
    full(f"cards/card_building_{key}.png", 512, 512, f"CARD {key}", f"{BUILDINGS[key]} card art")
for r_key in ROLES:
    full(f"cards/card_npc_{r_key}.png", 512, 512, f"CARD npc {r_key}", f"{ROLES[r_key]} NPC card art")
ITEMS = {"beamlaser": "beam laser derived item", "harvest_rig": "star-harvest rig item",
         "junk_collector": "junk collector item", "claim_rig": "salvage claim rig item",
         "scanner": "survey scanner item", "terraform_core": "terraform core item",
         "shield_hot": "hot shield item", "shield_cold": "cold shield item",
         "shield_radio": "radiation shield item"}
for key, desc in ITEMS.items():
    full(f"cards/card_item_{key}.png", 512, 512, f"CARD item {key}", desc)

# ================= RESSOURCES : liste maîtresse complète (256²) =================
RESOURCES = {
    # 12 basiques
    "ore": "ore chunk", "carbon": "carbon lump", "hydrogen": "hydrogen vial",
    "oxygen": "oxygen canister", "lithium": "lithium shards", "sulfur": "sulfur pile",
    "gold": "gold nuggets", "uranium": "uranium rods", "deuterium": "deuterium flask",
    "aluminium": "aluminium ingots", "phosphor": "phosphor grains", "silicon": "silicon wafer",
    # cristaux par climat
    "crystal_hot": "Ignis violet-red crystal", "crystal_cold": "Glace blue-white crystal",
    "crystal_temperate": "Virid green-blue crystal", "crystal_nox": "Nox black crystal",
    # raffinés
    "steel_l": "light steel beams", "steel_h": "heavy steel plates",
    "water": "water barrel", "heavy_water": "heavy water flask",
    "food_1": "food crate type 1", "food_2": "food crate type 2", "food_3": "food crate type 3",
    "med_1": "medicine type 1", "med_2": "medicine type 2", "med_3": "medicine type 3",
    # énergie
    "fuel_cells": "glowing yellow fuel cell",
    "fuel_cold": "cold propulsion fuel", "fuel_hot": "hot propulsion fuel", "fuel_gas": "gas propulsion fuel",
}
for key, desc in RESOURCES.items():
    full(f"resources/res_{key}.png", 256, 256, f"RES {key}", desc)

# ================= manifest + galerie auto-générée =================
with open(os.path.join(REPO, "docs", "design", "props", "manifest.json"), "w") as f:
    json.dump(manifest, f, indent=1)

groups = {}
for m in manifest:
    groups.setdefault(m["file"].split("/")[2], []).append(m)
html = ["<!doctype html><html><head><meta charset='utf-8'><title>ATG — Full asset gallery</title>",
        "<style>body{background:#060810;color:#F2F4FA;font:13px Inter,sans-serif;padding:24px;min-width:1280px}",
        "h1{color:#D9CF4A;font-family:Orbitron,sans-serif}h2{color:#6E96E8;margin-top:40px;font-family:Orbitron,sans-serif}",
        ".g{display:flex;flex-wrap:wrap;gap:12px}figure{margin:0;background:#111A30;border:1px solid #24314F;",
        "border-radius:8px;padding:6px}figcaption{font-size:10px;color:#A9B4CE;max-width:260px}",
        "img{display:block;image-rendering:pixelated;background:#0D0D0D}</style></head><body>",
        "<h1>ATG — FULL ASSET GALLERY (auto-generated)</h1>",
        f"<p>{len(manifest)} assets ×3 files (base + bump + light). Swap any stub at the same path; ",
        "regenerate this page with generate_stubs.py. Preview capped at 256px — files are native size.</p>"]
for g in sorted(groups):
    html.append(f"<h2>{g} ({len(groups[g])})</h2><div class='g'>")
    for m in groups[g]:
        w, h = map(int, m["size"].split("x"))
        dw = min(w, 256); dh = int(h * dw / w)
        html.append(f"<figure><img loading='lazy' src='../../../{m['file']}' width='{dw}' height='{dh}'>"
                    f"<figcaption>{m['file'].split('/')[-1]}<br>{m['size']} — {m['expected_art']}</figcaption></figure>")
    html.append("</div>")
html.append("</body></html>")
with open(os.path.join(REPO, "docs", "design", "props", "gallery.html"), "w") as f:
    f.write("\n".join(html))

print(f"{len(manifest)} assets (x3 fichiers) générés sous assets/game/ ; gallery.html + manifest.json à jour")
