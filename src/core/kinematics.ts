import * as THREE from 'three'

import { BoneDef, PoseAngles, Skeleton, Vec3 } from './types'

// 单骨骼的运动学状态
export interface BoneState {
  def: BoneDef
  localQuat: THREE.Quaternion   // 姿态旋转(相对父)
  worldMat: THREE.Matrix4       // 关节点世界变换
  worldPos: THREE.Vector3       // 关节点世界坐标
  worldDir: THREE.Vector3       // 骨块延伸方向(世界)
  worldCenter: THREE.Vector3    // 骨块质心世界坐标
  worldQuat: THREE.Quaternion
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

// 关节角硬钳制:所有姿态写入的唯一入口,保证任何时刻关节角都在设定范围内
export const clampAngles = (def: BoneDef, a: Vec3): Vec3 => ({
  x: clamp(a.x, def.limit.min.x, def.limit.max.x),
  y: clamp(a.y, def.limit.min.y, def.limit.max.y),
  z: clamp(a.z, def.limit.min.z, def.limit.max.z),
})

export const getAngles = (skel: Skeleton, pose: PoseAngles, boneId: string): Vec3 =>
  pose[boneId] ?? { x: 0, y: 0, z: 0 }

// 运动学树:负责 FK 计算与局部子树增量更新
export class Kinematics {
  states: BoneState[] = []
  byId = new Map<string, BoneState>()
  children = new Map<string | null, BoneDef[]>()

  constructor(public skel: Skeleton, public pose: PoseAngles) {
    for (const b of skel.bones) {
      const list = this.children.get(b.parentId) ?? []
      list.push(b)
      this.children.set(b.parentId, list)
    }
    this.rebuild()
  }

  // 全量正向运动学
  rebuild() {
    this.states = []
    this.byId.clear()
    const visit = (def: BoneDef, parentMat: THREE.Matrix4, parentQuat: THREE.Quaternion) => {
      const a = clampAngles(def, getAngles(this.skel, this.pose, def.id))
      const localQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(a.x, a.y, a.z, 'XYZ'))
      const local = new THREE.Matrix4().compose(
        new THREE.Vector3(def.offset.x, def.offset.y, def.offset.z), localQuat, new THREE.Vector3(1, 1, 1))
      const worldMat = new THREE.Matrix4().multiplyMatrices(parentMat, local)
      const worldPos = new THREE.Vector3().setFromMatrixPosition(worldMat)
      const worldQuat = new THREE.Quaternion().multiplyQuaternions(parentQuat, localQuat)
      const dir = new THREE.Vector3(def.direction.x, def.direction.y, def.direction.z)
      const worldDir = dir.clone().applyQuaternion(worldQuat).normalize()
      const worldCenter = worldPos.clone().addScaledVector(worldDir, def.length / 2)
      const st: BoneState = { def, localQuat, worldMat, worldPos, worldDir, worldCenter, worldQuat }
      this.states.push(st)
      this.byId.set(def.id, st)
      for (const c of this.children.get(def.id) ?? []) visit(c, worldMat, worldQuat)
    }
    const I = new THREE.Matrix4()
    const Q = new THREE.Quaternion()
    for (const b of this.children.get(null) ?? []) visit(b, I, Q)
  }

  // 只重算某骨骼的下游子树(IK 迭代用,避免 200 块全量重算)
  updateSubtree(rootId: string) {
    const walk = (id: string) => {
      const st = this.byId.get(id)
      if (!st) return
      const def = st.def
      const parentMat = def.parentId ? this.byId.get(def.parentId)!.worldMat : new THREE.Matrix4()
      const parentQuat = def.parentId ? this.byId.get(def.parentId)!.worldQuat : new THREE.Quaternion()
      const a = clampAngles(def, getAngles(this.skel, this.pose, def.id))
      st.localQuat.setFromEuler(new THREE.Euler(a.x, a.y, a.z, 'XYZ'))
      const local = new THREE.Matrix4().compose(
        new THREE.Vector3(def.offset.x, def.offset.y, def.offset.z), st.localQuat, new THREE.Vector3(1, 1, 1))
      st.worldMat.multiplyMatrices(parentMat, local)
      st.worldPos.setFromMatrixPosition(st.worldMat)
      st.worldQuat.multiplyQuaternions(parentQuat, st.localQuat)
      st.worldDir.set(def.direction.x, def.direction.y, def.direction.z).applyQuaternion(st.worldQuat).normalize()
      st.worldCenter.copy(st.worldPos).addScaledVector(st.worldDir, def.length / 2)
      for (const c of this.children.get(id) ?? []) walk(c.id)
    }
    walk(rootId)
  }

  // 骨骼末端点(骨块尾端)世界坐标
  tipOf(id: string): THREE.Vector3 {
    const st = this.byId.get(id)!
    return st.worldPos.clone().addScaledVector(st.worldDir, st.def.length)
  }
}
