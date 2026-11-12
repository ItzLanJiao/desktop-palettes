export type Palette = {
  id: string
  name: string
  base: 'dark' | 'light'
  bg: string
  text: string
  accent: string
  success?: string
  error?: string
  warning?: string
}

declare module 'claude-code' {
  interface PluginState {
    'desktop-palettes': {
      current: string
      setup: 'missing' | 'restart' | 'ready'
      isStripOpen: boolean
      tab: 'dark' | 'light'
      confirmRemove: boolean
    }
  }
}
