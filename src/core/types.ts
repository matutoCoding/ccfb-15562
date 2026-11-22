// 核心数据模型(可 JSON 序列化,用于导入导出)
export interface Vec3 { x: number; y: number; z: number }

// 关节旋转范围(弧度,XYZ 欧拉角各轴独立限位)
export interface JointLimit { min: Vec3; max: Vec3 }

export type BoneKind = 'shaft' | 'vertebra' | 'rib' | 'skull' | 'foot' | 'pelvis'

export interface BoneDef {
  id: string
  name: string
  parentId: string | null
  offset: Vec3        // 关节点相对父骨骼关节点的位置(父局部空间,米)
  direction: Vec3     // 骨块延伸方向(局部单位向量)
  length: number      // 骨块长度(米)
  radius: number      // 骨块半径(米)
  mass: number        // 质量(kg)
  kind: BoneKind
  missing: boolean    // 化石缺失,使用补件
  support: boolean    // 钢架支撑点
  foot: boolean       // 触地点,参与支撑多边形
  ikRoot: boolean     // IK 链底(自身不随 IK 转动)
  limit: JointLimit
}

export type PoseAngles = Record<string, Vec3>

export interface NamedPose { name: string; angles: PoseAngles }

export interface Keyframe { name: string; time: number; angles: PoseAngles }

export interface Skeleton {
  id: string
  name: string
  kind: string
  bones: BoneDef[]           // 保证父先于子(拓扑序)
  current: PoseAngles        // 当前工作姿态
  poses: NamedPose[]         // 姿态方案库
  keyframes: Keyframe[]      // 动画关键帧
}

export interface SteelRod {
  id: string
  kind: 'pole' | 'bracket' | 'link'
  boneId: string | null
  from: Vec3
  to: Vec3
  radius: number
  load: number               // 分担负荷 kg
}

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z })
export const cloneVec = (v: Vec3): Vec3 => ({ x: v.x, y: v.y, z: v.z })
