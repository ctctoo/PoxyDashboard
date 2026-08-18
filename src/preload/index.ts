import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { Api } from '../shared/api'

const api: Api = {
  getConfig: () => ipcRenderer.invoke('config:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),

  getApps: () => ipcRenderer.invoke('apps:list'),
  addApp: (input) => ipcRenderer.invoke('apps:add', input),
  updateApp: (id, patch) => ipcRenderer.invoke('apps:update', id, patch),
  removeApp: (id) => ipcRenderer.invoke('apps:remove', id),
  reorderApps: (ids) => ipcRenderer.invoke('apps:reorder', ids),
  setAppPinned: (id, v) => ipcRenderer.invoke('apps:setPinned', id, v),
  setAppHidden: (id, v) => ipcRenderer.invoke('apps:setHidden', id, v),

  startApp: (id) => ipcRenderer.invoke('apps:start', id),
  stopApp: (id) => ipcRenderer.invoke('apps:stop', id),
  restartApp: (id) => ipcRenderer.invoke('apps:restart', id),
  stopAllApps: () => ipcRenderer.invoke('apps:stopAll'),
  validateApp: (id) => ipcRenderer.invoke('apps:validate', id),

  pickDirectory: () => ipcRenderer.invoke('dialog:pickDirectory'),
  pickScript: () => ipcRenderer.invoke('dialog:pickScript'),
  detectProject: (dir) => ipcRenderer.invoke('project:detect', dir),
  scriptCommand: (path) => ipcRenderer.invoke('project:scriptCommand', path),

  getLogLines: (appId) => ipcRenderer.invoke('logs:get', appId),
  getMonitorState: () => ipcRenderer.invoke('monitor:state'),
  getHiddenPorts: () => ipcRenderer.invoke('monitor:hiddenPorts'),

  stopDb: (id) => ipcRenderer.invoke('db:stop', id),
  startDb: (id) => ipcRenderer.invoke('db:start', id),
  dismissDb: (id) => ipcRenderer.invoke('db:dismiss', id),

  stopContainer: (id) => ipcRenderer.invoke('container:stop', id),
  startContainer: (id) => ipcRenderer.invoke('container:start', id),

  claimPort: (port) => ipcRenderer.invoke('monitor:claim', port),
  dismissPort: (port) => ipcRenderer.invoke('monitor:dismiss', port),
  ignorePort: (port) => ipcRenderer.invoke('monitor:ignorePort', port),
  hidePort: (port) => ipcRenderer.invoke('monitor:hidePort', port),
  unhidePort: (port) => ipcRenderer.invoke('monitor:unhidePort', port),
  killProcess: (pid) => ipcRenderer.invoke('monitor:kill', pid),

  addFocusKeyword: (kw) => ipcRenderer.invoke('monitor:focusAdd', kw),
  removeFocusKeyword: (kw) => ipcRenderer.invoke('monitor:focusRemove', kw),

  stopAgentTask: (pid) => ipcRenderer.invoke('agents:stopTask', pid),
  stopAgent: (pid) => ipcRenderer.invoke('agents:stopAgent', pid),
  startAgent: (kind) => ipcRenderer.invoke('agents:startAgent', kind),
  restartAgent: (kind) => ipcRenderer.invoke('agents:restartAgent', kind),

  openUrl: (url) => ipcRenderer.invoke('shell:openUrl', url),
  openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
  getAppInfo: () => ipcRenderer.invoke('app:info'),

  on: (channel, cb) => {
    const listener = (_e: IpcRendererEvent, payload: unknown): void => (cb as (p: unknown) => void)(payload)
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore define in dts
  window.electron = electronAPI
  // @ts-ignore define in dts
  window.api = api
}
