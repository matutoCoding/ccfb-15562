import * as THREE from 'three'

import { BoneState } from './kinematics'
import { SteelRod, Vec3 } from './types'

export interface SteelOptions {
  gap: number       // 托架与骨面间隙(米)
  links: boolean    // 是否生成主杆间横向连杆
}

const out = (v: THREE.Vector3): Vec3 => ({ x: v.x, y: v.y, z: v.z })

// 杆径按负荷分档(米)
export const rodRadius = (load: number): number =>
  load < 60 ? 0.02 : load < 250 ? 0.032 : 0.045

// 点到线段最短距离
const segDist = (p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number => {
  const ab = b.clone().sub(a)
  const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq()))
  return p.distanceTo(a.clone().addScaledVector(ab, t))
}

// 杆件是否与任一骨块干涉(采样检测,裕量 = 骨半径 + 杆半径)
const rodClear = (a: THREE.Vector3, b: THREE.Vector3, rodR: number, states: BoneState[], ignoreId: string | null): boolean => {
  const samples = 16
  for (let i = 0; i <= samples; i++) {
    const p = a.clone().lerp(b, i / samples)
    for (const st of states) {
      if (st.def.id === ignoreId) continue
      const tip = st.worldPos.clone().addScaledVector(st.worldDir, st.def.length)
      if (segDist(p, st.worldPos, tip) < st.def.radius + rodR + 0.01) return false
    }
  }
  return true
}

// 按当前姿态生成钢架:主杆落地侧移避让骨块,托架贴骨面,连杆加固
export const generateSteel = (states: BoneState[], opts: SteelOptions): SteelRod[] => {
  const rods: SteelRod[] = []
  const supports = states.filter(s => s.def.support)
  if (supports.length === 0) return rods

  // 负荷分配:每块骨的质量归到最近的支撑点(水平距离)
  const loadOf = new Map<string, number>()
  for (const s of supports) loadOf.set(s.def.id, 0)
  for (const st of states) {
    let best: BoneState | null = null; let bd = Infinity
    for (const s of supports) {
      const d = Math.hypot(st.worldCenter.x - s.worldCenter.x, st.worldCenter.z - s.worldCenter.z)
      if (d < bd) { bd = d; best = s }
    }
    loadOf.set(best!.def.id, loadOf.get(best!.def.id)! + st.def.mass)
  }

  const poleTops: THREE.Vector3[] = []
  let n = 0
  for (const s of supports) {
    const load = loadOf.get(s.def.id)!
    const r = rodRadius(load)
    // 托架接触点:骨块质心正下方骨面,留出间隙
    const contact = s.worldCenter.clone().add(new THREE.Vector3(0, -s.def.radius - opts.gap, 0))
    // 主杆在侧方避让:从中线向外偏移,逐级加大直到不碰骨块
    const side = contact.z >= 0 ? 1 : -1
    let off = s.def.radius + r + 0.12
    let base = new THREE.Vector3()
    let top = new THREE.Vector3()
    for (let tries = 0; tries < 8; tries++) {
      base = new THREE.Vector3(contact.x, 0, contact.z + side * off)
      top = new THREE.Vector3(contact.x, contact.y, contact.z + side * off)
      if (rodClear(base, top, r, states, s.def.id)) break
      off += s.def.radius + 0.1
    }
    rods.push({ id: `rod${n++}`, kind: 'pole', boneId: s.def.id, from: out(base), to: out(top), radius: r, load })
    // 托架:主杆顶 → 骨面接触点
    rods.push({ id: `rod${n++}`, kind: 'bracket', boneId: s.def.id, from: out(top), to: out(contact), radius: r * 0.7, load })
    poleTops.push(top)
  }

  // 相邻主杆间横向连杆(半高处)
  if (links && poleTops.length > 1) {
    const sorted = [...poleTops].sort((a, b) => a.x - b.x)
    for (let i = 0; i + 1 < sorted.length; i++) {
      const a = sorted[i].clone().multiplyScalar(0.5)
      const b = sorted[i + 1].clone().multiplyScalar(0.5)
      if (a.distanceTo(b) < 5 && rodClear(a, b, 0.02, states, null)) {
        rods.push({ id: `rod${n++}`, kind: 'link', boneId: null, from: out(a), to: out(b), radius: 0.02, load: 0 })
      }
    }
  }
  return rods
}

export const steelToCsv = (rods: SteelRod[]): string => {
  const len = (r: SteelRod) => Math.hypot(r.to.x - r.from.x, r.to.y - r.from.y, r.to.z - r.from.z)
  const rows = rods.map(r =>
    [r.id, r.kind, r.boneId ?? '', len(r).toFixed(3), (r.radius * 1000).toFixed(1), r.load.toFixed(1),
      `(${r.from.x.toFixed(3)},${r.from.y.toFixed(3)},${r.from.z.toFixed(3)})`,
      `(${r.to.x.toFixed(3)},${r.to.y.toFixed(3)},${r.to.z.toFixed(3)})`].join(','))
  return ['杆件编号,类型,关联骨骼,长度(m),杆径(mm),分担负荷(kg),起点,终点', ...rows].join('\n')
}
