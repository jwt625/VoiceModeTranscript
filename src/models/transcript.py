"""Transcript models for database operations."""

import json
from dataclasses import dataclass
from typing import Optional


@dataclass
class RawTranscript:
    """Represents a raw transcript from whisper.cpp."""

    id: str
    session_id: str
    text: str
    timestamp: str
    sequence_number: int
    confidence: Optional[float] = None
    processing_time: Optional[float] = None
    audio_source: str = "unknown"

    @classmethod
    def from_db_row(cls, row: tuple) -> "RawTranscript":
        """Create RawTranscript instance from database row."""
        return cls(
            id=row[0],
            session_id=row[1],
            text=row[2],
            timestamp=row[3],
            sequence_number=row[4],
            confidence=row[5],
            processing_time=row[6],
            audio_source=row[7] if len(row) > 7 else "unknown",
        )

    def to_dict(self) -> dict:
        """Convert transcript to dictionary for JSON serialization."""
        return {
            "id": self.id,
            "session_id": self.session_id,
            "text": self.text,
            "timestamp": self.timestamp,
            "sequence_number": self.sequence_number,
            "confidence": self.confidence,
            "processing_time": self.processing_time,
            "audio_source": self.audio_source,
        }


@dataclass
class ProcessedTranscript:
    """Represents a processed transcript from LLM."""

    id: str
    session_id: str
    processed_text: str
    original_transcript_ids: list[str]
    original_transcript_count: int
    llm_model: str
    processing_time: float
    timestamp: str

    @classmethod
    def from_db_row(cls, row: tuple) -> "ProcessedTranscript":
        """Create ProcessedTranscript instance from database row."""
        # Parse JSON string back to list
        original_ids = json.loads(row[3]) if row[3] else []

        return cls(
            id=row[0],
            session_id=row[1],
            processed_text=row[2],
            original_transcript_ids=original_ids,
            original_transcript_count=row[4],
            llm_model=row[5],
            processing_time=row[6],
            timestamp=row[7],
        )

    def to_dict(self) -> dict:
        """Convert transcript to dictionary for JSON serialization."""
        return {
            "id": self.id,
            "session_id": self.session_id,
            "processed_text": self.processed_text,
            "original_transcript_ids": self.original_transcript_ids,
            "original_transcript_count": self.original_transcript_count,
            "llm_model": self.llm_model,
            "processing_time": self.processing_time,
            "timestamp": self.timestamp,
        }


@dataclass
class LegacyTranscript:
    """Represents a legacy transcript (for backward compatibility)."""

    id: int
    session_id: str
    timestamp: str
    source: str
    text: str
    confidence: Optional[float] = None
    is_final: bool = False

    @classmethod
    def from_db_row(cls, row: tuple) -> "LegacyTranscript":
        """Create LegacyTranscript instance from database row."""
        return cls(
            id=row[0],
            session_id=row[1],
            timestamp=row[2],
            source=row[3],
            text=row[4],
            confidence=row[5],
            is_final=bool(row[6]),
        )

    def to_dict(self) -> dict:
        """Convert transcript to dictionary for JSON serialization."""
        return {
            "id": self.id,
            "session_id": self.session_id,
            "timestamp": self.timestamp,
            "source": self.source,
            "text": self.text,
            "confidence": self.confidence,
            "is_final": self.is_final,
        }
