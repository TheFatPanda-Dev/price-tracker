import sys
import os

# Add your application directory to the Python path
INTERP = os.path.join(os.environ['HOME'], 'price-tracker', 'venv', 'bin', 'python')
if sys.executable != INTERP:
    os.execl(INTERP, INTERP, *sys.argv)

sys.path.insert(0, os.path.dirname(__file__))

# Import the Flask app
from app import app as application
