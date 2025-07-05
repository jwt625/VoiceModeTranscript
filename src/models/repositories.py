"""Repository classes for database operations."""

import json
from typing import Optional

from .database import get_db_connection
from .session import Session
from .transcript import ProcessedTranscript, RawTranscript


class SessionRepository:
    """Repository for session database operations."""

    def create(self, session_id: str, start_time: str) -> bool:
        """Create a new session record."""
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "INSERT INTO sessions (id, start_time) VALUES (?, ?)",
                    (session_id, start_time),
                )
                conn.commit()
                return True
        except Exception as e:
            print(f"❌ Error creating session record: {e}")
            return False

    def get_all(self) -> list[dict]:
        """Get all sessions with transcript counts."""
        with get_db_connection() as conn:
            cursor = conn.cursor()

            # Get all sessions from raw_transcripts (for backward compatibility)
            cursor.execute(
                """
                SELECT
                    session_id,
                    COUNT(*) as raw_transcript_count,
                    MIN(timestamp) as transcript_start_time,
                    MAX(timestamp) as transcript_end_time,
                    COUNT(DISTINCT audio_source) as audio_sources
                FROM raw_transcripts
                GROUP BY session_id
            """
            )
            transcript_sessions = {row[0]: row for row in cursor.fetchall()}

            # Get session records from sessions table
            cursor.execute(
                """
                SELECT id, start_time, end_time, duration, total_segments, total_words, avg_confidence
                FROM sessions
                ORDER BY start_time DESC
            """
            )
            session_records = {row[0]: row for row in cursor.fetchall()}

            # Get processed transcript counts
            cursor.execute(
                """
                SELECT session_id, COUNT(*) as processed_count
                FROM processed_transcripts
                GROUP BY session_id
            """
            )
            processed_counts = {row[0]: row[1] for row in cursor.fetchall()}

            # Combine data
            sessions = []
            all_session_ids = set(transcript_sessions.keys()) | set(
                session_records.keys()
            )

            for session_id in all_session_ids:
                session_data = {"id": session_id}

                # Use sessions table data if available
                if session_id in session_records:
                    record = session_records[session_id]
                    session_data.update(
                        {
                            "start_time": record[1],
                            "end_time": record[2],
                            "duration": record[3],
                            "total_segments": record[4],
                            "total_words": record[5],
                            "avg_confidence": record[6],
                        }
                    )

                # Add transcript counts
                if session_id in transcript_sessions:
                    transcript_data = transcript_sessions[session_id]
                    session_data.update(
                        {
                            "raw_transcript_count": transcript_data[1],
                            "transcript_start_time": transcript_data[2],
                            "transcript_end_time": transcript_data[3],
                            "audio_sources": transcript_data[4],
                        }
                    )
                else:
                    session_data.update(
                        {
                            "raw_transcript_count": 0,
                            "audio_sources": 0,
                        }
                    )

                session_data["processed_transcript_count"] = processed_counts.get(
                    session_id, 0
                )
                sessions.append(session_data)

            return sorted(sessions, key=lambda x: x.get("start_time", ""), reverse=True)

    def get_by_id(self, session_id: str) -> Optional[Session]:
        """Get a session by ID."""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT id, start_time, end_time, duration, total_segments,
                       raw_transcript_count, processed_transcript_count, total_words,
                       avg_confidence, confidence_count, confidence_sum
                FROM sessions WHERE id = ?
            """,
                (session_id,),
            )

            row = cursor.fetchone()
            return Session.from_db_row(row) if row else None

    def update_metrics(
        self,
        session_id: str,
        total_segments: int,
        total_words: int,
        avg_confidence: float,
        confidence_count: int,
        confidence_sum: float,
    ) -> bool:
        """Update session metrics."""
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    UPDATE sessions SET
                        total_segments = ?,
                        total_words = ?,
                        avg_confidence = ?,
                        confidence_count = ?,
                        confidence_sum = ?
                    WHERE id = ?
                """,
                    (
                        total_segments,
                        total_words,
                        avg_confidence,
                        confidence_count,
                        confidence_sum,
                        session_id,
                    ),
                )
                conn.commit()
                return True
        except Exception as e:
            print(f"❌ Error updating session metrics: {e}")
            return False

    def finalize(self, session_id: str, end_time: str, duration: int) -> bool:
        """Finalize a session with end time and duration."""
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    UPDATE sessions SET end_time = ?, duration = ? WHERE id = ?
                """,
                    (end_time, duration, session_id),
                )
                conn.commit()
                return True
        except Exception as e:
            print(f"❌ Error finalizing session: {e}")
            return False


class RawTranscriptRepository:
    """Repository for raw transcript database operations."""

    def create(self, transcript: RawTranscript) -> bool:
        """Save a raw transcript to the database."""
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO raw_transcripts
                    (id, session_id, text, timestamp, sequence_number, confidence, processing_time, audio_source)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                    (
                        transcript.id,
                        transcript.session_id,
                        transcript.text,
                        transcript.timestamp,
                        transcript.sequence_number,
                        transcript.confidence,
                        transcript.processing_time,
                        transcript.audio_source,
                    ),
                )
                conn.commit()
                return True
        except Exception as e:
            print(f"❌ Error saving raw transcript: {e}")
            return False

    def get_by_session(self, session_id: str) -> list[RawTranscript]:
        """Get all raw transcripts for a session."""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT id, session_id, text, timestamp, sequence_number, confidence, processing_time, audio_source
                FROM raw_transcripts
                WHERE session_id = ?
                ORDER BY sequence_number
            """,
                (session_id,),
            )

            return [RawTranscript.from_db_row(row) for row in cursor.fetchall()]

    def get_paginated(
        self, page: int = 1, limit: int = 50
    ) -> tuple[list[RawTranscript], int]:
        """Get paginated raw transcripts."""
        offset = (page - 1) * limit

        with get_db_connection() as conn:
            cursor = conn.cursor()

            # Get total count
            cursor.execute("SELECT COUNT(*) FROM raw_transcripts")
            total_count = cursor.fetchone()[0]

            # Get paginated results
            cursor.execute(
                """
                SELECT id, session_id, text, timestamp, sequence_number, confidence, processing_time, audio_source
                FROM raw_transcripts
                ORDER BY timestamp DESC
                LIMIT ? OFFSET ?
            """,
                (limit, offset),
            )

            transcripts = [RawTranscript.from_db_row(row) for row in cursor.fetchall()]
            return transcripts, total_count


