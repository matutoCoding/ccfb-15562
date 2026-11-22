import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

import { ComResult } from '../core/com'
import { Kinematics } from '../core/kinematics'
import { SteelRod } from '../core/types'
import { BonePalette, createBoneMesh, createRodMesh } from './bone_mesh'

export interface ViewportOptions {
  palette: BonePalette
  steelColor: string
  showGround?: boolean
  cameraPos?: [number, number, number]
  target?: [number, number, number]
}

const UP = new THREE.Vector3(0, 1, 0)

export class Viewport {
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  boneGroup = new THREE.Group()
  steelGroup = new THREE.Group()
  comGroup = new THREE.Group()
  boneMeshes = new Map<string, THREE.Group>()
  private raycaster = new THREE.Raycaster()
  private raf = 0
  private clock = new THREE.Clock()
  private resizeObs: ResizeObserver

  constructor(public container: HTMLElement, public opts: ViewportOptions) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    container.appendChild(this.renderer.domElement)

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200)
    this.camera.position.set(...(opts.cameraPos ?? [7, 3.5, 7]))
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.set(...(opts.target ?? [0, 1.5, 0]))
    this.controls.enableDamping = true

    this.scene.background = new THREE.Color(0x14161a)
    this.scene.fog = new THREE.Fog(0x14161a, 25, 60)
    this.scene.add(new THREE.HemisphereLight(0xdfe6f0, 0x2a2620, 0.9))
    const key = new THREE.DirectionalLight(0xfff2e0, 1.6)
    key.position.set(6, 10, 4)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.camera.left = -12; key.shadow.camera.right = 12
    key.shadow.camera.top = 12; key.shadow.camera.bottom = -12
    this.scene.add(key)

    if (opts.showGround ?? true) {
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(60, 60),
        new THREE.ShadowMaterial({ opacity: 0.35 }),
      )
      ground.rotation.x = -Math.PI / 2
      ground.receiveShadow = true
      this.scene.add(ground)
      const grid = new THREE.GridHelper(60, 60, 0x323743, 0x23262e)
      this.scene.add(grid)
    }
    this.scene.add(this.boneGroup, this.steelGroup, this.comGroup)

    this.resizeObs = new ResizeObserver(() => this.resize())
    this.resizeObs.observe(container)
    this.resize()
  }

  resize() {
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  // 重建骨骼网格(骨架结构变化时调用)
  buildSkeleton(kin: Kinematics) {
    this.boneGroup.clear()
    this.boneMeshes.clear()
    for (const st of kin.states) {
      const mesh = createBoneMesh(st.def, this.opts.palette)
      this.boneMeshes.set(st.def.id, mesh)
      this.boneGroup.add(mesh)
    }
    this.sync(kin)
  }

  // 每帧同步骨骼位姿
  sync(kin: Kinematics) {
    for (const st of kin.states) {
      const mesh = this.boneMeshes.get(st.def.id)
      if (!mesh) continue
      mesh.position.copy(st.worldPos)
      mesh.quaternion.setFromUnitVectors(UP, st.worldDir)
    }
  }

  setSteel(rods: SteelRod[]) {
    this.steelGroup.clear()
    for (const r of rods) {
      this.steelGroup.add(createRodMesh(
        new THREE.Vector3(r.from.x, r.from.y, r.from.z),
        new THREE.Vector3(r.to.x, r.to.y, r.to.z),
        r.radius, this.opts.steelColor))
    }
  }

  // 重心与支撑区可视化:重心球、投影线、支撑多边形
  setCom(res: ComResult | null) {
    this.comGroup.clear()
    if (!res) return
    const color = res.stable ? 0x5cb87a : 0xe05c5c
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xd98e4a }))
    ball.position.copy(res.pos)
    this.comGroup.add(ball)

    const lineGeo = new THREE.BufferGeometry().setFromPoints([res.pos, res.ground])
    this.comGroup.add(new THREE.Line(lineGeo, new THREE.LineDashedMaterial({ color, dashSize: 0.08, gapSize: 0.05 })))
    this.comGroup.children.forEach(c => { if (c instanceof THREE.Line) c.computeLineDistances() })

    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.1, 24),
      new THREE.MeshBasicMaterial({ color }))
    disc.rotation.x = -Math.PI / 2
    disc.position.copy(res.ground).y = 0.005
    this.comGroup.add(disc)

    if (res.polygon.length >= 3) {
      const pts = [...res.polygon, res.polygon[0]].map(p => new THREE.Vector3(p.x, 0.01, p.z))
      const poly = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color }))
      this.comGroup.add(poly)
    }
  }

  // 射线拾取骨骼
  pickBone(clientX: number, clientY: number): string | null {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(ndc, this.camera)
    const hits = this.raycaster.intersectObjects(this.boneGroup.children, true)
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object
      while (o && !this.boneMeshes.has(o.name)) o = o.parent
      if (o) return o.name
    }
    return null
  }

  // 指针位置投射到过某点、垂直于视线的工作平面(IK 拖拽用)
  dragPlanePoint(clientX: number, clientY: number, through: THREE.Vector3): THREE.Vector3 | null {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(ndc, this.camera)
    const normal = this.camera.getWorldDirection(new THREE.Vector3())
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, through)
    const out = new THREE.Vector3()
    return this.raycaster.ray.intersectPlane(plane, out) ? out : null
  }

  start(onTick?: (dt: number) => void) {
    const loop = () => {
      this.raf = requestAnimationFrame(loop)
      const dt = this.clock.getDelta()
      onTick?.(dt)
      this.controls.update()
      this.renderer.render(this.scene, this.camera)
    }
    loop()
  }

  // 高清截图:临时离屏尺寸渲染后立即取图
  screenshot(width: number, height: number): string {
    const prevSize = new THREE.Vector2()
    this.renderer.getSize(prevSize)
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.render(this.scene, this.camera)
    const url = this.renderer.domElement.toDataURL('image/png')
    this.renderer.setSize(prevSize.x, prevSize.y, false)
    this.resize()
    return url
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.resizeObs.disconnect()
    this.controls.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
