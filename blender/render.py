"""Превью модели: Cycles на CPU, несколько ракурсов."""
import bpy, math, os, sys
from mathutils import Vector
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "")
bpy.ops.wm.open_mainfile(filepath=OUT + "shoe.blend")
sc = bpy.context.scene
sc.render.engine = "CYCLES"
sc.cycles.device = "CPU"
sc.cycles.samples = int(os.environ.get("SAMPLES", "48"))
sc.cycles.use_denoising = True
sc.render.resolution_x, sc.render.resolution_y = int(os.environ.get("RX", "1100")), int(os.environ.get("RY", "800"))
sc.render.film_transparent = False
sc.view_settings.view_transform = "AgX"
w = bpy.data.worlds.new("w"); sc.world = w
nt = w.node_tree; bg = nt.nodes["Background"]
bg.inputs[0].default_value = (1.0, 0.93, 0.95, 1); bg.inputs[1].default_value = 0.35
# пол
bpy.ops.mesh.primitive_plane_add(size=3, location=(0, 0, 0))
fl = bpy.context.active_object
m = bpy.data.materials.new("floor"); b = m.node_tree.nodes["Principled BSDF"]
b.inputs["Base Color"].default_value = (0.98, 0.88, 0.9, 1); b.inputs["Roughness"].default_value = 0.6
fl.data.materials.append(m)
def light(loc, energy, size):
    bpy.ops.object.light_add(type="AREA", location=loc)
    l = bpy.context.active_object; l.data.energy = energy; l.data.size = size
    d = Vector((0, 0, 0.05)) - l.location; l.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
light((0.3, -0.5, 0.6), 22, 0.5); light((-0.5, 0.3, 0.5), 10, 0.8); light((0.0, 0.0, 0.8), 8, 0.4)
bpy.ops.object.camera_add(); cam = bpy.context.active_object; sc.camera = cam; cam.data.lens = 70
views = {"side": (0.03, -0.75, 0.16), "three4": (0.45, -0.5, 0.32), "back": (-0.55, -0.35, 0.3), "top": (0.12, -0.25, 0.65)}
names = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else list(views)
for n in names:
    cam.location = views[n]
    d = Vector((0, 0, 0.055)) - cam.location; cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = OUT + f"preview-{n}.png"
    bpy.ops.render.render(write_still=True)
    print("rendered", n)