class ProcessedTranscriptRepository:
    """Repository for processed transcript database operations."""

    def create(self, transcript: ProcessedTranscript) -> bool:
        """Save a processed transcript to the database."""
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()

                # Convert transcript IDs list to JSON string
                transcript_ids_json = json.dumps(transcript.original_transcript_ids)

                cursor.execute(
                    """
                    INSERT INTO processed_transcripts
                    (id, session_id, processed_text, original_transcript_ids,
                     original_transcript_count, llm_model, processing_time, timestamp)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                    (
                        transcript.id,
                        transcript.session_id,
                        transcript.processed_text,
                        transcript_ids_json,
                        transcript.original_transcript_count,
                        transcript.llm_model,
                        transcript.processing_time,
                        transcript.timestamp,
                    ),
                )
                conn.commit()
                return True
        except Exception as e:
            print(f"❌ Error saving processed transcript: {e}")
            return False

    def get_by_session(self, session_id: str) -> list[ProcessedTranscript]:
        """Get all processed transcripts for a session."""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT id, session_id, processed_text, original_transcript_ids,
                       original_transcript_count, llm_model, processing_time, timestamp
                FROM processed_transcripts
                WHERE session_id = ?
                ORDER BY timestamp
            """,
                (session_id,),
            )

            return [ProcessedTranscript.from_db_row(row) for row in cursor.fetchall()]

    def get_paginated(
        self, page: int = 1, limit: int = 20
    ) -> tuple[list[ProcessedTranscript], int]:
        """Get paginated processed transcripts."""
        offset = (page - 1) * limit

        with get_db_connection() as conn:
            cursor = conn.cursor()

            # Get total count
            cursor.execute("SELECT COUNT(*) FROM processed_transcripts")
            total_count = cursor.fetchone()[0]

            # Get paginated results
            cursor.execute(
                """
                SELECT id, session_id, processed_text, original_transcript_ids,
                       original_transcript_count, llm_model, processing_time, timestamp
                FROM processed_transcripts
                ORDER BY timestamp DESC
                LIMIT ? OFFSET ?
            """,
                (limit, offset),
            )

            transcripts = [
                ProcessedTranscript.from_db_row(row) for row in cursor.fetchall()
            ]
            return transcripts, total_count


class DatabaseRepository:
    """Repository for database-wide operations and statistics."""

    def get_stats(self) -> dict:
        """Get database statistics."""
        with get_db_connection() as conn:
            cursor = conn.cursor()

            # Get counts from all tables
            cursor.execute("SELECT COUNT(*) FROM raw_transcripts")
            raw_count = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(*) FROM processed_transcripts")
            processed_count = cursor.fetchone()[0]

            # Get session count from raw_transcripts (more accurate)
            cursor.execute("SELECT COUNT(DISTINCT session_id) FROM raw_transcripts")
            sessions_count = cursor.fetchone()[0]

            # Get sessions table count for reference
            cursor.execute("SELECT COUNT(*) FROM sessions")
            sessions_table_count = cursor.fetchone()[0]

            # Get latest activity
            cursor.execute("SELECT MAX(timestamp) FROM raw_transcripts")
            latest_raw = cursor.fetchone()[0]

            cursor.execute("SELECT MAX(timestamp) FROM processed_transcripts")
            latest_processed = cursor.fetchone()[0]

            return {
                "raw_transcripts": raw_count,
                "processed_transcripts": processed_count,
                "sessions_from_transcripts": sessions_count,
                "sessions_table_count": sessions_table_count,
                "latest_raw_transcript": latest_raw,
                "latest_processed_transcript": latest_processed,
            }
