import frappe


def get_context(context):
	# This function ensures the health_frontend.html template is served
	# for all routes under /health/*
	context.no_cache = 1
	# Required for file upload and other API calls from the frontend (avoids "Invalid Request" 400)
	if frappe.session.user != "Guest":
		context.csrf_token = frappe.sessions.get_csrf_token()
	else:
		context.csrf_token = ""
	return context














