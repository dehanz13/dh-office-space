"""Build the office from layout/office.json and export a GLB.

Run (from the project root):
    npm run model

Names the website relies on:
    DESK_top, LAB_top   the two desk tops (main desk, lab return); each rises on its own
    DESK_spine, LAB_spine  cable spines the site stretches as each desk rises
    LIGHTBAR            monitor light bar (the site hangs a spotlight on it)
    PCFAN_<i>_rotor     PC fan rotors (spin about local y)   EMI_pc*  PC lights (RGB)
    BLINDROLL_<g>, BLINDHEM_<g>   roller blind fabric (scaled in y) and hem bar per group
    SPOTNUM_<id>        number plates on coming-soon spots
    SCR_*               screens (the site animates them)
    ART_*               art canvases            RUG_top, CTBL_top, FLR_kitchen   painted surfaces
    BOARD_glass         marker drawings on the glass
    BOARD_pin           the pin board
    GAMEBOARD_<game>    board surfaces (the site adds pieces and play)
    CLOCK_*             clock faces, labels and hand pivots
    BIKE_crank, BIKE_flywheel, TREAD_belt   exercise moving parts
    NOTE_*              sticky notes              SWT_*  switch toggles
    EMI_*               parts that glow at night  LGT_*  light fixtures
    CHR_mesh_*          chair mesh panels (the site gives them a woven texture)
    M_glass             glass material (the site swaps in its own)

Coordinates: the layout uses three.js axes (x east, y up, z south). Blender is
z-up, so points go through B(x, y, z) = (x, -z, y); the glTF exporter converts
back to y-up, so the site sees layout coordinates again.
"""

import json
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Euler, Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
LAYOUT_PATH = argv[0] if len(argv) > 0 else "layout/office.json"
OUT_PATH = argv[1] if len(argv) > 1 else "public/models/office.glb"
BLEND_PATH = argv[2] if len(argv) > 2 else "build/office.blend"

with open(LAYOUT_PATH) as f:
    L = json.load(f)


def B(x, y, z):
    """three.js point -> Blender point."""
    return Vector((x, -z, y))


bpy.ops.wm.read_factory_settings(use_empty=True)

# ── Materials ────────────────────────────────────────────────────────────────
MATS = {}


def mat(name, color, rough=0.6, metal=0.0, emit=None, alpha=1.0):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    p = m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = (*color, 1.0)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    if emit is not None:
        p.inputs["Emission Color"].default_value = (*emit, 1.0)
        p.inputs["Emission Strength"].default_value = 0.0
    if alpha < 1.0:
        p.inputs["Alpha"].default_value = alpha
    MATS[name] = m
    return m


M = {
    "floor": mat("M_floor_oak", (0.62, 0.47, 0.33), 0.5),
    "tile": mat("M_tile", (0.82, 0.81, 0.78), 0.35),
    "wall": mat("M_wall", (0.86, 0.84, 0.80), 0.92),
    "ceiling": mat("M_ceiling", (0.92, 0.92, 0.91), 0.95),
    "concrete": mat("M_concrete", (0.52, 0.52, 0.50), 0.85),
    "mullion": mat("M_mullion", (0.05, 0.05, 0.055), 0.4, 0.6),
    "glass": mat("M_glass", (0.80, 0.88, 0.92), 0.05, alpha=0.15),
    "board": mat("M_board", (1.0, 1.0, 1.0), 0.2, alpha=0.0),
    "black": mat("M_metal_black", (0.03, 0.03, 0.035), 0.35, 0.6),
    "alu": mat("M_space_black", (0.07, 0.07, 0.08), 0.32, 0.9),
    "silver": mat("M_silver", (0.72, 0.72, 0.74), 0.3, 0.9),
    "chrome": mat("M_polished_alu", (0.85, 0.85, 0.87), 0.12, 1.0),
    "steel": mat("M_stainless", (0.62, 0.63, 0.64), 0.25, 1.0),
    "brass": mat("M_brass", (0.78, 0.58, 0.28), 0.25, 1.0),
    "desktop": mat("M_desk_oak", (0.62, 0.47, 0.32), 0.45),
    "walnut": mat("M_walnut", (0.24, 0.14, 0.08), 0.5),
    "walnut_dark": mat("M_walnut_dark", (0.14, 0.08, 0.05), 0.5),
    "oak_light": mat("M_oak_light", (0.74, 0.60, 0.43), 0.55),
    "kaya": mat("M_kaya", (0.80, 0.62, 0.36), 0.5),
    "marble": mat("M_marble", (0.90, 0.89, 0.87), 0.18),
    "screen": mat("M_screen", (0.01, 0.01, 0.015), 0.15),
    "fabric": mat("M_sofa_boucle", (0.72, 0.69, 0.64), 0.95),
    "pillow": mat("M_pillow_rust", (0.55, 0.22, 0.10), 0.9),
    "pillow2": mat("M_pillow_navy", (0.08, 0.12, 0.22), 0.9),
    "rug": mat("M_rug", (0.30, 0.31, 0.33), 1.0),
    "leather": mat("M_leather_cognac", (0.42, 0.21, 0.09), 0.42),
    "leather_black": mat("M_leather_black", (0.03, 0.03, 0.03), 0.4),
    "console": mat("M_console_white", (0.90, 0.90, 0.92), 0.35),
    "grille": mat("M_grille", (0.04, 0.04, 0.045), 0.9),
    "driver": mat("M_driver", (0.12, 0.12, 0.13), 0.3, 0.8),
    "ring": mat("M_ring", (0.10, 0.10, 0.11), 0.3, 0.5, emit=(0.35, 0.55, 1.0)),
    "shade": mat("M_lamp_shade", (0.95, 0.91, 0.82), 0.9, emit=(1.0, 0.72, 0.42)),
    "plant": mat("M_leaves", (0.16, 0.33, 0.14), 0.8),
    "pot": mat("M_pot", (0.83, 0.82, 0.78), 0.7),
    "ceramic": mat("M_ceramic", (0.86, 0.84, 0.80), 0.35),
    "ceramic_dark": mat("M_ceramic_dark", (0.12, 0.11, 0.10), 0.4),
    "frame": mat("M_frame_black", (0.02, 0.02, 0.02), 0.5),
    "sticky": mat("M_sticky", (0.98, 0.84, 0.26), 0.85),
    "tape": mat("M_tape", (0.98, 0.78, 0.10), 0.7),
    "switch": mat("M_switch_plate", (0.93, 0.93, 0.91), 0.4),
    "led_warm": mat("M_led_warm", (0.9, 0.85, 0.75), 0.5, emit=(1.0, 0.68, 0.38)),
    "led_cool": mat("M_led_cool", (0.5, 0.55, 0.7), 0.5, emit=(0.45, 0.55, 1.0)),
    "led_white": mat("M_led_white", (0.9, 0.9, 0.9), 0.4, emit=(1.0, 1.0, 1.0)),
    "led_cyan": mat("M_led_cyan", (0.3, 0.7, 0.8), 0.4, emit=(0.2, 0.9, 1.0)),
    "door": mat("M_door", (0.20, 0.13, 0.08), 0.55),
    "white": mat("M_white", (0.93, 0.93, 0.92), 0.5),
    "graphite": mat("M_graphite", (0.06, 0.062, 0.068), 0.55),
    "keycaps": mat("M_keycaps", (0.11, 0.115, 0.125), 0.7),
    "cable": mat("M_cable", (0.04, 0.04, 0.045), 0.6),
    "acrylic": mat("M_acrylic", (0.04, 0.04, 0.05), 0.08, alpha=0.55),
    "cork": mat("M_cork", (0.55, 0.40, 0.26), 0.95),
    "chair_mesh": mat("M_chair_mesh", (0.05, 0.05, 0.055), 0.8),
    "rubber": mat("M_rubber", (0.02, 0.02, 0.02), 0.9),
    "cooler_glass": mat("M_cooler_glass", (0.15, 0.17, 0.2), 0.05, alpha=0.35),
    "book_a": mat("M_book_a", (0.55, 0.12, 0.10), 0.7),
    "book_b": mat("M_book_b", (0.12, 0.20, 0.36), 0.7),
    "book_c": mat("M_book_c", (0.86, 0.80, 0.68), 0.7),
    "book_d": mat("M_book_d", (0.16, 0.30, 0.22), 0.7),
    "book_e": mat("M_book_e", (0.08, 0.08, 0.09), 0.7),
    "book_f": mat("M_book_f", (0.85, 0.55, 0.18), 0.7),
    "can_a": mat("M_can_white", (0.92, 0.92, 0.93), 0.25, 0.7),
    "can_b": mat("M_can_orange", (0.95, 0.45, 0.10), 0.25, 0.7),
    "can_c": mat("M_can_black", (0.05, 0.05, 0.06), 0.25, 0.7),
    "can_d": mat("M_can_blue", (0.15, 0.45, 0.85), 0.25, 0.7),
    "can_e": mat("M_can_pink", (0.92, 0.36, 0.58), 0.25, 0.7),
    "chess_frame": mat("M_chess_frame", (0.09, 0.06, 0.04), 0.4),
    "felt": mat("M_felt", (0.06, 0.07, 0.07), 0.95),
    "bike_red": mat("M_bike_accent", (0.55, 0.06, 0.06), 0.35, 0.3),
    "pc_glass": mat("M_pc_glass", (0.6, 0.65, 0.7), 0.05, alpha=0.15),
    "alu_brushed": mat("M_alu_brushed", (0.86, 0.87, 0.88), 0.3, 1.0),
    "travertine": mat("M_travertine", (0.84, 0.78, 0.68), 0.6),
    "lacquer_green": mat("M_lacquer_green", (0.07, 0.17, 0.13), 0.28),
    "ash": mat("M_ash", (0.78, 0.68, 0.53), 0.5),
    "linen": mat("M_blind_linen", (0.86, 0.84, 0.80), 0.95),
    "led_rgb": mat("M_led_rgb", (0.2, 0.2, 0.2), 0.4, emit=(1.0, 0.2, 1.0)),
    "beans": mat("M_beans", (0.20, 0.11, 0.05), 0.75),
    "pcb": mat("M_pcb", (0.03, 0.04, 0.04), 0.55),
    # Desk: white tops on dark grey legs; dark grey minis with a polished logo.
    "desk_white": mat("M_desk_white", (0.93, 0.93, 0.91), 0.38),
    "leg_grey": mat("M_leg_grey", (0.15, 0.155, 0.165), 0.42, 0.6),
    "mini_grey": mat("M_mini_grey", (0.2, 0.205, 0.215), 0.34, 0.95),
    "logo": mat("M_logo", (0.05, 0.05, 0.055), 0.1, 1.0),
    "paper": mat("M_paper", (0.95, 0.94, 0.9), 0.9),
    "pages": mat("M_pages", (0.9, 0.86, 0.76), 0.95),
    "ipad": mat("M_ipad", (0.1, 0.1, 0.11), 0.3, 0.9),
    "pencil": mat("M_pencil_white", (0.94, 0.94, 0.94), 0.3),
    "notebook_cover": mat("M_notebook_cover", (0.03, 0.03, 0.035), 0.55),
    # Collectibles and sculpture.
    "jade": mat("M_jade", (0.1, 0.42, 0.27), 0.16),
    "gold": mat("M_gold", (0.95, 0.7, 0.3), 0.2, 1.0),
    "statue": mat("M_statue_marble", (0.93, 0.92, 0.89), 0.32),
    "lacquer_red": mat("M_lacquer_red", (0.42, 0.04, 0.03), 0.24),
    "bronze": mat("M_bronze", (0.32, 0.2, 0.11), 0.35, 1.0),
    "glass_clear": mat("M_glass_clear", (0.9, 0.95, 0.97), 0.05, alpha=0.25),
    "sand": mat("M_sand", (0.82, 0.66, 0.42), 0.9),
    "leatherette": mat("M_leatherette", (0.025, 0.025, 0.025), 0.75),
    "cube_w": mat("M_cube_white", (0.92, 0.92, 0.9), 0.35),
    "cube_r": mat("M_cube_red", (0.7, 0.04, 0.04), 0.35),
    "cube_b": mat("M_cube_blue", (0.02, 0.15, 0.6), 0.35),
    "cube_g": mat("M_cube_green", (0.02, 0.45, 0.12), 0.35),
    "cube_y": mat("M_cube_yellow", (0.9, 0.72, 0.03), 0.35),
    "cube_o": mat("M_cube_orange", (0.9, 0.3, 0.02), 0.35),
    "niche": mat("M_niche_glow", (0.92, 0.82, 0.66), 0.8, emit=(1.0, 0.74, 0.46)),
    # More books.
    "book_g": mat("M_book_g", (0.04, 0.24, 0.26), 0.7),
    "book_h": mat("M_book_h", (0.28, 0.03, 0.06), 0.65),
    "book_i": mat("M_book_i", (0.68, 0.48, 0.1), 0.7),
    "book_j": mat("M_book_j", (0.38, 0.38, 0.4), 0.75),
    "book_k": mat("M_book_k", (0.9, 0.88, 0.83), 0.7),
    "book_l": mat("M_book_l", (0.28, 0.3, 0.11), 0.7),
    "book_m": mat("M_book_m", (0.58, 0.24, 0.14), 0.7),
    "book_n": mat("M_book_n", (0.18, 0.25, 0.38), 0.7),
    # Music corner: a smoked-oak console, studio monitors, turntables.
    "oak_smoked": mat("M_oak_smoked", (0.075, 0.05, 0.034), 0.42),
    "speaker": mat("M_speaker_grey", (0.11, 0.115, 0.12), 0.42, 0.6),
    "waveguide": mat("M_waveguide", (0.035, 0.035, 0.04), 0.3, 0.5),
    "cone": mat("M_cone", (0.05, 0.05, 0.055), 0.75),
    "vinyl": mat("M_vinyl", (0.015, 0.015, 0.017), 0.22),
    "label_a": mat("M_label_a", (0.85, 0.42, 0.08), 0.6),
    "label_b": mat("M_label_b", (0.08, 0.35, 0.6), 0.6),
    "slipmat": mat("M_slipmat", (0.04, 0.04, 0.045), 0.95),
    # Chairs: the reading chair's cobalt; the lounge chairs' rosewood and chestnut leather.
    "cobalt_shell": mat("M_cobalt_shell", (0.02, 0.07, 0.52), 0.14),
    "cobalt_velvet": mat("M_cobalt_velvet", (0.03, 0.1, 0.62), 0.88),
    "rosewood": mat("M_rosewood", (0.045, 0.02, 0.012), 0.24),
    "leather_lounge": mat("M_leather_chestnut", (0.32, 0.13, 0.05), 0.38),
    "leather_seam": mat("M_leather_seam", (0.15, 0.055, 0.022), 0.45),
    # The coffee bar: cold brew, its water and grounds, and the syrups.
    "coffee": mat("M_coffee", (0.03, 0.014, 0.006), 0.25),
    "grounds": mat("M_grounds", (0.06, 0.034, 0.018), 0.95),
    "water": mat("M_water", (0.6, 0.78, 0.86), 0.05, alpha=0.35),
    "glass_vessel": mat("M_glass_vessel", (0.9, 0.95, 0.97), 0.03, alpha=0.12),
    "syrup_amber": mat("M_syrup_amber", (0.62, 0.3, 0.04), 0.12),
    "syrup_caramel": mat("M_syrup_caramel", (0.3, 0.11, 0.025), 0.12),
    "syrup_hazel": mat("M_syrup_hazel", (0.48, 0.3, 0.12), 0.12),
    "syrup_berry": mat("M_syrup_berry", (0.36, 0.05, 0.15), 0.12),
    # Plants: every species its own leaf, pot and bark.
    "soil": mat("M_soil", (0.07, 0.045, 0.03), 1.0),
    "bark": mat("M_bark", (0.2, 0.14, 0.09), 0.9),
    "bark_olive": mat("M_bark_olive", (0.32, 0.29, 0.24), 0.95),
    "leaf_fiddle": mat("M_leaf_fiddle", (0.06, 0.2, 0.05), 0.55),
    "leaf_olive": mat("M_leaf_olive", (0.13, 0.19, 0.09), 0.6),
    "leaf_bop": mat("M_leaf_bop", (0.1, 0.25, 0.1), 0.5),
    "leaf_monstera": mat("M_leaf_monstera", (0.03, 0.19, 0.05), 0.62),
    "leaf_snake": mat("M_leaf_snake", (0.08, 0.2, 0.08), 0.5),
    "leaf_juniper": mat("M_leaf_juniper", (0.08, 0.2, 0.07), 0.85),
    "olive_fruit": mat("M_olive_fruit", (0.12, 0.08, 0.1), 0.35),
    "pot_white": mat("M_pot_white", (0.9, 0.89, 0.86), 0.3),
    "terracotta": mat("M_terracotta", (0.55, 0.27, 0.16), 0.85),
    "pot_black": mat("M_pot_black", (0.04, 0.04, 0.045), 0.55),
    "rattan": mat("M_rattan", (0.6, 0.45, 0.27), 0.9),
    "concrete_pot": mat("M_concrete_pot", (0.45, 0.45, 0.43), 0.9),
    "glaze_blue": mat("M_glaze_blue", (0.08, 0.2, 0.33), 0.18),
    # Dyson, whiteboard, rug fringe.
    "dyson_white": mat("M_dyson_white", (0.86, 0.87, 0.88), 0.3),
    "dyson_nickel": mat("M_dyson_nickel", (0.66, 0.66, 0.68), 0.22, 1.0),
    "dyson_mesh": mat("M_dyson_mesh", (0.75, 0.76, 0.78), 0.4, 0.8),
    "whiteboard": mat("M_whiteboard", (0.96, 0.96, 0.96), 0.2),
    "fringe": mat("M_fringe", (0.86, 0.81, 0.7), 1.0),
}

# ── Geometry helpers ─────────────────────────────────────────────────────────


def _link(obj, parent):
    bpy.context.scene.collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    return obj


def _rot(o, rot):
    rx, ry, rz = rot
    o.rotation_euler = Euler((math.radians(rx), math.radians(-rz), math.radians(ry)), "XZY")


def empty(name, pos=(0, 0, 0), rot_y=0.0, parent=None, rot=None):
    o = bpy.data.objects.new(name, None)
    o.empty_display_size = 0.2
    o.location = B(*pos)
    _rot(o, rot if rot is not None else (0, rot_y, 0))
    return _link(o, parent)


def _finish(name, bm, material, pos, rot, parent, bevel=0.0, seg=2, smooth=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material)
    o = bpy.data.objects.new(name, me)
    o.location = B(*pos)
    _rot(o, rot)
    if bevel > 0:
        mod = o.modifiers.new("Bevel", "BEVEL")
        mod.width = bevel
        mod.segments = seg
        mod.limit_method = "ANGLE"
    use_smooth = (bevel > 0) if smooth is None else smooth
    for poly in me.polygons:
        poly.use_smooth = use_smooth
    return _link(o, parent)


def box(name, size, pos, material, rot=(0, 0, 0), parent=None, bevel=0.0, seg=2):
    w, h, d = size
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * w, v.co.y * d, v.co.z * h))
    return _finish(name, bm, material, pos, rot, parent, bevel, seg)


def cyl(name, radius, height, pos, material, rot=(0, 0, 0), parent=None, segments=32, radius2=None, bevel=0.0):
    """Cylinder along three.js y."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments,
                          radius1=radius, radius2=radius if radius2 is None else radius2, depth=height)
    return _finish(name, bm, material, pos, rot, parent, bevel, smooth=True if bevel == 0 else None)


def sphere(name, radius, pos, material, scale=(1, 1, 1), parent=None, rot=(0, 0, 0), segs=(18, 12)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs[0], v_segments=segs[1], radius=radius)
    sx, sy, sz = scale
    for v in bm.verts:
        v.co = Vector((v.co.x * sx, v.co.y * sz, v.co.z * sy))
    return _finish(name, bm, material, pos, rot, parent, smooth=True)


def plane(name, w, h, pos, material, rot=(0, 0, 0), parent=None):
    """Quad facing three.js +z with 0..1 UVs (u right, v up)."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([(-w / 2, 0, -h / 2), (w / 2, 0, -h / 2), (w / 2, 0, h / 2), (-w / 2, 0, h / 2)], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new(name="UVMap")
    for i, (u, v) in enumerate([(0, 0), (1, 0), (1, 1), (0, 1)]):
        uv.data[i].uv = (u, v)
    me.materials.append(material)
    o = bpy.data.objects.new(name, me)
    o.location = B(*pos)
    _rot(o, rot)
    return _link(o, parent)


def disc(name, r, pos, material, rot=(0, 0, 0), parent=None, segments=64):
    """Round plane facing three.js +z, UV mapped so the texture's centre is the disc's centre."""
    me = bpy.data.meshes.new(name)
    verts = [(0, 0, 0)] + [(math.cos(a) * r, 0, math.sin(a) * r) for a in [i * 2 * math.pi / segments for i in range(segments)]]
    # Wound like plane(): the face points along three.js +z before rotation.
    faces = [(0, 1 + i, 1 + (i + 1) % segments) for i in range(segments)]
    me.from_pydata(verts, [], faces)
    uv = me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        for li in poly.loop_indices:
            vx, _, vz = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = (0.5 + vx / (2 * r), 0.5 + vz / (2 * r))
    me.materials.append(material)
    o = bpy.data.objects.new(name, me)
    o.location = B(*pos)
    _rot(o, rot)
    return _link(o, parent)


def multi_box(name, parts, material, parent=None):
    """Many boxes in ONE mesh: far fewer objects to draw. A part is (size, centre),
    optionally with a turn about y and then a lean about z, in degrees."""
    bm = bmesh.new()
    for part in parts:
        (w, h, d), (x, y, z) = part[0], part[1]
        ry = part[2] if len(part) > 2 else 0.0
        rz = math.radians(part[3]) if len(part) > 3 else 0.0
        geom = bmesh.ops.create_cube(bm, size=1.0)
        c = B(x, y, z)
        ca, sa = math.cos(math.radians(ry)), math.sin(math.radians(ry))
        cz, sz = math.cos(rz), math.sin(rz)
        for v in geom["verts"]:
            lx, ly, lz = v.co.x * w, v.co.y * d, v.co.z * h
            if rz:
                lx, lz = lx * cz - lz * sz, lx * sz + lz * cz
            v.co = Vector((lx * ca - ly * sa + c.x, lx * sa + ly * ca + c.y, lz + c.z))
    return _finish(name, bm, material, (0, 0, 0), (0, 0, 0), parent)


def multi_cyl(name, parts, material, parent=None, segments=16):
    """Many upright cylinders (radius, height, centre) in one mesh."""
    bm = bmesh.new()
    for r, h, (x, y, z) in parts:
        geom = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments, radius1=r, radius2=r, depth=h)
        c = B(x, y, z)
        for v in geom["verts"]:
            v.co = Vector((v.co.x + c.x, v.co.y + c.y, v.co.z + c.z))
    return _finish(name, bm, material, (0, 0, 0), (0, 0, 0), parent, smooth=True)


