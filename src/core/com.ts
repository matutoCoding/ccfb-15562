import * as THREE from 'three'

import { BoneState } from './kinematics'

export interface ComResult {
  pos: THREE.Vector3        // 重心世界坐标
  totalMass: number
  ground: THREE.Vector3     // 重心地面投影
  polygon: THREE.Vector3[]  // 支撑多边形(凸包,XZ)
  stable: boolean           // 投影是否在支撑区内
  margin: number            // 距多边形边界的有符号距离(内正外负,米)
}

// 重心 = Σ mi·pi / Σ mi,质心取骨块几何中心,可逐块手算核对
export const computeCOM = (states: BoneState[]): { pos: THREE.Vector3; totalMass: number } => {
  const pos = new THREE.Vector3()
  let total = 0
  for (const st of states) {
    pos.addScaledVector(st.worldCenter, st.def.mass)
    total += st.def.mass
  }
  if (total > 0) pos.divideScalar(total)
  return { pos, totalMass: total }
}

// Andrew 单调链凸包(XZ 平面)
export const convexHull = (pts: THREE.Vector3[]): THREE.Vector3[] => {
  const p = [...pts].sort((a, b) => a.x - b.x || a.z - b.z)
  if (p.length <= 2) return p
  const cross = (o: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) =>
    (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x)
  const lower: THREE.Vector3[] = []
  for (const pt of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop()
    lower.push(pt)
  }
  const upper: THREE.Vector3[] = []
  for (let i = p.length - 1; i >= 0; i--) {
    const pt = p[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop()
    upper.push(pt)
  }
  lower.pop(); upper.pop()
  return lower.concat(upper)
}

// 射线法点在多边形内(XZ 平面),同时返回到边界的最小距离
export const pointInPolygon = (p: THREE.Vector3, poly: THREE.Vector3[]): { inside: boolean; margin: number } => {
  if (poly.length < 3) return { inside: false, margin: -Infinity }
  let inside = false
  let minDist = Infinity
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]; const b = poly[j]
    if ((a.z > p.z) !== (b.z > p.z) && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside
    // 点到线段距离
    const abx = b.x - a.x; const abz = b.z - a.z
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / (abx * abx + abz * abz)))
    const dx = p.x - (a.x + abx * t); const dz = p.z - (a.z + abz * t)
    minDist = Math.min(minDist, Math.hypot(dx, dz))
  }
  return { inside, margin: inside ? minDist : -minDist }
}

export const analyzeStability = (states: BoneState[]): ComResult => {
  const { pos, totalMass } = computeCOM(states)
  const ground = new THREE.Vector3(pos.x, 0, pos.z)
  const feet = states.filter(s => s.def.foot)
  // 触地点取足部骨块中心的地面投影
  const polygon = convexHull(feet.map(s => new THREE.Vector3(s.worldCenter.x, 0, s.worldCenter.z)))
  // 触地点不足 3 个时退化为线段/点判定:投影距支撑线 0.2m 内视为稳定
  if (polygon.length < 3) {
    let margin = -Infinity
    if (polygon.length === 1) margin = 0.2 - ground.distanceTo(polygon[0])
    if (polygon.length === 2) {
      const ab = polygon[1].clone().sub(polygon[0])
      const t = Math.max(0, Math.min(1, ground.clone().sub(polygon[0]).dot(ab) / ab.lengthSq()))
      margin = 0.2 - ground.distanceTo(polygon[0].clone().addScaledVector(ab, t))
    }
    return { pos, totalMass, ground, polygon, stable: margin > 0, margin }
  }
  const { inside, margin } = pointInPolygon(ground, polygon)
  return { pos, totalMass, ground, polygon, stable: inside, margin }
}
