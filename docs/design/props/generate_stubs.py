#!/usr/bin/env python3
"""Génère les images stub du pipeline d'assets ATG (voir docs/ASSET_PIPELINE.md).

Chaque asset attendu par le jeu reçoit :
  - {name}.png        : placeholder aux dimensions finales, étiqueté
  - {name}.bump.png   : bump map neutre (gris) avec forme légère
  - {name}.light.png  : carte des sources lumineuses (transparent + points blancs)
Un manifest.json décrit ce que chaque fichier doit représenter.

Relancer :  python3 docs/design/props/generate_stubs.py
Les vrais assets remplacent les stubs AU MÊME CHEMIN, même nom.
"""
import json, os, math
from PIL import Image, ImageDraw

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
ROOT = os.path.join(REPO, "assets", "game")

BG = (17, 26, 48, 255)        # #111A30
BORDER = (36, 49, 79, 255)    # #24314F
HATCH = (42, 27, 82, 120)     # violet #2A1B52
TXT = (242, 244, 250, 255)    # #F2F4FA
ACCENT = (217, 207, 74, 255)  # #D9CF4A
STUB = (169, 180, 206, 255)   # #A9B4CE

manifest = []

def _text(d, xy, s, fill, big=False):
    # PIL default bitmap font, scaled by drawing multiple offsets for "bold"
    d.text(xy, s, fill=fill)
    if big:
        d.text((xy[0] + 1, xy[1]), s, fill=fill)

def _label_block(lines, colors, scale=1):
    """Rend les lignes de texte dans une petite image puis agrandit (lisible à toute taille)."""
    tmp = Image.new("RGBA", (400, 14 * len(lines) + 4), (0, 0, 0, 0))
    d = ImageDraw.Draw(tmp)
    wmax = 0
    for i, s in enumerate(lines):
        d.text((2, 2 + i * 12), s, fill=colors[i])
        wmax = max(wmax, int(d.textlength(s)) + 4)
    tmp = tmp.crop((0, 0, wmax, tmp.height))
    if scale > 1:
        tmp = tmp.resize((tmp.width * scale, tmp.height * scale), Image.NEAREST)
    return tmp

