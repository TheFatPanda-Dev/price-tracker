import sys
import os

# Add your application directory to the Python path
sys.path.insert(0, os.path.dirname(__file__))

# Avoid background scheduler worker contention on shared WSGI hosts.
os.environ.setdefault("ENABLE_SCHEDULER", "0")

# Import the Flask app for Passenger.
try:
	from wsgi import app as application
except Exception:
	from app import app as application
