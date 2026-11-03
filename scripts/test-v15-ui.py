#!/usr/bin/env python3
"""Compatibility entry point; UI geocoding moved to the API in v1.6."""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).with_name("test-v16-ui.py")), run_name="__main__")
