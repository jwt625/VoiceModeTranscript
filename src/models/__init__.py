"""Database models for Voice Mode Transcript application."""

from .database import get_db_connection, init_database
from .repositories import (
    DatabaseRepository,
    ProcessedTranscriptRepository,
    RawTranscriptRepository,
    SessionRepository,
)
from .session import Session
from .transcript import LegacyTranscript, ProcessedTranscript, RawTranscript

__all__ = [
    # Models
    "Session",
    "RawTranscript",
    "ProcessedTranscript",
    "LegacyTranscript",
    # Repositories
    "SessionRepository",
    "RawTranscriptRepository",
    "ProcessedTranscriptRepository",
    "DatabaseRepository",
    # Database utilities
    "get_db_connection",
    "init_database",
]
