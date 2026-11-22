import * as THREE from 'three'

import { downloadDataUrl } from '../../core/exporter'
import { Kinematics } from '../../core/kinematics'
import { generateSteel } from '../../core/steel'
import { store } from '../../store'
import { Viewport } from '../../three/viewport'
import { btn, el, toast } from '../ui'

// 展厅预览页:观众视角、展灯投影、地面阴影
export const mountHallPage = (root: HTMLElement): (() => void) => {
  const skel = store.active
  if (!skel) { root.append(el('div', 'page-body', '请先在骨架列表中选择骨架')); return () => {} }

  const head = el('div', 'page-head')
  head.append(el('h1', '', `展厅预览 — ${skel.name}`), el('span', 'spacer'))
  const body = el('div', 'page-body fill')
  const viewWrap = el('div', 'viewport-wrap')
  const panel = el('div', 'panel right')
  body.append(viewWrap, panel)
  root.append(head, body)

  const vp = new Viewport(viewWrap, {
    palette: { fossil: store.settings.boneColor, prosthetic: store.settings.prostheticColor, selected: '#d98e4a' },
    steelColor: store.settings.steelColor,
    showGround: false,
    cameraPos: [9, 1.6, 9],
    target: [0, 2, 0],
  })
  vp.scene.background = new THREE.Color(0x0d0e11)
  vp.scene.fog = new THREE.Fog(0x0d0e11, 20, 55)

  // 展厅:地面、墙面、展台
  const room = new THREE.Group()
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x2a2c31, roughness: 0.85 })
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  room.add(floor)
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x1e2026, roughness: 0.95 })
  for (const [x, z, ry] of [[0, -14, 0], [-14, 0, Math.PI / 2]] as const) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 8), wallMat)
    wall.position.set(x, 4, z)
    wall.rotation.y = ry
    room.add(wall)
  }
  const pedestal = new THREE.Mesh(
    new THREE.BoxGeometry(14, 0.15, 5),
    new THREE.MeshStandardMaterial({ color: 0x3a3d45, roughness: 0.6 }))
  pedestal.position.y = 0.075
  pedestal.receiveShadow = true
  pedestal.castShadow = true
  room.add(pedestal)
  vp.scene.add(room)

  // 展灯:三盏射灯,照亮骨架并在地面投出正确阴影
  const spots: THREE.SpotLight[] = []
  const spotDefs: [number, number, number, number][] = [
    [5, 6.5, 3, 0.9], [-4, 6.5, 4, 0.7], [0, 6.5, -5, 0.8],
  ]
  for (const [x, y, z, intensity] of spotDefs) {
    const s = new THREE.SpotLight(0xfff0d8, intensity * 60, 30, Math.PI / 6, 0.4, 1.6)
    s.position.set(x, y, z)
    s.target.position.set(0, 1.8, 0)
    s.castShadow = true
    s.shadow.mapSize.set(2048, 2048)
    s.shadow.bias = -0.0005
    vp.scene.add(s, s.target)
    spots.push(s)
  }

  const kin = new Kinematics(skel, skel.current)
  vp.buildSkeleton(kin)
  vp.setSteel(generateSteel(kin.states, { gap: store.settings.steelGap, links: store.settings.steelLinks }))

  // 观众视角预设
  const views: Record<string, { pos: [number, number, number]; tgt: [number, number, number] }> = {
    观众平视: { pos: [9, 1.6, 9], tgt: [0, 2, 0] },
    儿童视角: { pos: [6, 1.0, 6], tgt: [0, 2.2, 0] },
    入口远眺: { pos: [16, 1.7, 0], tgt: [0, 2, 0] },
    俯瞰布展: { pos: [0, 14, 0.1], tgt: [0, 0, 0] },
  }
  panel.append(el('h3', '', '视角预设'))
  for (const [name, v] of Object.entries(views)) {
    panel.append(btn(name, 'sm', () => {
      vp.camera.position.set(...v.pos)
      vp.controls.target.set(...v.tgt)
    }))
  }
  panel.append(el('h3', '', '展灯'))
  const dimmer = el('input') as HTMLInputElement
  dimmer.type = 'range'; dimmer.min = '0.2'; dimmer.max = '1.6'; dimmer.step = '0.1'; dimmer.value = '1'
  dimmer.oninput = () => {
    const k = parseFloat(dimmer.value)
    spots.forEach((s, i) => { s.intensity = spotDefs[i][3] * 60 * k })
  }
  panel.append(el('div', 'field', ''), dimmer)

  head.append(
    btn('高清截图 (4K)', 'primary', () => downloadDataUrl(`${skel.name}-展厅.png`, vp.screenshot(3840, 2160))),
    btn('重新生成钢架', '', () => {
      kin.rebuild()
      vp.setSteel(generateSteel(kin.states, { gap: store.settings.steelGap, links: store.settings.steelLinks }))
      toast('钢架已按当前姿态重新生成')
    }),
  )

  vp.start(() => { kin.rebuild(); vp.sync(kin) })
  return () => vp.dispose()
}
