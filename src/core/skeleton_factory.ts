import { BoneDef, BoneKind, JointLimit, Skeleton, Vec3, vec3 } from './types'

const norm = (x: number, y: number, z: number): Vec3 => {
  const l = Math.hypot(x, y, z)
  return { x: x / l, y: y / l, z: z / l }
}
const scale = (v: Vec3, s: number): Vec3 => ({ x: v.x * s, y: v.y * s, z: v.z * s })
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })

// 关节限位:z=俯仰 y=偏航 x=翻滚(弧度)
const limit = (z: number, y: number, x: number): JointLimit => ({
  min: { x: -x, y: -y, z: -z }, max: { x, y, z },
})

interface BoneOpts {
  kind?: BoneKind; missing?: boolean; support?: boolean; foot?: boolean; ikRoot?: boolean
  limit?: JointLimit
}

class Builder {
  bones: BoneDef[] = []
  private n = 0
  add(
    name: string, parentId: string | null, offset: Vec3, direction: Vec3,
    length: number, radius: number, mass: number, opts: BoneOpts = {},
  ): BoneDef {
    const b: BoneDef = {
      id: `b${this.n++}`, name, parentId, offset, direction: norm(direction.x, direction.y, direction.z),
      length, radius, mass,
      kind: opts.kind ?? 'shaft', missing: opts.missing ?? false,
      support: opts.support ?? false, foot: opts.foot ?? false, ikRoot: opts.ikRoot ?? false,
      limit: opts.limit ?? limit(0.15, 0.15, 0.08),
    }
    this.bones.push(b)
    return b
  }
  // 接在父骨块尾端
  chain(name: string, parent: BoneDef, direction: Vec3, length: number, radius: number, mass: number, opts: BoneOpts = {}) {
    return this.add(name, parent.id, scale(parent.direction, parent.length), direction, length, radius, mass, opts)
  }
}

const skel = (name: string, kind: string, bones: BoneDef[]): Skeleton => ({
  id: crypto.randomUUID(), name, kind, bones, current: {}, poses: [], keyframes: [],
})

// 两足兽脚类(类异特龙,约 8m)
export const generateTheropod = (): Skeleton => {
  const b = new Builder()
  const hipY = 2.25
  const pelvis = b.add('荐椎复合体', null, vec3(0, hipY, 0), norm(1, 0, 0), 0.9, 0.2, 160,
    { kind: 'pelvis', support: true, ikRoot: true, limit: limit(0.6, 0.6, 0.4) })

  // 背椎链(向前上方)
  let prev = pelvis
  const dorsals: BoneDef[] = []
  for (let i = 0; i < 12; i++) {
    const d = b.chain(`背椎 D${i + 1}`, prev, norm(1, 0.1 - i * 0.01, 0), 0.26, 0.13, 24,
      { kind: 'vertebra', ikRoot: i === 0, support: i === 6, limit: limit(0.12, 0.1, 0.05) })
    dorsals.push(d); prev = d
  }
  // 颈椎链(上扬)
  const necks: BoneDef[] = []
  for (let i = 0; i < 9; i++) {
    const n = b.chain(`颈椎 C${i + 1}`, prev, norm(1, 0.28 + i * 0.02, 0), 0.24, 0.1, 10,
      { kind: 'vertebra', limit: limit(0.18, 0.15, 0.06) })
    necks.push(n); prev = n
  }
  const skull = b.chain('头骨', prev, norm(1, 0.05, 0), 0.8, 0.2, 55, { kind: 'skull', limit: limit(0.3, 0.4, 0.15) })
  b.add('下颌', skull.id, add(scale(skull.direction, skull.length * 0.45), vec3(0, -0.12, 0)),
    norm(1, -0.15, 0), 0.55, 0.07, 8, { kind: 'skull', limit: limit(0.5, 0.05, 0.02) })

  // 尾椎链(向后渐细)
  prev = pelvis
  for (let i = 0; i < 22; i++) {
    const t = 1 - i / 22
    const c = b.chain(`尾椎 Ca${i + 1}`, prev, norm(-1, -0.04, 0), 0.24, 0.1 * t + 0.02, 14 * t + 2,
      { kind: 'vertebra', ikRoot: i === 0, support: i === 12, limit: limit(0.1, 0.12, 0.04) })
    prev = c
  }
  // 肋骨(成对,腹向弧形)
  dorsals.forEach((d, i) => {
    const ribLen = 0.55 + Math.sin(((i + 1) / dorsals.length) * Math.PI) * 0.45
    for (const s of [-1, 1]) {
      b.add(`肋骨 R${i + 1}${s < 0 ? 'L' : 'R'}`, d.id,
        add(scale(d.direction, d.length * 0.5), vec3(0, -0.05, s * 0.1)),
        norm(0.15, -1, s * 0.45), ribLen, 0.03, 5,
        { kind: 'rib', missing: (i === 4 && s < 0) || (i === 7 && s > 0), limit: limit(0.05, 0.05, 0.05) })
    }
  })
  // 前肢(兽脚类小短手)
  for (const s of [-1, 1]) {
    const sc = b.add(`肩胛${s < 0 ? 'L' : 'R'}`, dorsals[2].id,
      add(scale(dorsals[2].direction, dorsals[2].length * 0.5), vec3(0, -0.1, s * 0.22)),
      norm(0.2, -1, s * 0.2), 0.3, 0.05, 8, { ikRoot: true, limit: limit(0.4, 0.3, 0.3) })
    const hu = b.chain(`肱骨${s < 0 ? 'L' : 'R'}`, sc, norm(0.1, -1, 0), 0.22, 0.04, 5, { limit: limit(0.6, 0.3, 0.3) })
    const fo = b.chain(`前臂${s < 0 ? 'L' : 'R'}`, hu, norm(0.3, -1, 0), 0.18, 0.03, 3,
      { missing: s > 0, limit: limit(0.9, 0.2, 0.2) })
    b.chain(`指爪${s < 0 ? 'L' : 'R'}`, fo, norm(0.5, -1, 0), 0.12, 0.02, 1, { limit: limit(0.6, 0.3, 0.2) })
  }
  // 后肢
  for (const s of [-1, 1]) {
    const fe = b.add(`股骨${s < 0 ? 'L' : 'R'}`, pelvis.id, vec3(0.1, -0.15, s * 0.28),
      norm(0.05, -1, s * 0.05), 0.85, 0.09, 45, { limit: limit(0.8, 0.25, 0.2) })
    const ti = b.chain(`胫骨${s < 0 ? 'L' : 'R'}`, fe, norm(-0.05, -1, 0), 0.8, 0.07, 28, { limit: limit(1.1, 0.1, 0.05) })
    const mt = b.chain(`跖骨${s < 0 ? 'L' : 'R'}`, ti, norm(0.1, -1, 0), 0.45, 0.05, 12, { limit: limit(0.9, 0.1, 0.05) })
    for (let t = -1; t <= 1; t++) {
      b.chain(`趾骨${s < 0 ? 'L' : 'R'}${t + 2}`, mt, norm(1, -0.08, t * 0.3), 0.28, 0.03, 2,
        { kind: 'foot', foot: true, missing: s > 0 && t === 1, limit: limit(0.5, 0.2, 0.1) })
    }
  }
  return skel('兽脚类骨架(自动生成)', 'theropod', b.bones)
}

