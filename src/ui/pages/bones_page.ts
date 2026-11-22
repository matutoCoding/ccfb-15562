import * as THREE from 'three'

import { Kinematics } from '../../core/kinematics'
import { BoneDef, vec3 } from '../../core/types'
import { store } from '../../store'
import { Viewport } from '../../three/viewport'
import { btn, checkRow, el, field, numInput, toast } from '../ui'

// 保证骨骼数组为拓扑序(父先于子)
export const sortBones = (bones: BoneDef[]): BoneDef[] => {
  const byParent = new Map<string | null, BoneDef[]>()
  for (const b of bones) {
    const list = byParent.get(b.parentId) ?? []
    list.push(b)
    byParent.set(b.parentId, list)
  }
  const out: BoneDef[] = []
  const visit = (pid: string | null) => { for (const b of byParent.get(pid) ?? []) { out.push(b); visit(b.id) } }
  visit(null)
  return out.length === bones.length ? out : bones
}

const deg = (r: number) => (r * 180) / Math.PI
const rad = (d: number) => (d * Math.PI) / 180

// 骨骼编辑页:层级树 + 属性编辑 + 预览
export const mountBonesPage = (root: HTMLElement): (() => void) => {
  const skel = store.active
  if (!skel) { root.append(el('div', 'page-body', '请先在骨架列表中选择骨架')); return () => {} }

  const head = el('div', 'page-head')
  head.append(el('h1', '', `骨骼编辑 — ${skel.name}`), el('span', 'spacer'))
  const body = el('div', 'page-body fill')
  const treePanel = el('div', 'panel')
  const viewWrap = el('div', 'viewport-wrap')
  const propPanel = el('div', 'panel right')
  body.append(treePanel, viewWrap, propPanel)
  root.append(head, body)

  let selectedId: string | null = skel.bones[0]?.id ?? null
  let kin = new Kinematics(skel, skel.current)
  const vp = new Viewport(viewWrap, {
    palette: { fossil: store.settings.boneColor, prosthetic: store.settings.prostheticColor, selected: '#d98e4a' },
    steelColor: store.settings.steelColor,
  })

  const rebuild = () => {
    skel.bones = sortBones(skel.bones)
    kin = new Kinematics(skel, skel.current)
    vp.buildSkeleton(kin)
    store.save()
  }
  rebuild()

  // 高亮选中骨骼
  const highlight = () => {
    for (const [id, mesh] of vp.boneMeshes) {
      mesh.traverse(o => {
        if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
          o.material.emissive.setHex(id === selectedId ? 0xd98e4a : 0x000000)
          o.material.emissiveIntensity = id === selectedId ? 0.45 : 0
        }
      })
    }
  }

  // 层级树
  const renderTree = () => {
    treePanel.innerHTML = '<h3>骨骼层级</h3>'
    const tree = el('div', 'tree')
    const childrenOf = (pid: string | null) => skel.bones.filter(b => b.parentId === pid)
    const walk = (pid: string | null, depth: number) => {
      for (const b of childrenOf(pid)) {
        const node = el('div', `tree-node${b.id === selectedId ? ' selected' : ''}`)
        node.style.paddingLeft = `${depth * 14 + 4}px`
        node.append(el('span', '', b.name))
        if (b.missing) node.append(el('span', 'badge missing', '补件'))
        if (b.support) node.append(el('span', 'badge ok', '支撑'))
        node.onclick = () => { selectedId = b.id; renderTree(); renderProps(); highlight() }
        tree.appendChild(node)
        walk(b.id, depth + 1)
      }
    }
    walk(null, 0)
    treePanel.appendChild(tree)
  }

  // 属性编辑
  const renderProps = () => {
    propPanel.innerHTML = ''
    const b = skel.bones.find(x => x.id === selectedId)
    if (!b) return
    propPanel.append(el('h3', '', `属性 — ${b.name}`))
    const save = () => { store.save(); rebuild(); highlight() }

    const nameInput = el('input') as HTMLInputElement
    nameInput.type = 'text'; nameInput.value = b.name
    nameInput.onchange = () => { b.name = nameInput.value; save(); renderTree() }
    propPanel.append(field('名称', nameInput))

    // 父骨骼
    const parentSel = el('select') as HTMLSelectElement
    const descendants = new Set<string>()
    const collect = (id: string) => { descendants.add(id); skel.bones.filter(x => x.parentId === id).forEach(x => collect(x.id)) }
    collect(b.id)
    parentSel.append(new Option('(根骨骼)', ''))
    for (const p of skel.bones) {
      if (descendants.has(p.id)) continue
      parentSel.append(new Option(p.name, p.id))
    }
    parentSel.value = b.parentId ?? ''
    parentSel.onchange = () => { b.parentId = parentSel.value || null; save(); renderTree() }
    propPanel.append(field('父骨骼', parentSel))

    const vecRow = (label: string, get: () => { x: number; y: number; z: number }, set: (axis: 'x' | 'y' | 'z', v: number) => void) => {
      const row = el('div', 'row')
      for (const axis of ['x', 'y', 'z'] as const) {
        row.append(field(axis.toUpperCase(), numInput(get()[axis], 0.01, v => { set(axis, v); save() })))
      }
      propPanel.append(field(label, row))
    }
    vecRow('关节偏移 (m)', () => b.offset, (a, v) => { b.offset[a] = v })
    vecRow('延伸方向', () => b.direction, (a, v) => { b.direction[a] = v })

    propPanel.append(
      field('长度 (m)', numInput(b.length, 0.01, v => { b.length = Math.max(0.01, v); save() })),
      field('半径 (m)', numInput(b.radius, 0.005, v => { b.radius = Math.max(0.005, v); save() })),
      field('质量 (kg)', numInput(b.mass, 0.5, v => { b.mass = Math.max(0, v); save() })),
    )

    propPanel.append(el('h3', '', '标记'))
    propPanel.append(
      checkRow('化石缺失(使用补件)', b.missing, v => { b.missing = v; save() }),
      checkRow('钢架支撑点', b.support, v => { b.support = v; save() }),
      checkRow('触地点(支撑多边形)', b.foot, v => { b.foot = v; save() }),
      checkRow('IK 链底', b.ikRoot, v => { b.ikRoot = v; save() }),
    )

    propPanel.append(el('h3', '', '关节限位 (°)'))
    vecRow('最小角', () => ({ x: deg(b.limit.min.x), y: deg(b.limit.min.y), z: deg(b.limit.min.z) }),
      (a, v) => { b.limit.min[a] = rad(v) })
    vecRow('最大角', () => ({ x: deg(b.limit.max.x), y: deg(b.limit.max.y), z: deg(b.limit.max.z) }),
      (a, v) => { b.limit.max[a] = rad(v) })

    propPanel.append(el('h3', '', '操作'))
    const ops = el('div', 'row wrap')
    ops.append(
      btn('添加子骨骼', 'sm', () => {
        const nb: BoneDef = {
          id: `b${Date.now().toString(36)}`, name: `新骨骼 ${skel.bones.length + 1}`, parentId: b.id,
          offset: { ...b.direction }, direction: vec3(1, 0, 0), length: 0.2, radius: 0.04, mass: 2,
          kind: 'shaft', missing: false, support: false, foot: false, ikRoot: false,
          limit: { min: vec3(-0.3, -0.3, -0.3), max: vec3(0.3, 0.3, 0.3) },
        }
        skel.bones.push(nb)
        selectedId = nb.id
        save(); renderTree(); renderProps()
        toast('已添加子骨骼')
      }),
      btn('删除(含子级)', 'sm danger', () => {
        if (!confirm(`删除「${b.name}」及其全部子骨骼?`)) return
        const dead = new Set<string>()
        collect(b.id)
        skel.bones = skel.bones.filter(x => !dead.has(x.id))
        selectedId = skel.bones[0]?.id ?? null
        save(); renderTree(); renderProps()
      }),
    )
    propPanel.appendChild(ops)
  }

  // 视口点击拾取
  vp.renderer.domElement.addEventListener('pointerdown', ev => {
    if (ev.button !== 0) return
    const id = vp.pickBone(ev.clientX, ev.clientY)
    if (id) { selectedId = id; renderTree(); renderProps(); highlight() }
  })

  renderTree()
  renderProps()
  highlight()
  vp.start(() => { kin.rebuild(); vp.sync(kin) })
  return () => vp.dispose()
}
