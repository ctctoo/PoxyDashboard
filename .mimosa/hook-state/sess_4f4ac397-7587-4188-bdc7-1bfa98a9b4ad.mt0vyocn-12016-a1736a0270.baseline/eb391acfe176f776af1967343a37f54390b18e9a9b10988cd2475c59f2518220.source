import { Notification } from 'electron'

export function showNotification(title: string, body: string): void {
  if (!Notification.isSupported()) return
  try {
    new Notification({ title, body }).show()
  } catch {
    /* 通知失败不影响主流程 */
  }
}
