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
  pickExecutable: () => ipcRenderer.invoke('dialog:pickExecutable'),
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

  openUrl: (url) => ipcRenderer.invoke('shell:openUrl', url),
  openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
  getAppInfo: () => ipcRenderer.invoke('app:info'),

  listApplications: () => ipcRenderer.invoke('apps2:list'),
  searchApplications: (q) => ipcRenderer.invoke('apps2:search', q),
  syncDiscoveredApps: () => ipcRenderer.invoke('apps2:sync'),
  addApplication: (name, path, category) => ipcRenderer.invoke('apps2:add', name, path, category),
  setAppPinnedDesktop: (id, v) => ipcRenderer.invoke('apps2:setPinned', id, v),
  setAppCategory: (id, category) => ipcRenderer.invoke('apps2:setCategory', id, category),
  removeApplication: (id) => ipcRenderer.invoke('apps2:remove', id),
  launchApplication: (id) => ipcRenderer.invoke('apps2:launch', id),
  recentApplications: () => ipcRenderer.invoke('apps2:recent'),

  listWorkspaces: () => ipcRenderer.invoke('ws:list'),
  searchWorkspaces: (q) => ipcRenderer.invoke('ws:search', q),
  addWorkspace: (path) => ipcRenderer.invoke('ws:add', path),
  setWorkspacePinned: (id, v) => ipcRenderer.invoke('ws:setPinned', id, v),
  removeWorkspace: (id) => ipcRenderer.invoke('ws:remove', id),
  openWorkspace: (id) => ipcRenderer.invoke('ws:open', id),
  startWorkspace: (id) => ipcRenderer.invoke('ws:start', id),
  recentWorkspaces: () => ipcRenderer.invoke('ws:recent'),

  getSystemOverview: () => ipcRenderer.invoke('overview:get'),
  describeDangerous: (action, target) => ipcRenderer.invoke('permission:describe', action, target),

  detectModelEnvs: () => ipcRenderer.invoke('models:detect'),
  pickModelFile: () => ipcRenderer.invoke('models:pickFile'),
  listModels: () => ipcRenderer.invoke('models:list'),
  addModel: (input) => ipcRenderer.invoke('models:add', input),
  updateModel: (id, patch) => ipcRenderer.invoke('models:update', id, patch),
  removeModel: (id) => ipcRenderer.invoke('models:remove', id),
  startModel: (id) => ipcRenderer.invoke('models:start', id),
  stopModel: (id) => ipcRenderer.invoke('models:stop', id),
  buildModelCommand: (input) => ipcRenderer.invoke('models:command', input),

  on: (channel, cb) => {
    const listener = (_e: IpcRendererEvent, payload: unknown): void =>
      (cb as (p: unknown) => void)(payload)
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
