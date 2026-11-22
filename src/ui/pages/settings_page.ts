import { generateDefaults } from '../../core/skeleton_factory'
import { store } from '../../store'
import { btn, checkRow, el, field, numInput, toast } from '../ui'

// 设置页:外观、IK 参数、钢架参数、数据管理
export const mountSettingsPage = (root: HTMLElement): (() => void) => {
  const head = el('div', 'page-head')
  head.append(el('h1', '', '设置'))
  const body = el('div', 'page-body')
  root.append(head, body)

  const card = el('div', 'card')
  card.style.maxWidth = '560px'
  body.appendChild(card)
  const s = store.settings
  const save = () => { store.save(); toast('设置已保存') }

  card.append(el('h3', '', '显示'))
  const colorRow = (label: string, key: 'boneColor' | 'prostheticColor' | 'steelColor') => {
    const c = el('input') as HTMLInputElement
    c.type = 'color'; c.value = s[key]
    c.onchange = () => { s[key] = c.value; save() }
    const row = el('div', 'row')
    row.append(c, el('span', '', label))
    card.appendChild(row)
  }
  colorRow('化石骨骼颜色', 'boneColor')
  colorRow('补件颜色(缺失骨骼)', 'prostheticColor')
  colorRow('钢架颜色', 'steelColor')
  card.append(
    checkRow('默认显示骨骼', s.showBones, v => { s.showBones = v; save() }),
    checkRow('默认显示钢架', s.showSteel, v => { s.showSteel = v; save() }),
    checkRow('显示重心与支撑区', s.showCom, v => { s.showCom = v; save() }),
  )

  card.append(el('h3', '', 'IK 求解'))
  card.append(field('迭代次数(越大越精确)', numInput(s.ikIterations, 1, v => { s.ikIterations = Math.max(1, Math.round(v)); save() })))

  card.append(el('h3', '', '钢架生成'))
  card.append(
    field('托架与骨面间隙 (m)', numInput(s.steelGap, 0.005, v => { s.steelGap = Math.max(0, v); save() })),
    checkRow('生成主杆间连杆', s.steelLinks, v => { s.steelLinks = v; save() }),
  )

  card.append(el('h3', '', '数据'))
  const ops = el('div', 'row wrap')
  ops.append(
    btn('重新生成示例骨架', 'sm', () => {
      if (!confirm('将追加一具兽脚类和一具蜥脚类骨架,继续?')) return
      generateDefaults().forEach(k => store.upsert(k))
      toast('已生成示例骨架')
    }),
    btn('清空全部数据', 'sm danger', () => {
      if (!confirm('清空所有骨架与设置?此操作不可恢复')) return
      localStorage.clear()
      location.reload()
    }),
  )
  card.appendChild(ops)
  return () => {}
}
