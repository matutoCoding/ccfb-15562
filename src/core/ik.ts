import * as THREE from 'three'

import { clampAngles, Kinematics } from './kinematics'

export interface IkResult {
  reached: boolean      // 末端是否到达目标(容差内)
  clamped: string[]     // 本次求解中撞到限位的关节名
  distance: number      // 末端到目标的剩余距离
}

// 收集 IK 链:从末端向上,直到 ikRoot(不含)或根
export const ikChain = (kin: Kinematics, effectorId: string): string[] => {
  const chain: string[] = []
  let cur = kin.byId.get(effectorId)?.def.parentId ?? null
  while (cur) {
    const def = kin.byId.get(cur)!.def
    if (def.ikRoot) break
    chain.push(cur)
    cur = def.parentId
  }
  return chain
}

// CCD IK:逐关节把末端转向目标,每步分解欧拉角并硬钳制
export const solveIK = (
  kin: Kinematics, effectorId: string, target: THREE.Vector3, maxIter = 12, tol = 0.005,
): IkResult => {
  const chain = ikChain(kin, effectorId)
  const clampedSet = new Set<string>()
  const v1 = new THREE.Vector3(); const v2 = new THREE.Vector3()
  const delta = new THREE.Quaternion(); const parentInv = new THREE.Quaternion()
  const e = new THREE.Euler()

  for (let iter = 0; iter < maxIter; iter++) {
    const eff = kin.tipOf(effectorId)
    if (eff.distanceTo(target) < tol) break
    for (const jointId of chain) {
      const st = kin.byId.get(jointId)!
      const effPos = kin.tipOf(effectorId)
      v1.copy(effPos).sub(st.worldPos)
      v2.copy(target).sub(st.worldPos)
      if (v1.lengthSq() < 1e-10 || v2.lengthSq() < 1e-10) continue
      v1.normalize(); v2.normalize()
      delta.setFromUnitVectors(v1, v2)
      // 世界增量旋转 → 关节局部四元数
      const parentQuat = st.def.parentId ? kin.byId.get(st.def.parentId)!.worldQuat : new THREE.Quaternion()
      parentInv.copy(parentQuat).invert()
      const newLocal = new THREE.Quaternion().multiplyQuaternions(parentInv, delta.clone().multiply(st.worldQuat))
      // 分解为 XYZ 欧拉角 → 逐轴钳制 → 重建,保证永不超限
      e.setFromQuaternion(newLocal, 'XYZ')
      const raw = { x: e.x, y: e.y, z: e.z }
      const c = clampAngles(st.def, raw)
      if (c.x !== raw.x || c.y !== raw.y || c.z !== raw.z) clampedSet.add(st.def.name)
      kin.pose[jointId] = c
      kin.updateSubtree(jointId)
    }
  }
  const dist = kin.tipOf(effectorId).distanceTo(target)
  return { reached: dist < tol * 4, clamped: [...clampedSet], distance: dist }
}
