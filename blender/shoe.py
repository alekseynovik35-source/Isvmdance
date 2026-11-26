"""
Процедурная 3D-модель лодочки на шпильке для сайта ISV.M (Blender 5.x, bpy).
Запуск: python shoe.py  (с модулем bpy) — создаёт shoe.blend, shoe.glb и превью.

Размеры — женская туфля 37 размера: длина 24,5 см, каблук ~10 см.
Ось X — от пятки к носку, Z — вверх, Y — ширина. Единицы — метры.
"""
import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "")
L = 0.245          # длина подошвы
SOLE_T = 0.0045    # толщина подошвы
N_PHI = 18         # шаг по сечению (на половину)


# ---------- сплайн-кривые профиля (Catmull-Rom) ----------
def curve(points):
    pts = sorted(points)

    def f(x):
        if x <= pts[0][0]:
            return pts[0][1]
        if x >= pts[-1][0]:
            return pts[-1][1]
        for i in range(len(pts) - 1):
            x1, y1 = pts[i]
            x2, y2 = pts[i + 1]
            if x1 <= x <= x2:
                x0, y0 = pts[i - 1] if i > 0 else (x1 - (x2 - x1), y1 - (y2 - y1))
                x3, y3 = pts[i + 2] if i + 2 < len(pts) else (x2 + (x2 - x1), y2 + (y2 - y1))
                t = (x - x1) / (x2 - x1)
                m1 = (y2 - y0) / (x2 - x0) * (x2 - x1)
                m2 = (y3 - y1) / (x3 - x1) * (x2 - x1)
                t2, t3 = t * t, t * t * t
                return (2 * t3 - 3 * t2 + 1) * y1 + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * y2 + (t3 - t2) * m2
        return pts[-1][1]

    return f


# высота стельки над полом (профиль колодки с подъёмом под каблук 10 см)
z_ins = curve([(0.0, 0.100), (0.025, 0.0985), (0.05, 0.093), (0.08, 0.078), (0.11, 0.050),
               (0.135, 0.027), (0.155, 0.0135), (0.175, 0.0075), (0.20, 0.0063), (0.225, 0.0085), (0.245, 0.012)])
# полуширина следа: круглая пятка, узкая талия, широкая плюсна, острый мысок
_w = curve([(0.015, 0.0245), (0.035, 0.0285), (0.06, 0.0282), (0.09, 0.0262), (0.12, 0.0305),
            (0.15, 0.0375), (0.168, 0.0395), (0.19, 0.0365), (0.21, 0.0295), (0.228, 0.0175), (0.24, 0.0055)])


def half_w(x):
    if x < 0.015:  # скругление пятки
        r = 0.0245
        k = max(0.0, 1 - ((0.015 - x) / 0.015) ** 2)
        return r * math.sqrt(k)
    if x > 0.24:
        return 0.0055 * max(0.0, (L - x) / (L - 0.24)) ** 0.7
    return _w(x)


# высота «колодки» над стелькой по центру (подъём стопы сзади, мысок спереди)
H = curve([(0.0, 0.062), (0.04, 0.074), (0.09, 0.070), (0.12, 0.060), (0.145, 0.049), (0.16, 0.044),
           (0.18, 0.038), (0.2, 0.031), (0.22, 0.022), (0.235, 0.012), (0.245, 0.0035)])
# высота верхнего канта по бокам (задник выше, к середине ниже)
T = curve([(0.0, 0.056), (0.02, 0.054), (0.045, 0.043), (0.07, 0.032), (0.095, 0.028), (0.112, 0.030)])
X_THROAT = 0.152   # где закрывается вырез (передний край выреза по центру)
NEXP = 2.6         # «полнота» сечения (суперэллипс)


def nexp(x):
    # пятка — обтекаемая (стенки заваливаются внутрь), носок — полнее
    return 2.0 + (NEXP - 2.0) * min(1.0, max(0.0, (x - 0.02) / 0.1))


def section_point(x, phi):
    """точка на половине сечения: phi=0 — низ у подошвы, phi=pi/2 — верх по центру"""
    w, h = half_w(x), H(x)
    c, s = math.cos(phi), math.sin(phi)
    n = nexp(x)
    y = w * (abs(c) ** (2 / n))
    z = h * (abs(s) ** (2 / n))
    return Vector((x, y, z_ins(x) + z - 0.0015))


