import sys
import os

# Add root directory to sys.path so modules like main, scraper_engine, ga_traffic can be imported
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app