def stub(relpath, w, h, label, desc, overlay=False):
    """Placeholder principal ; overlay=True -> transparent, base visible dessous."""
    p = os.path.join(ROOT, relpath)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    if overlay:
        im = Image.new("RGBA", (w, h), (0, 0, 0, 0))          # transparent
        d = ImageDraw.Draw(im)
        d.rectangle([1, 1, w - 2, h - 2], outline=(217, 207, 74, 140), width=1)  # cadre pointillé simulé
        step = max(24, w // 8)
        for x in range(-h, w, step):                          # voile hachuré léger
            d.line([(x, h), (x + h, 0)], fill=(74, 45, 140, 60), width=1)
        tag = _label_block([f"[OV] {label}"], [ACCENT], scale=max(1, w // 512 + 1))
        im.alpha_composite(tag, (4, 4))                       # étiquette en coin, base lisible
    else:
        im = Image.new("RGBA", (w, h), BG)
        d = ImageDraw.Draw(im)
        step = max(24, w // 12)
        for x in range(-h, w, step):
            d.line([(x, h), (x + h, 0)], fill=HATCH, width=1)
        d.rectangle([0, 0, w - 1, h - 1], outline=BORDER, width=max(1, w // 256))
        lines = [f"[STUB] {label}", f"{w}x{h}"] + ([desc[:44]] if w >= 160 else [])
        colors = [ACCENT, TXT, STUB][:len(lines)]
        block = _label_block(lines, colors, scale=max(1, w // 512))
        im.alpha_composite(block, ((w - block.width) // 2, (h - block.height) // 2))
    im.save(p, optimize=True)
    manifest.append({"file": f"assets/game/{relpath}", "size": f"{w}x{h}", "label": label,
                     "overlay": overlay, "expected_art": desc})

def bump(relpath, w, h):
    p = os.path.join(ROOT, relpath)
    im = Image.new("RGBA", (w, h), (128, 128, 128, 255))   # gris neutre
    d = ImageDraw.Draw(im)
    d.ellipse([w * .25, h * .25, w * .75, h * .75], fill=(168, 168, 168, 255))  # relief léger testable
    d.rectangle([0, 0, w - 1, h - 1], outline=(96, 96, 96, 255))
    s = "[STUB] bump"
    d.text(((w - d.textlength(s)) // 2, h - 14), s, fill=(64, 64, 64, 255))
    im.save(p, optimize=True)

def light(relpath, w, h):
    p = os.path.join(ROOT, relpath)
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))           # transparent
    d = ImageDraw.Draw(im)
    for i in range(3):                                     # 3 sources émissives de test
        cx = int(w * (0.3 + 0.2 * i)); cy = int(h * (0.4 + 0.15 * (i % 2))); r = max(2, w // 64)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, 230 - 50 * i))
    im.save(p, optimize=True)

def full(relpath, w, h, label, desc):
    stub(relpath, w, h, label, desc, overlay=(".ov." in relpath))
    base, _ = os.path.splitext(relpath)
    bump(base + ".bump.png", w, h)
    light(base + ".light.png", w, h)

# ---------------- planets (128/256/512) + météo ----------------
PSIZE = {"s": 128, "m": 256, "l": 512}
for climate in ["hot", "cold", "temperate", "poison"]:
    for size, px in PSIZE.items():
        full(f"planets/planet_{climate}_{size}.png", px, px,
             f"PLANET {climate} {size.upper()}",
             f"pixel-sprite {climate} planet, groovy-dark palette")
for cond in ["smog", "ice", "burn", "poison", "radio"]:
    for size, px in PSIZE.items():
        full(f"planets/planet_temperate_{size}.ov.{cond}.png", px, px,
             f"OVERLAY {cond} {size.upper()}",
             f"transparent weather overlay: {cond} condition only")

# ---------------- stars & black hole (2048) ----------------
for key, desc in [("cold", "cold star, blue-white"), ("hot", "hot star, orange-violet"),
                  ("gas", "gas giant star"), ]:
    full(f"stars/star_{key}.png", 2048, 2048, f"STAR {key}", f"pixel-sprite {desc}, emissive")
full("stars/blackhole.png", 2048, 2048, "BLACK HOLE", "black hole with accretion ring, junk sink")

# ---------------- buildings (512x256, l1..l3, adaptations climat) ----------------
BUILDINGS = {
    "mine": "basic mine with ore carts", "refinery": "crystal refinery, fuel cells scattered",
    "spaceport": "small spaceport with landing pad", "market": "market hall with stalls",
    "workshop": "repair workshop, sparks", "turret": "heavy defense turret",
}
for key, desc in BUILDINGS.items():
    for lvl in [1, 2, 3]:
        full(f"buildings/building_{key}_l{lvl}.png", 512, 256,
             f"BUILDING {key} L{lvl}", f"{desc} (level {lvl})")
for clim in ["hot", "cold"]:
    full(f"buildings/building_refinery_l1.ov.{clim}.png", 512, 256,
         f"OVERLAY refinery {clim}", f"transparent {clim}-climate adaptation only")

# ---------------- ships (512x256, 9 coques + overlays d'exemple) ----------------
for cat in ["combat", "cargo", "civil"]:
    for size in ["s", "m", "l"]:
        full(f"ships/ship_{cat}_{size}.png", 512, 256,
             f"SHIP {cat} {size.upper()}", f"{cat} hull {size.upper()}, isometric, bare (no upgrades)")
for ov, desc in [("engine_1", "engine upgrade L1 glow"), ("engine_2", "engine upgrade L2 glow"),
                 ("armor_1", "armor plates L1"), ("cargo_1", "extra containers L1"),
                 ("harvest_1", "star-harvest rig")]:
    full(f"ships/ship_cargo_m.ov.{ov}.png", 512, 256,
         f"OVERLAY {ov}", f"transparent overlay: {desc} only, fits cargo_m hull")

# ---------------- units (256x256, taille à confirmer) ----------------
for key, desc in [("turret_light", "light turret"), ("turret_heavy", "heavy turret"),
                  ("tank", "ground tank")]:
    full(f"units/unit_{key}.png", 256, 256, f"UNIT {key}", f"{desc}, isometric ground unit")

# ---------------- portraits (512x1024) ----------------
for people, role, desc in [
    ("human", "pilot", "human civil pilot, weathered jacket"),
    ("human", "militarist", "stern human militarist officer"),
    ("forged", "engineer", "industrial robot engineer, worn chassis"),
    ("forged", "merchant", "polished robot exchange-arbiter"),
    ("vess", "diplomat", "tall opulent Vess diplomat, rich robes"),
    ("vess", "governor", "Vess governor, always rich, gold details"),
]:
    full(f"portraits/portrait_{people}_{role}_01.png", 512, 1024,
         f"PORTRAIT {people} {role}", f"{desc}; pixel-sprite, full height")

# ---------------- cards (art 512x512) ----------------
for typ, key, desc in [
    ("building", "mine", "mine building card art"),
    ("building", "refinery", "refinery card art, crystals+cells"),
    ("npc", "pilot", "civil pilot NPC card art"),
    ("npc", "governor", "governor NPC card art"),
    ("item", "beamlaser", "beam laser derived-item card art"),
]:
    full(f"cards/card_{typ}_{key}.png", 512, 512, f"CARD {typ} {key}", desc)

# ---------------- resource icons (256x256) ----------------
for key, desc in [("ore", "ore chunk"), ("silicon", "silicon wafer"),
                  ("crystal_hot", "Ignis violet-red crystal"), ("crystal_nox", "Nox black crystal"),
                  ("fuel_cells", "glowing yellow fuel cell"), ("food", "food crate")]:
    full(f"resources/res_{key}.png", 256, 256, f"RES {key}", desc)

with open(os.path.join(REPO, "docs", "design", "props", "manifest.json"), "w") as f:
    json.dump(manifest, f, indent=1)
print(f"{len(manifest)} stubs (x3 fichiers avec bump/light) générés sous assets/game/")
