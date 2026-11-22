import { analyzeStability } from '../../core/com'
import { downloadText } from '../../core/exporter'
import { Kinematics } from '../../core/kinematics'
import { generateSteel, steelToCsv } from '../../core/steel'
import { SteelRod } from '../../core/types'
import { store } from '../../store'
import { Viewport } from '../../three/viewport'
import { btn, checkRow, el, toast } from '../ui'

// 钢架生成页:按当前姿态生成支撑钢架,杆件明细可导出
export const mountSteelPage = (root: HTMLElement): (() => void) => {
  const skel = store.active
  if (!skel) { root.append(el('div', 'page-body', '请先在骨架列表中选择骨架')); return () => {} }

  const head = el('div', 'page-head')
  head.append(el('h1', '', `钢架生成 — ${skel.name}`), el('span', 'spacer'))
  const body = el('div', 'page-body fill')
  const viewWrap = el('div', 'viewport-wrap')
  const panel = el('div', 'panel right')
  body.append(viewWrap, panel)
  root.append(head, body)

  const kin = new Kinematics(skel, skel.current)
  const vp = new Viewport(viewWrap, {
    palette: { fossil: store.settings.boneColor, prosthetic: store.settings.prostheticColor, selected: '#d98e4a' },
    steelColor: store.settings.steelColor,
  })
  vp.buildSkeleton(kin)

  let rods: SteelRod[] = []
  const regenerate = () => {
    kin.rebuild()
    rods = generateSteel(kin.states, { gap: store.settings.steelGap, links: store.settings.steelLinks })
    vp.setSteel(rods)
    renderTable()
    toast(`已生成 ${rods.length} 根杆件`)
  }

  const tblWrap = el('div')
  const renderTable = () => {
    tblWrap.innerHTML = ''
    tblWrap.append(el('h3', '', `杆件明细(${rods.length} 根)`))
    const tbl = el('table', 'tbl')
    const len = (r: SteelRod) => Math.hypot(r.to.x - r.from.x, r.to.y - r.from.y, r.to.z - r.from.z)
    const kindName = { pole: '主杆', bracket: '托架', link: '连杆' }
    tbl.innerHTML = '<tr><th>编号</th><th>类型</th><th>长度 m</th><th>杆径 mm</th><th>负荷 kg</th></tr>'
    for (const r of rods) {
      const tr = el('tr')
      tr.innerHTML = `<td>${r.id}</td><td>${kindName[r.kind]}</td><td>${len(r).toFixed(3)}</td><td>${(r.radius * 1000).toFixed(1)}</td><td>${r.load.toFixed(1)}</td>`
      tbl.appendChild(tr)
    }
    tblWrap.appendChild(tbl)
    const totalLen = rods.reduce((s, r) => s + len(r), 0)
    tblWrap.append(el('div', 'muted', `总用材 ${totalLen.toFixed(2)} m`))
  }

  head.append(
    btn('重新生成钢架', 'primary', regenerate),
    btn('导出杆件表 CSV', '', () => {
      if (rods.length === 0) { toast('请先生成钢架', true); return }
      downloadText(`${skel.name}-钢架明细.csv`, steelToCsv(rods), 'text/csv')
    }),
  )

  panel.append(
    checkRow('显示骨骼', store.settings.showBones, v => { store.settings.showBones = v; store.save() }),
    checkRow('显示钢架', store.settings.showSteel, v => { store.settings.showSteel = v; store.save() }),
    checkRow('显示重心', store.settings.showCom, v => { store.settings.showCom = v; store.save() }),
    tblWrap,
  )

  regenerate()
  vp.start(() => {
    kin.rebuild()
    vp.sync(kin)
    vp.boneGroup.visible = store.settings.showBones
    vp.steelGroup.visible = store.settings.showSteel
    if (store.settings.showCom) vp.setCom(analyzeStability(kin.states))
    else vp.setCom(null)
  })
  return () => vp.dispose()
}
