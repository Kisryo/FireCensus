# Cycles render of a NASA 3D Resources satellite for the FireCensus Focus info cards.
# Usage: blender -b -P render_sat.py -- <model.glb> <earth_day.jpg> <out.jpg> [yaw_deg] [samples] [tilt_deg] [roll_deg]
#   tilt_deg rotates the model about X so the solar-array face turns toward the camera.
#
# v2 (fix2): NASA's original materials are replaced by name with our own PBR materials
# (crinkled gold MLI, gridded blue-violet solar cells, white radiators, black parts),
# three-light setup (key sun, cool rim from behind, faint fill), Earth turned so that
# Sumatra/Borneo sit under the satellite, satellite auto-framed to ~55% of frame width,
# slight depth of field and a bloom/glare pass on the metal highlights.
import bpy, sys, math
from mathutils import Vector, Quaternion
from bpy_extras.object_utils import world_to_camera_view

argv = sys.argv[sys.argv.index('--') + 1:]
model, earth_tex, out = argv[0], argv[1], argv[2]
yaw = float(argv[3]) if len(argv) > 3 else 35.0
samples = int(argv[4]) if len(argv) > 4 else 128
tilt = float(argv[5]) if len(argv) > 5 else 0.0
roll = float(argv[6]) if len(argv) > 6 else 0.0

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = samples
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = 1600, 1000
scene.render.image_settings.file_format = 'JPEG'
scene.render.image_settings.quality = 92
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.view_settings.exposure = 0.7


def lin(hexstr):
    h = hexstr.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (1.0,)


