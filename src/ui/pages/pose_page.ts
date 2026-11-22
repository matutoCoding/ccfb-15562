import * as THREE from 'three'

import { PosePlayer } from '../../core/animation'
import { analyzeStability } from '../../core/com'
import { downloadDataUrl, downloadText, poseToCsv } from '../../core/exporter'
import { solveIK } from '../../core/ik'
import { clampAngles, getAngles, Kinematics } from '../../core/kinematics'
import { store } from '../../store'
import { Viewport } from '../../three/viewport'
import { btn, el, field, numInput, toast } from '../ui'

const deg = (r: number) => (r * 180) / Math.PI
const rad = (d: number) => (d * Math.PI) / 180

// 姿态设计页:IK 拖拽、关节限位、重心分析、方案对比、关键帧动画
export const mountPosePage = (root: HTMLElement): (() => void) => {
  const skel = store.active
  if (!skel) { root.append(el('div', 'page-body', '请先在骨架列表中选择骨架')); return () => {} }

  const head = el('div', 'page-head')
  head.append(el('h1', '', `姿态设计 — ${skel.name}`), el('span', 'spacer'))
  const body = el('div', 'page-body fill')
  const left = el('div', 'panel')
  const viewWrap = el('div', 'viewport-wrap')
  const right = el('div', 'panel right')
  body.append(left, viewWrap, right)
  root.append(head, body)

  const hud = el('div', 'hud')
  viewWrap.appendChild(hud)
  const chipStable = el('div', 'chip')
  const chipMass = el('div', 'chip')
  const chipClamp = el('div', 'chip warn')
  chipClamp.style.display = 'none'
  hud.append(chipStable, chipMass, chipClamp)

  const kin = new Kinematics(skel, skel.current)
  const vp = new Viewport(viewWrap, {
    palette: { fossil: store.settings.boneColor, prosthetic: store.settings.prostheticColor, selected: '#d98e4a' },
    steelColor: store.settings.steelColor,
  })
  vp.buildSkeleton(kin)

  let selectedId: string | null = null
  let compareVps: Viewport[] = []
  const player = new PosePlayer(skel)

  // ---- 重心 HUD ----
  const updateCom = () => {
    const res = analyzeStability(kin.states)
    vp.setCom(store.settings.showCom ? res : null)
    chipStable.className = `chip ${res.stable ? 'ok' : 'warn'}`
    chipStable.textContent = res.stable
      ? `重心稳定 · 余量 ${res.margin.toFixed(2)}m`
      : `重心超出支撑区 ${Math.abs(res.margin).toFixed(2)}m`
    chipMass.textContent = `总质量 ${res.totalMass.toFixed(0)}kg · 重心 (${res.pos.x.toFixed(2)}, ${res.pos.y.toFixed(2)}, ${res.pos.z.toFixed(2)})`
  }

  // ---- IK 拖拽 ----
  let dragId: string | null = null
  let dragTarget = new THREE.Vector3()
  let lastClampToast = 0
  const canvas = vp.renderer.domElement
  canvas.addEventListener('pointerdown', ev => {
    if (ev.button !== 0) return
    const id = vp.pickBone(ev.clientX, ev.clientY)
    selectedId = id
    renderJointPanel()
    if (!id) return
    dragId = id
    dragTarget = kin.tipOf(id)
    vp.controls.enabled = false
    canvas.setPointerCapture(ev.pointerId)
  })
  canvas.addEventListener('pointermove', ev => {
    if (!dragId) return
    const pt = vp.dragPlanePoint(ev.clientX, ev.clientY, dragTarget)
    if (!pt) return
    dragTarget = pt
    const res = solveIK(kin, dragId, pt, store.settings.ikIterations)
    if (res.clamped.length > 0) {
      chipClamp.style.display = ''
      chipClamp.textContent = `关节限位:${res.clamped.join('、')} 已到极限`
      const now = performance.now()
      if (now - lastClampToast > 2500) {
        lastClampToast = now
        toast(`关节「${res.clamped[0]}」已到旋转极限,无法继续`, true)
      }
    } else chipClamp.style.display = 'none'
  })
  const endDrag = () => {
    if (!dragId) return
    dragId = null
    vp.controls.enabled = true
    chipClamp.style.display = 'none'
    store.save()
  }
  canvas.addEventListener('pointerup', endDrag)
  canvas.addEventListener('pointercancel', endDrag)

  // ---- 左栏:关节微调 + 重心明细 ----
  const renderJointPanel = () => {
    left.innerHTML = ''
    left.append(el('h3', '', '关节微调(拖动骨骼可 IK 联动)'))
    const b = skel.bones.find(x => x.id === selectedId)
    if (!b) { left.append(el('div', 'muted', '点击视口中的骨骼进行选择')); return }
    left.append(el('div', '', b.name))
    const a = getAngles(skel, skel.current, b.id)
    for (const axis of ['x', 'y', 'z'] as const) {
      const slider = el('input') as HTMLInputElement
      slider.type = 'range'
      slider.min = String(deg(b.limit.min[axis]))
      slider.max = String(deg(b.limit.max[axis]))
      slider.step = '0.5'
      slider.value = String(deg(a[axis]))
      const label = el('div', 'muted', `${axis.toUpperCase()} 轴 ${deg(a[axis]).toFixed(1)}°`)
      slider.oninput = () => {
        const cur = getAngles(skel, skel.current, b.id)
        skel.current[b.id] = clampAngles(b, { ...cur, [axis]: rad(parseFloat(slider.value)) })
        label.textContent = `${axis.toUpperCase()} 轴 ${slider.value}°`
      }
      slider.onchange = () => store.save()
      left.append(field(`限位 ${deg(b.limit.min[axis]).toFixed(0)}° ~ ${deg(b.limit.max[axis]).toFixed(0)}°`, slider))
      left.appendChild(label)
    }
    // 重心明细(可手算核对)
    left.append(el('h3', '', '重心明细(Σm·p / Σm)'))
    const detail = el('div', 'mono')
    detail.style.cssText = 'max-height:220px;overflow:auto;font-size:12px'
    const res = analyzeStability(kin.states)
    const rows = kin.states.map(st =>
      `${st.def.name} m=${st.def.mass.toFixed(1)} p=(${st.worldCenter.x.toFixed(2)},${st.worldCenter.y.toFixed(2)},${st.worldCenter.z.toFixed(2)})`)
    detail.textContent = rows.join('\n') + `\n合计 M=${res.totalMass.toFixed(1)}kg`
    left.appendChild(detail)
  }
  renderJointPanel()

  // ---- 右栏:姿态方案 / 关键帧 / 导出 ----
  const renderRight = () => {
    right.innerHTML = ''
    right.append(el('h3', '', '姿态方案'))
    const nameInput = el('input') as HTMLInputElement
    nameInput.type = 'text'; nameInput.placeholder = '方案名称'
    right.append(field('保存当前姿态', nameInput))
    right.append(btn('保存方案', 'primary sm', () => {
      const name = nameInput.value.trim() || `方案 ${skel.poses.length + 1}`
      skel.poses.push({ name, angles: JSON.parse(JSON.stringify(skel.current)) })
      store.save(); renderRight()
      toast(`已保存「${name}」`)
    }))
    for (const p of skel.poses) {
      const row = el('div', 'row')
      row.style.justifyContent = 'space-between'
      row.append(el('span', '', p.name))
      const ops = el('div', 'row')
      ops.append(
        btn('应用', 'sm', () => { skel.current = JSON.parse(JSON.stringify(p.angles)); kin.pose = skel.current; store.save() }),
        btn('删除', 'sm danger', () => { skel.poses = skel.poses.filter(x => x !== p); store.save(); renderRight() }),
      )
      row.appendChild(ops)
      right.appendChild(row)
    }

    right.append(el('h3', '', '方案对比'))
    right.append(btn(compareVps.length ? '退出对比' : '并排对比方案', 'sm', toggleCompare))

    right.append(el('h3', '', '关键帧动画'))
    const timeInput = numInput(skel.keyframes.length, 0.5, () => {})
    right.append(field('关键帧时刻 (s)', timeInput))
    right.append(btn('记录当前为关键帧', 'sm', () => {
      skel.keyframes.push({ name: `KF${skel.keyframes.length + 1}`, time: parseFloat(timeInput.value) || 0, angles: JSON.parse(JSON.stringify(skel.current)) })
      skel.keyframes.sort((a, b) => a.time - b.time)
      store.save(); renderRight()
      toast('已记录关键帧')
    }))
    right.append(el('div', 'muted', `${skel.keyframes.length} 个关键帧 · 时长 ${player.duration.toFixed(1)}s`))
    right.append(btn(player.playing ? '停止' : '播放动画', 'sm', () => {
      player.playing = !player.playing
      if (player.playing && player.time >= player.duration) player.time = 0
      renderRight()
    }))
    right.append(btn('清空关键帧', 'sm danger', () => { skel.keyframes = []; store.save(); renderRight() }))

    right.append(el('h3', '', '导出'))
    right.append(
      btn('导出姿态参数 CSV', 'sm', () => downloadText(`${skel.name}-姿态.csv`, poseToCsv(skel), 'text/csv')),
      btn('高清截图 (4K)', 'sm', () => downloadDataUrl(`${skel.name}.png`, vp.screenshot(3840, 2160))),
    )
  }

  // 方案对比:并排视口渲染各方案
  const toggleCompare = () => {
    if (compareVps.length) {
      compareVps.forEach(v => v.dispose())
      compareVps = []
      viewWrap.style.display = ''
      body.querySelectorAll('.compare-cell').forEach(n => n.remove())
      renderRight()
      return
    }
    const poses = skel.poses.slice(0, 3)
    if (poses.length === 0) { toast('先保存几套姿态方案再对比', true); return }
    viewWrap.style.display = 'none'
    for (const p of poses) {
      const cell = el('div', 'viewport-wrap compare-cell')
      cell.style.borderRight = '1px solid var(--line-soft)'
      const label = el('div', 'hud')
      label.append(el('div', 'chip', p.name))
      body.insertBefore(cell, right)
      cell.appendChild(label)
      const v = new Viewport(cell, {
        palette: { fossil: store.settings.boneColor, prosthetic: store.settings.prostheticColor, selected: '#d98e4a' },
        steelColor: store.settings.steelColor,
      })
      const k = new Kinematics(skel, JSON.parse(JSON.stringify(p.angles)))
      v.buildSkeleton(k)
      v.setCom(analyzeStability(k.states))
      v.start()
      compareVps.push(v)
    }
    renderRight()
  }

  head.append(
    btn('重置姿态', '', () => { skel.current = {}; kin.pose = skel.current; store.save(); toast('已重置为零位姿态') }),
  )

  renderRight()
  vp.start(dt => {
    player.tick(dt, skel.current)
    kin.rebuild()
    vp.sync(kin)
    updateCom()
  })
  return () => { compareVps.forEach(v => v.dispose()); vp.dispose() }
}
