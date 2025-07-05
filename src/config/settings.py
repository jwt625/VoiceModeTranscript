"""Application configuration settings."""

import os
from dataclasses import dataclass
from typing import Optional

from dotenv import load_dotenv

# Load environment variables
load_dotenv()


@dataclass
class AppConfig:
    """Application configuration class."""

    # Flask settings
    secret_key: str = "your-secret-key-here"
    debug: bool = False
    host: str = "127.0.0.1"
    port: int = 5000

    # Database settings
    database_url: str = "transcripts.db"

    # Audio settings
    sample_rate: int = 16000
    channels: int = 1
    chunk_size: int = 1024

    # Whisper.cpp settings
    whisper_model_path: str = "./whisper.cpp/models/ggml-base.en.bin"
    whisper_executable: str = "./whisper.cpp/main"

    # LLM settings
    llm_api_key: Optional[str] = None
    llm_base_url: str = "https://api.lambda.ai/v1"
    llm_model: str = "llama-4-maverick-17b-128e-instruct-fp8"

    # Auto-processing settings
    auto_processing_enabled: bool = True
    auto_processing_interval_minutes: int = 2

    # VAD settings
    use_fixed_interval: bool = False

    # Stream queue settings
    stream_queue_maxsize: int = 1000

    @classmethod
    def from_env(cls) -> "AppConfig":
        """Create configuration from environment variables."""
        return cls(
            secret_key=os.getenv("SECRET_KEY", cls.secret_key),
            debug=os.getenv("DEBUG", "false").lower() == "true",
            host=os.getenv("HOST", cls.host),
            port=int(os.getenv("PORT", str(cls.port))),
            database_url=os.getenv("DATABASE_URL", cls.database_url),
            sample_rate=int(os.getenv("SAMPLE_RATE", str(cls.sample_rate))),
            channels=int(os.getenv("CHANNELS", str(cls.channels))),
            chunk_size=int(os.getenv("CHUNK_SIZE", str(cls.chunk_size))),
            whisper_model_path=os.getenv("WHISPER_MODEL_PATH", cls.whisper_model_path),
            whisper_executable=os.getenv("WHISPER_EXECUTABLE", cls.whisper_executable),
            llm_api_key=os.getenv("LLM_API_KEY"),
            llm_base_url=os.getenv("LLM_BASE_URL", cls.llm_base_url),
            llm_model=os.getenv("LLM_MODEL", cls.llm_model),
            auto_processing_enabled=os.getenv("AUTO_PROCESSING_ENABLED", "true").lower()
            == "true",
            auto_processing_interval_minutes=int(
                os.getenv(
                    "AUTO_PROCESSING_INTERVAL_MINUTES",
                    str(cls.auto_processing_interval_minutes),
                )
            ),
            use_fixed_interval=os.getenv("USE_FIXED_INTERVAL", "false").lower()
            == "true",
            stream_queue_maxsize=int(
                os.getenv("STREAM_QUEUE_MAXSIZE", str(cls.stream_queue_maxsize))
            ),
        )


# Global configuration instance
_config: Optional[AppConfig] = None


def get_config() -> AppConfig:
    """Get the global configuration instance."""
    global _config
    if _config is None:
        _config = AppConfig.from_env()
    return _config


def set_config(config: AppConfig) -> None:
    """Set the global configuration instance (mainly for testing)."""
    global _config
    _config = config