# доля высоты колодки, на которой проходит кант выреза: плавная кривая от задника к вырезу
R = curve([(0.0, 0.90), (0.03, 0.80), (0.06, 0.57), (0.09, 0.43), (0.115, 0.47), (0.135, 0.66), (0.147, 0.88), (X_THROAT, 1.0)])


def phi_top(x):
    """докуда идёт сечение: pi/2 — закрыто (носок), меньше — открытый вырез лодочки"""
    if x >= X_THROAT:
        return math.pi / 2
    r = max(0.0, min(1.0, R(x)))
    return math.asin(r ** (nexp(x) / 2))


def xs_samples(n):
    # гуще у пятки, у выреза и у мыска
    out = []
    for i in range(n + 1):
        t = i / n
        out.append(L * (0.5 - 0.5 * math.cos(math.pi * t)) * 0.985 + L * 0.015 * t)
    extra = [X_THROAT - 0.04 * k for k in (0.01, 0.03, 0.06, 0.1, 0.16, 0.24, 0.35, 0.5, 0.7)]
    out = sorted(set([round(v, 6) for v in out + extra + [X_THROAT]]))
    return [v for v in out if 0 <= v <= L]


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name, color, rough, coat=0.0, coat_rough=0.03, metal=0.0, spec=0.5):
    m = bpy.data.materials.new(name)
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["Coat Weight"].default_value = coat
    b.inputs["Coat Roughness"].default_value = coat_rough
    b.inputs["Specular IOR Level"].default_value = spec
    return m


def srgb(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)


def mesh_obj(name, verts, faces):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    for p in me.polygons:
        p.use_smooth = True
    return ob


def add_mod(ob, kind, **kw):
    m = ob.modifiers.new(kind.lower(), kind)
    for k, v in kw.items():
        setattr(m, k, v)
    return m


# ---------- верх (лак) ----------
def build_upper(m_out, m_in):
    xs = xs_samples(72)
    verts, faces = [], []
    rows = []
    for x in xs:
        pt = phi_top(x)
        row = []
        for j in range(N_PHI + 1):
            # равномерно по phi с уплотнением у канта
            t = j / N_PHI
            phi = pt * (1 - (1 - t) ** 1.35) if pt < math.pi / 2 else pt * t
            v = section_point(x, phi)
            row.append(len(verts))
            verts.append(v)
        rows.append(row)
    for i in range(len(rows) - 1):
        for j in range(N_PHI):
            a, b, c, d = rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]
            faces.append((d, c, b, a))
    ob = mesh_obj("Upper", verts, faces)
    ob.data.materials.append(m_out)
    ob.data.materials.append(m_in)
    add_mod(ob, "MIRROR", use_axis=(False, True, False), use_clip=True, use_mirror_merge=True, merge_threshold=0.0004)
    add_mod(ob, "SOLIDIFY", thickness=0.0016, offset=-1.0, material_offset=1, material_offset_rim=0, use_rim=True)
    add_mod(ob, "SUBSURF", levels=2, render_levels=2)
    return ob


# ---------- подошва ----------
def outline_grid(xs, nv, width_add, zfun):
    verts, faces, rows = [], [], []
    for x in xs:
        w = half_w(x) + width_add * min(1.0, (L - x) / 0.012)
        row = []
        for j in range(nv + 1):
            s = -1 + 2 * j / nv
            y = w * math.sin(s * math.pi / 2)  # гуще к краям
            row.append(len(verts))
            verts.append(Vector((x, y, zfun(x, y))))
        rows.append(row)
    for i in range(len(rows) - 1):
        for j in range(nv):
            faces.append((rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]))
    return verts, faces


def build_sole(m_sole, m_lining):
    xs = xs_samples(60)
    xs = [max(0.0006, min(L - 0.0035, x)) for x in xs]
    xs = sorted(set(xs))
    # подошва: верхняя поверхность чуть ниже стельки, толщина вниз
    v, f = outline_grid(xs, 12, 0.0012, lambda x, y: z_ins(x) - 0.0016)
    sole = mesh_obj("Sole", v, f)
    sole.data.materials.append(m_sole)
    add_mod(sole, "SOLIDIFY", thickness=SOLE_T, offset=1.0, use_rim=True)
    add_mod(sole, "SUBSURF", levels=2, render_levels=2)
    # стелька (видна внутри): нюдовая кожа, лёгкий прогиб
    v, f = outline_grid(xs, 12, -0.0012, lambda x, y: z_ins(x) - 0.0008 + 0.0012 * (1 - (y / max(half_w(x), 1e-4)) ** 2))
    ins = mesh_obj("Insole", v, f)
    ins.data.materials.append(m_lining)
    add_mod(ins, "SUBSURF", levels=1, render_levels=2)
    return sole, ins


