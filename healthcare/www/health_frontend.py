

def get_context(context):
	# This function ensures the health_frontend.html template is served
	# for all routes under /health/*
	context.no_cache = 1
	return context














