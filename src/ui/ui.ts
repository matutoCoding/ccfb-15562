// 轻量 DOM 辅助
export const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K, cls = '', text = '',
): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text) e.textContent = text
  return e
}

export const btn = (label: string, cls = '', onClick?: () => void): HTMLButtonElement => {
  const b = el('button', `btn ${cls}`, label)
  if (onClick) b.onclick = onClick
  return b
}

export const field = (label: string, input: HTMLElement): HTMLDivElement => {
  const f = el('div', 'field')
  f.append(el('label', '', label), input)
  return f
}

export const numInput = (value: number, step: number, onChange: (v: number) => void): HTMLInputElement => {
  const i = el('input')
  i.type = 'number'; i.step = String(step); i.value = String(value)
  i.onchange = () => onChange(parseFloat(i.value))
  return i
}

export const checkRow = (label: string, checked: boolean, onChange: (v: boolean) => void): HTMLLabelElement => {
  const l = el('label', 'check-row')
  const c = el('input')
  c.type = 'checkbox'; c.checked = checked
  c.onchange = () => onChange(c.checked)
  l.append(c, document.createTextNode(label))
  return l
}

// 提示条
export const toast = (msg: string, warn = false) => {
  let box = document.querySelector('.toast-box')
  if (!box) { box = el('div', 'toast-box'); document.body.appendChild(box) }
  const t = el('div', `toast${warn ? ' warn' : ''}`, msg)
  box.appendChild(t)
  setTimeout(() => t.remove(), 3200)
}

// 文件选择并读取文本
export const pickFile = (accept: string): Promise<string | null> =>
  new Promise(resolve => {
    const i = el('input')
    i.type = 'file'; i.accept = accept
    i.onchange = async () => {
      const f = i.files?.[0]
      resolve(f ? await f.text() : null)
    }
    i.click()
  })

// 骨架 SVG 图标(线性,非 emoji)
export const icon = (path: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`

export const icons = {
  list: icon('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
  bones: icon('<path d="M12 2v20M2 12h20M7 7l10 10M17 7L7 17"/>'),
  pose: icon('<circle cx="12" cy="5" r="2"/><path d="M12 7v6M12 13l-4 7M12 13l4 7M7 10l5-2 5 2"/>'),
  steel: icon('<path d="M4 21V8l8-5 8 5v13M4 21h16M9 21v-6h6v6"/>'),
  hall: icon('<path d="M2 20h20M4 20V9l8-6 8 6v11M9 20v-5h6v5"/>'),
  gear: icon('<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.07-.4.1-.8.1-1.2Z"/>'),
}