# ---------- шпилька ----------
def build_heel(m_heel, m_tip):
    zb, zt = 0.009, 0.098
    nz, nr = 28, 32
    verts, faces, rings = [], [], []

    def sole_under(x):
        return z_ins(x) - 0.0016 - SOLE_T

    for k in range(nz + 1):
        s = k / nz  # 0 — низ, 1 — верх
        e = s ** 2.6  # вогнутый силуэт шпильки
        cx = 0.0305 + (0.0345 - 0.0305) * e
        a = 0.0050 + (0.0300 - 0.0050) * e    # полудлина по X
        b = 0.0046 + (0.0230 - 0.0046) * e    # полуширина по Y
        ring = []
        for j in range(nr):
            t = 2 * math.pi * j / nr
            c, sn = math.cos(t), math.sin(t)
            p = 2.4 if s < 0.6 else 2.4 + 0.8 * (s - 0.6) / 0.4
            x = cx + a * math.copysign(abs(c) ** (2 / p), c)
            y = b * math.copysign(abs(sn) ** (2 / p), sn)
            z_lin = zb + (zt - zb) * s
            # верх точно прилегает к наклонной подошве
            z = z_lin if s < 0.7 else z_lin + (sole_under(x) - z_lin) * ((s - 0.7) / 0.3) ** 1.5
            ring.append(len(verts))
            verts.append(Vector((x, y, min(z, sole_under(x)))))
        rings.append(ring)
    for k in range(nz):
        for j in range(nr):
            faces.append((rings[k][j], rings[k][(j + 1) % nr], rings[k + 1][(j + 1) % nr], rings[k + 1][j]))
    top_c = len(verts)
    verts.append(Vector((0.0345, 0, sole_under(0.0345))))
    for j in range(nr):
        faces.append((rings[-1][j], rings[-1][(j + 1) % nr], top_c))
    heel = mesh_obj("Heel", verts, faces)
    heel.data.materials.append(m_heel)
    add_mod(heel, "SUBSURF", levels=2, render_levels=2)

    # набойка
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=1, depth=zb, location=(0.0305, 0, zb / 2))
    tip = bpy.context.active_object
    tip.name = "HeelTip"
    tip.scale = (0.0050, 0.0046, 1)
    bpy.ops.object.transform_apply(scale=True)
    tip.data.materials.append(m_tip)
    add_mod(tip, "BEVEL", width=0.0009, segments=3)
    for p in tip.data.polygons:
        p.use_smooth = True
    return heel, tip


def main():
    clear()
    lacquer = mat("Cherry lacquer", srgb("#7E0A2A"), 0.22, coat=1.0, coat_rough=0.02, spec=0.6)
    lining = mat("Nude lining", srgb("#E9C2B6"), 0.65)
    sole_m = mat("Sole", srgb("#2A0710"), 0.55, spec=0.4)
    tip_m = mat("Heel tip", srgb("#140306"), 0.8)

    upper = build_upper(lacquer, lining)
    sole, ins = build_sole(sole_m, lining)
    heel, tip = build_heel(lacquer, tip_m)

    # всё в одну группу, центр — по низу, туфля смотрит носком вправо
    root = bpy.data.objects.new("ISVM_Shoe", None)
    bpy.context.collection.objects.link(root)
    for ob in (upper, sole, ins, heel, tip):
        ob.parent = root
    root.location = (-L / 2, 0, 0)

    bpy.ops.wm.save_as_mainfile(filepath=OUT + "shoe.blend")
    bpy.ops.export_scene.gltf(
        filepath=OUT + "shoe.glb",
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=7,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
    )
    print("exported", OUT + "shoe.glb", os.path.getsize(OUT + "shoe.glb"))


if __name__ == "__main__":
    main()
