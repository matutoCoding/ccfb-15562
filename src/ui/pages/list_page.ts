import { downloadText, skeletonFromJson, skeletonToJson } from '../../core/exporter'
import { generateSauropod, generateTheropod } from '../../core/skeleton_factory'
import { Skeleton } from '../../core/types'
import { store } from '../../store'
import { btn, el, pickFile, toast } from '../ui'

// 骨架列表页:增删改、导入导出
export const mountListPage = (root: HTMLElement): (() => void) => {
  const head = el('div', 'page-head')
  head.append(el('h1', '', '骨架列表'), el('span', 'spacer'))
  const body = el('div', 'page-body')
  root.append(head, body)

  head.append(
    btn('新建兽脚类', '', () => { store.upsert(generateTheropod()); toast('已生成兽脚类骨架') }),
    btn('新建蜥脚类', '', () => { store.upsert(generateSauropod()); toast('已生成蜥脚类骨架') }),
    btn('导入骨架', '', async () => {
      const text = await pickFile('.json')
      if (!text) return
      try {
        const skel = skeletonFromJson(text)
        skel.id = crypto.randomUUID()
        store.upsert(skel)
        toast(`已导入「${skel.name}」`)
      } catch (e) { toast(`导入失败:${(e as Error).message}`, true) }
    }),
  )

  const open = (s: Skeleton) => { store.activeId = s.id; store.save(); location.hash = '#pose' }

  const render = () => {
    body.innerHTML = ''
    if (store.skeletons.length === 0) {
      const empty = el('div', 'empty')
      empty.append(el('div', 'title', '还没有骨架数据'),
        el('div', '', '点击右上角按钮生成一具两足兽脚类或四足蜥脚类骨架'))
      body.appendChild(empty)
      return
    }
    const grid = el('div', 'grid-cards')
    for (const s of store.skeletons) {
      const card = el('div', 'card skel-card')
      const missing = s.bones.filter(b => b.missing).length
      card.append(
        el('div', '', s.name),
        el('div', 'meta', `${s.kind} · ${s.bones.length} 块骨骼 · 补件 ${missing} 块 · 姿态方案 ${s.poses.length} 套`),
      )
      const ops = el('div', 'ops')
      ops.append(
        btn('打开设计', 'primary sm', () => open(s)),
        btn('重命名', 'sm', () => {
          const name = prompt('骨架名称', s.name)
          if (name) { s.name = name; store.save() }
        }),
        btn('复制', 'sm', () => {
          const copy: Skeleton = JSON.parse(JSON.stringify(s))
          copy.id = crypto.randomUUID()
          copy.name = `${s.name} 副本`
          store.upsert(copy)
        }),
        btn('导出', 'sm', () => downloadText(`${s.name}.json`, skeletonToJson(s))),
        btn('删除', 'sm danger', () => {
          if (confirm(`删除「${s.name}」?此操作不可恢复`)) store.remove(s.id)
        }),
      )
      card.appendChild(ops)
      card.ondblclick = () => open(s)
      grid.appendChild(card)
    }
    body.appendChild(grid)
  }

  render()
  const off = store.onChange(render)
  return off
}
