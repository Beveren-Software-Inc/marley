# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

import frappe
from frappe import _


@frappe.whitelist()
def get_user_notifications(unread_only=False):
	"""Get notifications for the current user"""
	user = frappe.session.user
	
	try:
		# Get notifications from Frappe's notification system
		# Check if Notification Log table exists
		if not frappe.db.exists('DocType', 'Notification Log'):
			return {
				'notifications': [],
				'unread_count': 0
			}
		
		filters = {'for_user': user}
		if unread_only:
			filters['read'] = 0
		
		notifications = frappe.get_all(
			'Notification Log',
			filters=filters,
			fields=['name', 'type', 'document_type', 'document_name', 'for_user', 'read', 'creation', 'subject', 'email_content'],
			order_by='creation desc',
			limit=50
		)
		
		# Format notifications
		formatted_notifications = []
		for notif in notifications:
			formatted_notifications.append({
				'id': notif.name,
				'type': notif.type or 'Info',
				'title': notif.subject or 'Notification',
				'message': notif.email_content or '',
				'document_type': notif.document_type,
				'document_name': notif.document_name,
				'read': notif.read,
				'created': notif.creation.isoformat() if notif.creation else None
			})
		
		# Get unread count
		unread_count = frappe.db.count('Notification Log', {
			'for_user': user,
			'read': 0
		})
		
		return {
			'notifications': formatted_notifications,
			'unread_count': unread_count
		}
	except Exception as e:
		# Return empty notifications on error
		frappe.log_error(f"Error fetching notifications: {str(e)}")
		return {
			'notifications': [],
			'unread_count': 0
		}


@frappe.whitelist()
def mark_notification_read(notification_id):
	"""Mark a notification as read"""
	user = frappe.session.user
	
	try:
		# Verify the notification belongs to the user
		if not frappe.db.exists('Notification Log', notification_id):
			return {'success': False, 'error': 'Notification not found'}
		
		notification = frappe.get_doc('Notification Log', notification_id)
		if notification.for_user != user:
			frappe.throw(_("You don't have permission to mark this notification as read"))
		
		notification.read = 1
		notification.save(ignore_permissions=True)
		
		return {'success': True}
	except Exception as e:
		frappe.log_error(f"Error marking notification as read: {str(e)}")
		return {'success': False, 'error': str(e)}


@frappe.whitelist()
def mark_all_notifications_read():
	"""Mark all notifications as read for the current user"""
	user = frappe.session.user
	
	try:
		if not frappe.db.exists('DocType', 'Notification Log'):
			return {'success': False, 'error': 'Notification Log not available'}
		
		frappe.db.sql("""
			UPDATE `tabNotification Log`
			SET read = 1
			WHERE for_user = %s AND read = 0
		""", user)
		
		frappe.db.commit()
		
		return {'success': True}
	except Exception as e:
		frappe.log_error(f"Error marking all notifications as read: {str(e)}")
		return {'success': False, 'error': str(e)}

