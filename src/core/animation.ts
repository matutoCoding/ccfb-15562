import { clampAngles } from './kinematics'
import { PoseAngles, Skeleton } from './types'

// 姿态线性插值(逐关节欧拉角,插值后再钳制)
export const lerpPose = (skel: Skeleton, a: PoseAngles, b: PoseAngles, t: number): PoseAngles => {
  const out: PoseAngles = {}
  for (const bone of skel.bones) {
    const pa = a[bone.id] ?? { x: 0, y: 0, z: 0 }
    const pb = b[bone.id] ?? { x: 0, y: 0, z: 0 }
    out[bone.id] = clampAngles(bone, {
      x: pa.x + (pb.x - pa.x) * t,
      y: pa.y + (pb.y - pa.y) * t,
      z: pa.z + (pb.z - pa.z) * t,
    })
  }
  return out
}

// 关键帧动画播放器(如起身动画)
export class PosePlayer {
  time = 0
  playing = false

  constructor(private skel: Skeleton) {}

  get duration(): number {
    const ks = this.skel.keyframes
    return ks.length > 0 ? Math.max(...ks.map(k => k.time)) : 0
  }

  // 把 t 时刻的姿态写入目标 PoseAngles,返回是否有效
  applyAt(t: number, target: PoseAngles): boolean {
    const ks = [...this.skel.keyframes].sort((x, y) => x.time - y.time)
    if (ks.length === 0) return false
    if (t <= ks[0].time) { Object.assign(target, lerpPose(this.skel, ks[0].angles, ks[0].angles, 0)); return true }
    for (let i = 0; i + 1 < ks.length; i++) {
      if (t >= ks[i].time && t <= ks[i + 1].time) {
        const f = (t - ks[i].time) / (ks[i + 1].time - ks[i].time)
        Object.assign(target, lerpPose(this.skel, ks[i].angles, ks[i + 1].angles, f))
        return true
      }
    }
    Object.assign(target, lerpPose(this.skel, ks[ks.length - 1].angles, ks[ks.length - 1].angles, 0))
    return true
  }

  // 每帧推进,返回是否仍在播放
  tick(dt: number, target: PoseAngles): boolean {
    if (!this.playing || this.duration <= 0) return false
    this.time += dt
    if (this.time >= this.duration) { this.time = this.duration; this.playing = false }
    this.applyAt(this.time, target)
    return this.playing
  }
}
