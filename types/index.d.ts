export type Mood = 'warm' | 'cool' | 'neon' | 'nature' | 'pastel' | 'retro' | 'mono'

export type Palette = {
  id: string
  name: string
  base: 'dark' | 'light'
  mood: Mood
  bg: string
  text: string
  accent: string
  success?: string
  error?: string
  warning?: string
}

export type View = 'all' | 'dark' | 'light' | 'favorites' | 'recent'
export type Size = 'compact' | 'comfy'

declare module 'claude-code' {
  interface PluginState {
    'desktop-palettes': {
      current: string
      setup: 'missing' | 'restart' | 'ready'
      isStripOpen: boolean
      view: View
      mood: Mood | 'any'
      query: string
      size: Size
      favorites: string[]
      recent: string[]
      daily: boolean
      showSettings: boolean
      confirmRemove: boolean
    }
  }
}
