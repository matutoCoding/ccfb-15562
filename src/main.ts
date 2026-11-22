import './style.css'

import { store } from './store'
import { el, icons } from './ui/ui'
import { mountBonesPage } from './ui/pages/bones_page'
import { mountHallPage } from './ui/pages/hall_page'
import { mountListPage } from './ui/pages/list_page'
import { mountPosePage } from './ui/pages/pose_page'
import { mountSettingsPage } from './ui/pages/settings_page'
import { mountSteelPage } from './ui/pages/steel_page'

interface Page {
  title: string
  icon: string
  mount: (root: HTMLElement) => () => void
}

const routes: Record<string, Page> = {
  list: { title: '骨架列表', icon: icons.list, mount: mountListPage },
  bones: { title: '骨骼编辑', icon: icons.bones, mount: mountBonesPage },
  pose: { title: '姿态设计', icon: icons.pose, mount: mountPosePage },
  steel: { title: '钢架生成', icon: icons.steel, mount: mountSteelPage },
  hall: { title: '展厅预览', icon: icons.hall, mount: mountHallPage },
  settings: { title: '设置', icon: icons.gear, mount: mountSettingsPage },
}

store.load()

const app = document.getElementById('app')!
const side = el('nav', 'side')
const main = el('div', 'main')
app.append(side, main)

side.innerHTML = `<div class="brand">装架设计台<small>恐龙骨架姿态与钢架</small></div>`
for (const [key, r] of Object.entries(routes)) {
  const a = el('a', 'nav-item') as HTMLAnchorElement
  a.href = `#${key}`
  a.dataset.route = key
  a.innerHTML = `${r.icon}<span>${r.title}</span>`
  side.appendChild(a)
}

let dispose: (() => void) | null = null

const render = () => {
  const key = location.hash.slice(1) || 'list'
  const route = routes[key] ?? routes.list
  document.querySelectorAll('.nav-item').forEach(n =>
    n.classList.toggle('active', (n as HTMLAnchorElement).dataset.route === key))
  dispose?.()
  main.innerHTML = ''
  dispose = route.mount(main)
}

window.addEventListener('hashchange', render)
render()
