import * as THREE from 'three'

import { BoneDef } from './types'

export interface BonePalette {
  fossil: string
  prosthetic: string
  selected: string
}

// 按骨骼类型生成网格(胶囊/曲面,不用方块),几何沿 +Y 轴构建
export const createBoneMesh = (def: BoneDef, palette: BonePalette): THREE.Group => {
  const group = new THREE.Group()
  group.name = def.id
  const color = def.missing ? palette.prosthetic : palette.fossil
  const mat = new THREE.MeshStandardMaterial({
    color, roughness: def.missing ? 0.4 : 0.75, metalness: 0.05,
    transparent: def.missing, opacity: def.missing ? 0.92 : 1,
  })
  const L = def.length
  const r = def.radius

  const capsule = (radius: number, len: number, sy = 1) => {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(radius, Math.max(0.01, len), 6, 12), mat)
    m.scale.y = sy
    m.position.y = len / 2
    return m
  }

  switch (def.kind) {
    case 'vertebra': {
      const body = capsule(r, L * 0.7)
      body.scale.x = 1.15; body.scale.z = 1.15
      group.add(body)
      const spine = new THREE.Mesh(new THREE.ConeGeometry(r * 0.5, r * 2.2, 6), mat)
      spine.position.set(0, L * 0.35, r * 1.2)
      spine.rotation.x = Math.PI / 2
      group.add(spine)
      break
    }
    case 'rib': {
      // 弧形肋条:圆环的一段
      const arc = new THREE.Mesh(new THREE.TorusGeometry(L * 0.55, r, 6, 14, Math.PI * 0.85), mat)
      arc.rotation.z = -Math.PI * 0.42
      arc.position.y = L * 0.1
      group.add(arc)
      break
    }
    case 'skull': {
      const cranium = new THREE.Mesh(new THREE.SphereGeometry(r * 1.5, 14, 10), mat)
      cranium.scale.set(1, 0.95, 0.8)
      cranium.position.y = L * 0.25
      group.add(cranium)
      const snout = new THREE.Mesh(new THREE.ConeGeometry(r * 0.85, L * 0.75, 10), mat)
      snout.position.y = L * 0.62
      group.add(snout)
      break
    }
    case 'pelvis': {
      const body = capsule(r, L * 0.8)
      body.scale.x = 1.3
      group.add(body)
      const blade = new THREE.Mesh(new THREE.SphereGeometry(r * 1.6, 12, 8), mat)
      blade.scale.set(1, 0.5, 0.25)
      blade.position.y = L * 0.4
      group.add(blade)
      break
    }
    case 'foot':
      group.add(capsule(r, L * 0.9))
      break
    default:
      group.add(capsule(r, L * 0.85))
  }
  group.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true } })
  return group
}

// 钢架杆件网格
export const createRodMesh = (from: THREE.Vector3, to: THREE.Vector3, radius: number, color: string): THREE.Mesh => {
  const len = from.distanceTo(to)
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, len, 10),
    new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.8 }),
  )
  mesh.position.copy(from).lerp(to, 0.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize())
  mesh.castShadow = true
  return mesh
}