def curve_mesh(name, points, radius, material, parent=None, closed=False, res=10):
    """A smooth tube through points (three.js axes, parent-local), baked to a mesh."""
    cu = bpy.data.curves.new(name + "_curve", "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = 3
    cu.resolution_u = res
    cu.use_fill_caps = True
    spline = cu.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    spline.use_cyclic_u = closed
    for bp, p in zip(spline.bezier_points, points):
        bp.co = B(*p)
        bp.handle_left_type = "AUTO"
        bp.handle_right_type = "AUTO"
    tmp = bpy.data.objects.new(name + "_tmp", cu)
    bpy.context.scene.collection.objects.link(tmp)
    bpy.context.view_layer.update()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(tmp)
    bpy.data.curves.remove(cu)
    me.materials.clear()
    me.materials.append(material)
    for poly in me.polygons:
        poly.use_smooth = True
    return _link(bpy.data.objects.new(name, me), parent)


def sheet(name, w, h, pos, material, rot=(0, 0, 0), parent=None, bow=0.0, taper=0.0, thickness=0.0, nx=14, ny=14):
    """A UV-mapped panel facing +z, bowed into a gentle curve (depth `bow` at the edges)
    and optionally narrower at the bottom (`taper` 0..1). Used for chair mesh and shells."""
    me = bpy.data.meshes.new(name)
    verts, uvs = [], []
    for j in range(ny + 1):
        v = j / ny
        width = w * (1 - taper * (1 - v))
        for i in range(nx + 1):
            u = i / nx
            x = (u - 0.5) * width
            zc = -bow * ((2 * u - 1) ** 2)
            verts.append(B(x, (v - 0.5) * h, zc))
            uvs.append((u, v))
    faces = []
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
    me.from_pydata([tuple(p) for p in verts], [], faces)
    uv = me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        for li in poly.loop_indices:
            uv.data[li].uv = uvs[me.loops[li].vertex_index]
    for poly in me.polygons:
        poly.use_smooth = True
    me.materials.append(material)
    o = bpy.data.objects.new(name, me)
    o.location = B(*pos)
    _rot(o, rot)
    if thickness > 0:
        sol = o.modifiers.new("Solidify", "SOLIDIFY")
        sol.thickness = thickness
        sol.offset = 0
    return _link(o, parent)


def soft_block(name, size, pos, material, parent=None, rot=(0, 0, 0), bow=0.0, bevel=0.03, nx=10):
    """An upholstered block (cushions, arm pads): size (w, h, d) in three.js axes,
    every edge rounded, and optionally bowed back at the sides by `bow` so it
    follows a curved shell."""
    w, h, d = size
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    across = [e for e in bm.edges if abs(e.verts[0].co.x - e.verts[1].co.x) > 0.5]
    bmesh.ops.subdivide_edges(bm, edges=across, cuts=nx, use_grid_fill=True)
    for v in bm.verts:
        x = v.co.x * w
        # Blender y is three.js -z, so bowing the sides back adds to y.
        v.co = Vector((x, v.co.y * d + bow * (2 * x / w) ** 2, v.co.z * h))
    return _finish(name, bm, material, pos, rot, parent, bevel, seg=4, smooth=True)


def _mesh(name, verts, faces, material, parent=None, pos=(0, 0, 0), rot=(0, 0, 0), smooth=True, recalc=True, uvs=None, sharp=None):
    """A mesh straight from three.js-space vertices and faces (converted to Blender here)."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(B(*v)) for v in verts], [], faces)
    if recalc:
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
    if uvs is not None:
        uv = me.uv_layers.new(name="UVMap")
        for poly in me.polygons:
            for li in poly.loop_indices:
                uv.data[li].uv = uvs[me.loops[li].vertex_index]
    me.materials.append(material)
    for poly in me.polygons:
        poly.use_smooth = smooth
    if sharp is not None:
        me.set_sharp_from_angle(angle=math.radians(sharp))
    o = bpy.data.objects.new(name, me)
    o.location = B(*pos)
    _rot(o, rot)
    return _link(o, parent)


def fillet(points, r, steps=4, closed=False):
    """Round the corners of a polyline (three.js points), like bent tube."""
    pts = [Vector(p) for p in points]
    out = []
    n = len(pts)
    for i in range(n):
        if not closed and i in (0, n - 1):
            out.append(pts[i])
            continue
        p0, p1, p2 = pts[i - 1], pts[i], pts[(i + 1) % n]
        d0, d2 = p0 - p1, p2 - p1
        rr = min(r, d0.length * 0.45, d2.length * 0.45)
        a, b = p1 + d0.normalized() * rr, p1 + d2.normalized() * rr
        for k in range(steps + 1):
            s = k / steps
            out.append(a * (1 - s) ** 2 + p1 * (2 * s * (1 - s)) + b * (s * s))
    return [tuple(p) for p in out]


def tube_mesh(name, paths, material, parent=None, sides=8, closed=False, pos=(0, 0, 0), rot=(0, 0, 0), caps=True):
    """Tubes along polylines of (point, radius) in three.js coordinates, all in one mesh:
    trunks that taper, stems, chair frames, spokes, cables."""
    verts, faces = [], []
    for path in paths:
        pts = [Vector(p) for p, _ in path]
        rads = [max(r, 0.0004) for _, r in path]
        n = len(pts)
        rings, nrm = [], None
        for i in range(n):
            if closed:
                t = (pts[(i + 1) % n] - pts[i - 1]).normalized()
            else:
                t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
            if nrm is None:
                ref = Vector((0, 1, 0)) if abs(t.y) < 0.9 else Vector((1, 0, 0))
                nrm = t.cross(ref).normalized()
            else:
                nrm = (nrm - t * nrm.dot(t)).normalized()
            bi = t.cross(nrm)
            rings.append(len(verts))
            for k in range(sides):
                a = 2 * math.pi * k / sides
                verts.append(tuple(pts[i] + (nrm * math.cos(a) + bi * math.sin(a)) * rads[i]))
        for i in range(n if closed else n - 1):
            a0, a1 = rings[i], rings[(i + 1) % n]
            for k in range(sides):
                k2 = (k + 1) % sides
                faces.append((a0 + k, a0 + k2, a1 + k2, a1 + k))
        if caps and not closed:
            faces.append(tuple(rings[0] + k for k in range(sides)))
            faces.append(tuple(rings[-1] + k for k in range(sides)))
    return _mesh(name, verts, faces, material, parent, pos, rot)


def ring_path(radius, centre=(0, 0, 0), axis="z", n=48, r=0.003, start=0.0, end=2 * math.pi):
    """Points round a circle (for tube_mesh): axis is the circle's normal."""
    cx, cy, cz = centre
    pts = []
    for k in range(n + 1 if end - start < 2 * math.pi - 1e-6 else n):
        a = start + (end - start) * k / n
        c, s = math.cos(a) * radius, math.sin(a) * radius
        pts.append(((cx + c, cy + s, cz) if axis == "z" else (cx + c, cy, cz + s) if axis == "y" else (cx, cy + s, cz + c), r))
    return pts


def lathe(name, profile, pos, material, parent=None, segments=32, rot=(0, 0, 0), uv=False):
    """Revolve a profile [(radius, y), ...] about the y axis: bottles, bulbs, vases.
    With uv, u runs once round and v up the profile (a seam column is doubled)."""
    cols = segments + 1 if uv else segments
    verts, faces, uvs = [], [], []
    for i, (r, y) in enumerate(profile):
        for k in range(cols):
            a = 2 * math.pi * k / segments
            verts.append((math.cos(a) * r, y, math.sin(a) * r))
            uvs.append((k / segments, i / (len(profile) - 1)))
    for i in range(len(profile) - 1):
        for k in range(segments):
            a, b = i * cols + k, i * cols + (k + 1) % cols
            faces.append((a, b, b + cols, a + cols))
    return _mesh(name, verts, faces, material, parent, pos, rot, recalc=False, uvs=uvs if uv else None)


def _extrude(name, outline, depth, to3, material, pos, rot, parent, bevel=0.0, seg=2, sharp=None):
    bm = bmesh.new()
    lo = [bm.verts.new(B(*to3(u, v, 0.0))) for u, v in outline]
    hi = [bm.verts.new(B(*to3(u, v, depth))) for u, v in outline]
    bm.faces.new(lo)
    bm.faces.new(hi[::-1])
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _finish(name, bm, material, pos, rot, parent, bevel, seg, smooth=sharp is not None)
    if sharp is not None:
        o.data.set_sharp_from_angle(angle=math.radians(sharp))
    return o


def prism(name, outline, height, pos, material, rot=(0, 0, 0), parent=None, bevel=0.0, seg=2, sharp=None):
    """A plan outline [(x, z), ...] extruded up by `height` from y = 0."""
    return _extrude(name, outline, height, lambda u, v, w: (u, w, v), material, pos, rot, parent, bevel, seg, sharp)


def slab(name, outline, depth, pos, material, rot=(0, 0, 0), parent=None, bevel=0.0, seg=2, sharp=None):
    """A front outline [(x, y), ...] extruded toward +z by `depth` from z = 0."""
    return _extrude(name, outline, depth, lambda u, v, w: (u, v, w), material, pos, rot, parent, bevel, seg, sharp)


def rrect(w, d, r, n=6):
    """Rounded rectangle outline, w x d with corner radius r."""
    pts = []
    for cx, cz, a0 in ((w / 2 - r, d / 2 - r, 0), (-w / 2 + r, d / 2 - r, 90), (-w / 2 + r, -d / 2 + r, 180), (w / 2 - r, -d / 2 + r, 270)):
        for k in range(n + 1):
            a = math.radians(a0 + 90 * k / n)
            pts.append((cx + math.cos(a) * r, cz + math.sin(a) * r))
    return pts


def arch_outline(w, h, n=16):
    """A round-topped arch, base at y = 0: straight sides, a semicircle on top."""
    r = w / 2
    pts = [(-r, 0.0), (r, 0.0), (r, h - r)]
    pts += [(math.cos(math.pi * k / n) * r, h - r + math.sin(math.pi * k / n) * r) for k in range(1, n)]
    pts.append((-r, h - r))
    return pts


def blob(name, elements, material, parent=None, pos=(0, 0, 0), rot=(0, 0, 0), resolution=0.005, threshold=0.6):
    """Organic shapes from metaballs, baked to a mesh: sculpture, dragons, foliage pads.
    Each element: dict(co=(x, y, z) in three.js axes, r=radius, size=(sx, sy, sz) for
    ellipsoids, neg=True to carve)."""
    mb = bpy.data.metaballs.new(name + "_mb")
    mb.resolution = resolution
    mb.render_resolution = resolution
    mb.threshold = threshold
    for el in elements:
        size = el.get("size")
        e = mb.elements.new(type="ELLIPSOID" if size else "BALL")
        e.co = B(*el["co"])
        e.radius = el["r"]
        if size:
            sx, sy, sz = size
            e.size_x, e.size_y, e.size_z = sx, sz, sy
        if el.get("rot"):
            e.rotation = Euler(tuple(math.radians(a) for a in el["rot"]), "XYZ").to_quaternion()
        e.use_negative = el.get("neg", False)
        e.stiffness = el.get("stiff", 2.0)
    tmp = bpy.data.objects.new(f"{name}Mball", mb)
    bpy.context.scene.collection.objects.link(tmp)
    bpy.context.view_layer.update()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(tmp)
    bpy.data.metaballs.remove(mb)
    me.name = name
    me.materials.clear()
    me.materials.append(material)
    for poly in me.polygons:
        poly.use_smooth = True
    o = bpy.data.objects.new(name, me)
    o.location = B(*pos)
    _rot(o, rot)
    return _link(o, parent)


def chain(a, b, r0, r1, step=0.6, **extra):
    """Metaballs along a segment, radius r0 -> r1: limbs, bodies, branches."""
    a, b = Vector(a), Vector(b)
    length = (b - a).length
    n = max(2, int(length / (min(r0, r1) * step)) + 1)
    return [dict(co=tuple(a.lerp(b, k / (n - 1))), r=r0 + (r1 - r0) * k / (n - 1), **extra) for k in range(n)]


# Leaf outlines: half width (0..1) along the leaf, tip at t = 1.
LEAF_PROFILES = {
    "fiddle": lambda t: (math.sin(math.pi * min(1.0, t * 1.04)) ** 0.6) * (0.55 + 0.45 * t) * (1 + 0.07 * math.sin(t * 24)),
    "olive": lambda t: math.sin(math.pi * t) ** 1.15,
    "paddle": lambda t: min(1.0, t * 5) ** 0.5 * min(1.0, (1 - t) * 3.2) ** 0.75,
    "heart": lambda t: (math.sin(math.pi * (0.16 + 0.84 * t)) ** 0.7) * (1.2 - 0.45 * t),
    "sword": lambda t: min(1.0, (1 - t) * 2.4) * (0.82 + 0.18 * math.sin(t * 3.0)),
    "rubber": lambda t: math.sin(math.pi * t) ** 0.8,
}


def foliage(name, leaves, material, parent=None, stations=8):
    """Many leaves in one mesh, each a folded, drooping blade with UVs (u across, v along).
    Leaf: base, dir, length, width, shape, and optional up, fold, droop, twist, slits, tears."""
    verts, faces, uvs = [], [], []
    for lf in leaves:
        base = Vector(lf["base"])
        d = Vector(lf["dir"]).normalized()
        side = d.cross(Vector(lf.get("up", (0, 1, 0))))
        if side.length < 1e-4:
            side = d.cross(Vector((1, 0, 0)))
        side.normalize()
        nrm = side.cross(d).normalized()
        roll = lf.get("roll", 0.0)
        if roll:
            side, nrm = side * math.cos(roll) + nrm * math.sin(roll), nrm * math.cos(roll) - side * math.sin(roll)
        length, width = lf["length"], lf["width"]
        prof = LEAF_PROFILES[lf["shape"]]
        fold, droop, twist = lf.get("fold", 0.25), lf.get("droop", 0.3), lf.get("twist", 0.0)
        slits, tears = lf.get("slits", 0), set(lf.get("tears", ()))
        st = lf.get("stations", stations)
        rows = []
        for i in range(st + 1):
            t = i / st
            hw = prof(t) * width / 2
            c = base + d * (length * t) + Vector((0, -droop * (length * t) ** 2, 0))
            a = twist * t
            s_ = side * math.cos(a) + nrm * math.sin(a)
            n_ = nrm * math.cos(a) - side * math.sin(a)
            row = []
            for f in (-1.0, -0.5, 0.0, 0.5, 1.0):
                row.append(len(verts))
                verts.append(tuple(c + s_ * (f * hw) + n_ * (abs(f) * hw * fold)))
                uvs.append(((f + 1) / 2, t))
            rows.append(row)
        for i in range(st):
            for k in range(4):
                outer = k in (0, 3)
                if outer and slits and 0 < i < st - 1 and i % slits == 0:
                    continue
                if outer and (i, k) in tears:
                    continue
                faces.append((rows[i][k], rows[i][k + 1], rows[i + 1][k + 1], rows[i + 1][k]))
    return _mesh(name, verts, faces, material, parent, smooth=True, recalc=False, uvs=uvs)


def aim(obj, direction_three):
    """Point an object's local -y (three) axis along a three.js direction."""
    d = B(*direction_three).normalized()
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, -1)).rotation_difference(d)


# ── Room shell ───────────────────────────────────────────────────────────────
R = L["room"]
W, D, H, T = R["width"], R["depth"], R["height"], R["wallThickness"]
hx, hz = W / 2, D / 2
shell = empty("ROOM")

box("FLR_main", (W, 0.1, D), (0, -0.05, 0), M["floor"], parent=shell)
# The site paints wide oak planks on this plane (UV 0..1 across the room).
plane("FLR_main_top", W, D, (0, 0.0005, 0), M["floor"], rot=(-90, 0, 0), parent=shell)
box("CEIL", (W + 2 * T, 0.1, D + 2 * T), (0, H + 0.05, 0), M["ceiling"], parent=shell)


def door_leaf(name, w, h, pos, rot_y, sign=None):
    g = empty(name, pos, rot_y, parent=shell)
    box(f"{name}_leaf", (w - 0.04, h - 0.02, 0.05), (0, (h - 0.02) / 2, 0), M["door"], parent=g, bevel=0.004)
    box(f"{name}_frame_l", (0.04, h, 0.08), (-w / 2 + 0.02, h / 2, 0), M["black"], parent=g)
    box(f"{name}_frame_r", (0.04, h, 0.08), (w / 2 - 0.02, h / 2, 0), M["black"], parent=g)
    box(f"{name}_frame_t", (w, 0.04, 0.08), (0, h - 0.02, 0), M["black"], parent=g)
    cyl(f"{name}_handle", 0.012, 0.14, (w / 2 - 0.12, 1.0, 0.04), M["chrome"], rot=(0, 0, 90), parent=g)
    if sign:
        plane(f"SIGN_{name}", 0.26, 0.09, (0, 1.62, 0.03), M["white"], parent=g)
    return g


# South wall (door at x), east wall (door at z).
sd = L["walls"]["south"]["door"]
sx0, sx1 = sd["x"] - sd["width"] / 2, sd["x"] + sd["width"] / 2
box("WAL_south_a", (sx0 + hx + T, H, T), ((sx0 - hx - T) / 2, H / 2, hz + T / 2), M["wall"], parent=shell)
box("WAL_south_b", (hx + T - sx1, H, T), ((sx1 + hx + T) / 2, H / 2, hz + T / 2), M["wall"], parent=shell)
box("WAL_south_head", (sd["width"], H - sd["height"], T), (sd["x"], (H + sd["height"]) / 2, hz + T / 2), M["wall"], parent=shell)
door_leaf("DOOR", sd["width"], sd["height"], (sd["x"], 0, hz + 0.03), 180)

ed = L["walls"]["east"]["door"]
ez0, ez1 = ed["z"] - ed["width"] / 2, ed["z"] + ed["width"] / 2
box("WAL_east_a", (T, H, ez0 + hz + T), (hx + T / 2, H / 2, (ez0 - hz - T) / 2), M["wall"], parent=shell)
box("WAL_east_b", (T, H, hz + T - ez1), (hx + T / 2, H / 2, (ez1 + hz + T) / 2), M["wall"], parent=shell)
box("WAL_east_head", (T, H - ed["height"], ed["width"]), (hx + T / 2, (H + ed["height"]) / 2, ed["z"]), M["wall"], parent=shell)
door_leaf("DOOR_restroom", ed["width"], ed["height"], (hx + 0.03, 0, ed["z"]), -90, sign=ed.get("sign"))

# Baseboards on the solid walls (skipping the door openings).
box("BASE_south_a", (sx0 + hx, 0.08, 0.015), ((sx0 - hx) / 2, 0.04, hz - 0.0075), M["white"], parent=shell)
box("BASE_south_b", (hx - sx1, 0.08, 0.015), ((sx1 + hx) / 2, 0.04, hz - 0.0075), M["white"], parent=shell)
box("BASE_east_b", (0.015, 0.08, hz - ez1), (hx - 0.0075, 0.04, (ez1 + hz) / 2), M["white"], parent=shell)

# Ceiling soffit with a warm LED cove along the south wall and the music end of the east wall.
box("SOFFIT_south", (W, 0.14, 0.42), (0, H - 0.07, hz - 0.21), M["ceiling"], parent=shell)
box("EMI_cove_south", (W - 0.5, 0.012, 0.03), (0, H - 0.146, hz - 0.43), M["led_warm"], parent=shell)
east_from = 1.0
box("SOFFIT_east", (0.42, 0.14, hz - 0.42 - east_from), (hx - 0.21, H - 0.07, (east_from + hz - 0.42) / 2), M["ceiling"], parent=shell)
box("EMI_cove_east", (0.03, 0.012, hz - 0.8 - east_from), (hx - 0.43, H - 0.146, (east_from + hz - 0.42) / 2), M["led_warm"], parent=shell)


def curtain_wall(name, axis, length, fixed, spacing):
    g = empty(name, parent=shell)
    if axis == "x":
        box(f"{name}_glass", (length, H, 0.02), (0, H / 2, fixed), M["glass"], parent=g)
        box(f"{name}_sill", (length, 0.06, 0.16), (0, 0.03, fixed), M["mullion"], parent=g)
        box(f"{name}_head", (length, 0.08, 0.16), (0, H - 0.04, fixed), M["mullion"], parent=g)
    else:
        box(f"{name}_glass", (0.02, H, length), (fixed, H / 2, 0), M["glass"], parent=g)
        box(f"{name}_sill", (0.16, 0.06, length), (fixed, 0.03, 0), M["mullion"], parent=g)
        box(f"{name}_head", (0.16, 0.08, length), (fixed, H - 0.04, 0), M["mullion"], parent=g)
    n = int(round(length / spacing))
    parts = []
    for i in range(n + 1):
        t = -length / 2 + i * length / n
        parts.append(((0.06, H, 0.12), (t, H / 2, fixed)) if axis == "x" else ((0.12, H, 0.06), (fixed, H / 2, t)))
    multi_box(f"{name}_mullions", parts, M["mullion"], parent=g)


curtain_wall("GLS_north", "x", W, -hz, L["walls"]["north"]["mullionSpacing"])
curtain_wall("GLS_west", "z", D, -hx, L["walls"]["west"]["mullionSpacing"])

# ── Shared pieces ────────────────────────────────────────────────────────────


def screen_panel(prefix, screen_name, w, h, pos, parent, bezel=0.006, depth=0.02, rot=(0, 0, 0)):
    """A thin-bezel monitor panel: display `w` x `h`, bezel added around it."""
    g = empty(prefix, pos, parent=parent, rot=rot)
    box(f"{prefix}_panel", (w + 2 * bezel, h + 2 * bezel, depth), (0, 0, 0), M["black"], parent=g, bevel=0.002)
    box(f"{prefix}_back", (w * 0.45, h * 0.5, 0.03), (0, -h * 0.05, -depth / 2 - 0.012), M["black"], parent=g, bevel=0.008)
    plane(screen_name, w, h, (0, 0, depth / 2 + 0.0008), M["screen"], parent=g)
    return g


def leg_set(prefix, positions, sit, root, foot_axis):
    """Motorised legs: feet and sleeves stay on the floor; the inner columns ride with the top."""
    for i, ((x, z), axis) in enumerate(zip(positions, foot_axis)):
        size = (0.07, 0.03, 0.7) if axis == "z" else (0.7, 0.03, 0.07)
        box(f"{prefix}_foot_{i}", size, (x, 0.015, z), M["leg_grey"], parent=root, bevel=0.005)
        box(f"{prefix}_sleeve_{i}", (0.08, 0.55, 0.08), (x, 0.305, z), M["leg_grey"], parent=root, bevel=0.004)


def cable_spine(prefix, x, z, height, root):
    spine = empty(f"{prefix}_spine", (x, 0, z), parent=root)
    n = 14
    links = [((0.045, height / n * 0.8, 0.03), (0, (i + 0.5) * height / n, 0)) for i in range(n)]
    multi_box(f"{prefix}_spine_links", links, M["leg_grey"], parent=spine)
    box(f"{prefix}_floorbox", (0.12, 0.012, 0.12), (x, 0.006, z), M["alu"], parent=root, bevel=0.003)


# ── Builders ─────────────────────────────────────────────────────────────────


def build_column(it, root):
    w, h, d = it["size"]
    box("ARC_column", (w, h, d), (0, h / 2, 0), M["concrete"], parent=root)


def rotor(name, radius, blades, material, parent, pitch=28.0):
    """A fan rotor in its local xz plane (axis = local y): a hub and swept, pitched
    blades, all in one mesh."""
    g = empty(f"{name}_rotor", (0, 0, 0), parent=parent)
    verts, faces = [], []
    r0, r1 = radius * 0.34, radius
    span = 2 * math.pi / blades * 0.8
    for b in range(blades):
        a0 = b * 2 * math.pi / blades
        rows = []
        for i in range(4):
            rr = r0 + (r1 - r0) * i / 3
            sweep = 0.38 * i / 3
            row = []
            for j in range(5):
                f = j / 4
                a = a0 + sweep + span * f
                row.append(len(verts))
                verts.append((math.cos(a) * rr, (0.5 - f) * math.tan(math.radians(pitch)) * span * rr * 0.9, math.sin(a) * rr))
            rows.append(row)
        for i in range(3):
            for j in range(4):
                faces.append((rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]))
    _mesh(f"{name}_blades", verts, faces, material, parent=g, recalc=False)
    cyl(f"{name}_hub", r0, 0.013, (0, 0.002, 0), material, parent=g, segments=32)
    disc(f"{name}_badge", r0 * 0.7, (0, 0.0087, 0), M["black"], rot=(-90, 0, 0), parent=g, segments=24)
    return g


def pc_fan(name, pos, rot, parent, size=0.12):
    """A 120 mm case fan facing local +y: a frame with corner pads, motor struts,
    lit rings front and back, and a spinning rotor."""
    f = empty(name, pos, parent=parent, rot=rot)
    half, bar, depth = size / 2, 0.009, 0.025
    frame = [((size, depth, bar), (0, 0, -half + bar / 2)), ((size, depth, bar), (0, 0, half - bar / 2)),
             ((bar, depth, size), (-half + bar / 2, 0, 0)), ((bar, depth, size), (half - bar / 2, 0, 0))]
    frame += [((0.017, depth, 0.017), (sx * (half - 0.012), 0, sz * (half - 0.012)), 45) for sx in (-1, 1) for sz in (-1, 1)]
    multi_box(f"{name}_frame", frame, M["black"], parent=f)
    struts = [((half * 0.88, 0.004, 0.0045), (math.cos(a) * half * 0.5, -depth / 2 + 0.003, math.sin(a) * half * 0.5), -math.degrees(a)) for a in (0.6, 2.2, 3.8, 5.3)]
    multi_box(f"{name}_struts", struts, M["black"], parent=f)
    cyl(f"{name}_motor", half * 0.3, 0.006, (0, -depth / 2 + 0.004, 0), M["black"], parent=f, segments=24)
    for side, y in (("a", 0.0115), ("b", -0.0115)):
        tube_mesh(f"EMI_pcring_{name}_{side}", [ring_path(half * 0.9, centre=(0, y, 0), axis="y", n=40, r=0.0032)], M["led_rgb"], parent=f, sides=6, closed=True)
    rotor(name, half * 0.86, 9, M["graphite"], f)
    return f


