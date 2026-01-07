import os
import subprocess
import frappe

def build_frontend():
	"""Build the React frontend application"""
	frontend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend")
	
	if not os.path.exists(frontend_dir):
		frappe.log_error(f"Frontend directory not found: {frontend_dir}", "Build Error")
		return
	
	# Change to frontend directory and run npm build
	original_dir = os.getcwd()
	try:
		os.chdir(frontend_dir)
		frappe.log_error(f"Building frontend from: {frontend_dir}", "Build Info")
		
		# Run npm build
		result = subprocess.run(
			["npm", "run", "build"],
			capture_output=True,
			text=True,
			check=False
		)
		
		if result.returncode != 0:
			frappe.log_error(
				f"Frontend build failed:\n{result.stderr}\n{result.stdout}",
				"Build Error"
			)
			print(f"Frontend build failed: {result.stderr}")
		else:
			print("Frontend build completed successfully")
			if result.stdout:
				print(result.stdout)
	finally:
		os.chdir(original_dir)







