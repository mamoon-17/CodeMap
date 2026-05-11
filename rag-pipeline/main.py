"""ASGI entry shim so `uvicorn main:app` works; app lives in `app.py`."""
from app import app

__all__ = ["app"]
