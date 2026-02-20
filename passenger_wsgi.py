import sys
import os

# Add your application directory to the Python path
sys.path.insert(0, os.path.dirname(__file__))

# Import the Flask app
from app import app as application