def build_gaming_pc(prefix, pos, parent):
    """A glass showcase tower. Inside: an E-ATX board with lit memory, a liquid cooler
    whose pump head shows the CPU temperature, a diagnostic display cycling
    temperatures, a flagship graphics card, a 1600 W supply in a vented basement and
    ten lit fans. Front (+z) and left (-x) are glass; the board faces the glass."""
    pc = empty(prefix, pos, parent=parent)
    W, Hh, Dd = 0.3, 0.5, 0.46
    k = M["black"]
    box(f"{prefix}_floor", (W, 0.025, Dd), (0, 0.0125, 0), k, parent=pc, bevel=0.003)
    box(f"{prefix}_roof", (W, 0.02, Dd), (0, Hh - 0.01, 0), k, parent=pc, bevel=0.003)
    box(f"{prefix}_back", (W, Hh - 0.045, 0.012), (0, Hh / 2, -Dd / 2 + 0.006), k, parent=pc)
    box(f"{prefix}_wall", (0.012, Hh - 0.045, Dd), (W / 2 - 0.006, Hh / 2, 0), k, parent=pc)
    multi_box(f"{prefix}_roof_vents", [((0.2, 0.002, 0.004), (-0.02, Hh + 0.001, -0.19 + i * 0.0125)) for i in range(31)], M["graphite"], parent=pc)
    for sx in (-1, 1):
        for sz in (-1, 1):
            cyl(f"{prefix}_foot_{sx}_{sz}", 0.016, 0.014, (sx * (W / 2 - 0.035), -0.007, sz * (Dd / 2 - 0.045)), M["rubber"], parent=pc)
    plane(f"{prefix}_glass_front", W - 0.004, Hh - 0.045, (0, Hh / 2, Dd / 2 - 0.002), M["pc_glass"], parent=pc)
    plane(f"{prefix}_glass_side", Dd - 0.004, Hh - 0.045, (-W / 2 + 0.002, Hh / 2, 0), M["pc_glass"], rot=(0, -90, 0), parent=pc)
    cyl(f"{prefix}_power", 0.007, 0.003, (0.1, Hh + 0.0015, Dd / 2 - 0.03), M["chrome"], parent=pc, segments=24)
    tube_mesh(f"EMI_pcled_power_{prefix}", [ring_path(0.0075, centre=(0.1, Hh + 0.0028, Dd / 2 - 0.03), axis="y", n=20, r=0.0009)], M["led_white"], parent=pc, sides=4, closed=True)
    box(f"EMI_pcrgb_strip_top_{prefix}", (W - 0.04, 0.004, 0.006), (0, Hh - 0.024, Dd / 2 - 0.012), M["led_rgb"], parent=pc)
    box(f"EMI_pcrgb_strip_low_{prefix}", (W - 0.04, 0.004, 0.006), (0, 0.128, Dd / 2 - 0.012), M["led_rgb"], parent=pc)

    # Basement: a vented shroud over the power supply, with a window onto its label.
    sh = 0.12
    box(f"{prefix}_shroud_top", (W - 0.024, 0.005, Dd - 0.03), (0, sh - 0.0025, -0.005), k, parent=pc)
    multi_box(f"{prefix}_shroud_vents", [((0.004, 0.002, 0.07), (-0.11 + i * 0.011, sh + 0.0005, 0.16)) for i in range(18)], M["graphite"], parent=pc)
    fx = -W / 2 + 0.012
    face = [((0.008, 0.02, Dd - 0.03), (fx, 0.035, -0.005)), ((0.008, 0.015, Dd - 0.03), (fx, sh - 0.0075, -0.005)),
            ((0.008, 0.06, 0.02), (fx, 0.075, -Dd / 2 + 0.02)), ((0.008, 0.06, 0.25), (fx, 0.075, 0.085))]
    multi_box(f"{prefix}_shroud_face", face, k, parent=pc)
    box(f"{prefix}_psu", (0.14, 0.085, 0.16), (-0.06, 0.07, -0.12), M["graphite"], parent=pc, bevel=0.003)
    plane("PSU_label", 0.15, 0.06, (-0.1305, 0.072, -0.12), M["white"], rot=(0, -90, 0), parent=pc)
    for z in (0.065, -0.14):
        box(f"{prefix}_grommet_{z:.2f}", (0.04, 0.003, 0.03), (W / 2 - 0.05, sh + 0.001, z), M["rubber"], parent=pc, bevel=0.002)

    # The motherboard on the right wall (the site paints its traces and silkscreen).
    bx = W / 2 - 0.0135
    by, bz, bh, bw = 0.3125, -0.088, 0.305, 0.244
    box(f"{prefix}_board", (0.002, bh, bw), (bx + 0.0005, by, bz), M["pcb"], parent=pc)
    plane("PCB_board", bw, bh, (bx - 0.0006, by, bz), M["pcb"], rot=(0, -90, 0), parent=pc)
    sock_y, sock_z = 0.37, -0.1
    box(f"{prefix}_socket", (0.004, 0.07, 0.07), (bx - 0.002, sock_y, sock_z), M["silver"], parent=pc)
    # VRM: two finned heatsinks wrapped round the socket, chokes in front of them.
    vrm_top = [((0.022, 0.026, 0.13), (bx - 0.011, 0.432, -0.12))]
    vrm_top += [((0.004, 0.026, 0.13), (bx - 0.024, 0.432, -0.12))]
    multi_box(f"{prefix}_vrm_top", vrm_top, M["alu_brushed"], parent=pc)
    multi_box(f"{prefix}_vrm_top_fins", [((0.002, 0.022, 0.126), (bx - 0.0255, 0.425 + i * 0.0045, -0.12)) for i in range(4)], k, parent=pc)
    box(f"{prefix}_vrm_side", (0.022, 0.12, 0.024), (bx - 0.011, 0.35, -0.184), M["alu_brushed"], parent=pc, bevel=0.002)
    multi_box(f"{prefix}_vrm_side_fins", [((0.002, 0.116, 0.002), (bx - 0.0225, 0.35, -0.194 + i * 0.005)) for i in range(5)], k, parent=pc)
    chokes = [((0.008, 0.008, 0.008), (bx - 0.004, 0.41, -0.175 + i * 0.012)) for i in range(9)]
    chokes += [((0.008, 0.008, 0.008), (bx - 0.004, 0.395 - i * 0.012, -0.165)) for i in range(7)]
    multi_box(f"{prefix}_chokes", chokes, M["graphite"], parent=pc)
    # Rear I/O cover with a lit strip.
    box(f"{prefix}_io_cover", (0.03, 0.15, 0.05), (bx - 0.015, 0.385, -0.205), M["graphite"], parent=pc, bevel=0.004)
    box(f"{prefix}_io_cap", (0.002, 0.14, 0.042), (bx - 0.031, 0.385, -0.205), M["alu_brushed"], parent=pc)
    box(f"EMI_pcrgb_io_{prefix}", (0.003, 0.12, 0.004), (bx - 0.0325, 0.385, -0.188), M["led_rgb"], parent=pc)
    # M.2 heatsink with grooves, a chipset cover, the CMOS battery, PCIe slots.
    box(f"{prefix}_m2", (0.006, 0.03, 0.14), (bx - 0.003, 0.27, -0.1), M["alu_brushed"], parent=pc, bevel=0.002)
    multi_box(f"{prefix}_m2_grooves", [((0.001, 0.002, 0.13), (bx - 0.0065, 0.26 + i * 0.006, -0.1)) for i in range(4)], k, parent=pc)
    cyl(f"{prefix}_cmos", 0.0095, 0.003, (bx - 0.0015, 0.29, 0.0), M["chrome"], rot=(0, 0, 90), parent=pc, segments=24)
    slots = [((0.008, 0.007, 0.09), (bx - 0.004, y, -0.15)) for y in (0.236, 0.19)]
    multi_box(f"{prefix}_pcie", slots, k, parent=pc)
    multi_box(f"{prefix}_pcie_armor", [((0.009, 0.002, 0.092), (bx - 0.0045, y + 0.0045, -0.15)) for y in (0.236, 0.19)], M["steel"], parent=pc)
    # Diagnostic display: two red digits cycling temperatures.
    box(f"{prefix}_post_case", (0.004, 0.016, 0.026), (bx - 0.002, 0.3, 0.02), k, parent=pc)
    plane("SCR_pcpost", 0.022, 0.012, (bx - 0.0042, 0.3, 0.02), M["screen"], rot=(0, -90, 0), parent=pc)
    # Memory: four sticks with brushed spreaders and diffused light bars.
    sticks, tops, slots, latches = [], [], [], []
    for i in range(4):
        z = -0.02 + i * 0.0105
        slots.append(((0.006, 0.142, 0.008), (bx - 0.003, 0.372, z)))
        sticks.append(((0.03, 0.133, 0.007), (bx - 0.021, 0.372, z)))
        tops.append(((0.004, 0.13, 0.0072), (bx - 0.038, 0.372, z)))
        latches += [((0.008, 0.006, 0.008), (bx - 0.007, 0.372 + s * 0.073, z)) for s in (-1, 1)]
    multi_box(f"{prefix}_dimm_slots", slots, k, parent=pc)
    multi_box(f"{prefix}_dimm_latches", latches, M["white"], parent=pc)
    multi_box(f"{prefix}_ram", sticks, M["alu_brushed"], parent=pc)
    multi_box(f"EMI_pcram_{prefix}", tops, M["led_rgb"], parent=pc)
    multi_box(f"{prefix}_ram_fins", [((0.0015, 0.12, 0.0074), (bx - 0.026 - j * 0.004, 0.372, -0.02 + i * 0.0105)) for i in range(4) for j in range(2)], k, parent=pc)
    # 24-pin power: a white sleeved ribbon from the board's edge down into the basement.
    box(f"{prefix}_atx24", (0.014, 0.052, 0.01), (bx - 0.007, 0.35, 0.03), k, parent=pc)
    whites, blacks = [], []
    for row in range(2):
        for i in range(12):
            x = bx - 0.004 - row * 0.0045
            y = 0.326 + i * 0.0043
            path = [((x, y, 0.035), 0.0019), ((x, y, 0.06), 0.0019), ((x - 0.004, y - 0.03, 0.08), 0.0019), ((x - 0.006, 0.17, 0.075 - row * 0.003), 0.0019), ((x - 0.006, 0.122, 0.067), 0.0019)]
            (whites if (i + row) % 2 == 0 else blacks).append(path)
    tube_mesh(f"{prefix}_atx_white", whites, M["white"], parent=pc, sides=5)
    tube_mesh(f"{prefix}_atx_black", blacks, M["cable"], parent=pc, sides=5)
    box(f"{prefix}_atx_comb", (0.012, 0.056, 0.004), (bx - 0.008, 0.35, 0.065), M["acrylic"], parent=pc)
    # 8-pin CPU power to the top corner.
    eps = [[((bx - 0.004 - (i % 2) * 0.0045, 0.452 + (i // 2) * 0.0043 * 0, -0.17 - (i // 2) * 0.0045), 0.0019),
            ((bx - 0.006 - (i % 2) * 0.0045, 0.472, -0.172 - (i // 2) * 0.0045), 0.0019),
            ((bx - 0.03 - (i % 2) * 0.0045, Hh - 0.022, -0.19 - (i // 2) * 0.0045), 0.0019)] for i in range(8)]
    tube_mesh(f"{prefix}_eps", eps, M["white"], parent=pc, sides=5)
    box(f"{prefix}_eps_plug", (0.012, 0.012, 0.022), (bx - 0.006, 0.455, -0.177), k, parent=pc)

    # Liquid cooler: pump head on the CPU with a round temperature screen, and a
    # lit ring; sleeved hoses up to the radiator.
    cyl(f"{prefix}_pump", 0.035, 0.026, (bx - 0.015, sock_y, sock_z), M["graphite"], rot=(0, 0, 90), parent=pc, segments=48, bevel=0.003)
    disc("SCR_pcpump", 0.028, (bx - 0.0285, sock_y, sock_z), M["screen"], rot=(0, -90, 0), parent=pc, segments=48)
    tube_mesh(f"EMI_pcpump_{prefix}", [ring_path(0.0318, centre=(bx - 0.0283, sock_y, sock_z), axis="x", n=48, r=0.0022)], M["led_rgb"], parent=pc, sides=6, closed=True)
    for i, dz in enumerate((-0.012, 0.012)):
        path = [((bx - 0.022, sock_y + 0.03, sock_z + dz), 0.0068), ((bx - 0.04, sock_y + 0.06, sock_z + dz * 2), 0.0068),
                ((-0.02, Hh - 0.08, -0.16 + dz * 2), 0.0068), ((-0.055, Hh - 0.05, -0.18 + dz * 3), 0.0068)]
        tube_mesh(f"{prefix}_hose_{i}", [path], M["black"], parent=pc, sides=10)
        cyl(f"{prefix}_fitting_{i}", 0.009, 0.014, (bx - 0.024, sock_y + 0.031, sock_z + dz), M["chrome"], parent=pc, segments=16)

    # Flagship graphics card in the top slot, fans down, backplate up, lit edge to the glass.
    gl, gh, gt = 0.34, 0.14, 0.072
    gy = 0.236 - gt / 2 + 0.004
    gx = bx - 0.004 - gh / 2
    gz = -Dd / 2 + 0.012 + gl / 2
    box(f"{prefix}_gpu", (gh, gt - 0.012, gl), (gx, gy - 0.004, gz), M["alu_brushed"], parent=pc, bevel=0.008, seg=3)
    box(f"{prefix}_gpu_backplate", (gh - 0.006, 0.004, gl - 0.008), (gx, gy + gt / 2 - 0.006, gz), k, parent=pc, bevel=0.002)
    multi_box(f"{prefix}_gpu_ribs", [((0.003, 0.0015, gl - 0.06), (gx - gh / 2 + 0.02 + i * 0.012, gy + gt / 2 - 0.003, gz - 0.02)) for i in range(9)], M["graphite"], parent=pc)
    box(f"{prefix}_gpu_flow", (gh - 0.03, 0.002, 0.07), (gx, gy + gt / 2 - 0.0035, gz + gl / 2 - 0.055), M["graphite"], parent=pc)
    multi_box(f"{prefix}_gpu_fins", [((0.004, gt - 0.03, 0.0025), (gx - gh / 2 - 0.0015, gy - 0.004, gz - gl / 2 + 0.02 + i * 0.0105)) for i in range(29)], k, parent=pc)
    box(f"EMI_pcgpu_{prefix}", (0.003, 0.008, gl - 0.06), (gx - gh / 2 - 0.004, gy + 0.018, gz), M["led_white"], parent=pc)
    box(f"{prefix}_gpu_bracket", (gh + 0.01, gt + 0.012, 0.004), (gx, gy, -Dd / 2 + 0.014), M["alu_brushed"], parent=pc)
    box(f"{prefix}_gpu_plug", (0.012, 0.012, 0.022), (gx - gh / 2 + 0.03, gy + gt / 2 + 0.004, gz + 0.06), k, parent=pc)
    power = [[((gx - gh / 2 + 0.026 + (i % 2) * 0.0045, gy + gt / 2 + 0.01, gz + 0.052 + (i // 2) * 0.0045), 0.0019),
              ((gx - gh / 2 + 0.03 + (i % 2) * 0.0045, gy + gt / 2 + 0.03, gz + 0.09 + (i // 2) * 0.0045), 0.0019),
              ((bx - 0.04 + (i % 2) * 0.0045, gy + gt / 2 + 0.01, 0.1 + (i // 2) * 0.004), 0.0019),
              ((W / 2 - 0.05 + (i % 2) * 0.0045, sh + 0.004, 0.06 + (i // 2) * 0.0035), 0.0019)] for i in range(12)]
    tube_mesh(f"{prefix}_gpu_power", power, M["white"], parent=pc, sides=5)
    cyl(f"{prefix}_gpu_support", 0.006, gy - gt / 2 - sh + 0.004, (gx - 0.03, (sh + gy - gt / 2) / 2, gz + gl / 2 - 0.03), M["chrome"], parent=pc)

    # Ten fans: three under the radiator, three intakes behind the front glass,
    # three on the basement roof blowing up at the card, one exhaust.
    box(f"{prefix}_radiator", (0.125, 0.028, 0.4), (-0.03, Hh - 0.034, -0.01), k, parent=pc)
    multi_box(f"{prefix}_radiator_fins", [((0.12, 0.001, 0.0015), (-0.03, Hh - 0.0485, -0.2 + i * 0.008)) for i in range(48)], M["graphite"], parent=pc)
    n = 0
    for z in (-0.135, -0.01, 0.115):
        pc_fan(f"PCFAN_{n}", (-0.03, Hh - 0.066, z), (180, 0, 0), pc)
        n += 1
    for y in (0.178, 0.298, 0.418):
        pc_fan(f"PCFAN_{n}", (-0.02, y, Dd / 2 - 0.03), (90, 0, 0), pc)
        n += 1
    for z in (-0.135, -0.01, 0.115):
        pc_fan(f"PCFAN_{n}", (-0.03, sh + 0.0125, z), (0, 0, 0), pc)
        n += 1
    pc_fan(f"PCFAN_{n}", (-0.02, 0.38, -Dd / 2 + 0.03), (-90, 0, 0), pc)
    return pc


def keypad(name, pos, rot_y, parent):
    """A desk controller: up and down buttons and a little height display."""
    k = empty(name, pos, rot_y, parent=parent)
    box(f"{name}_body", (0.13, 0.028, 0.055), (0, 0, 0), M["graphite"], parent=k, bevel=0.006, seg=3)
    plane(f"SCR_{name}", 0.034, 0.014, (-0.03, 0.0, 0.0281), M["screen"], parent=k)
    for i, x in enumerate((0.018, 0.048)):
        box(f"{name}_btn_{i}", (0.022, 0.014, 0.006), (x, 0.0, 0.03), M["black"], parent=k, bevel=0.002)
    return k


def apple_outline(height):
    """The apple silhouette for the Mac minis, as a plan outline: stem toward -z."""
    right = [(0.0, 0.7), (0.08, 0.76), (0.18, 0.8), (0.3, 0.8), (0.42, 0.75), (0.52, 0.66), (0.568, 0.398),
             (0.501, 0.325), (0.47, 0.21), (0.501, 0.095), (0.568, 0.022), (0.64, -0.2), (0.6, -0.45),
             (0.52, -0.68), (0.4, -0.86), (0.28, -0.96), (0.16, -0.98), (0.07, -0.94)]
    left = [(-0.07, -0.94), (-0.16, -0.98), (-0.28, -0.96), (-0.4, -0.86), (-0.52, -0.68), (-0.6, -0.45), (-0.66, -0.2),
            (-0.69, 0.02), (-0.69, 0.22), (-0.66, 0.4), (-0.6, 0.55), (-0.52, 0.66), (-0.42, 0.75), (-0.3, 0.8),
            (-0.18, 0.8), (-0.08, 0.76)]
    s = height / 1.8
    body = [(x * s, -(y + 0.08) * s) for x, y in right + [(0.0, -0.9)] + left]
    leaf = []
    for k in range(16):
        a = 2 * math.pi * k / 16
        lx, ly = 0.2 * math.cos(a), 0.085 * math.sin(a) * (1 - 0.35 * math.cos(a) ** 2)
        c, sn = math.cos(math.radians(55)), math.sin(math.radians(55))
        leaf.append(((0.1 + lx * c - ly * sn) * s, -(1.02 + lx * sn + ly * c + 0.08) * s))
    return body, leaf


def mac_mini(name, pos, rot_y, parent):
    """A Mac mini: a 12.7 cm rounded square in dark grey aluminium, a little taller
    than the dock, floating on a black foot ring, the logo on top and ports in front."""
    g = empty(name, pos, rot_y, parent=parent)
    s, h, r, foot = 0.127, 0.056, 0.02, 0.006
    prism(f"{name}_foot", rrect(0.104, 0.104, 0.026), foot, (0, 0, 0), M["black"], parent=g)
    prism(f"{name}_body", rrect(s, s, r, n=8), h, (0, foot, 0), M["mini_grey"], parent=g, bevel=0.0035, seg=3, sharp=40)
    body, leaf = apple_outline(0.03)
    prism(f"{name}_logo", body, 0.0005, (0, foot + h, -0.004), M["logo"], parent=g)
    prism(f"{name}_logo_leaf", leaf, 0.0005, (0, foot + h, -0.004), M["logo"], parent=g)
    for i, x in enumerate((-0.02, -0.006)):
        box(f"{name}_usbc_{i}", (0.009, 0.0032, 0.002), (x, foot + 0.022, s / 2 + 0.0002), M["black"], parent=g, bevel=0.0012)
    cyl(f"{name}_jack", 0.0018, 0.002, (0.012, foot + 0.022, s / 2 + 0.0002), M["black"], rot=(90, 0, 0), parent=g, segments=12)
    box(f"EMI_mini_led_{name}", (0.0025, 0.0025, 0.001), (0.05, foot + 0.022, s / 2 + 0.0004), M["led_white"], parent=g)
    return g


def notebook(name, pos, rot_y, parent):
    """An open A5 notebook: hard black cover, a cream page block, two curved pages
    (the site writes on them), a ribbon and the elastic band."""
    g = empty(name, pos, rot_y, parent=parent)
    box(f"{name}_cover", (0.31, 0.004, 0.216), (0, 0.002, 0), M["notebook_cover"], parent=g, bevel=0.0015)
    box(f"{name}_block", (0.296, 0.007, 0.206), (0, 0.0075, 0), M["pages"], parent=g)
    for side, sx, tilt in (("left", -1, 3), ("right", 1, -3)):
        sheet(f"{name}_{side}", 0.146, 0.204, (sx * 0.074, 0.0118, 0), M["paper"], rot=(-90, 0, tilt), parent=g, bow=-0.003, nx=10, ny=6)
    box(f"{name}_gutter", (0.006, 0.002, 0.204), (0, 0.0105, 0), M["pages"], parent=g)
    box(f"{name}_ribbon", (0.005, 0.0012, 0.14), (0.03, 0.0128, 0.08), M["lacquer_red"], rot=(0, 8, 0), parent=g)
    box(f"{name}_band", (0.008, 0.0045, 0.216), (0.142, 0.0024, 0), M["rubber"], parent=g)
    return g


def ipad(name, pos, rot_y, parent):
    """A 13-inch iPad Pro lying flat, screen on (the site draws a diagram on it), with its pencil."""
    g = empty(name, pos, rot_y, parent=parent)
    w, d, t = 0.2815, 0.2155, 0.0051
    prism(f"{name}_body", rrect(w, d, 0.012), t, (0, 0, 0), M["ipad"], parent=g, bevel=0.0012, seg=2, sharp=40)
    plane(f"{name}_glass", w - 0.004, d - 0.004, (0, t + 0.0002, 0), M["screen"], rot=(-90, 0, 0), parent=g)
    plane("SCR_ipad", w - 0.016, d - 0.016, (0, t + 0.0004, 0), M["screen"], rot=(-90, 0, 0), parent=g)
    pencil = empty(f"{name}_pencil", (0.0, 0.0045, d / 2 + 0.02), rot_y=4, parent=g)
    cyl(f"{name}_pencil_body", 0.0045, 0.15, (0, 0, 0), M["pencil"], rot=(0, 0, 90), parent=pencil, segments=12)
    cyl(f"{name}_pencil_tip", 0.0045, 0.016, (0.083, 0, 0), M["pencil"], rot=(0, 0, -90), parent=pencil, radius2=0.0012, segments=12)
    return g


def build_desk_l(it, root):
    """Two sit/stand desks pushed into an L: the main desk along the glass and the lab
    desk (the return) on the sitter's right. Each has its own legs, cable spine,
    keypad and top, so each rises on its own. Local +z is the sitter's side."""
    w, d = it["size"]
    rt = it["return"]
    sit = it["sitHeight"]
    rx0, rx1, rz1 = rt["x0"], rt["x1"], rt["z1"]
    rw, rcx = rx1 - rx0, (rx0 + rx1) / 2
    rlen, rcz = rz1 - d / 2, (rz1 + d / 2) / 2
    main_legs = [(-w / 2 + 0.15, 0.0), (rcx, 0.0)]
    lab_legs = [(rcx, d / 2 + 0.28), (rcx, rz1 - 0.2)]
    leg_set("DESK", main_legs, sit, root, ["z", "z"])
    leg_set("LAB", lab_legs, sit, root, ["x", "x"])
    cable_spine("DESK", rx0 - 0.05, -0.32, sit - 0.15, root)
    cable_spine("LAB", rx1 - 0.12, rz1 - 0.45, sit - 0.15, root)

    top = empty("DESK_top", (0, sit, 0), parent=root)
    lab = empty("LAB_top", (0, sit, 0), parent=root)
    box("DESK_surface", (w, 0.03, d), (0, -0.015, 0), M["desk_white"], parent=top, bevel=0.006)
    box("LAB_surface", (rw, 0.03, rlen - 0.004), (rcx, -0.015, rcz + 0.002), M["desk_white"], parent=lab, bevel=0.006)
    box("DESK_frame", (w - 0.3, 0.035, d - 0.2), (0, -0.05, 0), M["leg_grey"], parent=top)
    box("LAB_frame", (rw - 0.2, 0.035, rlen - 0.2), (rcx, -0.05, rcz), M["leg_grey"], parent=lab)
    for i, (x, z) in enumerate(main_legs):
        box(f"DESK_column_{i}", (0.065, 0.6, 0.065), (x, -0.33, z), M["leg_grey"], parent=top)
    for i, (x, z) in enumerate(lab_legs):
        box(f"LAB_column_{i}", (0.065, 0.6, 0.065), (x, -0.33, z), M["leg_grey"], parent=lab)
    # Cable trays under the back edges, bundles inside.
    box("DESK_tray", (w - 0.6, 0.006, 0.14), (-0.2, -0.16, -d / 2 + 0.12), M["black"], parent=top)
    box("DESK_tray_lip", (w - 0.6, 0.05, 0.006), (-0.2, -0.135, -d / 2 + 0.19), M["black"], parent=top)
    cyl("DESK_bundle", 0.018, w - 0.7, (-0.2, -0.14, -d / 2 + 0.12), M["grille"], rot=(0, 0, 90), parent=top)
    box("LAB_tray", (0.14, 0.006, rlen - 0.4), (rx1 - 0.12, -0.16, rcz), M["black"], parent=lab)
    box("LAB_tray_lip", (0.006, 0.05, rlen - 0.4), (rx1 - 0.19, -0.135, rcz), M["black"], parent=lab)
    cyl("LAB_bundle", 0.016, rlen - 0.5, (rx1 - 0.12, -0.14, rcz), M["grille"], rot=(90, 0, 0), parent=lab)
    # Under-edge light along the sitter's edge and the lab desk's inner edge.
    box("EMI_desk_led", (rx0 + w / 2 - 0.1, 0.008, 0.012), ((rx0 - w / 2) / 2, -0.04, d / 2 - 0.03), M["led_cool"], parent=top)
    box("EMI_desk_led_lab", (0.012, 0.008, rlen - 0.1), (rx0 + 0.03, -0.04, rcz), M["led_cool"], parent=lab)
    box("DESK_mat", (0.95, 0.003, 0.36), (-0.3, 0.0015, 0.21), M["felt"], parent=top, bevel=0.0015)
    keypad("KEYPAD_main", (it["keypads"]["main"][0], -0.045, d / 2 - 0.022), 0, top)
    keypad("KEYPAD_lab", (rx0 - 0.022, -0.045, it["keypads"]["lab"][1]), -90, lab)

    # Main 34" monitor and a vertical 27" touching its right edge, bottoms aligned.
    sx = -0.35
    main_w, main_h, bezel = 0.765, 0.43, 0.006
    main_cy = 0.26 + main_h / 2 + bezel
    cyl("DESK_arm_pole", 0.02, 0.62, (0.0, 0.31, -0.37), M["black"], parent=top)
    box("DESK_arm_main", (0.3, 0.035, 0.05), (sx + 0.15, main_cy, -0.33), M["black"], parent=top)
    screen_panel("MON_main", "SCR_main", main_w, main_h, (sx, main_cy, -0.24), top)
    joint_x = sx + main_w / 2 + bezel
    vert_w, vert_h = 0.336, 0.597
    vert_cy = 0.26 + vert_h / 2 + bezel
    pivot = empty("MON_vertical_pivot", (joint_x, vert_cy, -0.24), rot_y=-15, parent=top)
    screen_panel("MON_vertical", "SCR_vertical", vert_w, vert_h, (vert_w / 2 + bezel, 0, 0), pivot)
    box("DESK_arm_vertical", (0.2, 0.035, 0.05), (joint_x + 0.08, vert_cy - 0.1, -0.33), M["black"], parent=top)
    # A monitor light bar on the 34": it throws light down onto the keyboard and mouse.
    bar_y = main_cy + main_h / 2 + bezel + 0.016
    lb = empty("LIGHTBAR", (sx, bar_y, -0.222), parent=top)
    cyl("LIGHTBAR_body", 0.013, 0.5, (0, 0, 0), M["alu_brushed"], rot=(0, 0, 90), parent=lb, segments=20)
    box("LIGHTBAR_clip", (0.05, 0.035, 0.05), (0, -0.012, -0.03), M["black"], parent=lb, bevel=0.004)
    box("EMI_lightbar", (0.44, 0.003, 0.009), (0, -0.0125, 0.003), M["led_white"], parent=lb)

    # 16" laptop centred under the main monitor.
    box("LAP_base", (0.356, 0.016, 0.248), (sx, 0.008, -0.02), M["alu"], parent=top, bevel=0.004)
    box("LAP_keys", (0.30, 0.002, 0.11), (sx, 0.0165, -0.045), M["screen"], parent=top)
    hinge = empty("LAP_hinge", (sx, 0.016, -0.144), parent=top, rot=(-15, 0, 0))
    box("LAP_lid", (0.356, 0.24, 0.006), (0, 0.12, 0), M["alu"], parent=hinge, bevel=0.003)
    plane("SCR_laptop", 0.33, 0.21, (0, 0.125, 0.0031), M["screen"], parent=hinge)

    # Low-profile mechanical keyboard (75%) and an ergonomic mouse.
    kb_w, kb_d = 0.313, 0.131
    box("KB_case", (kb_w, 0.018, kb_d), (sx, 0.009, 0.21), M["graphite"], rot=(4, 0, 0), parent=top, bevel=0.006, seg=3)
    caps, pitch = [], 0.0193
    for r, count in enumerate([16, 15, 15, 14, 13, 10]):
        row_w = count * pitch
        for k in range(count):
            cw = pitch * 5.2 - 0.0028 if (r == 5 and k == 4) else pitch - 0.0028
            x = sx - row_w / 2 + (k + 0.5) * pitch + (pitch * 2.1 if r == 5 and k > 4 else 0) - (0.01 if r == 5 else 0)
            if x + cw / 2 > sx + kb_w / 2 - 0.008:
                continue
            caps.append(((cw, 0.009, pitch - 0.0035), (x, 0.0215 + r * 0.0012, 0.21 - kb_d / 2 + 0.014 + r * pitch)))
    multi_box("KB_caps", caps, M["keycaps"], parent=top)
    mouse = empty("MOUSE", (0.0, 0.0, 0.22), rot_y=-8, parent=top)
    sphere("MOUSE_body", 0.5, (0, 0.022, 0), M["graphite"], scale=(0.084, 0.05, 0.125), parent=mouse)
    sphere("MOUSE_thumb", 0.5, (-0.037, 0.012, 0.01), M["graphite"], scale=(0.03, 0.022, 0.07), parent=mouse)
    cyl("MOUSE_wheel", 0.0095, 0.008, (0.004, 0.045, -0.03), M["silver"], rot=(0, 0, 90), parent=mouse)

    # Thunderbolt dock on its side, left of the laptop, with one short cable.
    dock = empty("DOCK", (-0.95, 0.0, -0.22), parent=top)
    box("DOCK_body", (0.042, 0.114, 0.143), (0, 0.057, 0), M["alu"], parent=dock, bevel=0.005)
    box("EMI_dock_led", (0.006, 0.003, 0.002), (0, 0.098, 0.0716), M["led_white"], parent=dock)
    curve_mesh("CBL_laptop_dock", [(sx - 0.178, 0.008, -0.08), (-0.65, 0.004, -0.1), (-0.85, 0.004, -0.14), (-0.95, 0.02, -0.148)], 0.0028, M["cable"], parent=top)
    curve_mesh("CBL_dock_tray", [(-0.95, 0.09, -0.29), (-0.95, 0.06, -0.37), (-0.92, -0.02, -0.405), (-0.85, -0.12, -0.3)], 0.003, M["cable"], parent=top)
    cyl("PRP_mug", 0.042, 0.1, (-1.0, 0.05, 0.2), M["ceramic"], parent=top)

    # The gaming PC in the corner where the two desks meet.
    build_gaming_pc("PC", (rcx + 0.03, 0.0, -0.12), top)
    curve_mesh("CBL_pc", [(rcx + 0.03, 0.2, -0.355), (rcx, 0.05, -0.39), (rcx - 0.05, -0.12, -0.36)], 0.004, M["cable"], parent=top)

    # The lab desk: two 32" monitors meeting edge to edge, angled at the chair.
    ax = rx1 - 0.15
    cyl("LAB_arm_pole", 0.02, 0.62, (rx1 - 0.08, 0.31, rcz), M["black"], parent=lab)
    agent_w, agent_h = 0.708, 0.398
    agent_cy = 0.26 + agent_h / 2 + bezel
    for key, sign, ry in (("a", -1, -82), ("b", 1, -98)):
        p = empty(f"MON_agent_{key}_pivot", (ax, agent_cy, rcz), rot_y=ry, parent=lab)
        screen_panel(f"MON_agent_{key}", f"SCR_agent_{key}", agent_w, agent_h, (sign * (agent_w / 2 + bezel), 0, 0), p)
    box("LAB_arm", (0.06, 0.035, 0.5), (rx1 - 0.1, agent_cy, rcz), M["black"], parent=lab)
    # Two Mac minis, one under each monitor: dark grey aluminium, a polished logo on
    # top, ports on the front, a lit power dot. Each sits on a black foot ring.
    for key, sign in (("a", -1), ("b", 1)):
        z = rcz + sign * 0.357
        mac_mini(f"MINI_{key}", (ax - 0.13, 0.0, z), -90, lab)
        curve_mesh(f"CBL_mini_{key}", [(ax - 0.07, 0.02, z), (rx1 - 0.06, 0.012, z), (rx1 - 0.04, -0.03, z - 0.04), (rx1 - 0.12, -0.13, z - 0.2)], 0.0028, M["cable"], parent=lab)

    # The lab desk's paper side: an open notebook with a pen, and a 13" iPad Pro with its pencil.
    notebook("NOTEBOOK", (0.64, 0.0, 1.02), -96, lab)
    pen = empty("PEN", (0.6, 0.0065, 1.27), rot_y=-128, parent=lab)
    cyl("PEN_barrel", 0.0058, 0.125, (0, 0, 0), M["black"], rot=(90, 0, 0), parent=pen, segments=16)
    cyl("PEN_cap", 0.0062, 0.05, (0, 0, -0.07), M["black"], rot=(90, 0, 0), parent=pen, segments=16)
    box("PEN_clip", (0.0015, 0.002, 0.045), (0, 0.0064, -0.07), M["chrome"], parent=pen)
    cyl("PEN_nib", 0.004, 0.012, (0, 0, 0.068), M["gold"], rot=(90, 0, 0), parent=pen, radius2=0.0008, segments=12)
    ipad("IPAD", (0.66, 0.0, 1.66), -84, lab)

def build_aeron_chair(it, root):
    """A Herman Miller Aeron-style task chair: polished star base, woven mesh seat and
    a tall curved mesh back with a lumbar bar. Local +z is the chair's front."""
    hub_y = 0.11
    for i in range(5):
        a = math.radians(i * 72 + 18)
        tip = (math.sin(a) * 0.33, 0.07, math.cos(a) * 0.33)
        curve_mesh(f"CHR_leg_{i}", [(0, hub_y, 0), (tip[0] * 0.55, hub_y - 0.015, tip[2] * 0.55), tip], 0.017, M["chrome"], parent=root, res=6)
        sphere(f"CHR_caster_{i}", 0.032, (tip[0], 0.032, tip[2]), M["rubber"], scale=(1.0, 1.0, 0.7), parent=root)
    cyl("CHR_hub", 0.045, 0.06, (0, hub_y, 0), M["chrome"], parent=root)
    cyl("CHR_gas", 0.022, 0.28, (0, 0.27, 0), M["black"], parent=root)
    box("CHR_mechanism", (0.2, 0.06, 0.24), (0, 0.42, 0.0), M["graphite"], parent=root, bevel=0.015)
    # Seat: a graphite frame with a woven pellicle stretched in it, front edge rolled down.
    box("CHR_seat_frame", (0.5, 0.035, 0.47), (0, 0.465, 0.02), M["graphite"], parent=root, bevel=0.03, seg=3)
    sheet("CHR_mesh_seat", 0.44, 0.41, (0, 0.487, 0.02), M["chair_mesh"], rot=(-90, 0, 0), parent=root, bow=0.012)
    curve_mesh("CHR_seat_waterfall", [(-0.24, 0.47, 0.25), (0, 0.462, 0.262), (0.24, 0.47, 0.25)], 0.014, M["graphite"], parent=root)
    # Spine from the mechanism up to the back frame.
    curve_mesh("CHR_spine", [(0, 0.42, -0.08), (0, 0.45, -0.22), (0, 0.55, -0.27)], 0.022, M["graphite"], parent=root)
    # Back: tall, narrower at the bottom, bowed to wrap the sitter; frame tubes on the edges.
    back_tilt = -10
    back = empty("CHR_back", (0, 0.86, -0.25), parent=root, rot=(back_tilt, 0, 0))
    sheet("CHR_mesh_back", 0.44, 0.6, (0, 0, 0), M["chair_mesh"], parent=back, bow=0.05, taper=0.22)
    for s in (-1, 1):
        curve_mesh(f"CHR_back_rail_{s}", [(s * 0.17, -0.3, -0.05), (s * 0.205, -0.05, -0.05), (s * 0.225, 0.2, -0.05), (s * 0.215, 0.31, -0.04)], 0.016, M["graphite"], parent=back)
    curve_mesh("CHR_back_top", [(-0.215, 0.31, -0.04), (0, 0.322, 0.0), (0.215, 0.31, -0.04)], 0.016, M["graphite"], parent=back)
    curve_mesh("CHR_back_bottom", [(-0.17, -0.3, -0.05), (0, -0.31, -0.02), (0.17, -0.3, -0.05)], 0.016, M["graphite"], parent=back)
    curve_mesh("CHR_lumbar", [(-0.19, -0.1, 0.012), (0, -0.095, 0.03), (0.19, -0.1, 0.012)], 0.018, M["graphite"], parent=back)
    # Arms: curved posts from under the seat to padded rests.
    for s in (-1, 1):
        curve_mesh(f"CHR_arm_post_{s}", [(s * 0.1, 0.43, -0.12), (s * 0.26, 0.48, -0.14), (s * 0.27, 0.62, -0.06)], 0.016, M["graphite"], parent=root)
        box(f"CHR_arm_pad_{s}", (0.07, 0.025, 0.25), (s * 0.27, 0.64, 0.0), M["leather_black"], parent=root, bevel=0.012, seg=3)


def build_wine_cooler(it, root):
    """A glass-door drinks fridge, open behind the glass so the stock shows: steel
    shell, lit back wall, side LED strips and wire shelves. The site fills the
    shelves with cans."""
    w, h, d = it["size"]
    t = 0.028
    kick = 0.06
    inner_h = h - t - kick
    box("COOL_top", (w, t, d), (0, h - t / 2, 0), M["steel"], parent=root, bevel=0.004)
    box("COOL_kick", (w, kick, d), (0, kick / 2, -0.01), M["black"], parent=root)
    for sx in (-1, 1):
        box(f"COOL_side_{sx}", (t, inner_h, d), (sx * (w / 2 - t / 2), kick + inner_h / 2, 0), M["steel"], parent=root)
        box(f"EMI_cooler_strip_{sx}", (0.006, inner_h - 0.04, 0.006), (sx * (w / 2 - t - 0.004), kick + inner_h / 2, d / 2 - 0.035), M["led_white"], parent=root)
    box("COOL_back", (w - 2 * t, inner_h, t), (0, kick + inner_h / 2, -d / 2 + t / 2), M["graphite"], parent=root)
    plane("EMI_cooler_back", w - 2 * t - 0.01, inner_h - 0.03, (0, kick + inner_h / 2, -d / 2 + t + 0.002), M["led_cool"], parent=root)
    for i, y in enumerate(it["shelves"]):
        rails = [((w - 2 * t, 0.004, 0.004), (0, y, -d / 2 + 0.06 + k * (d - 0.12) / 6)) for k in range(7)]
        multi_box(f"COOL_shelf_{i}", rails, M["chrome"], parent=root)
        box(f"COOL_shelf_lip_{i}", (w - 2 * t, 0.018, 0.012), (0, y + 0.006, d / 2 - 0.03), M["alu_brushed"], parent=root)
    # The door: a slim black frame round clear glass, and a long steel handle.
    fz = d / 2 + 0.012
    frame = [((w, 0.04, 0.024), (0, h - 0.02, fz)), ((w, 0.04, 0.024), (0, kick + 0.02, fz)),
             ((0.03, h - kick, 0.024), (-w / 2 + 0.015, kick + (h - kick) / 2, fz)), ((0.03, h - kick, 0.024), (w / 2 - 0.015, kick + (h - kick) / 2, fz))]
    multi_box("COOL_door_frame", frame, M["black"], parent=root)
    plane("COOL_glass", w - 0.06, h - kick - 0.08, (0, kick + (h - kick) / 2, fz), M["cooler_glass"], parent=root)
    box("COOL_handle", (0.016, h - 0.3, 0.02), (w / 2 - 0.045, kick + (h - kick) / 2, fz + 0.03), M["steel"], parent=root, bevel=0.004)
    for y in (kick + 0.17, h - 0.17):
        box(f"COOL_handle_post_{y:.2f}", (0.012, 0.012, 0.03), (w / 2 - 0.045, y, fz + 0.016), M["steel"], parent=root)


def build_glass_board(it, root):
    h = it["top"] - it["bottom"]
    plane("BOARD_glass", it["width"], h, (0, (it["top"] + it["bottom"]) / 2, 0), M["board"], parent=root)


def build_spin_bike(it, root):
    """Indoor spin bike. Local +z is where the rider faces."""
    box("BIKE_base_front", (0.56, 0.05, 0.08), (0, 0.04, 0.45), M["black"], parent=root, bevel=0.015)
    box("BIKE_base_rear", (0.6, 0.05, 0.08), (0, 0.04, -0.52), M["black"], parent=root, bevel=0.015)
    # Frame: a front column up to the bars and a rear beam that meets it, like a "λ".
    curve_mesh("BIKE_column", [(0, 0.06, 0.45), (0, 0.5, 0.37), (0, 0.97, 0.3)], 0.045, M["black"], parent=root)
    curve_mesh("BIKE_beam", [(0, 0.06, -0.52), (0, 0.28, -0.24), (0, 0.5, 0.18), (0, 0.6, 0.36)], 0.045, M["black"], parent=root)
    curve_mesh("BIKE_seatpost", [(0, 0.3, -0.27), (0, 0.98, -0.36)], 0.024, M["silver"], parent=root, res=2)
    sphere("BIKE_saddle", 0.5, (0, 1.01, -0.37), M["leather_black"], scale=(0.15, 0.06, 0.27), parent=root)
    curve_mesh("BIKE_stem", [(0, 0.96, 0.3), (0, 1.08, 0.34)], 0.024, M["silver"], parent=root, res=2)
    curve_mesh("BIKE_handlebar", [(-0.24, 1.08, 0.24), (-0.17, 1.12, 0.34), (0, 1.11, 0.37), (0.17, 1.12, 0.34), (0.24, 1.08, 0.24)], 0.017, M["black"], parent=root)
    # Big touchscreen on a post at the front, facing the rider.
    curve_mesh("BIKE_screen_post", [(0, 1.08, 0.34), (0, 1.26, 0.42)], 0.02, M["black"], parent=root, res=2)
    screen_panel("BIKE_console", "SCR_bike", 0.5, 0.3, (0, 1.4, 0.45), root, bezel=0.012, depth=0.03, rot=(-15, 180, 0))
    # Flywheel in a shroud at the front, and the crank that spins with your cadence.
    fly = empty("BIKE_flywheel", (0, 0.38, 0.22), parent=root)
    cyl("BIKE_flywheel_disc", 0.21, 0.04, (0, 0, 0), M["silver"], rot=(0, 0, 90), parent=fly, segments=48)
    for i in range(6):
        box(f"BIKE_spoke_{i}", (0.045, 0.012, 0.33), (0, 0, 0), M["black"], rot=(i * 60, 0, 0), parent=fly)
    box("BIKE_shroud_l", (0.012, 0.44, 0.46), (-0.04, 0.4, 0.22), M["bike_red"], parent=root, bevel=0.005)
    box("BIKE_shroud_r", (0.012, 0.44, 0.46), (0.04, 0.4, 0.22), M["bike_red"], parent=root, bevel=0.005)
    crank = empty("BIKE_crank", (0, 0.34, -0.08), parent=root)
    for s in (-1, 1):
        arm = empty(f"BIKE_crank_arm_{s}", (s * 0.12, 0, 0), parent=crank, rot=(90 if s > 0 else -90, 0, 0))
        box(f"BIKE_crank_bar_{s}", (0.03, 0.17, 0.02), (0, 0.085, 0), M["silver"], parent=arm)
        box(f"BIKE_pedal_{s}", (0.1, 0.02, 0.08), (s * 0.05, 0.17, 0), M["black"], parent=arm, bevel=0.006)


def build_treadmill(it, root):
    """Treadmill. Local +z is where the runner faces."""
    box("TREAD_deck", (0.85, 0.16, 1.95), (0, 0.1, 0), M["black"], parent=root, bevel=0.03, seg=3)
    plane("TREAD_belt", 0.54, 1.55, (0, 0.183, -0.05), M["rubber"], rot=(-90, 0, 0), parent=root)
    for s in (-1, 1):
        box(f"TREAD_rail_{s}", (0.14, 0.02, 1.6), (s * 0.34, 0.185, -0.05), M["silver"], parent=root, bevel=0.005)
    box("TREAD_hood", (0.85, 0.2, 0.32), (0, 0.17, 0.82), M["graphite"], parent=root, bevel=0.06, seg=3)
    for s in (-1, 1):
        curve_mesh(f"TREAD_upright_{s}", [(s * 0.36, 0.2, 0.86), (s * 0.37, 0.8, 0.8), (s * 0.34, 1.3, 0.66)], 0.03, M["graphite"], parent=root)
        curve_mesh(f"TREAD_handrail_{s}", [(s * 0.34, 1.12, 0.66), (s * 0.36, 1.1, 0.4), (s * 0.35, 1.06, 0.15)], 0.018, M["silver"], parent=root)
    box("TREAD_console", (0.74, 0.08, 0.22), (0, 1.32, 0.66), M["graphite"], rot=(-25, 0, 0), parent=root, bevel=0.03, seg=3)
    screen_panel("TREAD_screen", "SCR_tread", 0.44, 0.27, (0, 1.5, 0.66), root, bezel=0.012, depth=0.03, rot=(-12, 180, 0))


def build_game_table(it, root):
    game = it["game"]
    h = 0.72
    box("GT_top", (0.8, 0.035, 0.8), (0, h - 0.0175, 0), M["walnut"], parent=root, bevel=0.006)
    cyl("GT_pedestal", 0.06, h - 0.06, (0, (h - 0.06) / 2 + 0.03, 0), M["black"], parent=root)
    box("GT_foot_a", (0.6, 0.03, 0.07), (0, 0.015, 0), M["black"], parent=root, bevel=0.006)
    box("GT_foot_b", (0.07, 0.03, 0.6), (0, 0.015, 0), M["black"], parent=root, bevel=0.006)
    # Two chairs: the visitor's on the south (+z) side, the AI's opposite.
    for tag, z, ry in (("you", 0.72, 180), ("ai", -0.72, 0)):
        c = empty(f"GT_chair_{tag}", (0, 0, z), rot_y=ry, parent=root)
        box(f"GT_seat_{tag}", (0.44, 0.04, 0.42), (0, 0.46, 0), M["oak_light"], parent=c, bevel=0.015, seg=3)
        box(f"GT_back_{tag}", (0.42, 0.24, 0.025), (0, 0.72, -0.19), M["oak_light"], rot=(-6, 0, 0), parent=c, bevel=0.01, seg=3)
        for sx in (-1, 1):
            for sz in (-1, 1):
                cyl(f"GT_leg_{tag}_{sx}_{sz}", 0.015, 0.46, (sx * 0.18, 0.23, sz * 0.17), M["black"], parent=c)
    if game == "go":
        box("GB_go_block", (0.48, 0.1, 0.5), (0, h + 0.05, 0), M["kaya"], parent=root, bevel=0.004)
        plane("GAMEBOARD_go", 0.44, 0.44, (0, h + 0.1005, 0), M["kaya"], rot=(-90, 0, 0), parent=root)
        for tag, x in (("you", 0.33), ("ai", -0.33)):
            cyl(f"GB_bowl_{tag}", 0.065, 0.06, (x, h + 0.03, 0.12 if tag == "you" else -0.12), M["walnut_dark"], parent=root, radius2=0.075)
        box("EMI_ai_go", (0.2, 0.004, 0.006), (0, h + 0.07, -0.252), M["led_cyan"], parent=root)
    else:
        frame = M["chess_frame"] if game == "chess" else M["walnut"]
        box(f"GB_{game}_frame", (0.53, 0.03, 0.53), (0, h + 0.015, 0), frame, parent=root, bevel=0.004)
        plane(f"GAMEBOARD_{game}", 0.44, 0.44, (0, h + 0.0305, 0), M["felt"], rot=(-90, 0, 0), parent=root)
        if game == "chess":
            # The AI board: a lit edge all round and a status strip on the AI's side.
            parts = [((0.54, 0.004, 0.006), (0, h + 0.031, 0.266)), ((0.54, 0.004, 0.006), (0, h + 0.031, -0.266)),
                     ((0.006, 0.004, 0.54), (0.266, h + 0.031, 0)), ((0.006, 0.004, 0.54), (-0.266, h + 0.031, 0))]
            multi_box("EMI_ai_ring_chess", parts, M["led_cyan"], parent=root)
            box("GB_chess_status", (0.24, 0.05, 0.03), (0, h + 0.055, -0.3), M["black"], rot=(25, 0, 0), parent=root, bevel=0.004)
            plane("SCR_ai_chess", 0.22, 0.04, (0, h + 0.0585, -0.284), M["screen"], rot=(-65, 0, 0), parent=root)
        else:
            box("EMI_ai_checkers", (0.2, 0.004, 0.006), (0, h + 0.031, -0.266), M["led_cyan"], parent=root)


def build_kitchen(it, root):
    c, fr, isl = it["counter"], it["fridge"], it["island"]
    fl = it["floor"]
    plane("FLR_kitchen", fl["x1"] - fl["x0"], fl["z1"] - fl["z0"], ((fl["x0"] + fl["x1"]) / 2, 0.002, (fl["z0"] + fl["z1"]) / 2), M["tile"], rot=(-90, 0, 0), parent=root)
    # Counter run on the east wall: walnut doors, marble top, marble backsplash.
    cx, cz = (c["x0"] + c["x1"]) / 2, (c["z0"] + c["z1"]) / 2
    cw, cl, ch = c["x1"] - c["x0"], c["z1"] - c["z0"], c["height"]
    box("KIT_base", (cw - 0.02, ch - 0.13, cl), (cx + 0.01, 0.1 + (ch - 0.13) / 2, cz), M["walnut"], parent=root)
    box("KIT_toe", (cw - 0.08, 0.1, cl), (cx + 0.04, 0.05, cz), M["black"], parent=root)
    n = max(1, int(cl / 0.6))
    for i in range(1, n):
        z = c["z0"] + i * cl / n
        box(f"KIT_gap_{i}", (0.004, ch - 0.16, 0.006), (c["x0"] - 0.001, 0.1 + (ch - 0.13) / 2, z), M["black"], parent=root)
    box("KIT_top", (cw + 0.02, 0.03, cl + 0.02), (cx - 0.01, ch - 0.015, cz), M["marble"], parent=root, bevel=0.003)
    plane("KIT_splash", cl, 0.6, (c["x1"] - 0.005, ch + 0.3, cz), M["marble"], rot=(0, -90, 0), parent=root)
    box("KIT_sink", (0.42, 0.012, 0.62), (cx - 0.02, ch + 0.0005, -2.55), M["graphite"], parent=root)
    curve_mesh("KIT_faucet", [(c["x1"] - 0.12, ch, -2.55), (c["x1"] - 0.12, ch + 0.32, -2.55), (c["x1"] - 0.2, ch + 0.38, -2.55), (c["x1"] - 0.3, ch + 0.25, -2.55)], 0.011, M["brass"], parent=root)
    box("KIT_cooktop", (0.52, 0.006, 0.6), (cx - 0.02, ch + 0.003, -3.7), M["screen"], parent=root, bevel=0.002)
    # Open walnut shelves with jars and glasses above the sink.
    for i, y in enumerate((1.55, 1.95)):
        box(f"KIT_shelf_{i}", (0.28, 0.035, 1.5), (c["x1"] - 0.14, y, -2.55), M["walnut"], parent=root)
        multi_cyl(f"KIT_jars_{i}", [(0.04, 0.12, (c["x1"] - 0.14, y + 0.078, -2.55 + k * 0.13 - 0.55)) for k in range(9)], M["ceramic"], parent=root)
    box("EMI_kitchen_shelf", (0.02, 0.006, 1.4), (c["x1"] - 0.26, 1.53, -2.55), M["led_warm"], parent=root)

    # Coffee bar: a polished two-group espresso machine with gauges and a display,
    # a tall-hopper grinder, a cold-drip tower, syrups and cups. Faces into the kitchen.
    eb = empty("COFFEE", (cx - 0.015, ch, -4.95), rot_y=-90, parent=root)
    box("ESP_plinth", (0.78, 0.05, 0.56), (0, 0.025, -0.01), M["black"], parent=eb, bevel=0.006)
    box("ESP_body", (0.72, 0.33, 0.5), (0, 0.215, -0.03), M["alu_brushed"], parent=eb, bevel=0.025, seg=3)
    for sx in (-1, 1):
        box(f"ESP_side_{sx}", (0.035, 0.4, 0.55), (sx * 0.375, 0.245, -0.01), M["chrome"], parent=eb, bevel=0.017, seg=4)
    box("ESP_warmer", (0.7, 0.018, 0.44), (0, 0.39, -0.04), M["chrome"], parent=eb, bevel=0.004)
    rail = [(-0.33, 0.44, 0.17), (-0.33, 0.44, -0.24), (0.33, 0.44, -0.24), (0.33, 0.44, 0.17)]
    curve_mesh("ESP_rail", rail, 0.006, M["chrome"], parent=eb, res=4)
    for sx in (-1, 1):
        curve_mesh(f"ESP_rail_post_{sx}", [(sx * 0.33, 0.39, 0.17), (sx * 0.33, 0.44, 0.17)], 0.005, M["chrome"], parent=eb, res=2)
    multi_cyl("ESP_cups", [(0.038, 0.06, (x, 0.43, z)) for x in (-0.22, -0.11, 0.0, 0.11, 0.22) for z in (-0.12, 0.02)], M["ceramic"], parent=eb)
    # Front: a black glass panel with two pressure gauges and a small display.
    box("ESP_panel", (0.66, 0.12, 0.012), (0, 0.3, 0.226), M["screen"], parent=eb, bevel=0.003)
    for i, x in enumerate((-0.2, 0.2)):
        cyl(f"ESP_gauge_bezel_{i}", 0.036, 0.012, (x, 0.3, 0.236), M["chrome"], rot=(90, 0, 0), parent=eb, segments=32)
        disc(f"ESP_gauge_{i}", 0.03, (x, 0.3, 0.2425), M["white"], parent=eb, segments=32)
        box(f"ESP_needle_{i}", (0.003, 0.024, 0.002), (x + 0.006, 0.306, 0.2445), M["bike_red"], rot=(0, 0, -35), parent=eb)
    plane("SCR_coffee", 0.13, 0.05, (0, 0.3, 0.2325), M["screen"], parent=eb)
    box("EMI_coffee_led", (0.6, 0.006, 0.01), (0, 0.23, 0.22), M["led_white"], parent=eb)
    for i, x in enumerate((-0.17, 0.17)):
        cyl(f"ESP_group_{i}", 0.048, 0.06, (x, 0.2, 0.2), M["chrome"], parent=eb, segments=32)
        cyl(f"ESP_basket_{i}", 0.042, 0.03, (x, 0.155, 0.2), M["chrome"], parent=eb, segments=32)
        box(f"ESP_portafilter_{i}", (0.03, 0.026, 0.17), (x, 0.15, 0.3), M["walnut"], rot=(-6, 0, 0), parent=eb, bevel=0.01, seg=3)
        box(f"ESP_paddle_{i}", (0.02, 0.016, 0.07), (x, 0.395 - 0.005, 0.16), M["walnut"], rot=(0, 25, 0), parent=eb, bevel=0.006)
    for sx in (-1, 1):
        curve_mesh(f"ESP_wand_{sx}", [(sx * 0.31, 0.24, 0.21), (sx * 0.33, 0.17, 0.27), (sx * 0.35, 0.08, 0.3)], 0.006, M["chrome"], parent=eb, res=6)
        cyl(f"ESP_knob_{sx}", 0.022, 0.03, (sx * 0.31, 0.28, 0.24), M["walnut"], rot=(90, 0, 0), parent=eb)
    box("ESP_tray", (0.62, 0.022, 0.17), (0, 0.06, 0.25), M["steel"], parent=eb, bevel=0.003)
    box("ESP_tank_lid", (0.24, 0.012, 0.12), (0.18, 0.4, -0.2), M["chrome"], parent=eb, bevel=0.004)
    box("ESP_badge", (0.12, 0.022, 0.003), (0, 0.375, 0.233), M["brass"], parent=eb, bevel=0.0012)
    for i, x in enumerate((-0.17, 0.17)):
        tube_mesh(f"ESP_group_ring_{i}", [ring_path(0.05, centre=(x, 0.23, 0.2), axis="y", n=32, r=0.004)], M["chrome"], parent=eb, sides=6, closed=True)
    multi_cyl("ESP_feet", [(0.018, 0.02, (sx * 0.33, -0.005, sz * 0.22)) for sx in (-1, 1) for sz in (-1, 1)], M["chrome"], parent=eb)
    multi_box("ESP_grate", [((0.6, 0.004, 0.006), (0, 0.073, 0.18 + k * 0.022)) for k in range(7)], M["chrome"], parent=eb)
    gb = empty("GRINDER", (cx - 0.02, ch, -5.68), rot_y=-90, parent=root)
    box("GRIND_body", (0.2, 0.38, 0.27), (0, 0.19, 0), M["alu_brushed"], parent=gb, bevel=0.03, seg=3)
    box("GRIND_base", (0.22, 0.03, 0.29), (0, 0.015, 0), M["black"], parent=gb, bevel=0.006)
    cyl("GRIND_collar", 0.06, 0.03, (0, 0.395, -0.02), M["chrome"], parent=gb, segments=32)
    cyl("GRIND_hopper", 0.085, 0.25, (0, 0.535, -0.02), M["cooler_glass"], parent=gb, radius2=0.065, segments=32)
    cyl("GRIND_beans", 0.075, 0.13, (0, 0.475, -0.02), M["beans"], parent=gb, radius2=0.07, segments=24)
    cyl("GRIND_lid", 0.07, 0.02, (0, 0.67, -0.02), M["black"], parent=gb, segments=32)
    box("GRIND_spout", (0.05, 0.03, 0.06), (0, 0.2, 0.15), M["black"], parent=gb, bevel=0.006)
    cyl("GRIND_cup", 0.035, 0.05, (0, 0.06, 0.12), M["chrome"], parent=gb)
    # A Kyoto-style cold-drip tower: water in the top globe drips through a brass
    # valve onto the grounds, then down a glass coil into the carafe.
    cb = empty("COLDBREW", (cx - 0.05, ch, -4.41), rot_y=-90, parent=root)
    box("BREW_base", (0.26, 0.03, 0.2), (0, 0.015, 0), M["walnut"], parent=cb, bevel=0.006)
    box("BREW_plate", (0.08, 0.016, 0.002), (0, 0.016, 0.101), M["brass"], parent=cb, bevel=0.001)
    for s in (-1, 1):
        box(f"BREW_post_{s}", (0.03, 0.8, 0.03), (s * 0.105, 0.43, -0.07), M["walnut"], parent=cb, bevel=0.004)
    box("BREW_cap", (0.27, 0.035, 0.05), (0, 0.845, -0.07), M["walnut"], parent=cb, bevel=0.006)
    for i, (y, r) in enumerate(((0.62, 0.062), (0.43, 0.052))):
        box(f"BREW_arm_{i}", (0.24, 0.022, 0.03), (0, y, -0.055), M["walnut"], parent=cb, bevel=0.004)
        tube_mesh(f"BREW_ring_{i}", [ring_path(r, centre=(0, y, r - 0.04), axis="y", n=40, r=0.0045)], M["brass"], parent=cb, sides=6, closed=True)
        box(f"BREW_clamp_{i}", (0.026, 0.016, 0.014), (0, y, -0.036), M["brass"], parent=cb, bevel=0.003)
    # The water globe, its valve and a falling drop.
    gz = 0.062 - 0.04
    globe = [(0.0005, -0.085), (0.006, -0.085), (0.006, -0.045), (0.02, -0.036), (0.045, -0.02), (0.062, 0.0), (0.075, 0.03), (0.08, 0.07), (0.075, 0.11), (0.06, 0.14), (0.035, 0.16), (0.022, 0.166), (0.022, 0.185)]
    lathe("BREW_globe", globe, (0, 0.62, gz), M["glass_vessel"], parent=cb, segments=32)
    lathe("BREW_water", [(0.0005, -0.03), (0.035, -0.024), (0.056, -0.004), (0.07, 0.03), (0.074, 0.075), (0.0005, 0.075)], (0, 0.62, gz), M["water"], parent=cb, segments=32)
    cyl("BREW_valve", 0.009, 0.022, (0, 0.525, gz), M["brass"], parent=cb, segments=16)
    cyl("BREW_valve_stem", 0.0035, 0.034, (0.02, 0.527, gz), M["brass"], rot=(0, 0, 90), parent=cb, segments=10)
    cyl("BREW_valve_knob", 0.009, 0.008, (0.039, 0.527, gz), M["walnut"], rot=(0, 0, 90), parent=cb, segments=16)
    sphere("BREW_drop", 0.0035, (0, 0.5, gz), M["water"], scale=(1, 1.4, 1), parent=cb, segs=(10, 8))
    # The grounds chamber with its filter paper, then the coil and the carafe.
    bz = 0.052 - 0.04
    lathe("BREW_chamber", [(0.003, 0.33), (0.006, 0.345), (0.05, 0.38), (0.052, 0.388), (0.052, 0.5)], (0, 0, bz), M["glass_vessel"], parent=cb, segments=32)
    cyl("BREW_grounds", 0.048, 0.06, (0, 0.415, bz), M["grounds"], parent=cb, segments=32)
    disc("BREW_filter", 0.046, (0, 0.4455, bz), M["paper"], rot=(-90, 0, 0), parent=cb, segments=32)
    coil, turns = [], 3.5
    for k in range(85):
        u = k / 84
        a = u * turns * 2 * math.pi
        coil.append((math.cos(a) * 0.032, 0.325 - u * 0.11, bz + math.sin(a) * 0.032))
    coil += [(-0.012, 0.21, bz), (0, 0.203, bz), (0, 0.195, bz)]
    tube_mesh("BREW_coil_glass", [[(p, 0.0048) for p in coil]], M["glass_vessel"], parent=cb, sides=8)
    tube_mesh("BREW_coil_coffee", [[(p, 0.003) for p in coil]], M["coffee"], parent=cb, sides=6)
    sphere("BREW_drip", 0.004, (0, 0.183, bz), M["coffee"], scale=(1, 1.4, 1), parent=cb, segs=(10, 8))
    carafe = [(0.0005, 0.03), (0.05, 0.03), (0.062, 0.05), (0.066, 0.09), (0.058, 0.13), (0.03, 0.155), (0.022, 0.17), (0.025, 0.178)]
    lathe("BREW_carafe", carafe, (0, 0, bz), M["glass_vessel"], parent=cb, segments=32)
    lathe("BREW_carafe_coffee", [(0.0005, 0.032), (0.048, 0.032), (0.059, 0.05), (0.0625, 0.092), (0.0005, 0.092)], (0, 0, bz), M["coffee"], parent=cb, segments=32)
    # Syrups with pumps, between the cooktop and the tower.
    for k, key in enumerate(("syrup_amber", "syrup_caramel", "syrup_berry")):
        sg = empty(f"SYRUP_{k}", (cx + 0.12, ch, -4.065 - k * 0.075), rot_y=-90, parent=root)
        lathe(f"SYRUP_{k}_glass", [(0.0005, 0.0), (0.029, 0.0), (0.031, 0.006), (0.031, 0.165), (0.025, 0.185), (0.013, 0.2), (0.013, 0.215)], (0, 0, 0), M["glass_vessel"], parent=sg, segments=28)
        lathe(f"SYRUP_{k}_fill", [(0.0005, 0.004), (0.028, 0.004), (0.028, 0.15), (0.0005, 0.15)], (0, 0, 0), M[key], parent=sg, segments=24)
        cyl(f"SYRUP_{k}_label", 0.0318, 0.07, (0, 0.085, 0), M["paper"], parent=sg, segments=28)
        cyl(f"SYRUP_{k}_band", 0.0322, 0.012, (0, 0.085, 0), M[key], parent=sg, segments=28)
        cyl(f"SYRUP_{k}_collar", 0.016, 0.02, (0, 0.222, 0), M["black"], parent=sg, segments=20)
        cyl(f"SYRUP_{k}_stem", 0.004, 0.036, (0, 0.25, 0), M["chrome"], parent=sg, segments=12)
        box(f"SYRUP_{k}_head", (0.022, 0.016, 0.03), (0, 0.275, 0.004), M["black"], parent=sg, bevel=0.004)
        box(f"SYRUP_{k}_nozzle", (0.006, 0.006, 0.036), (0, 0.277, 0.033), M["black"], rot=(8, 0, 0), parent=sg)
    # Around the machine, kept tidy: a knock box, a tamping station with tamper and
    # distributor, two milk pitchers, bean canisters, and a floating cup shelf above.
    kb = empty("KNOCKBOX", (cx - 0.04, ch, -5.455), rot_y=-90, parent=root)
    box("KNOCK_body", (0.15, 0.11, 0.12), (0, 0.055, 0), M["rubber"], parent=kb, bevel=0.012, seg=3)
    box("KNOCK_well", (0.12, 0.004, 0.09), (0, 0.111, 0), M["beans"], parent=kb)
    cyl("KNOCK_bar", 0.011, 0.14, (0, 0.104, 0), M["chrome"], rot=(0, 0, 90), parent=kb, segments=16)
    ts = empty("TAMP_STATION", (cx - 0.04, ch, -5.98), rot_y=-90, parent=root)
    box("TAMP_mat", (0.22, 0.012, 0.15), (0, 0.006, 0), M["rubber"], parent=ts, bevel=0.004)
    cyl("TAMP_base", 0.0293, 0.02, (-0.05, 0.022, 0.0), M["steel"], parent=ts, segments=32)
    cyl("TAMP_handle", 0.017, 0.055, (-0.05, 0.06, 0.0), M["walnut"], parent=ts, segments=24, radius2=0.012)
    sphere("TAMP_knob", 0.021, (-0.05, 0.095, 0.0), M["walnut"], scale=(1, 0.8, 1), parent=ts)
    cyl("TAMP_leveler", 0.0295, 0.022, (0.045, 0.023, 0.02), M["graphite"], parent=ts, segments=32)
    cyl("TAMP_leveler_top", 0.024, 0.006, (0.045, 0.037, 0.02), M["chrome"], parent=ts, segments=32)
    pitcher = [(0.0005, 0.0), (0.037, 0.0), (0.039, 0.01), (0.04, 0.05), (0.036, 0.085), (0.032, 0.1), (0.033, 0.104)]
    for i, (z, x_off) in enumerate(((-6.17, 0.07), (-6.12, -0.05))):
        pg = empty(f"PITCHER_{i}", (cx + x_off, ch, z), rot_y=-90 + i * 40, parent=root)
        lathe(f"PITCHER_{i}_body", pitcher, (0, 0, 0), M["steel"], parent=pg, segments=32)
        box(f"PITCHER_{i}_spout", (0.016, 0.012, 0.022), (0, 0.098, 0.034), M["steel"], rot=(25, 0, 0), parent=pg, bevel=0.004)
        tube_mesh(f"PITCHER_{i}_handle", [[((0, 0.088, -0.035), 0.004), ((0, 0.085, -0.058), 0.004), ((0, 0.045, -0.058), 0.004), ((0, 0.03, -0.037), 0.004)]], M["steel"], parent=pg, sides=6)
    for i, z in enumerate((-6.05, -6.17)):
        cyl(f"CANISTER_{i}", 0.05, 0.15, (c["x1"] - 0.08, ch + 0.075, z + 0.02), M["ceramic_dark"], parent=root, segments=32, bevel=0.004)
        cyl(f"CANISTER_lid_{i}", 0.051, 0.022, (c["x1"] - 0.08, ch + 0.161, z + 0.02), M["walnut"], parent=root, segments=32, bevel=0.004)
    sh_x, sh_y, sh_z0, sh_z1 = c["x1"] - 0.13, 1.7, -5.85, -4.3
    box("KIT_coffee_shelf", (0.26, 0.035, sh_z1 - sh_z0), (sh_x, sh_y, (sh_z0 + sh_z1) / 2), M["walnut"], parent=root, bevel=0.003)
    box("EMI_kitchen_shelf_coffee", (0.02, 0.006, sh_z1 - sh_z0 - 0.1), (sh_x - 0.11, sh_y - 0.021, (sh_z0 + sh_z1) / 2), M["led_warm"], parent=root)
    cups = [(0.04, 0.075, (sh_x, sh_y + 0.055, sh_z0 + 0.12 + k * 0.11)) for k in range(6)]
    multi_cyl("KIT_shelf_cups", cups, M["ceramic"], parent=root, segments=24)
    tube_mesh("KIT_shelf_cup_handles", [[((sh_x - 0.04, sh_y + 0.075, z), 0.004), ((sh_x - 0.058, sh_y + 0.065, z), 0.004), ((sh_x - 0.058, sh_y + 0.045, z), 0.004), ((sh_x - 0.04, sh_y + 0.04, z), 0.004)] for _, _, (_, _, z) in cups], M["ceramic"], parent=root, sides=5)
    jar = [(0.0005, 0.0), (0.045, 0.0), (0.047, 0.01), (0.047, 0.15), (0.035, 0.16), (0.035, 0.175)]
    for i in range(3):
        z = sh_z0 + 0.86 + i * 0.13
        lathe(f"KIT_bean_jar_{i}", jar, (sh_x, sh_y + 0.0175, z), M["glass_clear"], parent=root, segments=28)
        cyl(f"KIT_bean_fill_{i}", 0.043, 0.1 - i * 0.025, (sh_x, sh_y + 0.0175 + (0.1 - i * 0.025) / 2 + 0.004, z), M["beans"], parent=root, segments=24)
        cyl(f"KIT_bean_lid_{i}", 0.038, 0.02, (sh_x, sh_y + 0.2, z), M["walnut"], parent=root, segments=24)
    cyl("KIT_herb_pot", 0.05, 0.09, (sh_x, sh_y + 0.0625, sh_z1 - 0.09), M["terracotta"], parent=root, segments=24, radius2=0.055)
    rand = random.Random(4)
    blob("KIT_herb", [dict(co=(sh_x + rand.uniform(-0.04, 0.04), sh_y + 0.12 + rand.uniform(0, 0.08), sh_z1 - 0.09 + rand.uniform(-0.04, 0.04)), r=rand.uniform(0.022, 0.03)) for _ in range(12)], M["leaf_olive"], parent=root, resolution=0.005)
    # Tall fridge with French doors and a freezer drawer.
    fx, fz = (fr["x0"] + fr["x1"]) / 2, (fr["z0"] + fr["z1"]) / 2
    fw, fl_, fh = fr["x1"] - fr["x0"], fr["z1"] - fr["z0"], fr["height"]
    box("FRIDGE_body", (fw, fh, fl_), (fx, fh / 2, fz), M["steel"], parent=root, bevel=0.01)
    box("FRIDGE_split_v", (0.004, fh * 0.62, 0.006), (fr["x0"] - 0.001, fh * 0.69, fz), M["black"], parent=root)
    box("FRIDGE_split_h", (0.004, 0.006, fl_ - 0.02), (fr["x0"] - 0.001, fh * 0.38, fz), M["black"], parent=root)
    for s in (-1, 1):
        box(f"FRIDGE_handle_{s}", (0.03, 0.75, 0.02), (fr["x0"] - 0.03, fh * 0.7, fz + s * 0.06), M["chrome"], parent=root, bevel=0.005)
    box("FRIDGE_handle_drawer", (0.03, 0.02, 0.55), (fr["x0"] - 0.03, fh * 0.34, fz), M["chrome"], parent=root, bevel=0.005)
    # Long island: marble waterfall top, fluted walnut body, seating overhang to the west.
    ix, iz = (isl["x0"] + isl["x1"]) / 2, (isl["z0"] + isl["z1"]) / 2
    iw, il, ih = isl["x1"] - isl["x0"], isl["z1"] - isl["z0"], isl["height"]
    box("ISL_top", (iw, 0.04, il), (ix, ih - 0.02, iz), M["marble"], parent=root, bevel=0.004)
    for s in (-1, 1):
        box(f"ISL_waterfall_{s}", (iw, ih - 0.04, 0.04), (ix, (ih - 0.04) / 2, iz + s * (il / 2 - 0.02)), M["marble"], parent=root, bevel=0.003)
    box("ISL_body", (iw - 0.25, ih - 0.06, il - 0.12), (ix + 0.12, (ih - 0.06) / 2, iz), M["walnut"], parent=root)
    flutes = [((0.012, ih - 0.12, 0.03), (isl["x0"] + 0.245 - 0.004, (ih - 0.06) / 2, isl["z0"] + 0.1 + k * 0.06)) for k in range(int((il - 0.2) / 0.06))]
    multi_box("ISL_flutes", flutes, M["walnut_dark"], parent=root)
    box("EMI_island_led", (0.012, 0.006, il - 0.2), (isl["x0"] + 0.03, ih - 0.045, iz), M["led_warm"], parent=root)
    for i, (sx_, sz_) in enumerate(it["stools"]):
        st = empty(f"STOOL_{i}", (sx_, 0, sz_), rot_y=90, parent=root)
        cyl(f"STOOL_seat_{i}", 0.2, 0.06, (0, 0.66, 0), M["leather"], parent=st, bevel=0.02)
        box(f"STOOL_back_{i}", (0.34, 0.12, 0.04), (0, 0.78, -0.17), M["leather"], rot=(-8, 0, 0), parent=st, bevel=0.02, seg=3)
        for k in range(4):
            a = math.radians(45 + k * 90)
            curve_mesh(f"STOOL_leg_{i}_{k}", [(math.sin(a) * 0.12, 0.63, math.cos(a) * 0.12), (math.sin(a) * 0.19, 0.0, math.cos(a) * 0.19)], 0.011, M["black"], parent=st, res=2)
        curve_mesh(f"STOOL_ring_{i}", [(math.sin(math.radians(a)) * 0.165, 0.25, math.cos(math.radians(a)) * 0.165) for a in range(0, 360, 45)], 0.008, M["brass"], parent=st, closed=True)
    for i, (px, pz) in enumerate(it["pendants"]):
        drop = H - 2.3
        cyl(f"KIT_pendant_cord_{i}", 0.003, drop, (px, H - drop / 2, pz), M["black"], parent=root, segments=8)
        cyl(f"KIT_pendant_cap_{i}", 0.04, 0.05, (px, 2.32, pz), M["brass"], parent=root)
        sphere(f"EMI_kitchen_pendant_{i}", 0.13, (px, 2.18, pz), M["led_warm"], parent=root)


def build_world_clocks(it, root):
    """Three big station-style wall clocks with a lit label under each."""
    r = it.get("radius", 0.2)
    for ck in it["clocks"]:
        city, x = ck["city"], ck["x"]
        cyl(f"CLOCK_rim_{city}", r, 0.06, (x, 0, 0.0), M["walnut_dark"], rot=(90, 0, 0), parent=root, segments=72)
        cyl(f"CLOCK_bezel_{city}", r - 0.012, 0.004, (x, 0, 0.0305), M["brass"], rot=(90, 0, 0), parent=root, segments=72)
        disc(f"CLOCK_face_{city}", r - 0.022, (x, 0, 0.0335), M["white"], parent=root)
        for hand, length, width, m in (("h", 0.55 * r, 0.024, M["black"]), ("m", 0.8 * r, 0.015, M["black"]), ("s", 0.86 * r, 0.005, M["bike_red"])):
            pivot = empty(f"CLOCK_{hand}_{city}", (x, 0, 0.037 + {"h": 0, "m": 0.003, "s": 0.006}[hand]), parent=root)
            box(f"CLOCK_{hand}_{city}_bar", (width, length, 0.003), (0, length / 2 - 0.03, 0), m, parent=pivot)
        cyl(f"CLOCK_cap_{city}", 0.014, 0.012, (x, 0, 0.046), M["brass"], rot=(90, 0, 0), parent=root)
        box(f"CLOCK_label_back_{city}", (0.64, 0.13, 0.012), (x, -(r + 0.105), 0.004), M["black"], parent=root, bevel=0.004)
        plane(f"CLOCK_label_{city}", 0.6, 0.11, (x, -(r + 0.105), 0.0105), M["white"], parent=root)


def build_sofa(it, root):
    w, d = it["width"], it["depth"]
    arm = 0.2
    ch = it.get("chaise")
    chaise_side = (-1 if ch["x"] < 0 else 1) if ch else 0
    for sx in (-1, 1):
        for sz in (-1, 1):
            cyl(f"SOFA_leg_{sx}_{sz}", 0.02, 0.06, (sx * (w / 2 - 0.08), 0.03, sz * (d / 2 - 0.08)), M["black"], parent=root)
    box("SOFA_base", (w, 0.22, d), (0, 0.17, 0), M["fabric"], parent=root, bevel=0.03, seg=3)
    box("SOFA_back", (w, 0.5, 0.18), (0, 0.53, -d / 2 + 0.09), M["fabric"], parent=root, bevel=0.04, seg=3)
    for s in (-1, 1):
        if s == chaise_side:
            continue
        box(f"SOFA_arm_{s}", (arm, 0.5, d), (s * (w / 2 - arm / 2), 0.31, 0), M["fabric"], parent=root, bevel=0.05, seg=3)
    inner = w - 2 * arm
    n = 3
    cw = inner / n
    for i in range(n):
        x = -inner / 2 + cw * (i + 0.5)
        if not (ch and abs(x - ch["x"]) < cw / 2 + 0.1):
            box(f"SOFA_seat_{i}", (cw - 0.01, 0.16, d - 0.24), (x, 0.36, 0.08), M["fabric"], parent=root, bevel=0.045, seg=3)
        box(f"SOFA_cushion_{i}", (cw - 0.02, 0.42, 0.2), (x, 0.66, -d / 2 + 0.26), M["fabric"], rot=(-9, 0, 0), parent=root, bevel=0.06, seg=3)
    if ch:
        cz = d / 2 + ch["length"] / 2
        box("SOFA_chaise_base", (ch["width"], 0.22, ch["length"]), (ch["x"], 0.17, cz), M["fabric"], parent=root, bevel=0.03, seg=3)
        box("SOFA_chaise_seat", (ch["width"] - 0.02, 0.16, ch["length"] + d - 0.26), (ch["x"], 0.36, cz - (d - 0.26) / 2 + 0.02), M["fabric"], parent=root, bevel=0.045, seg=3)
    # Throw pillows sit on the seat and lean on the back cushions: a pair at the
    # arm end, a pair in the chaise corner, overlapping a little like real ones.
    seat_top = 0.44
    back_face = -d / 2 + 0.26 + 0.11
    pillows = [
        ("a", w / 2 - arm - 0.24, 0.46, "pillow", (-16, -12, 5)),
        ("b", w / 2 - arm - 0.6, 0.42, "pillow2", (-14, 6, -4)),
        ("c", -w / 2 + 0.36, 0.46, "pillow2", (-16, 12, -5)),
        ("d", -w / 2 + 0.74, 0.42, "pillow", (-14, -6, 4)),
    ]
    for key, x, size, m, rot in pillows:
        box(f"SOFA_pillow_{key}", (size, size, 0.14), (x, seat_top + size / 2 - 0.02, back_face + 0.07), M[m], rot=rot, parent=root, bevel=0.065, seg=4)
    box("SOFA_throw", (0.5, 0.02, 0.7), (w / 2 - 0.45, 0.45, 0.1), M["oak_light"], rot=(0, 12, 0), parent=root, bevel=0.01)


def build_console_table(it, root):
    w, h, d = it["size"]
    box("CONS_top", (w, 0.035, d), (0, h - 0.0175, 0), M["walnut"], parent=root, bevel=0.005)
    for s in (-1, 1):
        box(f"CONS_slab_{s}", (0.035, h - 0.035, d - 0.04), (s * (w / 2 - 0.25), (h - 0.035) / 2, 0), M["walnut"], parent=root)
    box("CONS_shelf", (w - 0.55, 0.025, d - 0.06), (0, 0.16, 0), M["walnut"], parent=root)
    # A few things on top: a vase with branches, a stack of books, a sculpture, a bowl.
    cyl("DEC_vase", 0.06, 0.28, (-0.95, h + 0.14, 0), M["ceramic_dark"], parent=root, radius2=0.035)
    for i, (dx, dz, tilt) in enumerate(((0.0, 0.0, 6), (0.04, -0.02, -14), (-0.03, 0.03, 18))):
        curve_mesh(f"DEC_branch_{i}", [(-0.95, h + 0.25, 0), (-0.95 + dx * 3 + math.sin(math.radians(tilt)) * 0.2, h + 0.55, dz * 3), (-0.95 + dx * 5 + math.sin(math.radians(tilt)) * 0.35, h + 0.78, dz * 5)], 0.004, M["walnut_dark"], parent=root, res=4)
    for i, (bh, m) in enumerate(((0.03, M["book_c"]), (0.025, M["book_e"]), (0.035, M["book_a"]))):
        box(f"DEC_book_{i}", (0.26 - i * 0.02, bh, 0.19), (0.1, h + 0.015 + sum((0.03, 0.025, 0.035)[:i]) + bh / 2 - 0.015, 0), m, rot=(0, i * 7 - 6, 0), parent=root, bevel=0.002)
    sphere("DEC_sculpture", 0.08, (0.6, h + 0.08, 0), M["brass"], scale=(1, 1.25, 1), parent=root)
    cyl("DEC_bowl", 0.11, 0.06, (1.1, h + 0.03, 0), M["ceramic"], parent=root, radius2=0.07)


def build_rug(it, root):
    w, d = it["size"]
    # The lounge rug keeps the name the site paints; others get their own.
    top = "RUG_top" if it["id"] == "rug-lounge" else f"RUG_{it['id']}"
    box(f"RUGBASE_{it['id']}", (w, 0.008, d), (0, 0.004, 0), M["rug"], parent=root)
    plane(top, w, d, (0, 0.0085, 0), M["rug"], rot=(-90, 0, 0), parent=root)
    if it.get("style") == "persian":
        # Knotted wool fringe along both short ends.
        threads = []
        for sx in (-1, 1):
            z = -d / 2 + 0.01
            while z < d / 2 - 0.01:
                threads.append(((0.075, 0.003, 0.0055), (sx * (w / 2 + 0.036), 0.002, z), 0))
                z += 0.012
        multi_box("RUG_fringe", threads, M["fringe"], parent=root)


def build_coffee_table_round(it, root):
    """A round travertine coffee table: a thick honed top floating on a brass
    shadow ring over a fluted drum. The site paints the stone on CTBL_top."""
    r, h = it["radius"], it["height"]
    top_t = 0.065
    cyl("CTBL_slab", r, top_t, (0, h - top_t / 2, 0), M["travertine"], parent=root, segments=96, bevel=0.012)
    disc("CTBL_top", r - 0.01, (0, h + 0.0006, 0), M["travertine"], rot=(-90, 0, 0), parent=root, segments=96)
    cyl("CTBL_ring", r * 0.6, 0.014, (0, h - top_t - 0.007, 0), M["brass"], parent=root, segments=72)
    dh = h - top_t - 0.014
    dr = r * 0.56
    cyl("CTBL_drum", dr, dh, (0, dh / 2, 0), M["travertine"], parent=root, segments=72)
    n = 30
    flutes = [(0.021, dh, (math.cos(a) * dr, dh / 2, math.sin(a) * dr)) for a in [k * 2 * math.pi / n for k in range(n)]]
    multi_cyl("CTBL_flutes", flutes, M["travertine"], parent=root, segments=10)


def build_side_table_round(it, root):
    r, h = it["radius"], it["height"]
    cyl("STBL_top", r, 0.03, (0, h - 0.015, 0), M["marble"], parent=root, segments=48, bevel=0.004)
    cyl("STBL_stem", 0.03, h - 0.04, (0, (h - 0.03) / 2, 0), M["brass"], parent=root)
    cyl("STBL_foot", 0.2, 0.02, (0, 0.01, 0), M["black"], parent=root, segments=40)
    if it.get("decor") == "bonsai":
        bonsai("BONSAI", (0, h, 0), root)
    else:
        cyl("STBL_cup", 0.04, 0.08, (0.08, h + 0.04, 0.04), M["ceramic"], parent=root)


def build_media_console(it, root):
    """A long, low ash console with rounded ends, a reeded front and a white
    marble top, floating on a recessed black plinth."""
    w, h, d = it["size"]
    plinth = 0.07
    body_h = h - plinth - 0.025
    straight = w - d
    box("MEDIA_plinth", (straight, plinth, d - 0.1), (0, plinth / 2, -0.01), M["black"], parent=root)
    box("MEDIA_body", (straight, body_h, d), (0, plinth + body_h / 2, 0), M["ash"], parent=root)
    for sx in (-1, 1):
        cyl(f"MEDIA_end_{sx}", d / 2, body_h, (sx * straight / 2, plinth + body_h / 2, 0), M["ash"], parent=root, segments=40)
        cyl(f"MEDIA_top_end_{sx}", d / 2 + 0.008, 0.025, (sx * straight / 2, h - 0.0125, 0), M["marble"], parent=root, segments=40)
    box("MEDIA_top", (straight, 0.025, d + 0.016), (0, h - 0.0125, 0), M["marble"], parent=root)
    reeds = [(0.0085, body_h - 0.03, (x, plinth + body_h / 2, d / 2)) for x in [-straight / 2 + 0.02 + k * 0.022 for k in range(int((straight - 0.04) / 0.022) + 1)]]
    multi_cyl("MEDIA_reeds", reeds, M["ash"], parent=root, segments=8)
    box("MEDIA_niche", (0.7, 0.12, 0.02), (0, plinth + body_h / 2, d / 2 + 0.006), M["walnut_dark"], parent=root)
    box("EMI_media_led", (straight - 0.1, 0.006, 0.01), (0, plinth - 0.004, d / 2 - 0.06), M["led_warm"], parent=root)


def build_tv(it, root):
    w, h = it["size"]
    plane("EMI_tv_bias", w + 0.14, h + 0.12, (0, 0, -0.03), M["led_cool"], parent=root)
    box("TV_panel", (w + 0.02, h + 0.02, 0.03), (0, 0, 0), M["black"], parent=root, bevel=0.003)
    plane("SCR_tv", w, h, (0, 0, 0.0155), M["screen"], parent=root)


def build_game_console(it, root):
    box("GAME_body", (0.1, 0.36, 0.27), (0, 0.18, 0), M["console"], parent=root, bevel=0.02, seg=3)
    box("GAME_core", (0.104, 0.3, 0.2), (0, 0.18, -0.01), M["black"], parent=root, bevel=0.01)
    box("EMI_game_light", (0.006, 0.22, 0.004), (0, 0.19, 0.137), M["led_cool"], parent=root)


def build_controller(it, root):
    box("PAD_body", (0.15, 0.035, 0.08), (0, 0.018, 0), M["black"], parent=root, bevel=0.015, seg=3)
    for s in (-1, 1):
        sphere(f"PAD_grip_{s}", 0.03, (s * 0.058, 0.014, 0.03), M["black"], scale=(1, 0.8, 1.4), parent=root)


def build_floor_lamp(it, root):
    cyl("LAMP_base", 0.16, 0.03, (0, 0.015, 0), M["black"], parent=root)
    cyl("LAMP_pole", 0.012, 1.5, (0, 0.78, 0), M["black"], parent=root)
    cyl("EMI_lamp_shade", 0.22, 0.32, (0, 1.6, 0), M["shade"], parent=root, segments=40, radius2=0.17)


def multi_sphere(name, parts, material, parent=None, segs=(10, 7)):
    """Many small spheres (radius, centre) in one mesh: olives, pebbles."""
    bm = bmesh.new()
    for r, (x, y, z) in parts:
        geom = bmesh.ops.create_uvsphere(bm, u_segments=segs[0], v_segments=segs[1], radius=r)
        c = B(x, y, z)
        for v in geom["verts"]:
            v.co = Vector((v.co.x + c.x, v.co.y + c.y, v.co.z + c.z))
    return _finish(name, bm, material, (0, 0, 0), (0, 0, 0), parent, smooth=True)


def _soil(root, r, y, rand, pebbles=0):
    cyl("PLANT_soil", r, 0.01, (0, y, 0), M["soil"], parent=root, segments=32)
    if pebbles:
        multi_sphere("PLANT_pebbles", [(rand.uniform(0.008, 0.014), (math.cos(a) * rr, y + 0.006, math.sin(a) * rr)) for a, rr in [(rand.uniform(0, 6.3), rand.uniform(0.03, r * 0.9)) for _ in range(pebbles)]], M["white"], parent=root)


def plant_fiddle(root, rand):
    """Fiddle-leaf fig: one tall stem and a side branch, big glossy violin-shaped
    leaves spiralling up, in a tall ribbed white pot."""
    cyl("PLANT_pot", 0.2, 0.5, (0, 0.25, 0), M["pot_white"], parent=root, segments=48, radius2=0.21)
    multi_cyl("PLANT_pot_ribs", [(0.011, 0.46, (math.cos(a) * 0.205, 0.25, math.sin(a) * 0.205)) for a in [k * 2 * math.pi / 30 for k in range(30)]], M["pot_white"], parent=root, segments=8)
    _soil(root, 0.19, 0.49, rand)
    trunk = [((0.0, 0.48, 0.0), 0.026), ((0.03, 0.8, 0.01), 0.022), ((0.02, 1.15, 0.03), 0.017), ((-0.02, 1.45, 0.0), 0.012), ((-0.03, 1.72, -0.02), 0.007)]
    branch = [((0.025, 1.08, 0.025), 0.013), ((0.12, 1.25, 0.08), 0.01), ((0.2, 1.42, 0.1), 0.006)]
    tube_mesh("PLANT_trunk", [trunk, branch], M["bark"], parent=root, sides=8)
    leaves = []
    for stem, t0, count in ((trunk, 0.45, 26), (branch, 0.25, 12)):
        pts = [Vector(p) for p, _ in stem]
        for k in range(count):
            f = t0 + (1 - t0) * k / (count - 1)
            seg = min(int(f * (len(pts) - 1)), len(pts) - 2)
            lf = f * (len(pts) - 1) - seg
            p = pts[seg].lerp(pts[seg + 1], lf)
            a = k * 2.4 + rand.uniform(-0.2, 0.2)
            out = Vector((math.cos(a), rand.uniform(0.35, 0.75), math.sin(a))).normalized()
            size = 0.36 - 0.12 * f + rand.uniform(-0.03, 0.03)
            leaves.append(dict(base=tuple(p + Vector((math.cos(a), 0, math.sin(a))) * 0.03), dir=tuple(out), length=size, width=size * 0.7,
                               shape="fiddle", fold=0.12, droop=0.9, roll=rand.uniform(-0.25, 0.25), stations=10))
    foliage("PLANT_leaves", leaves, M["leaf_fiddle"], parent=root)


def plant_olive(root, rand):
    """Olive tree: three stems twisting round each other, branching into a loose crown
    of narrow silver-green leaves with a few olives, in an aged terracotta pot."""
    prof = [(0.21, 0.0), (0.24, 0.05), (0.28, 0.3), (0.3, 0.48), (0.32, 0.5), (0.33, 0.55), (0.3, 0.56), (0.29, 0.52)]
    lathe("PLANT_pot", prof, (0, 0, 0), M["terracotta"], parent=root, segments=48)
    cyl("PLANT_pot_floor", 0.21, 0.02, (0, 0.01, 0), M["terracotta"], parent=root, segments=48)
    _soil(root, 0.29, 0.5, rand, pebbles=26)
    stems, twigs = [], []
    for s in range(3):
        a0 = s * 2.1
        path = []
        for k in range(9):
            t = k / 8
            a = a0 + t * 2.4
            r_off = 0.035 * (1 - t * 0.5)
            path.append(((math.cos(a) * r_off, 0.5 + t * 0.62, math.sin(a) * r_off), 0.034 - t * 0.016))
        stems.append(path)
    tips = []
    for b in range(9):
        a = b * 0.7 + rand.uniform(-0.2, 0.2)
        start = Vector((math.cos(a) * 0.03, 1.02 + rand.uniform(0, 0.14), math.sin(a) * 0.03))
        reach = rand.uniform(0.32, 0.55)
        mid = start + Vector((math.cos(a) * reach * 0.5, rand.uniform(0.18, 0.3), math.sin(a) * reach * 0.5))
        end = start + Vector((math.cos(a) * reach, rand.uniform(0.45, 0.85), math.sin(a) * reach))
        stems.append([(tuple(start), 0.016), (tuple(mid), 0.01), (tuple(end), 0.004)])
        for _ in range(4):
            f = rand.uniform(0.35, 0.95)
            p = start.lerp(mid, f * 2) if f < 0.5 else mid.lerp(end, (f - 0.5) * 2)
            aa = a + rand.uniform(-1.1, 1.1)
            q = p + Vector((math.cos(aa) * 0.18, rand.uniform(0.03, 0.16), math.sin(aa) * 0.18))
            twigs.append([(tuple(p), 0.004), (tuple(q), 0.0015)])
            tips.append((p, q))
        tips.append((mid, end))
    tube_mesh("PLANT_trunk", stems, M["bark_olive"], parent=root, sides=8)
    tube_mesh("PLANT_twigs", twigs, M["bark_olive"], parent=root, sides=4)
    leaves, olives = [], []
    for p, q in tips:
        d = q - p
        for k in range(30):
            f = 0.12 + 0.88 * k / 29
            base = p.lerp(q, f)
            side = d.cross(Vector((0, 1, 0)))
            if side.length < 1e-4:
                side = Vector((1, 0, 0))
            side.normalize()
            s = 1 if k % 2 else -1
            direction = (d.normalized() * 0.55 + side * s * 0.8 + Vector((0, rand.uniform(-0.3, 0.3), 0))).normalized()
            ln = rand.uniform(0.065, 0.09)
            leaves.append(dict(base=tuple(base), dir=tuple(direction), length=ln, width=ln * 0.26, shape="olive", fold=0.12, droop=0.6, roll=rand.uniform(-0.6, 0.6), stations=4))
        if rand.random() < 0.45:
            c = p.lerp(q, rand.uniform(0.4, 0.9)) + Vector((0, -0.015, 0))
            olives += [(0.0075, tuple(c + Vector((rand.uniform(-0.012, 0.012), rand.uniform(-0.01, 0.0), rand.uniform(-0.012, 0.012))))) for _ in range(rand.randint(2, 4))]
    foliage("PLANT_leaves", leaves, M["leaf_olive"], parent=root)
    multi_sphere("PLANT_olives", olives, M["olive_fruit"], parent=root, segs=(8, 6))


def plant_bird_of_paradise(root, rand):
    """Bird of paradise: tall stems fanning out of a wide black bowl, each ending in a
    huge paddle leaf, some torn along the veins the way old leaves split."""
    prof = [(0.2, 0.0), (0.26, 0.08), (0.31, 0.22), (0.34, 0.38), (0.345, 0.42), (0.32, 0.425), (0.315, 0.39)]
    lathe("PLANT_pot", prof, (0, 0, 0), M["pot_black"], parent=root, segments=48)
    cyl("PLANT_pot_floor", 0.2, 0.02, (0, 0.01, 0), M["pot_black"], parent=root, segments=48)
    _soil(root, 0.315, 0.39, rand)
    petioles, leaves = [], []
    for k in range(10):
        spread = (k - 4.5) / 4.5
        a = spread * 0.75 + rand.uniform(-0.12, 0.12)
        z = rand.uniform(-0.12, 0.12)
        height = rand.uniform(0.75, 1.35) * (1 - abs(spread) * 0.25)
        base = Vector((spread * 0.06, 0.4, z * 0.3))
        top = base + Vector((math.sin(a) * height * 0.45, height, z))
        petioles.append([(tuple(base), 0.013), (tuple(base.lerp(top, 0.5) + Vector((math.sin(a) * 0.05, 0, 0))), 0.011), (tuple(top), 0.008)])
        direction = Vector((math.sin(a) * 1.1, 1.0, z * 2)).normalized()
        ln = rand.uniform(0.7, 1.0)
        tears = {(i, c) for i in range(2, 13) for c in (0, 3) if rand.random() < 0.28}
        leaves.append(dict(base=tuple(top), dir=tuple(direction), up=(0, 0, 1), length=ln, width=ln * 0.32, shape="paddle", fold=0.16, droop=0.22,
                           twist=rand.uniform(-0.3, 0.3), roll=rand.uniform(-0.4, 0.4), stations=14, tears=tears))
    tube_mesh("PLANT_stems", petioles, M["leaf_bop"], parent=root, sides=6)
    foliage("PLANT_leaves", leaves, M["leaf_bop"], parent=root)
    tube_mesh("PLANT_new_leaf", [[((0.0, 0.42, 0.0), 0.012), ((0.01, 1.0, 0.0), 0.012), ((0.02, 1.45, 0.01), 0.003)]], M["leaf_bop"], parent=root, sides=6)


def plant_monstera(root, rand):
    """Monstera: long stalks arching out of a woven basket, big heart-shaped leaves
    with their split edges, round a mossy climbing pole."""
    cyl("PLANT_pot", 0.245, 0.38, (0, 0.19, 0), M["rattan"], parent=root, segments=48, radius2=0.26)
    tube_mesh("PLANT_weave", [ring_path(0.247 + 0.015 * k / 12, centre=(0, 0.02 + k * 0.029, 0), axis="y", n=48, r=0.006) for k in range(13)], M["rattan"], parent=root, sides=5, closed=True)
    cyl("PLANT_liner", 0.24, 0.02, (0, 0.37, 0), M["pot_black"], parent=root, segments=48)
    _soil(root, 0.235, 0.37, rand)
    cyl("PLANT_pole", 0.028, 1.0, (0, 0.85, 0), M["bark"], parent=root, segments=10)
    stalks, leaves = [], []
    for k in range(14):
        a = k * 2.4 + rand.uniform(-0.3, 0.3)
        out = Vector((math.cos(a), 0, math.sin(a)))
        reach = rand.uniform(0.3, 0.55)
        h = rand.uniform(0.45, 0.95)
        base = Vector((0, 0.38, 0)) + out * 0.04
        mid = base + out * reach * 0.5 + Vector((0, h * 0.9, 0))
        end = base + out * reach + Vector((0, h, 0))
        stalks.append([(tuple(base), 0.009), (tuple(mid), 0.008), (tuple(end), 0.006)])
        young = k > 10
        ln = rand.uniform(0.26, 0.32) if young else rand.uniform(0.4, 0.52)
        direction = (out + Vector((0, -0.25, 0))).normalized()
        leaves.append(dict(base=tuple(end), dir=tuple(direction), length=ln, width=ln * 0.92, shape="heart", fold=0.08, droop=0.35,
                           roll=rand.uniform(-0.25, 0.25), stations=14, slits=0 if young else 2))
    tube_mesh("PLANT_stalks", stalks, M["leaf_monstera"], parent=root, sides=5)
    foliage("PLANT_leaves", leaves, M["leaf_monstera"], parent=root)


def plant_snake(root, rand):
    """Snake plant: stiff, banded sword leaves, slightly twisted, in a tall concrete box."""
    box("PLANT_pot", (0.3, 0.44, 0.3), (0, 0.22, 0), M["concrete_pot"], parent=root, bevel=0.01)
    box("PLANT_soil", (0.27, 0.01, 0.27), (0, 0.435, 0), M["soil"], parent=root)
    leaves = []
    for k in range(15):
        a = k * 2.4
        r_off = rand.uniform(0.0, 0.08)
        base = Vector((math.cos(a) * r_off, 0.43, math.sin(a) * r_off))
        tilt = rand.uniform(0.05, 0.28)
        direction = Vector((math.cos(a) * tilt, 1.0, math.sin(a) * tilt)).normalized()
        ln = rand.uniform(0.55, 0.95)
        leaves.append(dict(base=tuple(base), dir=tuple(direction), up=(math.cos(a + 1.6), 0, math.sin(a + 1.6)), length=ln, width=rand.uniform(0.06, 0.085),
                           shape="sword", fold=0.3, droop=0.02, twist=rand.uniform(0.3, 0.9), stations=10))
    foliage("PLANT_leaves", leaves, M["leaf_snake"], parent=root)


PLANTS = {"fiddle": plant_fiddle, "olive": plant_olive, "bird-of-paradise": plant_bird_of_paradise, "monstera": plant_monstera, "snake": plant_snake}


def build_plant(it, root):
    """Every indoor tree is its own species: fiddle-leaf fig, olive, bird of paradise,
    monstera, snake plant."""
    PLANTS[it.get("species", "fiddle")](root, random.Random(sum(ord(c) for c in it["id"])))


def bonsai(name, pos, parent):
    """A juniper bonsai: a twisting trunk, three branches and cloud-pruned foliage pads,
    in a shallow blue glazed tray on moss."""
    g = empty(name, pos, rot_y=20, parent=parent)
    g.scale = (1.45, 1.45, 1.45)
    box(f"{name}_pot", (0.24, 0.045, 0.16), (0, 0.03, 0), M["glaze_blue"], parent=g, bevel=0.008)
    for sx in (-1, 1):
        for sz in (-1, 1):
            box(f"{name}_foot_{sx}_{sz}", (0.03, 0.008, 0.02), (sx * 0.09, 0.004, sz * 0.055), M["glaze_blue"], parent=g)
    box(f"{name}_moss", (0.22, 0.006, 0.14), (0, 0.054, 0), M["leaf_juniper"], parent=g)
    trunk = [((0.0, 0.05, 0.0), 0.022), ((0.03, 0.1, 0.01), 0.018), ((-0.01, 0.16, 0.0), 0.014), ((0.02, 0.22, -0.01), 0.01), ((0.0, 0.27, 0.0), 0.006)]
    branches = [[((0.025, 0.11, 0.01), 0.01), ((0.1, 0.14, 0.02), 0.006), ((0.14, 0.15, 0.03), 0.003)],
                [((-0.008, 0.165, 0.0), 0.009), ((-0.08, 0.2, -0.02), 0.005), ((-0.12, 0.21, -0.02), 0.003)],
                [((0.015, 0.215, -0.01), 0.007), ((0.06, 0.25, 0.03), 0.004)]]
    tube_mesh(f"{name}_trunk", [trunk] + branches, M["bark"], parent=g, sides=8)
    rand = random.Random(3)
    pads = []
    for cx, cy, cz, s in ((0.13, 0.165, 0.03, 0.065), (-0.11, 0.225, -0.02, 0.06), (0.05, 0.27, 0.02, 0.055), (0.0, 0.3, 0.0, 0.05)):
        for _ in range(9):
            a, rr = rand.uniform(0, 6.3), rand.uniform(0, s)
            pads.append(dict(co=(cx + math.cos(a) * rr, cy + rand.uniform(0, 0.012), cz + math.sin(a) * rr), r=rand.uniform(0.02, 0.028)))
    blob(f"{name}_foliage", pads, M["leaf_juniper"], parent=g, resolution=0.004)
    return g


def build_credenza(it, root):
    """A record console: smoked oak with a bowed, fully fluted tambour front, floating
    on a recessed bronze plinth under a walnut top with a brass edge, lit from below.
    A crate of records sits at one end and headphones hang on a stand at the other."""
    w, h, d = it["size"]
    plinth, top_t, bow = 0.075, 0.035, 0.05

    def front(x):
        return d / 2 - 0.03 + bow * (1 - (2 * x / w) ** 2)

    n = 32
    xs = [-w / 2 + w * k / n for k in range(n + 1)]
    body_h = h - plinth - top_t
    body = [(x, front(x)) for x in xs] + [(w / 2, -d / 2), (-w / 2, -d / 2)]
    prism("REC_body", body, body_h, (0, plinth, 0), M["oak_smoked"], parent=root, sharp=35)
    pl = [(x * 0.94, front(x) - 0.07) for x in xs] + [(w / 2 * 0.94, -d / 2 + 0.06), (-w / 2 * 0.94, -d / 2 + 0.06)]
    prism("REC_plinth", pl, plinth, (0, 0, 0), M["bronze"], parent=root, sharp=35)
    top = [(x * (w + 0.04) / w, front(x) + 0.022) for x in xs] + [((w + 0.04) / 2, -d / 2), (-(w + 0.04) / 2, -d / 2)]
    prism("REC_top", top, top_t, (0, h - top_t, 0), M["walnut"], parent=root, bevel=0.005, sharp=35)
    tube_mesh("REC_top_brass", [[((x * (w + 0.04) / w, h - top_t / 2, front(x) + 0.0235), 0.0032) for x in xs]], M["brass"], parent=root, sides=6)
    # The tambour: half-round oak slats all along the bow, three doors with bronze pulls.
    slats, x = [], -w / 2 + 0.02
    while x < w / 2 - 0.015:
        slats.append((0.0115, body_h - 0.03, (x, plinth + body_h / 2, front(x) + 0.002)))
        x += 0.025
    multi_cyl("REC_slats", slats, M["oak_smoked"], parent=root, segments=10)
    for i, xd in enumerate((-w / 6, w / 6)):
        box(f"REC_seam_{i}", (0.004, body_h - 0.03, 0.02), (xd, plinth + body_h / 2, front(xd) + 0.004), M["black"], parent=root)
    for i, xp in enumerate((-w / 6 - 0.05, w / 6 - 0.05, w / 2 - 0.12)):
        box(f"REC_pull_{i}", (0.014, 0.2, 0.016), (xp, plinth + body_h * 0.62, front(xp) + 0.02), M["bronze"], parent=root, bevel=0.004)
    tube_mesh("EMI_credenza_led", [[((x * 0.95, plinth - 0.006, front(x) - 0.075), 0.004) for x in xs]], M["led_warm"], parent=root, sides=5)
    # A crate of records.
    crate = empty("REC_crate", (-1.08, h, 0.02), rot_y=6, parent=root)
    for sx in (-1, 1):
        box(f"REC_crate_side_{sx}", (0.012, 0.2, 0.34), (sx * 0.17, 0.1, 0), M["walnut"], parent=crate)
    box("REC_crate_floor", (0.35, 0.012, 0.34), (0, 0.006, 0), M["walnut"], parent=crate)
    box("REC_crate_back", (0.35, 0.2, 0.012), (0, 0.1, -0.165), M["walnut"], parent=crate)
    box("REC_crate_front", (0.35, 0.09, 0.012), (0, 0.045, 0.165), M["walnut"], parent=crate)
    rand = random.Random(5)
    sleeves = {}
    for k in range(26):
        key = rand.choice(BOOK_KEYS)
        sleeves.setdefault(key, []).append(((0.31, 0.31, 0.005), (0, 0.165, -0.14 + k * 0.0105), 0))
    for key, parts in sleeves.items():
        multi_box(f"REC_crate_sleeves_{key}", [((s[0][0], s[0][1], s[0][2]), s[1]) for s in parts], M[key], parent=crate)
    # Headphones on a bronze stand.
    hp = empty("REC_phones", (1.1, h, 0.02), rot_y=-20, parent=root)
    cyl("REC_phones_base", 0.07, 0.012, (0, 0.006, 0), M["bronze"], parent=hp, segments=32)
    cyl("REC_phones_pole", 0.008, 0.3, (0, 0.16, 0), M["bronze"], parent=hp)
    tube_mesh("REC_phones_cradle", [[((-0.035, 0.31, 0), 0.008), ((0, 0.322, 0), 0.008), ((0.035, 0.31, 0), 0.008)]], M["bronze"], parent=hp, sides=8)
    band = [((math.cos(math.radians(a)) * 0.085, 0.24 + math.sin(math.radians(a)) * 0.085, 0), 0.009) for a in range(0, 181, 15)]
    tube_mesh("REC_phones_band", [band], M["leather_black"], parent=hp, sides=8)
    for sx in (-1, 1):
        cyl(f"REC_phones_cup_{sx}", 0.045, 0.035, (sx * 0.088, 0.22, 0), M["graphite"], rot=(0, 0, 90), parent=hp, segments=32, bevel=0.008)
        cyl(f"REC_phones_pad_{sx}", 0.042, 0.016, (sx * 0.064, 0.22, 0), M["leather_black"], rot=(0, 0, 90), parent=hp, segments=32)


def turntable(prefix, pos, parent, label):
    """A direct-drive DJ turntable: heavy plinth, strobe-dotted platter, slipmat and a
    record (TT_spin_* turns while music plays), S-shaped tonearm, pitch fader, lights."""
    g = empty(prefix, pos, parent=parent)
    W, H, Dd = 0.453, 0.07, 0.353
    for sx in (-1, 1):
        for sz in (-1, 1):
            cyl(f"{prefix}_foot_{sx}_{sz}", 0.034, 0.022, (sx * (W / 2 - 0.05), 0.011, sz * (Dd / 2 - 0.05)), M["rubber"], parent=g, segments=24)
    box(f"{prefix}_plinth", (W, H, Dd), (0, 0.022 + H / 2, 0), M["graphite"], parent=g, bevel=0.006, seg=3)
    top = 0.022 + H
    box(f"{prefix}_plate", (W - 0.006, 0.003, Dd - 0.006), (0, top + 0.0015, 0), M["black"], parent=g)
    pcx = -0.055
    spin = empty(f"TT_spin_{prefix}", (pcx, top + 0.003, 0.0), parent=g)
    cyl(f"{prefix}_platter", 0.166, 0.024, (0, 0.012, 0), M["silver"], parent=spin, segments=72)
    dots = [((0.004, 0.003, 0.0025), (math.cos(a) * 0.1665, 0.008 + row * 0.006, math.sin(a) * 0.1665), -math.degrees(a) + 90) for row in range(3) for a in [k * 2 * math.pi / 72 for k in range(72)]]
    multi_box(f"{prefix}_strobe_dots", dots, M["black"], parent=spin)
    cyl(f"{prefix}_slipmat", 0.152, 0.003, (0, 0.0255, 0), M["slipmat"], parent=spin, segments=64)
    cyl(f"{prefix}_record", 0.15, 0.002, (0, 0.028, 0), M["vinyl"], parent=spin, segments=72)
    tube_mesh(f"{prefix}_grooves", [ring_path(rr, centre=(0, 0.0291, 0), axis="y", n=64, r=0.0004) for rr in (0.07, 0.095, 0.12, 0.142)], M["graphite"], parent=spin, sides=3, closed=True)
    cyl(f"{prefix}_label", 0.05, 0.0024, (0, 0.0283, 0), M[label], parent=spin, segments=40)
    box(f"{prefix}_label_mark", (0.03, 0.0005, 0.006), (0.02, 0.0298, 0), M["white"], parent=spin)
    cyl(f"{prefix}_spindle", 0.0036, 0.016, (pcx, top + 0.035, 0.0), M["chrome"], parent=g, segments=12)
    # Tonearm.
    ax, az = 0.16, -0.11
    cyl(f"{prefix}_arm_base", 0.032, 0.012, (ax, top + 0.006, az), M["silver"], parent=g, segments=32)
    cyl(f"{prefix}_arm_pillar", 0.013, 0.05, (ax, top + 0.03, az), M["silver"], parent=g, segments=20)
    arm = [((ax + 0.004, top + 0.058, az - 0.06), 0.0042), ((ax, top + 0.058, az), 0.0042), ((ax - 0.012, top + 0.056, az + 0.08), 0.0042),
           ((ax - 0.05, top + 0.052, az + 0.15), 0.0042), ((ax - 0.085, top + 0.048, az + 0.185), 0.0038)]
    tube_mesh(f"{prefix}_arm", [arm], M["chrome"], parent=g, sides=8)
    cyl(f"{prefix}_counterweight", 0.019, 0.032, (ax + 0.005, top + 0.058, az - 0.075), M["silver"], rot=(90, 0, 0), parent=g, segments=24)
    box(f"{prefix}_headshell", (0.018, 0.007, 0.05), (ax - 0.095, top + 0.044, az + 0.2), M["black"], rot=(0, -38, 0), parent=g, bevel=0.002)
    box(f"{prefix}_cartridge", (0.012, 0.012, 0.022), (ax - 0.098, top + 0.036, az + 0.205), M["bike_red"], rot=(0, -38, 0), parent=g, bevel=0.002)
    cyl(f"{prefix}_arm_rest", 0.004, 0.04, (ax + 0.03, top + 0.02, az + 0.12), M["silver"], parent=g, segments=10)
    # Controls: start/stop, speed buttons, pitch fader, target and strobe lights.
    box(f"{prefix}_start", (0.034, 0.008, 0.024), (-W / 2 + 0.04, top + 0.004, Dd / 2 - 0.03), M["silver"], parent=g, bevel=0.002)
    for i in range(2):
        box(f"{prefix}_speed_{i}", (0.016, 0.006, 0.012), (-W / 2 + 0.075 + i * 0.022, top + 0.003, Dd / 2 - 0.028), M["silver"], parent=g, bevel=0.0015)
    box(f"{prefix}_pitch_slot", (0.012, 0.002, 0.12), (W / 2 - 0.035, top + 0.0035, 0.07), M["screen"], parent=g)
    box(f"{prefix}_pitch_cap", (0.022, 0.013, 0.014), (W / 2 - 0.035, top + 0.009, 0.06), M["silver"], parent=g, bevel=0.002)
    cyl(f"{prefix}_target", 0.009, 0.032, (-W / 2 + 0.035, top + 0.016, -Dd / 2 + 0.04), M["silver"], parent=g, segments=16)
    sphere(f"EMI_tt_light_{prefix}", 0.006, (-W / 2 + 0.035, top + 0.034, -Dd / 2 + 0.04), M["led_white"], parent=g)
    box(f"EMI_tt_strobe_{prefix}", (0.012, 0.004, 0.012), (0.13, top + 0.004, 0.155), M["led_warm"], parent=g)
    return g


def build_music_player(it, root):
    """Two turntables either side of a two-channel battle mixer: faders, EQ knobs,
    lit cue buttons and a level meter (SCR_music) that bounces with the music."""
    turntable("TTA", (-0.41, 0.0, 0.0), root, "label_a")
    turntable("TTB", (0.41, 0.0, 0.0), root, "label_b")
    mx = empty("MIXER", (0, 0, 0), parent=root)
    W, H, Dd = 0.3, 0.098, 0.36
    box("MIX_body", (W, H, Dd), (0, H / 2, 0), M["graphite"], parent=mx, bevel=0.006, seg=3)
    box("MIX_face", (W - 0.012, 0.002, Dd - 0.012), (0, H + 0.001, 0), M["black"], parent=mx)
    slots, caps, knobs, ticks, buttons = [], [], [], [], []
    for sx in (-1, 1):
        x = sx * 0.075
        slots.append(((0.006, 0.002, 0.11), (x, H + 0.0025, 0.055)))
        caps.append(((0.016, 0.012, 0.024), (x, H + 0.008, 0.035 + sx * 0.02)))
        for i, z in enumerate((-0.15, -0.115, -0.08, -0.045)):
            knobs.append((0.0095, 0.014, (x, H + 0.009, z)))
            ticks.append(((0.0015, 0.003, 0.008), (x + 0.004 * sx, H + 0.017, z - 0.002)))
        buttons.append(((0.022, 0.007, 0.014), (x, H + 0.0055, -0.012)))
    slots.append(((0.1, 0.002, 0.006), (0, H + 0.0025, 0.15)))
    caps.append(((0.024, 0.012, 0.016), (0.01, H + 0.008, 0.15)))
    for i, z in enumerate((0.07, 0.11)):
        knobs.append((0.009, 0.014, (0, H + 0.009, z)))
        ticks.append(((0.0015, 0.003, 0.008), (0.003, H + 0.017, z - 0.002)))
    multi_box("MIX_slots", slots, M["screen"], parent=mx)
    multi_box("MIX_caps", caps, M["silver"], parent=mx)
    multi_cyl("MIX_knobs", knobs, M["black"], parent=mx, segments=20)
    multi_box("MIX_ticks", ticks, M["white"], parent=mx)
    multi_box("EMI_mixer_cue", buttons, M["led_warm"], parent=mx)
    multi_box("EMI_mixer_fx", [((0.014, 0.006, 0.012), (-0.03 + i * 0.02, H + 0.005, -0.165)) for i in range(4)], M["led_cyan"], parent=mx)
    plane("SCR_music", 0.034, 0.13, (0, H + 0.0025, -0.06), M["screen"], rot=(-90, 0, 0), parent=mx)


def driver_unit(name, r, pos, parent, ring_name=None, depth=0.03):
    """A woofer seen from the front: cone, rubber surround and dust cap. Each part keeps
    its origin at the driver's centre so the site can pulse the whole unit."""
    g = empty(name + "_unit", pos, parent=parent)
    cyl(f"{name}_cone", r * 0.32, depth, (0, 0, -depth / 2), M["cone"], rot=(90, 0, 0), parent=g, radius2=r * 0.88, segments=48)
    tube_mesh(f"{name}_surround", [ring_path(r * 0.92, axis="z", n=48, r=r * 0.07)], M["rubber"], parent=g, sides=8, closed=True)
    sphere(f"{name}_cap", r * 0.3, (0, 0, -0.002), M["cone"], scale=(1, 1, 0.45), parent=g, segs=(24, 12))
    if ring_name:
        tube_mesh(ring_name, [ring_path(r * 1.08, axis="z", n=56, r=0.0045, centre=(0, 0, 0.002))], M["ring"], parent=g, sides=6, closed=True)
    return g


def build_studio_main(it, root):
    """A large three-way studio monitor on a steel stand: rounded cabinet, a
    waveguide holding the midrange dome and tweeter, the woofer below with its light
    ring, port slots and a status light."""
    sid = it["id"]
    box("SMN_stand_base", (0.42, 0.02, 0.42), (0, 0.025, 0), M["black"], parent=root, bevel=0.004)
    multi_cyl("SMN_spikes", [(0.012, 0.016, (sx * 0.18, 0.008, sz * 0.18)) for sx in (-1, 1) for sz in (-1, 1)], M["chrome"], parent=root, segments=12)
    for sx in (-1, 1):
        box(f"SMN_stand_post_{sx}", (0.05, 0.6, 0.05), (sx * 0.08, 0.335, 0), M["black"], parent=root, bevel=0.004)
    box("SMN_stand_top", (0.32, 0.02, 0.36), (0, 0.645, 0), M["black"], parent=root, bevel=0.003)
    box("SMN_pad", (0.3, 0.014, 0.33), (0, 0.662, 0), M["rubber"], parent=root, bevel=0.004)
    cab = empty("SMN_cab", (0, 0.669, 0), parent=root)
    cw, ch, cd = 0.3, 0.52, 0.38
    box(f"SMN_cabinet_{sid}", (cw, ch, cd), (0, ch / 2, 0), M["speaker"], parent=cab, bevel=0.028, seg=4)
    fz = cd / 2
    slab(f"SMN_waveguide_{sid}", rrect(0.25, 0.19, 0.05), 0.006, (0, 0.395, fz - 0.002), M["waveguide"], parent=cab, sharp=40)
    sphere(f"SMN_mid_{sid}", 0.034, (0, 0.38, fz + 0.002), M["cone"], scale=(1, 1, 0.38), parent=cab, segs=(28, 14))
    tube_mesh(f"SMN_mid_ring_{sid}", [ring_path(0.038, centre=(0, 0.38, fz + 0.005), axis="z", n=40, r=0.004)], M["rubber"], parent=cab, sides=6, closed=True)
    sphere(f"SMN_tweeter_{sid}", 0.013, (0, 0.45, fz + 0.004), M["silver"], scale=(1, 1, 0.5), parent=cab, segs=(20, 10))
    tube_mesh(f"SMN_tweeter_ring_{sid}", [ring_path(0.02, centre=(0, 0.45, fz + 0.005), axis="z", n=32, r=0.003)], M["waveguide"], parent=cab, sides=6, closed=True)
    driver_unit(f"SPK_woof_a_{sid}", 0.105, (0, 0.17, fz + 0.002), cab, ring_name=f"EMI_ring_a_{sid}")
    for sx in (-1, 1):
        box(f"SMN_port_{sid}_{sx}", (0.1, 0.018, 0.01), (sx * 0.07, 0.035, fz - 0.002), M["black"], parent=cab, bevel=0.006)
    box(f"EMI_spk_led_{sid}", (0.008, 0.004, 0.002), (0.11, 0.035, fz + 0.002), M["led_cyan"], parent=cab)
    multi_box(f"SMN_heatsink_{sid}", [((0.004, 0.3, 0.02), (-0.1 + i * 0.022, 0.28, -fz - 0.01)) for i in range(10)], M["graphite"], parent=cab)


def build_studio_nearfield(it, root):
    """A rounded die-cast nearfield monitor on a slim stand, tilted up on an isolation
    pod: big waveguide round the tweeter, woofer below, two port slots."""
    sid = it["id"]
    cyl("NF_base", 0.15, 0.022, (0, 0.011, 0), M["black"], parent=root, segments=40, bevel=0.004)
    cyl("NF_pole", 0.022, 0.9, (0, 0.47, 0), M["black"], parent=root, segments=20)
    cyl("NF_plate", 0.09, 0.016, (0, 0.928, 0), M["black"], parent=root, segments=32)
    box("NF_pod", (0.12, 0.03, 0.14), (0, 0.951, 0), M["rubber"], parent=root, bevel=0.01)
    cab = empty("NF_cab", (0, 0.966, 0), parent=root, rot=(-5, 0, 0))
    cw, ch, cd = 0.24, 0.39, 0.24
    box(f"NF_cabinet_{sid}", (cw, ch, cd), (0, ch / 2, 0), M["speaker"], parent=cab, bevel=0.06, seg=6)
    fz = cd / 2
    cyl(f"NF_waveguide_{sid}", 0.022, 0.018, (0, 0.285, fz - 0.006), M["waveguide"], rot=(90, 0, 0), parent=cab, radius2=0.1, segments=48)
    sphere(f"NF_tweeter_{sid}", 0.012, (0, 0.285, fz + 0.0), M["silver"], scale=(1, 1, 0.5), parent=cab, segs=(20, 10))
    driver_unit(f"STD_woof_{sid}", 0.078, (0, 0.12, fz + 0.004), cab, ring_name=f"EMI_ring_{sid}")
    for sx in (-1, 1):
        box(f"NF_port_{sid}_{sx}", (0.06, 0.013, 0.01), (sx * 0.065, 0.028, fz - 0.003), M["black"], parent=cab, bevel=0.005)
    box(f"EMI_spk_led_{sid}", (0.006, 0.004, 0.002), (0.0, 0.03, fz + 0.002), M["led_cyan"], parent=cab)


def build_studio_sub(it, root):
    """A studio subwoofer: rounded cabinet, front woofer with a light ring, a wide port."""
    box("SUBW_cabinet", (0.46, 0.42, 0.46), (0, 0.23, 0), M["speaker"], parent=root, bevel=0.04, seg=4)
    multi_cyl("SUBW_feet", [(0.025, 0.02, (sx * 0.17, 0.01, sz * 0.17)) for sx in (-1, 1) for sz in (-1, 1)], M["rubber"], parent=root, segments=16)
    driver_unit("SUB_woofer", 0.145, (0, 0.25, 0.232), root, ring_name="EMI_ring_sub", depth=0.04)
    box("SUBW_port", (0.3, 0.03, 0.01), (0, 0.06, 0.228), M["black"], parent=root, bevel=0.012)


def buttons(name, points, parent, r=0.011):
    """Leather buttons pulled into a cushion, in one mesh: small spheres sunk to half depth."""
    return multi_sphere(name, [(r, p) for p in points], M["leather_seam"], parent=parent, segs=(12, 8))


def build_lounge_chair(it, root):
    """A classic lounge chair and its ottoman, in the manner of the 1956 Eames
    design: moulded rosewood shells, deep chestnut-leather cushions with buttons,
    polished aluminium arms and a five-star swivel base. Local +z is the front."""
    alu, wood, hide = M["alu_brushed"], M["rosewood"], M["leather_lounge"]

    def star_base(prefix, centre, n, reach, hub_y):
        cx, cz = centre
        legs = []
        for k in range(n):
            a = math.radians(k * 360 / n + (0 if n % 2 else 45))
            dx, dz = math.sin(a), math.cos(a)
            legs.append([((cx + dx * 0.04, hub_y, cz + dz * 0.04), 0.022), ((cx + dx * reach * 0.55, hub_y - 0.035, cz + dz * reach * 0.55), 0.017), ((cx + dx * reach, 0.034, cz + dz * reach), 0.012)])
            cyl(f"{prefix}_glide_{k}", 0.017, 0.022, (cx + dx * reach, 0.012, cz + dz * reach), M["black"], parent=root, segments=16)
        tube_mesh(f"{prefix}_base", legs, alu, parent=root, sides=8)
        cyl(f"{prefix}_hub", 0.05, 0.06, (cx, hub_y, cz), M["black"], parent=root, segments=24, bevel=0.01)

    # Swivel base and column under the seat.
    star_base("LNG", (0, -0.04), 5, 0.36, 0.11)
    cyl("LNG_column", 0.028, 0.1, (0, 0.185, -0.04), M["black"], parent=root, segments=20)
    box("LNG_mount", (0.24, 0.025, 0.26), (0, 0.247, -0.02), M["black"], parent=root, bevel=0.006)

    # Seat: a moulded shell tilted back, and a thick cushion with six buttons and a pleat.
    seat = empty("LNG_seat", (0, 0.26, 0.04), parent=root, rot=(-8, 0, 0))
    prism("LNG_seat_shell", rrect(0.68, 0.6, 0.14), 0.026, (0, 0, 0), wood, parent=seat, bevel=0.007)
    soft_block("LNG_seat_cushion", (0.62, 0.11, 0.58), (0, 0.026 + 0.055, 0), hide, parent=seat, bevel=0.042)
    buttons("LNG_seat_btn", [(x, 0.132, z) for x in (-0.16, 0, 0.16) for z in (-0.14, 0.04)], seat)
    tube_mesh("LNG_seat_pleat", [[((-0.27, 0.134, 0.17), 0.004), ((0.27, 0.134, 0.17), 0.004)]], M["leather_seam"], parent=seat, sides=6)

    # Back: a bowed shell holding two cushion rolls; the headrest above it, a
    # little more upright; two aluminium spines behind tie them together.
    back = empty("LNG_back", (0, 0.34, -0.27), parent=root, rot=(-20, 0, 0))
    sheet("LNG_back_shell", 0.72, 0.36, (0, 0.18, -0.06), wood, parent=back, bow=0.05, thickness=0.022)
    for i, y in enumerate((0.095, 0.265)):
        soft_block(f"LNG_back_roll_{i}", (0.62, 0.165, 0.1), (0, y, 0.0), hide, parent=back, bow=0.045, bevel=0.045)
        buttons(f"LNG_back_btn_{i}", [(x, y, 0.046 - 0.045 * (2 * x / 0.62) ** 2) for x in (-0.15, 0.0, 0.15)], back)
    head = empty("LNG_head", (0, 0.39, 0), parent=back, rot=(7, 0, 0))
    sheet("LNG_head_shell", 0.66, 0.22, (0, 0.11, -0.06), wood, parent=head, bow=0.045, thickness=0.022)
    soft_block("LNG_head_cushion", (0.58, 0.19, 0.1), (0, 0.105, 0.0), hide, parent=head, bow=0.04, bevel=0.045)
    buttons("LNG_head_btn", [(x, 0.105, 0.046 - 0.04 * (2 * x / 0.58) ** 2) for x in (-0.12, 0.12)], head)
    for sx in (-1, 1):
        box(f"LNG_spine_{sx}", (0.036, 0.62, 0.012), (sx * 0.13, 0.3, -0.083), alu, parent=back, bevel=0.004)

    # Arms: an aluminium bracket from the seat shell to the back shell, a padded
    # leather rest on top.
    for sx in (-1, 1):
        x = sx * 0.355
        frame = fillet([(sx * 0.33, 0.29, 0.2), (x, 0.52, 0.17), (x, 0.535, -0.12), (sx * 0.345, 0.42, -0.25)], 0.05)
        tube_mesh(f"LNG_arm_frame_{sx}", [[(p, 0.011) for p in frame]], alu, parent=root, sides=8)
        soft_block(f"LNG_arm_pad_{sx}", (0.075, 0.045, 0.42), (x, 0.565, 0.02), hide, parent=root, rot=(-4, 0, 0), bevel=0.02)

    # The ottoman: four-star base, a tilted shell and a buttoned cushion.
    oz = 0.78
    star_base("OTT", (0, oz), 4, 0.3, 0.1)
    cyl("OTT_column", 0.026, 0.08, (0, 0.165, oz), M["black"], parent=root, segments=20)
    ott = empty("OTT_seat", (0, 0.22, oz), parent=root, rot=(-5, 0, 0))
    prism("OTT_shell", rrect(0.6, 0.48, 0.12), 0.024, (0, 0, 0), wood, parent=ott, bevel=0.006)
    soft_block("OTT_cushion", (0.56, 0.1, 0.44), (0, 0.024 + 0.05, 0), hide, parent=ott, bevel=0.04)
    buttons("OTT_btn", [(x, 0.12, z) for x in (-0.12, 0.12) for z in (-0.08, 0.08)], ott)


def build_ball_chair(it, root):
    """A Ball chair in cobalt: a glossy lacquered sphere opened toward the front, lined
    and cushioned in cobalt velvet, swivelling on a polished pedestal."""
    R, cy = 0.55, 0.62
    opening = math.radians(58)
    tilt = math.radians(14)
    front = B(0, math.sin(tilt), math.cos(tilt)).normalized()
    for name, radius, material, thick in (("BALL_shell", R, M["cobalt_shell"], 0.03), ("BALL_lining", R - 0.035, M["cobalt_velvet"], 0.0)):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=64, v_segments=40, radius=radius)
        gone = [f for f in bm.faces if f.calc_center_median().normalized().dot(front) > math.cos(opening)]
        bmesh.ops.delete(bm, geom=gone, context="FACES")
        o = _finish(name, bm, material, (0, cy, 0), (0, 0, 0), root, smooth=True)
        if thick:
            sol = o.modifiers.new("Solidify", "SOLIDIFY")
            sol.thickness = thick
            sol.offset = 1
    rim = []
    for k in range(64):
        a = 2 * math.pi * k / 64
        local = Vector((math.cos(a) * math.sin(opening), math.sin(a) * math.sin(opening), math.cos(opening)))
        p = Vector((local.x, local.y * math.cos(tilt) + local.z * math.sin(tilt), -local.y * math.sin(tilt) + local.z * math.cos(tilt)))
        rim.append(((p.x * (R - 0.017), cy + p.y * (R - 0.017), p.z * (R - 0.017)), 0.017))
    tube_mesh("BALL_rim", [rim], M["cobalt_shell"], parent=root, sides=10, closed=True)
    cyl("BALL_seat", 0.4, 0.11, (0, 0.4, 0.06), M["cobalt_velvet"], parent=root, segments=48, bevel=0.045)
    box("BALL_back", (0.5, 0.4, 0.13), (0, 0.66, -0.31), M["cobalt_velvet"], rot=(-14, 0, 0), parent=root, bevel=0.06, seg=4)
    box("BALL_pillow", (0.36, 0.2, 0.1), (0.12, 0.55, -0.18), M["cobalt_velvet"], rot=(-20, -18, 8), parent=root, bevel=0.05, seg=4)
    cyl("BALL_stem", 0.045, 0.09, (0, 0.065, 0), M["chrome"], parent=root, segments=32, radius2=0.07)
    cyl("BALL_base", 0.3, 0.02, (0, 0.01, 0), M["chrome"], parent=root, segments=64, bevel=0.006)


def build_dyson(it, root):
    """A Dyson-style purifying fan, running: white base, perforated filter body, a
    display on the front, and the tall open loop on top. DYSON_head oscillates."""
    cyl("DYS_base", 0.118, 0.05, (0, 0.025, 0), M["dyson_white"], parent=root, segments=48, bevel=0.01)
    head = empty("DYSON_head", (0, 0.05, 0), parent=root)
    cyl("DYS_band_low", 0.108, 0.07, (0, 0.035, 0), M["dyson_white"], parent=head, segments=48)
    lathe("DYS_filter", [(0.104, 0.07), (0.104, 0.43)], (0, 0, 0), M["dyson_mesh"], parent=head, segments=64, uv=True)
    cyl("DYS_core", 0.098, 0.36, (0, 0.25, 0), M["graphite"], parent=head, segments=32)
    cyl("DYS_band_top", 0.107, 0.06, (0, 0.46, 0), M["dyson_white"], parent=head, segments=48, bevel=0.008)
    cyl("DYS_neck", 0.06, 0.05, (0, 0.515, 0), M["dyson_nickel"], parent=head, segments=40, radius2=0.05)
    cyl("DYS_screen_bezel", 0.026, 0.004, (0, 0.035, 0.107), M["black"], rot=(90, 0, 0), parent=head, segments=40)
    disc("SCR_dyson", 0.022, (0, 0.035, 0.1095), M["screen"], parent=head, segments=40)
    box("EMI_dyson_led", (0.008, 0.0025, 0.001), (0, 0.065, 0.1085), M["led_white"], parent=head)
    straight, rr = 0.28, 0.09
    loop = []
    for k in range(48):
        a = 2 * math.pi * k / 48
        y = straight / 2 if math.sin(a) >= 0 else -straight / 2
        loop.append((math.cos(a) * rr, 0.54 + straight / 2 + rr + y + math.sin(a) * rr, 0.0))
    o = tube_mesh("DYS_loop", [[(p, 0.022) for p in loop]], M["dyson_white"], parent=head, sides=12, closed=True)
    o.scale = (1.0, 1.7, 1.0)
    inner = [(p[0], p[1], 0.023) for p in loop]
    o2 = tube_mesh("DYS_loop_trim", [[(p, 0.006) for p in inner]], M["dyson_nickel"], parent=head, sides=6, closed=True)
    o2.scale = (1.0, 1.7, 1.0)


def build_whiteboard(it, root):
    """A mobile whiteboard on castors: aluminium frame, marker tray with pens and an
    eraser. The site writes maths and physics on BOARD_white."""
    bw, bh = it.get("size", [1.6, 1.0])
    cy = 1.3
    box("WB_back", (bw, bh, 0.018), (0, cy, -0.012), M["white"], parent=root)
    plane("BOARD_white", bw, bh, (0, cy, 0.0), M["whiteboard"], parent=root)
    frame = [((bw + 0.04, 0.022, 0.03), (0, cy + bh / 2 + 0.011, -0.004)), ((bw + 0.04, 0.022, 0.03), (0, cy - bh / 2 - 0.011, -0.004)),
             ((0.022, bh, 0.03), (-bw / 2 - 0.011, cy, -0.004)), ((0.022, bh, 0.03), (bw / 2 + 0.011, cy, -0.004))]
    multi_box("WB_frame", frame, M["silver"], parent=root)
    for sx in (-1, 1):
        x = sx * (bw / 2 + 0.06)
        box(f"WB_post_{sx}", (0.035, 1.82, 0.035), (x, 0.95, 0), M["silver"], parent=root, bevel=0.004)
        box(f"WB_foot_{sx}", (0.045, 0.035, 0.62), (x, 0.06, 0), M["silver"], parent=root, bevel=0.004)
        cyl(f"WB_pivot_{sx}", 0.018, 0.045, (sx * (bw / 2 + 0.035), cy, 0), M["black"], rot=(0, 0, 90), parent=root, segments=20)
        for sz in (-1, 1):
            cyl(f"WB_castor_{sx}_{sz}", 0.03, 0.022, (x, 0.03, sz * 0.27), M["black"], rot=(0, 0, 90), parent=root, segments=20)
    box("WB_stretcher", (bw + 0.12, 0.03, 0.03), (0, 0.32, 0), M["silver"], parent=root)
    box("WB_tray", (1.1, 0.012, 0.07), (0, cy - bh / 2 - 0.03, 0.03), M["silver"], parent=root)
    box("WB_tray_lip", (1.1, 0.025, 0.006), (0, cy - bh / 2 - 0.022, 0.064), M["silver"], parent=root)
    for i, (x, m) in enumerate(((-0.3, "black"), (-0.22, "bike_red"), (-0.14, "book_b"), (0.1, "book_d"))):
        cyl(f"WB_marker_{i}", 0.0085, 0.13, (x, cy - bh / 2 - 0.015, 0.03 + (i % 2) * 0.012), M[m], rot=(0, 0, 90), parent=root, segments=12)
    box("WB_eraser", (0.13, 0.03, 0.05), (0.32, cy - bh / 2 - 0.009, 0.03), M["black"], parent=root, bevel=0.006)
    box("WB_eraser_felt", (0.124, 0.006, 0.046), (0.32, cy - bh / 2 - 0.026, 0.03), M["felt"], parent=root)


def build_blind_panel(it, root):
    """The blinds' master panel by the door: a screen showing every group and a pair
    of big buttons that move them all."""
    box("BPN_plate", (0.15, 0.23, 0.012), (0, 0, 0.006), M["switch"], parent=root, bevel=0.004)
    box("BPN_screen_frame", (0.13, 0.09, 0.004), (0, 0.055, 0.014), M["black"], parent=root, bevel=0.002)
    plane("SCR_blindpanel", 0.12, 0.08, (0, 0.055, 0.0162), M["screen"], parent=root)
    for i, y in enumerate((-0.035, -0.08)):
        box(f"BPN_button_{i}", (0.1, 0.036, 0.01), (0, y, 0.016), M["switch"], parent=root, bevel=0.004)
    chevrons = [((0.014, 0.004, 0.002), (-0.0055, -0.035, 0.0215), 0, 35), ((0.014, 0.004, 0.002), (0.0055, -0.035, 0.0215), 0, -35),
                ((0.014, 0.004, 0.002), (-0.0055, -0.08, 0.0215), 0, -35), ((0.014, 0.004, 0.002), (0.0055, -0.08, 0.0215), 0, 35)]
    multi_box("BPN_arrows", chevrons, M["graphite"], parent=root)
    box("EMI_switch_blindall", (0.012, 0.003, 0.003), (0, -0.106, 0.0135), M["led_warm"], parent=root)


def build_art(it, root):
    w, h = it["size"]
    key = it["art"]
    box(f"ART_frame_{key}", (w + 0.06, h + 0.06, 0.035), (0, 0, -0.0075), M["frame"], parent=root, bevel=0.003)
    plane(f"ART_{key}", w, h, (0, 0, 0.0105), mat(f"M_art_{key}", (0.3, 0.3, 0.32), 0.8), parent=root)


# ── Library curios ───────────────────────────────────────────────────────────


def _scaled(elements, s, offset=(0, 0, 0)):
    ox, oy, oz = offset
    out = []
    for e in elements:
        e = dict(e)
        x, y, z = e["co"]
        e["co"] = (ox + x * s, oy + y * s, oz + z * s)
        e["r"] = e["r"] * s
        out.append(e)
    return out


def zeus(name, pos, parent, height=0.5):
    """A marble Zeus in the Artemision pose: striding sideways, the left arm aimed along
    the stride, the right drawn back to throw, head turned toward the aim. The torso
    faces the room, as the bronze does. Metaballs make the anatomy; one smooth mesh."""
    E = []
    head = (0.022, 0.925, 0.0)
    E += [dict(co=head, r=0.064, size=(1.05, 1.18, 1.05))]
    for k in range(12):
        a = math.radians(-120 + k * 22)
        E.append(dict(co=(head[0] - 0.012 + math.cos(a) * 0.012, 0.96 + math.cos(a) * 0.012, math.sin(a) * 0.05), r=0.024))
    E += [dict(co=(head[0] + 0.045, 0.875, 0.012), r=0.048, size=(0.8, 0.9, 0.75)), dict(co=(head[0] + 0.07, 0.925, 0.01), r=0.013)]
    E += [dict(co=(head[0] + 0.05, 0.855, sz * 0.02), r=0.02) for sz in (-1, 1)]
    E += chain((0.005, 0.87, 0), (0, 0.8, 0), 0.04, 0.045)
    # Torso: chest, ribcage, waist and hips overlapping, so it reads as one body.
    E += [dict(co=(0, 0.735, 0.005), r=0.1, size=(1.18, 1.0, 0.64)), dict(co=(0, 0.665, 0.0), r=0.092, size=(1.05, 0.9, 0.62)),
          dict(co=(0, 0.595, 0.0), r=0.085, size=(0.95, 0.9, 0.6)), dict(co=(0, 0.53, 0.0), r=0.088, size=(1.08, 0.85, 0.66)),
          dict(co=(0, 0.48, 0.0), r=0.08, size=(1.12, 0.7, 0.66))]
    E += [dict(co=(sx * 0.046, 0.748, 0.034), r=0.048) for sx in (-1, 1)]
    E += [dict(co=(sx * 0.115, 0.792, 0.0), r=0.052) for sx in (-1, 1)]
    # Arms level with the shoulders: the left aims, the right is drawn back, hand raised.
    E += chain((0.125, 0.792, 0.0), (0.28, 0.802, 0.0), 0.038, 0.031) + chain((0.28, 0.802, 0.0), (0.43, 0.815, 0.0), 0.031, 0.022)
    E += [dict(co=(0.465, 0.815, 0.0), r=0.027, size=(1.6, 0.6, 0.9))]
    E += chain((-0.125, 0.792, 0.0), (-0.27, 0.81, 0.0), 0.038, 0.031) + chain((-0.27, 0.81, 0.0), (-0.37, 0.875, 0.0), 0.031, 0.022)
    E += [dict(co=(-0.385, 0.9, 0.0), r=0.027)]
    # A wide stride along the same line: the left foot planted ahead, the right heel lifted.
    E += chain((0.055, 0.46, 0.0), (0.14, 0.27, 0.01), 0.06, 0.044) + chain((0.14, 0.27, 0.01), (0.21, 0.045, 0.015), 0.044, 0.025)
    E += [dict(co=(0.235, 0.022, 0.015), r=0.03, size=(1.6, 0.55, 0.8))]
    E += chain((-0.055, 0.46, 0.0), (-0.14, 0.27, -0.01), 0.06, 0.044) + chain((-0.14, 0.27, -0.01), (-0.225, 0.07, -0.015), 0.044, 0.025)
    E += [dict(co=(-0.21, 0.03, -0.015), r=0.028, size=(1.5, 0.6, 0.8), rot=(0, 0, -35))]
    g = empty(name, pos, parent=parent)
    # A low threshold keeps the limbs full; at the default the figure thins to sticks.
    figure = [dict(e, r=e["r"] * 1.12) for e in E]
    blob(f"{name}_figure", _scaled(figure, height), M["statue"], parent=g, resolution=0.003, threshold=0.32)
    # The thunderbolt in the raised hand.
    bolt = [((-0.385 * height + dx, 0.9 * height + dy, 0.0), 0.0035) for dx, dy in ((0.0, -0.06), (0.014, -0.02), (-0.01, 0.0), (0.008, 0.05))]
    tube_mesh(f"{name}_bolt", [bolt], M["gold"], parent=g, sides=5)
    return g


def greek_column(name, pos, parent, h=0.42, r=0.07):
    """A fluted Doric column for a pedestal: square base, fluted shaft, capital."""
    g = empty(name, pos, parent=parent)
    box(f"{name}_base", (r * 2.6, 0.035, r * 2.6), (0, 0.0175, 0), M["statue"], parent=g, bevel=0.004)
    cyl(f"{name}_shaft", r * 0.92, h - 0.09, (0, 0.035 + (h - 0.09) / 2, 0), M["statue"], parent=g, segments=40)
    n = 20
    multi_cyl(f"{name}_flutes", [(r * 0.14, h - 0.1, (math.cos(a) * r * 0.86, 0.035 + (h - 0.09) / 2, math.sin(a) * r * 0.86)) for a in [k * 2 * math.pi / n for k in range(n)]], M["statue"], parent=g, segments=8)
    cyl(f"{name}_echinus", r * 1.25, 0.025, (0, h - 0.0425, 0), M["statue"], parent=g, radius2=r * 0.95, segments=40)
    box(f"{name}_abacus", (r * 2.7, 0.03, r * 2.7), (0, h - 0.015, 0), M["statue"], parent=g, bevel=0.003)
    return g


def dragon(name, pos, parent, material, eye, flip=False, length=0.42):
    """A Chinese dragon sculpture: a long body rising and diving through clouds, head
    raised over a pearl, horns, whiskers, a spined back and clawed legs."""
    g = empty(name, pos, rot_y=180 if flip else 0, parent=parent)
    L = length

    def body(s):
        x = (0.5 - s) * L
        y = 0.1 + 0.045 * math.sin(2 * math.pi * 1.25 * s + 0.6) * (1 - 0.3 * s) + 0.065 * (1 - s) ** 4
        z = 0.032 * math.sin(2 * math.pi * 1.6 * s)
        return Vector((x, y, z))

    def radius(s):
        return 0.019 if s < 0.06 else 0.024 * (1 - s) ** 0.7 + 0.004

    E = [dict(co=tuple(body(k / 90)), r=radius(k / 90)) for k in range(91)]
    head = body(0.0)
    hx, hy, hz = head
    E += [dict(co=(hx + 0.022, hy + 0.012, hz), r=0.022, size=(1.5, 0.9, 0.9)),
          dict(co=(hx + 0.052, hy + 0.004, hz), r=0.014, size=(1.6, 0.72, 0.85)),
          dict(co=(hx + 0.046, hy - 0.017, hz), r=0.011, size=(1.7, 0.5, 0.75), rot=(0, 0, -18))]
    E += [dict(co=(hx + 0.03, hy + 0.024, hz + sz * 0.012), r=0.0075) for sz in (-1, 1)]
    E += [dict(co=(hx - 0.004 - k * 0.006, hy + 0.018 + (k % 2) * 0.008, hz + sz * 0.014), r=0.008) for k in range(4) for sz in (-1, 1)]
    for s_leg in (0.17, 0.3, 0.58, 0.7):
        p = body(s_leg)
        side = 1 if s_leg in (0.17, 0.58) else -1
        knee = p + Vector((0.008, -0.025, side * 0.022))
        foot = p + Vector((0.018, -0.045, side * 0.03))
        E += chain(tuple(p), tuple(knee), 0.0075, 0.0055) + chain(tuple(knee), tuple(foot), 0.0055, 0.0045)
        E += [dict(co=tuple(foot + Vector((0.006 * math.cos(a), -0.002, side * 0.004 + 0.006 * math.sin(a)))), r=0.003) for a in (-0.8, 0.0, 0.8)]
    tail = body(1.0)
    E += [dict(co=(tail.x - 0.01, tail.y + dy, tail.z), r=0.006, size=(1.6, 0.6, 1.0)) for dy in (-0.008, 0.0, 0.008)]
    # Clouds where the body dips: little heaps it rests on.
    dips = [s for s in [k / 200 for k in range(201)] if body(s).y < body(s - 0.005).y and body(s).y < body(s + 0.005).y]
    for s in dips:
        c = body(s)
        E += [dict(co=(c.x + dx, 0.02 + dy, c.z + dz), r=rr) for dx, dy, dz, rr in ((0, 0.012, 0, 0.022), (0.022, 0.006, 0.008, 0.016), (-0.022, 0.006, -0.006, 0.016), (0.0, 0.004, 0.018, 0.014))]
    blob(f"{name}_body", E, material, parent=g, resolution=0.0028, threshold=0.4)
    # Horns, whiskers and the spines down the back.
    horns = [[((hx + 0.02, hy + 0.028, hz + sz * 0.01), 0.0038), ((hx - 0.012, hy + 0.058, hz + sz * 0.02), 0.0028), ((hx - 0.045, hy + 0.07, hz + sz * 0.03), 0.0012)] for sz in (-1, 1)]
    tube_mesh(f"{name}_horns", horns, material, parent=g, sides=6)
    whiskers = [[((hx + 0.066, hy + 0.002, hz + sz * 0.008), 0.0016), ((hx + 0.08, hy - 0.01, hz + sz * 0.04), 0.0013),
                 ((hx + 0.06, hy - 0.03, hz + sz * 0.08), 0.0011), ((hx + 0.03, hy - 0.02, hz + sz * 0.11), 0.0006)] for sz in (-1, 1)]
    tube_mesh(f"{name}_whiskers", whiskers, material, parent=g, sides=4)
    spines = []
    for k in range(26):
        s = 0.07 + k * 0.034
        p, r = body(s), radius(s)
        spines.append([(tuple(p + Vector((0, r * 0.8, 0))), 0.0032 * (1 - s * 0.6)), (tuple(p + Vector((-0.004, r * 0.8 + 0.013 * (1 - s * 0.7), 0))), 0.0003)])
    tube_mesh(f"{name}_spines", spines, material, parent=g, sides=4)
    for sz in (-1, 1):
        sphere(f"{name}_eye_{sz}", 0.0042, (hx + 0.038, hy + 0.017, hz + sz * 0.013), eye, parent=g)
    sphere(f"{name}_pearl", 0.016, (hx + 0.115, hy - 0.004, hz), M["ceramic"], parent=g)
    return g


def penny_farthing(name, pos, rot_y, parent):
    """An old high-wheel bicycle in miniature: big front wheel, little rear wheel,
    the backbone following the big wheel's curve, saddle and bars."""
    g = empty(name, pos, rot_y, parent=parent)
    R, r = 0.11, 0.033
    hub, rear = Vector((0, R + 0.004, 0)), Vector((-0.205, r + 0.004, 0))
    tube_mesh(f"{name}_tyres", [ring_path(R - 0.001, centre=tuple(hub), axis="z", n=64, r=0.0045), ring_path(r - 0.001, centre=tuple(rear), axis="z", n=28, r=0.0035)], M["rubber"], parent=g, sides=6, closed=True)
    tube_mesh(f"{name}_rims", [ring_path(R - 0.007, centre=tuple(hub), axis="z", n=64, r=0.0017)], M["chrome"], parent=g, sides=5, closed=True)
    spokes = []
    for k in range(32):
        a = 2 * math.pi * k / 32
        side = 0.006 if k % 2 else -0.006
        spokes.append([((hub.x, hub.y, side), 0.0006), ((hub.x + math.cos(a) * (R - 0.008), hub.y + math.sin(a) * (R - 0.008), 0), 0.0006)])
    for k in range(12):
        a = 2 * math.pi * k / 12
        spokes.append([((rear.x, rear.y, 0), 0.0006), ((rear.x + math.cos(a) * (r - 0.006), rear.y + math.sin(a) * (r - 0.006), 0), 0.0006)])
    tube_mesh(f"{name}_spokes", spokes, M["chrome"], parent=g, sides=3, caps=False)
    cyl(f"{name}_hub", 0.009, 0.026, tuple(hub), M["chrome"], rot=(90, 0, 0), parent=g, segments=16)
    head = Vector((-0.006, 2 * R + 0.012, 0))
    tube_mesh(f"{name}_fork", [[((hub.x, hub.y, sz * 0.012), 0.0024), ((head.x, head.y - 0.012, sz * 0.008), 0.0026)] for sz in (-1, 1)], M["black"], parent=g, sides=6)
    back = [((math.cos(math.radians(a)) * (R + 0.014) + hub.x, math.sin(math.radians(a)) * (R + 0.014) + hub.y, 0), 0.0042 - (a - 95) * 0.000012) for a in range(95, 196, 10)]
    back.append(((rear.x + 0.004, rear.y + 0.012, 0), 0.0028))
    back.append(((rear.x, rear.y, 0), 0.0025))
    tube_mesh(f"{name}_backbone", [back], M["black"], parent=g, sides=8)
    tube_mesh(f"{name}_bars", [[((head.x, head.y, -0.05), 0.0022), ((head.x + 0.004, head.y + 0.004, 0), 0.0024), ((head.x, head.y, 0.05), 0.0022)]], M["chrome"], parent=g, sides=6)
    for sz in (-1, 1):
        cyl(f"{name}_grip_{sz}", 0.0042, 0.022, (head.x, head.y, sz * 0.056), M["walnut"], rot=(90, 0, 0), parent=g, segments=10)
        crank = hub + Vector((0.0, 0.0, sz * 0.016))
        tube_mesh(f"{name}_crank_{sz}", [[(tuple(crank), 0.0018), (tuple(crank + Vector((sz * 0.0, -0.028 * sz, 0))), 0.0018)]], M["chrome"], parent=g, sides=5)
        box(f"{name}_pedal_{sz}", (0.012, 0.004, 0.014), tuple(crank + Vector((0, -0.028 * sz, sz * 0.008))), M["black"], parent=g)
    seat = Vector((math.cos(math.radians(112)) * (R + 0.022) + hub.x, math.sin(math.radians(112)) * (R + 0.022) + hub.y, 0))
    sphere(f"{name}_saddle", 0.5, tuple(seat), M["leather_black"], scale=(0.032, 0.01, 0.022), parent=g)
    return g


def armillary(name, pos, parent, rr=0.072):
    """A brass armillary sphere on a walnut stand: meridian, equator, ecliptic, tropics, polar axis."""
    g = empty(name, pos, parent=parent)
    cyl(f"{name}_foot", 0.05, 0.014, (0, 0.007, 0), M["walnut_dark"], parent=g, segments=32, bevel=0.003)
    cyl(f"{name}_stem", 0.006, 0.06, (0, 0.044, 0), M["brass"], parent=g)
    c = Vector((0, 0.074 + rr, 0))
    tilt = math.radians(-35)

    def ring(radius, plane_rot, offset=0.0, rad=0.0022):
        pts = []
        for k in range(48):
            a = 2 * math.pi * k / 48
            p = Vector((math.cos(a) * radius, offset, math.sin(a) * radius))
            p.rotate(plane_rot)
            pts.append((tuple(c + p), rad))
        return pts

    from mathutils import Matrix
    axis_tilt = Matrix.Rotation(tilt, 3, "Z")
    rings = [ring(rr, Matrix.Rotation(math.pi / 2, 3, "X")),
             ring(rr * 0.97, axis_tilt),
             ring(rr * 0.97, axis_tilt @ Matrix.Rotation(math.radians(23.4), 3, "X")),
             ring(rr * 0.97 * math.cos(math.radians(23.4)), axis_tilt, rr * 0.97 * math.sin(math.radians(23.4)), 0.0015),
             ring(rr * 0.97 * math.cos(math.radians(23.4)), axis_tilt, -rr * 0.97 * math.sin(math.radians(23.4)), 0.0015)]
    tube_mesh(f"{name}_rings", rings, M["brass"], parent=g, sides=6, closed=True)
    axis = Vector((0, rr * 1.15, 0))
    axis.rotate(axis_tilt)
    tube_mesh(f"{name}_axis", [[(tuple(c - axis), 0.0016), (tuple(c + axis), 0.0016)]], M["brass"], parent=g, sides=5)
    sphere(f"{name}_earth", 0.016, tuple(c), M["book_n"], parent=g)
    return g


def hourglass(name, pos, parent):
    """A walnut-framed hourglass, sand running from the top bulb into a heap below."""
    g = empty(name, pos, parent=parent)
    for y in (0.006, 0.174):
        cyl(f"{name}_cap_{y:.3f}", 0.048, 0.012, (0, y, 0), M["walnut_dark"], parent=g, segments=36, bevel=0.002)
    for k in range(3):
        a = 2 * math.pi * k / 3
        cyl(f"{name}_post_{k}", 0.004, 0.156, (math.cos(a) * 0.04, 0.09, math.sin(a) * 0.04), M["brass"], parent=g, segments=10)
    bulb = [(0.004, 0.012), (0.022, 0.02), (0.032, 0.04), (0.033, 0.06), (0.024, 0.078), (0.006, 0.088), (0.0035, 0.09),
            (0.006, 0.092), (0.024, 0.102), (0.033, 0.12), (0.032, 0.14), (0.022, 0.16), (0.004, 0.168)]
    lathe(f"{name}_glass", bulb, (0, 0, 0), M["glass_clear"], parent=g, segments=28)
    cyl(f"{name}_heap", 0.03, 0.026, (0, 0.025, 0), M["sand"], parent=g, radius2=0.004, segments=24)
    cyl(f"{name}_top_sand", 0.028, 0.03, (0, 0.11, 0), M["sand"], parent=g, radius2=0.008, segments=24)
    cyl(f"{name}_stream", 0.0009, 0.07, (0, 0.06, 0), M["sand"], parent=g, segments=6)
    return g


def ship_in_bottle(name, pos, parent):
    """A clipper ship in a bottle, lying on a walnut cradle."""
    g = empty(name, pos, parent=parent)
    for sx in (-1, 1):
        box(f"{name}_cradle_{sx}", (0.012, 0.03, 0.07), (sx * 0.06, 0.015, 0), M["walnut_dark"], parent=g, bevel=0.003)
    prof = [(0.0005, -0.13), (0.03, -0.128), (0.042, -0.11), (0.044, 0.04), (0.04, 0.07), (0.018, 0.1), (0.012, 0.125), (0.012, 0.15), (0.0005, 0.152)]
    lathe(f"{name}_bottle", prof, (0, 0.046, 0), M["glass_clear"], parent=g, segments=28, rot=(0, 0, -90))
    cyl(f"{name}_cork", 0.011, 0.02, (0.16, 0.046, 0), M["cork"], rot=(0, 0, 90), parent=g, segments=12)
    ship = empty(f"{name}_ship", (-0.02, 0.022, 0), parent=g)
    box(f"{name}_hull", (0.12, 0.018, 0.028), (0, 0.0, 0), M["walnut"], parent=ship, bevel=0.006)
    for i, x in enumerate((-0.035, 0.0, 0.035)):
        cyl(f"{name}_mast_{i}", 0.0012, 0.065, (x, 0.04, 0), M["walnut_dark"], parent=ship, segments=6)
        for j, y in enumerate((0.032, 0.056)):
            plane(f"{name}_sail_{i}_{j}", 0.026, 0.02 - j * 0.004, (x, y, 0.001), M["paper"], rot=(0, 90, 0), parent=ship)
    box(f"{name}_sea", (0.16, 0.004, 0.05), (-0.01, 0.006, 0), M["glaze_blue"], parent=g)
    return g


def rangefinder(name, pos, rot_y, parent):
    """A vintage rangefinder camera: chrome plates, black leatherette, a stubby lens."""
    g = empty(name, pos, rot_y, parent=parent)
    box(f"{name}_body", (0.138, 0.062, 0.032), (0, 0.04, 0), M["leatherette"], parent=g, bevel=0.008, seg=3)
    box(f"{name}_top", (0.138, 0.016, 0.034), (0, 0.078, 0), M["chrome"], parent=g, bevel=0.005)
    box(f"{name}_bottom", (0.136, 0.007, 0.033), (0, 0.0115, 0), M["chrome"], parent=g, bevel=0.003)
    for i, x in enumerate((-0.045, -0.02, 0.052)):
        box(f"{name}_window_{i}", (0.016 if i < 2 else 0.012, 0.009, 0.002), (x, 0.065, 0.016), M["screen"] if i != 1 else M["cooler_glass"], parent=g)
    cyl(f"{name}_mount", 0.024, 0.008, (0.0, 0.04, 0.02), M["chrome"], rot=(90, 0, 0), parent=g, segments=32)
    cyl(f"{name}_lens", 0.02, 0.032, (0.0, 0.04, 0.04), M["black"], rot=(90, 0, 0), parent=g, segments=32)
    cyl(f"{name}_ring", 0.021, 0.006, (0.0, 0.04, 0.05), M["chrome"], rot=(90, 0, 0), parent=g, segments=32)
    disc(f"{name}_glass", 0.015, (0.0, 0.04, 0.0562), M["cooler_glass"], parent=g, segments=24)
    for i, x in enumerate((-0.045, 0.045)):
        cyl(f"{name}_dial_{i}", 0.009, 0.007, (x, 0.09, 0.0), M["chrome"], parent=g, segments=20)
    box(f"{name}_lever", (0.03, 0.002, 0.007), (0.048, 0.094, 0.004), M["chrome"], rot=(0, 20, 0), parent=g)
    return g


def newtons_cradle(name, pos, rot_y, parent):
    """Newton's cradle: five chrome balls hung on V strings from two arches."""
    g = empty(name, pos, rot_y, parent=parent)
    box(f"{name}_base", (0.18, 0.014, 0.11), (0, 0.007, 0), M["walnut_dark"], parent=g, bevel=0.003)
    arches = [fillet([(-0.08, 0.014, sz * 0.042), (-0.08, 0.15, sz * 0.042), (0.08, 0.15, sz * 0.042), (0.08, 0.014, sz * 0.042)], 0.02) for sz in (-1, 1)]
    tube_mesh(f"{name}_frame", [[(p, 0.0022) for p in a] for a in arches], M["chrome"], parent=g, sides=6)
    balls, strings = [], []
    for k in range(5):
        x = -0.046 + k * 0.023
        balls.append((x, 0.045, 0))
        strings += [[((x, 0.056, 0), 0.0003), ((x, 0.15, sz * 0.042), 0.0003)] for sz in (-1, 1)]
    for i, b in enumerate(balls):
        sphere(f"{name}_ball_{i}", 0.0113, b, M["chrome"], parent=g, segs=(20, 14))
    tube_mesh(f"{name}_strings", strings, M["cable"], parent=g, sides=3, caps=False)
    return g


def rubiks(name, pos, rot_y, parent, size=0.057):
    """A half-solved Rubik's cube: black core, stickers on the faces you can see."""
    g = empty(name, pos, rot_y, parent=parent)
    box(f"{name}_core", (size, size, size), (0, size / 2, 0), M["black"], parent=g, bevel=0.003)
    rand = random.Random(7 + len(name))
    colours = ("cube_w", "cube_r", "cube_b", "cube_g", "cube_y", "cube_o")
    parts = {c: [] for c in colours}
    cell = size / 3
    st = cell * 0.86
    for i in range(3):
        for j in range(3):
            u, v = (i - 1) * cell, (j - 1) * cell
            parts[rand.choice(colours)].append(((st, 0.0012, st), (u, size + 0.0006, v)))
            parts[rand.choice(colours)].append(((st, st, 0.0012), (u, size / 2 + v, size / 2 + 0.0006)))
            parts[rand.choice(colours)].append(((0.0012, st, st), (size / 2 + 0.0006, size / 2 + v, u)))
            parts[rand.choice(colours)].append(((0.0012, st, st), (-size / 2 - 0.0006, size / 2 + v, u)))
    for c, ps in parts.items():
        if ps:
            multi_box(f"{name}_{c}", ps, M[c], parent=g)
    return g


BOOK_KEYS = ("book_a", "book_b", "book_c", "book_d", "book_e", "book_f", "book_g", "book_h", "book_i", "book_j", "book_k", "book_l", "book_m", "book_n")


def build_bookshelf(it, root):
    """A library wall rather than a plain bookcase: three lit arched niches (a marble
    Zeus on a fluted column between two Chinese dragons, gold and jade), book bays
    whose shelves step at their own heights, curios among the books, and a walnut
    ladder on a brass rail. Local +z faces the room."""
    w, h, d = it["size"]
    rand = random.Random(31)
    base_h, top_t = 0.55, 0.05
    inner_top = h - top_t
    fz = d / 2
    box("SHELF_back", (w, h - base_h, 0.02), (0, base_h + (h - base_h) / 2, -fz + 0.01), M["walnut_dark"], parent=root)
    box("SHELF_cabinet", (w, base_h, d - 0.02), (0, base_h / 2, 0.01), M["walnut"], parent=root)
    flutes = [((0.012, 0.44, 0.012), (-w / 2 + 0.04 + k * 0.05, 0.3, fz - 0.004)) for k in range(int((w - 0.08) / 0.05))]
    multi_box("SHELF_cabinet_flutes", flutes, M["walnut_dark"], parent=root)
    box("SHELF_kick_brass", (w, 0.012, 0.004), (0, 0.06, fz + 0.002), M["brass"], parent=root)
    box("SHELF_cabinet_brass", (w, 0.008, 0.004), (0, base_h - 0.03, fz + 0.002), M["brass"], parent=root)
    box("SHELF_top", (w + 0.04, top_t, d + 0.03), (0, h - top_t / 2, 0.015), M["walnut"], parent=root, bevel=0.006)
    box("SHELF_top_brass", (w + 0.04, 0.008, 0.004), (0, h - top_t - 0.004, fz + 0.028), M["brass"], parent=root)

    sections = [("B", 0.95), ("A", 0.6), ("B", 0.95), ("C", 1.0), ("B", 0.95), ("A", 0.6), ("B", 0.95)]
    x = -w / 2
    edges = [x]
    for _, sw in sections:
        x += sw
        edges.append(x)
    uprights = [((0.035, inner_top - base_h, d), (e, base_h + (inner_top - base_h) / 2, 0)) for e in edges[1:-1]]
    uprights += [((0.04, inner_top - base_h, d), (edges[0] + 0.02, base_h + (inner_top - base_h) / 2, 0)), ((0.04, inner_top - base_h, d), (edges[-1] - 0.02, base_h + (inner_top - base_h) / 2, 0))]
    shelves, leds = [], []
    books = {k: [] for k in BOOK_KEYS}
    bands, labels, pages = [], [], []

    def shelf(x0, x1, y):
        shelves.append(((x1 - x0, 0.03, d - 0.02), ((x0 + x1) / 2, y - 0.015, 0.01)))
        leds.append(((x1 - x0 - 0.06, 0.006, 0.012), ((x0 + x1) / 2, y - 0.033, fz - 0.04)))

    def book_row(x_start, x_end, y0, gap):
        bx = x_start
        while bx < x_end - 0.03:
            t = rand.uniform(0.016, 0.058)
            if bx + t > x_end:
                break
            bh = min(gap - 0.025, rand.uniform(0.17, 0.33))
            dep = rand.uniform(0.13, 0.24)
            key = rand.choice(BOOK_KEYS)
            zc = fz - 0.025 - rand.uniform(0.0, 0.012) - dep / 2
            books[key].append(((t, bh, dep), (bx + t / 2, y0 + bh / 2, zc)))
            front = zc + dep / 2
            if t > 0.024 and rand.random() < 0.35:
                for f in ((0.12, 0.88) if rand.random() < 0.5 else (0.9,)):
                    bands.append(((t * 0.94, 0.005, 0.0016), (bx + t / 2, y0 + bh * f, front + 0.0006)))
            if t > 0.03 and rand.random() < 0.09:
                labels.append(((t * 0.66, 0.034, 0.0012), (bx + t / 2, y0 + bh * 0.62, front + 0.0006)))
            bx += t + rand.uniform(0.0005, 0.003)
        # A last book leaning on the row.
        if x_end - bx > 0.06:
            t, bh = rand.uniform(0.025, 0.04), min(gap - 0.04, rand.uniform(0.2, 0.28))
            lean = rand.uniform(9, 15)
            books[rand.choice(BOOK_KEYS)].append(((t, bh, 0.19), (bx + bh * math.sin(math.radians(lean)) / 2 + t / 2, y0 + bh * math.cos(math.radians(lean)) / 2 + 0.003, fz - 0.12), 0, -lean))

    def flat_stack(xc, y0, n, ry_seed=0.0):
        y = y0
        for i in range(n):
            bw, bt, bd = rand.uniform(0.15, 0.24), rand.uniform(0.022, 0.042), rand.uniform(0.14, 0.2)
            ry = rand.uniform(-5, 5) + ry_seed
            key = rand.choice(BOOK_KEYS)
            zc = fz - 0.03 - bd / 2
            if rand.random() < 0.5:
                books[key].append(((bw, bt, bd), (xc, y + bt / 2, zc), ry))
            else:
                books[key].append(((bw, 0.003, bd), (xc, y + 0.0015, zc), ry))
                books[key].append(((bw, 0.003, bd), (xc, y + bt - 0.0015, zc), ry))
                pages.append(((bw - 0.006, bt - 0.006, bd - 0.004), (xc, y + bt / 2, zc - 0.001), ry))
            y += bt
        return y

    def arch_niche(tag, x0, x1, y_floor, y_top, aw, ah):
        """A lit arched niche: a glowing arch-shaped back, walnut spandrels and a brass edge."""
        xc, sw = (x0 + x1) / 2, x1 - x0
        ht = y_top - y_floor
        slab(f"EMI_niche_{tag}", arch_outline(aw, ah, 20), 0.004, (xc, y_floor, -fz + 0.022), M["niche"], parent=root)
        sp = ah - aw / 2
        arc = [(math.cos(math.radians(a)) * aw / 2, sp + math.sin(math.radians(a)) * aw / 2) for a in range(180, 89, -10)]
        left = [(-sw / 2, 0.0), (-aw / 2, 0.0)] + arc + [(0.0, ht), (-sw / 2, ht)]
        right = [(-px, py) for px, py in left]
        slab(f"SHELF_spandrel_{tag}_l", left, 0.02, (xc, y_floor, fz - 0.03), M["walnut"], parent=root)
        slab(f"SHELF_spandrel_{tag}_r", right, 0.02, (xc, y_floor, fz - 0.03), M["walnut"], parent=root)
        trim = [(-aw / 2, 0.0)] + arc + [(-px, py) for px, py in reversed(arc[:-1])] + [(aw / 2, 0.0)]
        tube_mesh(f"SHELF_arch_brass_{tag}", [[((xc + px, y_floor + py, fz - 0.008), 0.0045) for px, py in trim]], M["brass"], parent=root, sides=8)

    curio_slots = {(0, 1): "camera", (2, 2): "cradle", (4, 1): "cube", (6, 2): "hourglass"}
    for si, (kind, sw) in enumerate(sections):
        x0, x1 = edges[si] + (0.0175 if si > 0 else 0.04), edges[si + 1] - (0.0175 if si < len(sections) - 1 else 0.04)
        xc = (x0 + x1) / 2
        shelf(x0, x1, base_h + 0.03)
        if kind == "B":
            ys = [base_h + 0.03]
            y = ys[0]
            while True:
                y += rand.uniform(0.33, 0.43)
                if y > inner_top - 0.3:
                    break
                ys.append(y)
                shelf(x0, x1, y)
            ys.append(inner_top)
            for lv in range(len(ys) - 1):
                y0, gap = ys[lv], ys[lv + 1] - ys[lv] - 0.03
                curio = curio_slots.get((si, lv))
                if curio:
                    left_side = rand.random() < 0.5
                    cx = x0 + 0.17 if left_side else x1 - 0.17
                    if curio == "camera":
                        rangefinder("CURIO_camera", (cx, y0, 0.02), rand.uniform(-20, 20), root)
                    elif curio == "cradle":
                        newtons_cradle("CURIO_cradle", (cx, y0, 0.0), rand.uniform(-15, 15), root)
                    elif curio == "cube":
                        top = flat_stack(cx, y0, 3)
                        rubiks("CURIO_cube", (cx, top, 0.0), 28, root)
                    elif curio == "hourglass":
                        hourglass("CURIO_hourglass", (cx, y0, 0.01), root)
                    if left_side:
                        book_row(x0 + 0.36, x1 - 0.02, y0, gap)
                    else:
                        book_row(x0 + 0.02, x1 - 0.36, y0, gap)
                elif rand.random() < 0.18:
                    flat_stack(x0 + 0.16, y0, rand.randint(3, 5))
                    book_row(x0 + 0.3, x1 - 0.02, y0, gap)
                else:
                    book_row(x0 + 0.02 + rand.uniform(0, 0.06), x1 - 0.02 - rand.uniform(0, 0.12), y0, gap)
        elif kind == "A":
            mid, top = 1.15, 2.05
            shelf(x0, x1, mid)
            shelf(x0, x1, top)
            arch_niche(f"a{si}", x0, x1, mid, top, x1 - x0 - 0.1, top - mid - 0.07)
            if si < 3:
                dragon("CURIO_dragon_gold", (xc, mid + 0.025, 0.0), root, M["gold"], M["black"], flip=False)
                armillary("CURIO_armillary", (xc, base_h + 0.03, 0.0), root)
            else:
                dragon("CURIO_dragon_jade", (xc, mid + 0.025, 0.0), root, M["jade"], M["gold"], flip=True)
                ship_in_bottle("CURIO_ship", (xc, base_h + 0.03, 0.0), root)
            for dx in (-0.2, 0.2):
                box(f"CURIO_stand_{si}_{dx:.1f}", (0.04, 0.025, 0.12), (xc + dx * 0.9, mid + 0.0125, 0.0), M["lacquer_red"], parent=root, bevel=0.004)
            box(f"CURIO_stand_{si}", (0.42, 0.012, 0.13), (xc, mid + 0.019, 0.0), M["lacquer_red"], parent=root, bevel=0.003)
            flat_stack(xc - 0.08, top, 4)
            flat_stack(xc + 0.16, top, 2, 30)
        else:
            mid = 1.13
            shelf(x0, x1, mid)
            arch_niche("c", x0, x1, mid, inner_top, x1 - x0 - 0.16, inner_top - mid - 0.1)
            greek_column("CURIO_column", (xc, mid, 0.0), root)
            zeus("CURIO_zeus", (xc, mid + 0.42, 0.0), root)
            empty("LGT_zeus", (xc, mid + 1.25, fz - 0.05), parent=root)
            penny_farthing("CURIO_bicycle", (xc + 0.06, base_h + 0.03, 0.02), 0, root)
            flat_stack(x0 + 0.13, base_h + 0.03, 4)
            flat_stack(x1 - 0.13, base_h + 0.03, 3)

    multi_box("SHELF_uprights", uprights, M["walnut_dark"], parent=root)
    multi_box("SHELF_boards", shelves, M["walnut"], parent=root)
    multi_box("EMI_shelf_leds", leds, M["led_warm"], parent=root)
    for key, parts in books.items():
        if parts:
            multi_box(f"SHELF_books_{key}", parts, M[key], parent=root)
    if bands:
        multi_box("SHELF_book_bands", bands, M["gold"], parent=root)
    if labels:
        multi_box("SHELF_book_labels", labels, M["paper"], parent=root)
    if pages:
        multi_box("SHELF_book_pages", pages, M["pages"], parent=root)

    # The library ladder on its brass rail.
    rail_y, rail_z = 2.36, fz + 0.06
    cyl("SHELF_rail", 0.011, w - 0.1, (0, rail_y, rail_z), M["brass"], rot=(0, 0, 90), parent=root, segments=16)
    for e in edges[1:-1:2] + [edges[0] + 0.06, edges[-1] - 0.06]:
        cyl(f"SHELF_rail_post_{e:.2f}", 0.007, 0.06, (e, rail_y, fz + 0.03), M["brass"], rot=(90, 0, 0), parent=root, segments=12)
    lx = it.get("ladder", 0.0)
    foot_z = rail_z + 0.62
    for sx in (-1, 1):
        tube_mesh(f"SHELF_ladder_rail_{sx}", [[((lx + sx * 0.21, rail_y + 0.06, rail_z + 0.02), 0.018), ((lx + sx * 0.235, 0.03, foot_z), 0.018)]], M["walnut"], parent=root, sides=6)
        tube_mesh(f"SHELF_ladder_hook_{sx}", [[((lx + sx * 0.21, rail_y + 0.06, rail_z + 0.02), 0.005), ((lx + sx * 0.21, rail_y + 0.035, rail_z - 0.02), 0.005), ((lx + sx * 0.21, rail_y - 0.01, rail_z - 0.005), 0.005)]], M["brass"], parent=root, sides=6)
        cyl(f"SHELF_ladder_wheel_{sx}", 0.028, 0.02, (lx + sx * 0.235, 0.028, foot_z + 0.01), M["brass"], rot=(0, 0, 90), parent=root, segments=20)
    rungs = []
    for k in range(7):
        f = (k + 1) / 8
        y = 0.03 + (rail_y + 0.03) * f
        z = foot_z + (rail_z + 0.02 - foot_z) * f
        half = 0.235 - 0.025 * f
        rungs.append(((half * 2, 0.022, 0.07), (lx, y, z)))
    multi_box("SHELF_ladder_rungs", rungs, M["walnut"], parent=root)


def tape_rect(prefix, w, h, root, floor=False):
    t = 0.045
    if floor:
        parts = [((w, 0.002, t), (0, 0.001, -h / 2)), ((w, 0.002, t), (0, 0.001, h / 2)), ((t, 0.002, h), (-w / 2, 0.001, 0)), ((t, 0.002, h), (w / 2, 0.001, 0))]
    else:
        parts = [((w, t, 0.002), (0, h / 2, 0.001)), ((w, t, 0.002), (0, -h / 2, 0.001)), ((t, h, 0.002), (-w / 2, 0, 0.001)), ((t, h, 0.002), (w / 2, 0, 0.001))]
    multi_box(prefix, parts, M["tape"], parent=root)


def build_wall_spot(it, root):
    w, h = it["size"]
    tape_rect("TAPE_" + it["id"], w, h, root)
    plane(f"NOTE_{it['id']}", 0.2, 0.2, (0.02, 0.1, 0.004), M["sticky"], rot=(0, 0, 4), parent=root)
    plane(f"SPOTNUM_{it['id']}", 0.3, 0.13, (0, -0.19, 0.003), M["white"], parent=root)


def build_floor_spot(it, root):
    w, d = it["size"]
    tape_rect("TAPE_" + it["id"], w, d, root, floor=True)
    for s in (-1, 1):
        box(f"SIGN_leg_{it['id']}_{s}", (0.025, 0.95, 0.025), (s * 0.2, 0.47, -0.06), M["walnut"], rot=(10, 0, 0), parent=root)
    board = empty(f"SIGNG_{it['id']}", (0, 0.72, 0), parent=root, rot=(-10, 0, 0))
    box(f"SIGN_board_{it['id']}", (0.46, 0.6, 0.02), (0, 0, 0), M["white"], parent=board, bevel=0.004)
    plane(f"NOTE_{it['id']}", 0.22, 0.22, (0.03, 0.1, 0.0112), M["sticky"], rot=(0, 0, 3), parent=board)
    plane(f"SPOTNUM_{it['id']}", 0.38, 0.17, (0, -0.17, 0.0108), M["white"], parent=board)


def build_switch(it, root):
    sid = it["id"]
    box(f"SWP_{sid}", (0.08, 0.12, 0.012), (0, 0, 0.006), M["switch"], parent=root, bevel=0.003)
    box(f"SWT_{sid}", (0.024, 0.04, 0.014), (0, 0, 0.016), M["switch"], parent=root, bevel=0.003)
    box(f"EMI_{sid}", (0.012, 0.004, 0.003), (0, -0.045, 0.0135), M["led_warm"], parent=root)


def build_spot_fixture(it, root):
    p, t = Vector(it["position"]), Vector(it["target"])
    cyl(f"LGT_mount_{it['id']}", 0.05, 0.02, (0, 0.02, 0), M["black"], parent=root)
    can = empty(f"LGT_{it['id']}", (0, -0.02, 0), parent=root)
    aim(can, tuple(t - p))
    cyl(f"LGT_can_{it['id']}", 0.045, 0.16, (0, -0.08, 0), M["black"], parent=can)
    cyl(f"EMI_{it['id']}", 0.034, 0.004, (0, -0.161, 0), M["led_warm"], parent=can)


def build_linear_pendant(it, root):
    ln = it["length"]
    drop = H - it["position"][1]
    for s in (-1, 1):
        cyl(f"PEND_wire_{s}", 0.002, drop, (s * (ln / 2 - 0.1), drop / 2, 0), M["black"], parent=root, segments=8)
    box("PEND_bar", (ln, 0.035, 0.06), (0, 0, 0), M["black"], parent=root, bevel=0.004)
    box("EMI_pendant", (ln - 0.06, 0.006, 0.04), (0, -0.0185, 0), M["led_warm"], parent=root)


def build_downlights(it, root):
    rings = [(0.075, 0.012, (x, H - 0.006, z)) for x, z in it["points"]]
    lenses = [(0.058, 0.004, (x, H - 0.013, z)) for x, z in it["points"]]
    multi_cyl("DOWN_rings", rings, M["white"], parent=root, segments=24)
    multi_cyl("EMI_downlights", lenses, M["led_warm"], parent=root, segments=24)


def build_neon_sign(it, root):
    w, h = it["size"]
    box("NEON_panel", (w, h, 0.012), (0, 0, 0.032), M["acrylic"], parent=root, bevel=0.004)
    for sx in (-1, 1):
        for sy in (-1, 1):
            cyl(f"NEON_standoff_{sx}_{sy}", 0.01, 0.026, (sx * (w / 2 - 0.05), sy * (h / 2 - 0.05), 0.013), M["silver"], rot=(90, 0, 0), parent=root)


def build_pinboard(it, root):
    w, h = it["size"]
    box("PIN_frame", (w + 0.05, h + 0.05, 0.03), (0, 0, 0.0), M["desktop"], parent=root, bevel=0.004)
    plane("BOARD_pin", w, h, (0, 0, 0.0155), M["cork"], parent=root)


def build_blinds(it, root):
    """Motorised roller blinds, one per group of three panes: a cassette at the
    head, linen fabric the site lowers and raises (BLINDROLL_<g> scales in y,
    BLINDHEM_<g> rides at its foot), and an up/down plate on a mullion."""
    top = H - 0.16
    for g in it["groups"]:
        gid = g["id"]
        length = g["to"] - g["from"]
        mid = (g["from"] + g["to"]) / 2
        if g["wall"] == "north":
            grp = empty(f"BLIND_{gid}", (mid, top, -hz + 0.085), 0, parent=root)
            plate = empty(f"BLINDPLATE_{gid}", (g["plate"], 1.15, -hz + 0.062), 0, parent=root)
        else:
            grp = empty(f"BLIND_{gid}", (-hx + 0.085, top, mid), 90, parent=root)
            plate = empty(f"BLINDPLATE_{gid}", (-hx + 0.062, 1.15, g["plate"]), 90, parent=root)
        box(f"BLIND_cassette_{gid}", (length - 0.02, 0.1, 0.1), (0, 0.06, -0.01), M["white"], parent=grp, bevel=0.01)
        roll = empty(f"BLINDROLL_{gid}", (0, 0, 0), parent=grp)
        plane(f"BLINDF_{gid}", length - 0.06, 1.0, (0, -0.5, 0), M["linen"], parent=roll)
        hem = empty(f"BLINDHEM_{gid}", (0, 0, 0), parent=grp)
        box(f"BLINDHEM_bar_{gid}", (length - 0.05, 0.024, 0.022), (0, -0.012, 0), M["alu_brushed"], parent=hem, bevel=0.004)
        box(f"BLINDPLATE_body_{gid}", (0.052, 0.11, 0.01), (0, 0, 0.005), M["switch"], parent=plate, bevel=0.003)
        box(f"BLINDPLATE_up_{gid}", (0.034, 0.03, 0.008), (0, 0.022, 0.012), M["switch"], parent=plate, bevel=0.003)
        box(f"BLINDPLATE_down_{gid}", (0.034, 0.03, 0.008), (0, -0.022, 0.012), M["switch"], parent=plate, bevel=0.003)
        box(f"EMI_switch_blind_{gid}", (0.01, 0.003, 0.003), (0, -0.047, 0.0105), M["led_warm"], parent=plate)


BUILDERS = {
    "blinds": build_blinds, "blind-panel": build_blind_panel, "dyson": build_dyson, "whiteboard": build_whiteboard,
    "column": build_column, "desk-l": build_desk_l, "aeron-chair": build_aeron_chair, "wine-cooler": build_wine_cooler,
    "glass-board": build_glass_board, "spin-bike": build_spin_bike, "treadmill": build_treadmill,
    "game-table": build_game_table, "kitchen": build_kitchen, "world-clocks": build_world_clocks,
    "sofa": build_sofa, "console-table": build_console_table, "rug": build_rug,
    "coffee-table-round": build_coffee_table_round, "side-table-round": build_side_table_round,
    "media-console": build_media_console, "tv": build_tv, "game-console": build_game_console,
    "controller": build_controller, "floor-lamp": build_floor_lamp, "plant": build_plant,
    "credenza": build_credenza, "music-player": build_music_player, "studio-main": build_studio_main,
    "studio-nearfield": build_studio_nearfield, "studio-sub": build_studio_sub, "lounge-chair": build_lounge_chair,
    "ball-chair": build_ball_chair, "art": build_art, "bookshelf": build_bookshelf, "wall-spot": build_wall_spot,
    "floor-spot": build_floor_spot, "switch": build_switch, "spot-fixture": build_spot_fixture,
    "linear-pendant": build_linear_pendant, "downlights": build_downlights, "neon-sign": build_neon_sign, "pinboard": build_pinboard,
}

missing = []
for it in L["items"]:
    fn = BUILDERS.get(it["type"])
    if fn is None:
        missing.append(it["type"])
        continue
    root = empty(f"ITEM_{it['id']}") if it["type"] == "downlights" else empty(f"ITEM_{it['id']}", tuple(it["position"]), it.get("rotY", 0))
    fn(it, root)
if missing:
    raise SystemExit(f"No builder for item types: {sorted(set(missing))}")

os.makedirs(os.path.dirname(OUT_PATH) or ".", exist_ok=True)
os.makedirs(os.path.dirname(BLEND_PATH) or ".", exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(BLEND_PATH))
bpy.ops.export_scene.gltf(filepath=os.path.abspath(OUT_PATH), export_format="GLB", export_yup=True, export_apply=True, export_cameras=False, export_lights=False, export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)
objs = list(bpy.data.objects)
print(f"OFFICE_BUILD_OK objects={len(objs)} meshes={sum(1 for o in objs if o.type == 'MESH')} out={OUT_PATH}")