// 四足蜥脚类(类梁龙,约 18m)
export const generateSauropod = (): Skeleton => {
  const b = new Builder()
  const hipY = 2.6
  const pelvis = b.add('荐椎复合体', null, vec3(0, hipY, 0), norm(1, 0, 0), 1.2, 0.3, 420,
    { kind: 'pelvis', support: true, ikRoot: true, limit: limit(0.5, 0.5, 0.3) })

  let prev = pelvis
  const dorsals: BoneDef[] = []
  for (let i = 0; i < 11; i++) {
    const d = b.chain(`背椎 D${i + 1}`, prev, norm(1, 0.06, 0), 0.4, 0.2, 60,
      { kind: 'vertebra', ikRoot: i === 0, support: i === 8, limit: limit(0.1, 0.08, 0.04) })
    dorsals.push(d); prev = d
  }
  // 长颈(大幅上扬)
  const necks: BoneDef[] = []
  for (let i = 0; i < 14; i++) {
    const n = b.chain(`颈椎 C${i + 1}`, prev, norm(1, 0.32 + i * 0.015, 0), 0.45, 0.14, 26,
      { kind: 'vertebra', support: i === 7, limit: limit(0.14, 0.12, 0.05) })
    necks.push(n); prev = n
  }
  b.chain('头骨', prev, norm(1, 0.1, 0), 0.6, 0.14, 30, { kind: 'skull', limit: limit(0.35, 0.4, 0.15) })

  // 长尾
  prev = pelvis
  for (let i = 0; i < 28; i++) {
    const t = 1 - i / 28
    const c = b.chain(`尾椎 Ca${i + 1}`, prev, norm(-1, -0.05, 0), 0.34, 0.14 * t + 0.02, 30 * t + 3,
      { kind: 'vertebra', ikRoot: i === 0, support: i === 14, limit: limit(0.08, 0.1, 0.04) })
    prev = c
  }
  // 肋骨
  dorsals.forEach((d, i) => {
    const ribLen = 0.9 + Math.sin(((i + 1) / dorsals.length) * Math.PI) * 0.7
    for (const s of [-1, 1]) {
      b.add(`肋骨 R${i + 1}${s < 0 ? 'L' : 'R'}`, d.id,
        add(scale(d.direction, d.length * 0.5), vec3(0, -0.08, s * 0.16)),
        norm(0.12, -1, s * 0.4), ribLen, 0.04, 12,
        { kind: 'rib', missing: (i === 3 && s > 0) || (i === 8 && s < 0), limit: limit(0.04, 0.04, 0.04) })
    }
  })
  // 四肢(前后共 4 条)
  const leg = (root: BoneDef, side: number, tag: string, front: boolean) => {
    const fe = b.add(`${tag}股骨${side < 0 ? 'L' : 'R'}`, root.id, vec3(front ? 0.2 : -0.1, -0.2, side * 0.45),
      norm(0, -1, side * 0.03), front ? 1.15 : 1.05, 0.11, front ? 70 : 85, { limit: limit(0.7, 0.2, 0.15) })
    const ti = b.chain(`${tag}胫骨${side < 0 ? 'L' : 'R'}`, fe, norm(0, -1, 0), front ? 0.85 : 0.75, 0.09, 45, { limit: limit(0.9, 0.08, 0.04) })
    const mt = b.chain(`${tag}跖骨${side < 0 ? 'L' : 'R'}`, ti, norm(0.05, -1, 0), 0.55, 0.08, 25, { limit: limit(0.7, 0.08, 0.04) })
    b.chain(`${tag}趾掌${side < 0 ? 'L' : 'R'}`, mt, norm(1, -0.05, 0), 0.3, 0.09, 10,
      { kind: 'foot', foot: true, missing: front && side > 0, limit: limit(0.4, 0.15, 0.08) })
  }
  for (const s of [-1, 1]) {
    leg(pelvis, s, '后', false)
    leg(dorsals[8], s, '前', true)
  }
  return skel('蜥脚类骨架(自动生成)', 'sauropod', b.bones)
}

export const generateDefaults = (): Skeleton[] => [generateTheropod(), generateSauropod()]
