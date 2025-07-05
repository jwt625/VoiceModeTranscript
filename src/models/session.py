"""Session model for database operations."""

from dataclasses import dataclass
from typing import Optional


@dataclass
class Session:
    """Represents a recording session."""

    id: str
    start_time: str
    end_time: Optional[str] = None
    duration: Optional[int] = None
    total_segments: int = 0
    raw_transcript_count: int = 0
    processed_transcript_count: int = 0
    total_words: int = 0
    avg_confidence: float = 0.0
    confidence_count: int = 0
    confidence_sum: float = 0.0

    @classmethod
    def from_db_row(cls, row: tuple) -> "Session":
        """Create Session instance from database row."""
        return cls(
            id=row[0],
            start_time=row[1],
            end_time=row[2],
            duration=row[3],
            total_segments=row[4],
            raw_transcript_count=row[5],
            processed_transcript_count=row[6],
            total_words=row[7],
            avg_confidence=row[8],
            confidence_count=row[9],
            confidence_sum=row[10],
        )

    def to_dict(self) -> dict:
        """Convert session to dictionary for JSON serialization."""
        return {
            "id": self.id,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "duration": self.duration,
            "total_segments": self.total_segments,
            "raw_transcript_count": self.raw_transcript_count,
            "processed_transcript_count": self.processed_transcript_count,
            "total_words": self.total_words,
            "avg_confidence": self.avg_confidence,
            "confidence_count": self.confidence_count,
            "confidence_sum": self.confidence_sum,
        }
