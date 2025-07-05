"""Database connection and initialization utilities."""

import sqlite3
from collections.abc import Generator
from contextlib import contextmanager

from ..config import get_config


@contextmanager
def get_db_connection() -> Generator[sqlite3.Connection, None, None]:
    """Get a database connection with automatic cleanup."""
    config = get_config()
    conn = sqlite3.connect(config.database_url)
    try:
        yield conn
    finally:
        conn.close()


def init_database() -> None:
    """Initialize SQLite database with all required tables."""
    with get_db_connection() as conn:
        cursor = conn.cursor()

        # Create sessions table
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                start_time TEXT NOT NULL,
                end_time TEXT,
                duration INTEGER,
                total_segments INTEGER DEFAULT 0,
                raw_transcript_count INTEGER DEFAULT 0,
                processed_transcript_count INTEGER DEFAULT 0,
                total_words INTEGER DEFAULT 0,
                avg_confidence REAL DEFAULT 0.0,
                confidence_count INTEGER DEFAULT 0,
                confidence_sum REAL DEFAULT 0.0,
                bookmarked BOOLEAN DEFAULT 0,
                summary TEXT,
                keywords TEXT,
                summary_generated_at TEXT
            )
        """
        )

        # Create raw_transcripts table for whisper.cpp output
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS raw_transcripts (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                text TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                sequence_number INTEGER NOT NULL,
                confidence REAL,
                processing_time REAL,
                audio_source TEXT NOT NULL DEFAULT 'unknown',
                FOREIGN KEY (session_id) REFERENCES sessions (id)
            )
        """
        )

        # Create processed_transcripts table for LLM output
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS processed_transcripts (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                processed_text TEXT NOT NULL,
                original_transcript_ids TEXT NOT NULL,
                original_transcript_count INTEGER NOT NULL,
                llm_model TEXT NOT NULL,
                processing_time REAL NOT NULL,
                timestamp TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions (id)
            )
        """
        )

        # Create legacy transcripts table (keep for backward compatibility)
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS transcripts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                source TEXT NOT NULL,
                text TEXT NOT NULL,
                confidence REAL,
                is_final BOOLEAN DEFAULT 0,
                FOREIGN KEY (session_id) REFERENCES sessions (id)
            )
        """
        )

        # Migration: Add audio_source column to existing raw_transcripts table if it doesn't exist
        try:
            cursor.execute(
                'ALTER TABLE raw_transcripts ADD COLUMN audio_source TEXT NOT NULL DEFAULT "unknown"'
            )
            print("✅ Added audio_source column to raw_transcripts table")
        except sqlite3.OperationalError as e:
            if "duplicate column name" in str(e).lower():
                print("ℹ️  audio_source column already exists in raw_transcripts table")
            else:
                print(f"⚠️  Error adding audio_source column: {e}")

        # Create indexes for better performance
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_raw_transcripts_session ON raw_transcripts(session_id)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_processed_transcripts_session ON processed_transcripts(session_id)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_transcripts_session ON transcripts(session_id)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_raw_transcripts_timestamp ON raw_transcripts(timestamp)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_processed_transcripts_timestamp ON processed_transcripts(timestamp)"
        )

        conn.commit()
        print("✅ Database initialized successfully")
