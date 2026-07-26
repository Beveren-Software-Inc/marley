export interface Notification {
  id: string
  type: string
  title: string
  message: string
  document_type?: string
  document_name?: string
  read: number
  created?: string
}

export interface NotificationsResponse {
  notifications: Notification[]
  unread_count: number
}

export async function fetchNotifications(unreadOnly: boolean = false): Promise<NotificationsResponse> {
  const params = new URLSearchParams()
  if (unreadOnly) params.append('unread_only', '1')

  const url = `/api/method/healthcare.api.notifications.get_user_notifications${params.toString() ? `?${params.toString()}` : ''}`

  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  const resData = await response.json()

  if (response.status === 403 || response.status === 401 || resData?.exc_type === 'AuthenticationError') {
    return { notifications: [], unread_count: 0 }
  }

  if (resData?.message) {
    return resData.message as NotificationsResponse
  }
  throw new Error('Invalid response format')
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const { ensureCSRF } = await import('./apiClient')
  const csrf = await ensureCSRF()
  const response = await fetch(
    `/api/method/healthcare.api.notifications.mark_notification_read`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {})
      },
      body: JSON.stringify({ notification_id: notificationId })
    }
  )
  
  const resData = await response.json()

  if (resData.exc) {
    throw new Error(resData.exc || 'Failed to mark notification as read')
  }
}

export async function markAllNotificationsRead(): Promise<void> {
  const { ensureCSRF } = await import('./apiClient')
  const csrf = await ensureCSRF()
  const response = await fetch(
    `/api/method/healthcare.api.notifications.mark_all_notifications_read`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {})
      }
    }
  )
  
  const resData = await response.json()

  if (resData.exc) {
    throw new Error(resData.exc || 'Failed to mark all notifications as read')
  }
}









