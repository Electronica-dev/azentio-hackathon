"""Regula: deterministic regulatory change impact engine."""
from .env import load_env

load_env()  # reads <repo>/.env once, so every entry point sees the same config

__version__ = "1.0.0"
