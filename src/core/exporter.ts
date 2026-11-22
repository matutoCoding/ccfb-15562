import { Skeleton } from './types'

// 通用下载
export const downloadText = (filename: string, text: string, mime = 'application/json') => {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }))
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

export const downloadDataUrl = (filename: string, dataUrl: string) => {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.click()
}

export const skeletonToJson = (skel: Skeleton): string => JSON.stringify(skel, null, 2)

export const skeletonFromJson = (text: string): Skeleton => {
  const obj = JSON.parse(text) as Skeleton
  if (!obj.bones || !Array.isArray(obj.bones) || obj.bones.length === 0) throw new Error('文件中没有骨骼数据')
  obj.poses = obj.poses ?? []
  obj.keyframes = obj.keyframes ?? []
  obj.current = obj.current ?? {}
  return obj
}

// 姿态参数导出(关节角表,度)
export const poseToCsv = (skel: Skeleton): string => {
  const d = (r: number) => ((r * 180) / Math.PI).toFixed(2)
  const rows = skel.bones.map(b => {
    const a = skel.current[b.id] ?? { x: 0, y: 0, z: 0 }
    return [b.id, b.name, d(a.x), d(a.y), d(a.z),
      d(b.limit.min.x), d(b.limit.max.x), d(b.limit.min.y), d(b.limit.max.y), d(b.limit.min.z), d(b.limit.max.z)].join(',')
  })
  return ['骨骼ID,名称,角X(°),角Y(°),角Z(°),限位Xmin,限位Xmax,限位Ymin,限位Ymax,限位Zmin,限位Zmax', ...rows].join('\n')
}
