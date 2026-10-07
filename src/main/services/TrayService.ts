/**
 * Owns the optional system tray icon and close-to-tray behavior.
 */

import { join } from 'node:path'
import { app, Menu, nativeImage, Tray, type BrowserWindow } from 'electron'
import { IpcChannel } from '@shared/IpcChannel'
import type { AppSettings, TrayIconPreset } from '@shared/types'
import type LoggerService from './LoggerService'

type TraySettings = Pick<AppSettings, 'showTrayIcon' | 'minimizeToTrayOnClose'> & {
  trayIcon?: TrayIconPreset
}

/** Maps each selectable tray preset to its packaged icon file. */
const TRAY_ICON_FILES: Record<TrayIconPreset, string> = {
  default: 'icon.png',
  bluetooth: 'tray-icon-bluetooth.png',
  weather: 'tray-icon-weather.png',
}

export default class TrayService {
  private tray: Tray | null = null
  private settings: Required<TraySettings>
  private activeIconFile: string | null = null
  private quitting = false

  /** Creates the configured tray icon without exposing Electron objects to the renderer. */
  public constructor(
    private readonly window: BrowserWindow,
    settings: TraySettings,
    private readonly logger: LoggerService,
  ) {
    this.settings = {
      showTrayIcon: settings.showTrayIcon,
      minimizeToTrayOnClose: settings.minimizeToTrayOnClose,
      trayIcon: settings.trayIcon ?? 'default',
    }
    this.updateTrayIcon()
  }

  /** Applies persisted tray preferences immediately. */
  public applySettings(settings: TraySettings): void {
    this.settings = {
      showTrayIcon: settings.showTrayIcon,
      minimizeToTrayOnClose: settings.minimizeToTrayOnClose,
      trayIcon: settings.trayIcon ?? 'default',
    }
    this.updateTrayIcon()
  }

  /** Returns true only when hiding cannot strand the user without a working tray icon. */
  public shouldMinimizeOnClose(): boolean {
    return !this.quitting && this.settings.minimizeToTrayOnClose && this.tray !== null
  }

  /** Prevents close-to-tray from intercepting an explicit application quit. */
  public prepareToQuit(): void {
    this.quitting = true
    this.destroyTrayIcon()
  }

  /** Releases native resources when the owning application window is replaced. */
  public dispose(): void {
    this.destroyTrayIcon()
  }

  /** Creates, replaces, or removes the native icon to match the latest persisted setting. */
  private updateTrayIcon(): void {
    if (this.quitting || !this.settings.showTrayIcon) {
      this.destroyTrayIcon()
      return
    }
    const iconFile = TRAY_ICON_FILES[this.settings.trayIcon] ?? TRAY_ICON_FILES.default
    if (this.tray && this.activeIconFile === iconFile) return
    this.destroyTrayIcon()

    try {
      const iconPath = app.isPackaged
        ? join(process.resourcesPath, iconFile)
        : join(app.getAppPath(), 'build', iconFile)
      const sourceImage = nativeImage.createFromPath(iconPath)
      if (sourceImage.isEmpty()) throw new Error(`Tray icon could not be read from ${iconPath}.`)
      const trayImage =
        process.platform === 'win32' ? sourceImage : sourceImage.resize({ width: 16, height: 16 })
      const tray = new Tray(trayImage)
      tray.setToolTip('Transcript')
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: 'Open', click: () => this.showWindow() },
          { label: 'Settings', click: () => this.showSettings() },
          { label: 'Exit', role: 'quit' },
        ]),
      )
      tray.on('click', () => this.showWindow())
      this.tray = tray
      this.activeIconFile = iconFile
    } catch (error) {
      this.logger.error('TrayService', 'System tray icon could not be created.', error)
      this.tray = null
    }
  }

  /** Restores and focuses the application from either tray interaction. */
  private showWindow(): void {
    if (this.window.isDestroyed()) return
    this.window.show()
    if (this.window.isMinimized()) this.window.restore()
    this.window.focus()
  }

  /** Restores the window and asks the renderer to open its settings page. */
  private showSettings(): void {
    this.showWindow()
    if (!this.window.isDestroyed()) {
      this.window.webContents.send(IpcChannel.SettingsOpenRequested)
    }
  }

  /** Destroys the current native tray instance exactly once. */
  private destroyTrayIcon(): void {
    this.tray?.destroy()
    this.tray = null
    this.activeIconFile = null
  }
}