# near-black space
world = bpy.data.worlds.new('Space'); scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (0.35, 0.45, 0.7, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = 0.03   # faint, so shadow sides are dark but not pure black
# ...but camera rays see pure black space
_wn = world.node_tree; _bg = _wn.nodes['Background']; _out = _wn.nodes['World Output']
_lp = _wn.nodes.new('ShaderNodeLightPath'); _blk = _wn.nodes.new('ShaderNodeBackground')
_blk.inputs[0].default_value = (0, 0, 0, 1); _blk.inputs[1].default_value = 0.0
_mx = _wn.nodes.new('ShaderNodeMixShader')
_wn.links.new(_lp.outputs['Is Camera Ray'], _mx.inputs[0])
_wn.links.new(_bg.outputs[0], _mx.inputs[1]); _wn.links.new(_blk.outputs[0], _mx.inputs[2])
_wn.links.new(_mx.outputs[0], _out.inputs['Surface'])

# ---------------------------------------------------------------- satellite
bpy.ops.import_scene.gltf(filepath=model)
objs = [o for o in scene.objects if o.type == 'MESH']
root = bpy.data.objects.new('SatRoot', None); scene.collection.objects.link(root)
for o in list(scene.objects):
    if o.parent is None and o is not root:
        o.parent = root          # root is identity now, so root-local space == glTF import space

# ---------------------------------------------------------------- materials
def new_mat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(b.outputs[0], nt.nodes['Material Output'].inputs['Surface'])
    return m, nt, b


def crinkle(nt, b, strength=0.55):
    """Crumpled-foil normal: voronoi facets distorted by noise, fed to a bump node (world space)."""
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 9.0
    noise.inputs['Detail'].default_value = 4.0
    mix = nt.nodes.new('ShaderNodeVectorMath'); mix.operation = 'MULTIPLY_ADD'
    nt.links.new(noise.outputs['Color'], mix.inputs[0])
    mix.inputs[1].default_value = (0.25, 0.25, 0.25)
    nt.links.new(geo.outputs['Position'], mix.inputs[2])
    nt.links.new(geo.outputs['Position'], noise.inputs['Vector'])
    vor = nt.nodes.new('ShaderNodeTexVoronoi')
    vor.inputs['Scale'].default_value = 28.0
    vor.inputs['Randomness'].default_value = 1.0
    nt.links.new(mix.outputs[0], vor.inputs['Vector'])
    fine = nt.nodes.new('ShaderNodeTexNoise')
    fine.inputs['Scale'].default_value = 90.0
    fine.inputs['Detail'].default_value = 6.0
    nt.links.new(geo.outputs['Position'], fine.inputs['Vector'])
    add = nt.nodes.new('ShaderNodeMath'); add.operation = 'MULTIPLY_ADD'
    nt.links.new(fine.outputs['Fac'], add.inputs[0]); add.inputs[1].default_value = 0.35
    nt.links.new(vor.outputs['Distance'], add.inputs[2])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = strength
    bump.inputs['Distance'].default_value = 0.02
    nt.links.new(add.outputs[0], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    # roughness varies a little across the foil so highlights break up
    rmap = nt.nodes.new('ShaderNodeMapRange')
    rmap.inputs['To Min'].default_value = 0.22; rmap.inputs['To Max'].default_value = 0.36
    nt.links.new(noise.outputs['Fac'], rmap.inputs['Value'])
    nt.links.new(rmap.outputs['Result'], b.inputs['Roughness'])


def mat_mli(col='#C9A045'):
    m, nt, b = new_mat('FC_MLI_' + col)
    b.inputs['Base Color'].default_value = lin(col)
    b.inputs['Metallic'].default_value = 1.0
    crinkle(nt, b)
    return m


def mat_flat(name, col, rough, metal=0.0):
    m, nt, b = new_mat(name)
    b.inputs['Base Color'].default_value = lin(col)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    return m


def mat_cells(axes, cell):
    """Dark blue-violet cells #1A2350 with thin silver grid lines, laid out on the panel plane.
    axes = the two root-local axes spanning the panel, cell = cell size in root-local units."""
    m, nt, b = new_mat('FC_Cells')
    tc = nt.nodes.new('ShaderNodeTexCoord'); tc.object = root
    sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(tc.outputs['Object'], sep.inputs[0])
    com = nt.nodes.new('ShaderNodeCombineXYZ')
    nt.links.new(sep.outputs['XYZ'[axes[0]]], com.inputs['X'])
    nt.links.new(sep.outputs['XYZ'[axes[1]]], com.inputs['Y'])
    brick = nt.nodes.new('ShaderNodeTexBrick')
    brick.offset = 0.0; brick.squash = 1.0
    nt.links.new(com.outputs[0], brick.inputs['Vector'])
    brick.inputs['Scale'].default_value = 1.0 / cell
    brick.inputs['Brick Width'].default_value = 1.0
    brick.inputs['Row Height'].default_value = 1.0
    brick.inputs['Mortar Size'].default_value = 0.07
    brick.inputs['Mortar Smooth'].default_value = 0.0
    brick.inputs['Bias'].default_value = 0.0
    brick.inputs['Color1'].default_value = lin('#1A2350')
    brick.inputs['Color2'].default_value = lin('#262F70')
    brick.inputs['Mortar'].default_value = lin('#B9C0CA')
    nt.links.new(brick.outputs['Color'], b.inputs['Base Color'])
    # grid lines are metal, cells are glassy dielectric with a coat for a crisp highlight
    met = nt.nodes.new('ShaderNodeMapRange')
    met.inputs['To Min'].default_value = 0.0; met.inputs['To Max'].default_value = 0.35
    nt.links.new(brick.outputs['Fac'], met.inputs['Value'])
    nt.links.new(met.outputs['Result'], b.inputs['Metallic'])
    b.inputs['Roughness'].default_value = 0.15
    b.inputs['Coat Weight'].default_value = 0.6
    b.inputs['Coat Roughness'].default_value = 0.05
    b.inputs['Coat Tint'].default_value = lin('#C8C0FF')   # faint blue-violet sheen
    return m


MLI = {'Gold Foil', 'Gold Foil_2', 'Gold Leaf', 'Gold Leaf_2', 'Foil', 'Gold_Metal', 'antenna_base',
       'antenna_dish_outer', 'antenna_poles', 'foil_gold'}
SILVER_FOIL = {'foil_silver'}
PANELS = {'Main Solar Panels', 'Side Panels', 'Solar_Cells-1', 'Solar_Cells-2', 'SolarPanelFaces', 'shiny_panel'}
WHITE = {'Light_Metal', 'Plating', 'HSB Thermal Radiator Panels', 'antenna_dish_inner', 'Main Dish'}
BLACK = {'Thrusters', 'Dark_Metal', 'Main Panels Hardware', 'SolarPanelBack', 'Dark_Gray_Metal'}
SILVER = {'Silver Surfaces', 'Crome', 'shiny_Metal', 'Gray_Metal', 'Grey Metal', 'Dark_shiny_Metal',
          'Dark_shiny_Metal-2', 'antenna_poles_joints', 'Hooded_Instoment_shiney_1', 'Grey Surfaces'}

m_mli = mat_mli('#C9A045')
m_sfoil = mat_mli('#C4C9D0')
m_white = mat_flat('FC_White', '#E8EAED', 0.4)
m_black = mat_flat('FC_Black', '#111316', 0.45, 0.3)
m_silver = mat_flat('FC_Silver', '#B4B9C0', 0.28, 1.0)

# panel materials need their own plane axes, measured from the faces that use them
panel_mats = {}
for o in objs:
    me = o.data
    for mi, m in enumerate(me.materials):
        if not m or m.name not in PANELS:
            continue
        vs = {v for p in me.polygons if p.material_index == mi for v in p.vertices}
        pts = [o.matrix_world @ me.vertices[i].co for i in vs]
        dims = [max(p[k] for p in pts) - min(p[k] for p in pts) for k in range(3)]
        axes = sorted(range(3), key=lambda k: -dims[k])[:2]
        cell = min(dims[axes[0]], dims[axes[1]]) / 14.0
        key = (m.name, tuple(axes))
        if key not in panel_mats:
            panel_mats[key] = mat_cells(axes, cell)
        me.materials[mi] = panel_mats[key]

for o in objs:
    for i, m in enumerate(o.data.materials):
        if not m:
            continue
        n = m.name
        rep = (m_mli if n in MLI else m_sfoil if n in SILVER_FOIL else m_white if n in WHITE else
               m_black if n in BLACK else m_silver if n in SILVER else None)
        if rep:
            o.data.materials[i] = rep
print('PANEL MATS', list(panel_mats))

# ---------------------------------------------------------------- camera
cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
cam.data.lens = 50
scene.collection.objects.link(cam); scene.camera = cam
cam.location = (0, -4.6, 1.0)
cam.rotation_euler = (Vector((0, 0, 0)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
bpy.context.view_layer.update()

# ---------------------------------------------------------------- auto-frame satellite
verts = [(o, [v.co.copy() for v in o.data.vertices]) for o in objs]
mn = Vector((1e18,) * 3); mx = Vector((-1e18,) * 3)
for o, vs in verts:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
centre = (mn + mx) / 2; k = 2.0 / max(mx - mn)
root.rotation_euler = (math.radians(tilt), math.radians(roll), math.radians(yaw))
root.rotation_mode = 'XYZ'
target_w, target_cx = 0.55, 0.45
offset = Vector((0, 0, 0))
right = cam.matrix_world.to_3x3() @ Vector((1, 0, 0))
up = cam.matrix_world.to_3x3() @ Vector((0, 1, 0))
for it in range(4):
    root.scale = (k,) * 3
    root.location = offset - (root.rotation_euler.to_matrix() @ (centre * k))
    bpy.context.view_layer.update()
    xs, ys = [], []
    for o, vs in verts:
        mw = o.matrix_world
        step = max(1, len(vs) // 4000)
        for co in vs[::step]:
            p = world_to_camera_view(scene, cam, mw @ co)
            xs.append(p.x); ys.append(p.y)
    w, h = max(xs) - min(xs), max(ys) - min(ys)
    cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
    print('FRAME it', it, 'w %.3f h %.3f cx %.3f cy %.3f' % (w, h, cx, cy))
    fit = target_w / w
    if h * fit > 0.86:
        fit = 0.86 / h
    k *= fit
    view_w = 2 * 4.7 * math.tan(cam.data.angle / 2)
    offset += right * (target_cx - cx) * view_w + up * (0.52 - cy) * view_w * 1000 / 1600

# ---------------------------------------------------------------- Earth
EARTH_C = Vector((44, 110, -74)); EARTH_R = 44
bpy.ops.mesh.primitive_uv_sphere_add(segments=192, ring_count=96, radius=EARTH_R, location=EARTH_C)
earth = bpy.context.active_object
bpy.ops.object.shade_smooth()
mat = bpy.data.materials.new('Earth'); mat.use_nodes = True
nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']
tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = bpy.data.images.load(earth_tex)
nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.75
earth.data.materials.append(mat)
# Turn the globe so lon 108E, lat 0 (between Sumatra and Borneo) faces the satellite/camera.
uv = earth.data.uv_layers.active.data
best, bestd = None, 9
tu, tv = (108 + 180) / 360.0, 0.5
for poly in earth.data.polygons:
    for li in poly.loop_indices:
        u, v = uv[li].uv
        d = (u - tu) ** 2 + (v - tv) ** 2
        if d < bestd:
            bestd, best = d, earth.data.vertices[earth.data.loops[li].vertex_index].co.copy()
north = Vector((0, 0, 1))
# Aim: the Earth point seen at screen (0.80, 0.17), i.e. just inside the limb in the lower-right corner.
bpy.context.view_layer.update()
fr = cam.data.view_frame(scene=scene)            # tr, br, bl, tl in camera space
sx, sy = 0.80, 0.17
pt = fr[2] + (fr[1] - fr[2]) * sx + (fr[3] - fr[2]) * sy
d = (cam.matrix_world.to_3x3() @ pt).normalized(); o = cam.location
oc = o - EARTH_C; bq = oc.dot(d); cq = oc.dot(oc) - EARTH_R ** 2; disc = bq * bq - cq
want = ((o + d * (-bq - math.sqrt(disc))) - EARTH_C).normalized() if disc > 0 else (o - EARTH_C).normalized()
print('EARTH aim hit', disc > 0)
q1 = best.normalized().rotation_difference(want)
# second rotation about 'want' so the globe's north points roughly up in frame
n1 = q1 @ north
proj = lambda v: (v - want * v.dot(want)).normalized()
q2 = proj(n1).rotation_difference(proj(Vector((0, 0, 1)) + Vector((0.2, 0, 0))))
earth.rotation_mode = 'QUATERNION'; earth.rotation_quaternion = q2 @ q1
print('EARTH best uv dist', bestd)

# thin blue atmosphere shell
bpy.ops.mesh.primitive_uv_sphere_add(segments=128, ring_count=64, radius=EARTH_R * 1.015, location=EARTH_C)
atmo = bpy.context.active_object; bpy.ops.object.shade_smooth()
am = bpy.data.materials.new('Atmo'); am.use_nodes = True
an = am.node_tree; an.nodes.remove(an.nodes['Principled BSDF'])
vol = an.nodes.new('ShaderNodeVolumeScatter'); vol.inputs['Color'].default_value = (0.45, 0.7, 1, 1)
vol.inputs['Density'].default_value = 0.06
an.links.new(vol.outputs[0], an.nodes['Material Output'].inputs['Volume'])
atmo.data.materials.append(am)

# ---------------------------------------------------------------- lights
def sun(name, energy, color, aim_from):
    L = bpy.data.objects.new(name, bpy.data.lights.new(name, 'SUN'))
    L.data.energy = energy; L.data.color = color; L.data.angle = math.radians(0.6)
    L.rotation_euler = (Vector((0, 0, 0)) - Vector(aim_from)).to_track_quat('-Z', 'Y').to_euler()
    scene.collection.objects.link(L)
    return L

sun('Key', 4.8, (1.0, 0.97, 0.92), (-6, -2.5, 3.0))          # strong side sun from the left
sun('Rim', 1.9, (0.82, 0.9, 1.0), (2.5, 7.0, 2.2))           # cool white from behind -> clean outline
sun('Fill', 0.12, (0.5, 0.68, 1.0), (3, -4, -2))             # very weak earth-shine

# depth of field: focus on the satellite, Earth goes slightly soft
cam.data.dof.use_dof = True
cam.data.dof.focus_distance = (cam.location - offset).length
cam.data.dof.aperture_fstop = 4.0

# ---------------------------------------------------------------- bloom / glare
def setup_glare():
    try:
        ng = bpy.data.node_groups.new('FC_Comp', 'CompositorNodeTree')
        scene.compositing_node_group = ng
        rl = ng.nodes.new('CompositorNodeRLayers')
        gl = ng.nodes.new('CompositorNodeGlare')
        outn = ng.nodes.new('NodeGroupOutput')
        ng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
        ins = {s.name: s for s in gl.inputs}
        print('GLARE inputs', list(ins))
        def setin(name, val):
            if name in ins:
                try:
                    ins[name].default_value = val
                except Exception as e:
                    print('glare set fail', name, e)
        setin('Type', 'Bloom'); setin('Quality', 'High')
        setin('Threshold', 0.85); setin('Strength', 0.35); setin('Size', 0.55)
        setin('Saturation', 1.0)
        ng.links.new(rl.outputs['Image'], gl.inputs['Image'])
        ng.links.new(gl.outputs['Image'], outn.inputs[0])
        print('GLARE ok (5.x node group)')
    except Exception as e:
        print('GLARE 5.x path failed:', e)
        scene.use_nodes = True
        t = scene.node_tree
        rl = t.nodes['Render Layers']; comp = t.nodes['Composite']
        gl = t.nodes.new('CompositorNodeGlare'); gl.glare_type = 'FOG_GLOW'; gl.threshold = 0.85; gl.mix = -0.6
        t.links.new(rl.outputs['Image'], gl.inputs['Image']); t.links.new(gl.outputs['Image'], comp.inputs['Image'])
        print('GLARE ok (legacy)')

setup_glare()

scene.render.filepath = out
bpy.ops.render.render(write_still=True)
print('WROTE', out)
