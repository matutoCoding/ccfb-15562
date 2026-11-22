import { generateDefaults } from './core/skeleton_factory'
import { Skeleton } from './core/types'

export interface Settings {
  boneColor: string
  prostheticColor: string
  steelColor: string
  showBones: boolean
  showSteel: boolean
  showCom: boolean
  ikIterations: number
  steelGap: number
  steelLinks: boolean
}

const KEY = 'dino-mount-designer-v1'

interface Persist {
  skeletons: Skeleton[]
  activeId: string | null
  settings: Settings
}

const defaultSettings = (): Settings => ({
  boneColor: '#c9b18c',
  prostheticColor: '#d8dde3',
  steelColor: '#8a939e',
  showBones: true,
  showSteel: true,
  showCom: true,
  ikIterations: 12,
  steelGap: 0.03,
  steelLinks: true,
})

class Store {
  skeletons: Skeleton[] = []
  activeId: string | null = null
  settings: Settings = defaultSettings()
  private listeners = new Set<() => void>()

  load() {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      try {
        const p = JSON.parse(raw) as Persist
        this.skeletons = p.skeletons
        this.activeId = p.activeId
        this.settings = { ...defaultSettings(), ...p.settings }
      } catch { /* 数据损坏则重新生成 */ }
    }
    if (this.skeletons.length === 0) {
      this.skeletons = generateDefaults()
      this.activeId = this.skeletons[0].id
    }
  }

  save() {
    const p: Persist = { skeletons: this.skeletons, activeId: this.activeId, settings: this.settings }
    localStorage.setItem(KEY, JSON.stringify(p))
    this.emit()
  }

  get active(): Skeleton | null {
    return this.skeletons.find(s => s.id === this.activeId) ?? this.skeletons[0] ?? null
  }

  upsert(skel: Skeleton) {
    const i = this.skeletons.findIndex(s => s.id === skel.id)
    if (i >= 0) this.skeletons[i] = skel
    else this.skeletons.push(skel)
    this.save()
  }

  remove(id: string) {
    this.skeletons = this.skeletons.filter(s => s.id !== id)
    if (this.activeId === id) this.activeId = this.skeletons[0]?.id ?? null
    this.save()
  }

  onChange(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn) }
  private emit() { this.listeners.forEach(f => f()) }
}

export const store = new Store()
