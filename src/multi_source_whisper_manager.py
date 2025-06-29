#!/usr/bin/env python3
"""
Multi-Source Whisper Manager
Manages multiple whisper.cpp instances for different audio sources
"""

import threading
import time
from typing import Dict, Optional, Callable, Any
from .whisper_stream_processor import WhisperStreamProcessor


class MultiSourceWhisperManager:
    def __init__(self, callback: Optional[Callable] = None):
        """
        Initialize multi-source whisper manager
        
        Args:
            callback: Function to call when new transcripts are available
                     Signature: callback(transcript_data: Dict[str, Any])
        """
        self.callback = callback
        self.processors: Dict[str, WhisperStreamProcessor] = {}
        self.is_running = False
        self.session_id = None
        
    def add_audio_source(self, source_name: str, audio_device_id: Optional[int] = None):
        """
        Add an audio source for processing
        
        Args:
            source_name: Name of the audio source (e.g., 'microphone', 'system')
            audio_device_id: Optional audio device ID for this source
        """
        if source_name in self.processors:
            print(f"⚠️  Audio source '{source_name}' already exists")
            return
            
        processor = WhisperStreamProcessor(
            callback=self._on_transcript_from_source,
            audio_source=source_name,
            audio_device_id=audio_device_id
        )
        
        self.processors[source_name] = processor
        print(f"✅ Added audio source: {source_name}")
        
    def remove_audio_source(self, source_name: str):
        """Remove an audio source"""
        if source_name in self.processors:
            processor = self.processors[source_name]
            if processor.is_running:
                processor.stop_streaming()
            del self.processors[source_name]
            print(f"🗑️  Removed audio source: {source_name}")
        
    def start_streaming(self, session_id: str) -> bool:
        """
        Start streaming for all configured audio sources
        
        Args:
            session_id: Session identifier
            
        Returns:
            bool: True if at least one processor started successfully
        """
        if not self.processors:
            print("⚠️  No audio sources configured")
            return False
            
        self.session_id = session_id
        self.is_running = True
        
        success_count = 0
        for source_name, processor in self.processors.items():
            try:
                if processor.start_streaming(session_id):
                    success_count += 1
                    print(f"✅ Started streaming for {source_name}")
                else:
                    print(f"❌ Failed to start streaming for {source_name}")
            except Exception as e:
                print(f"❌ Error starting {source_name}: {e}")
                
        if success_count == 0:
            self.is_running = False
            return False
            
        print(f"🎤 Started {success_count}/{len(self.processors)} audio sources")
        return True
        
    def stop_streaming(self) -> Dict[str, Any]:
        """
        Stop streaming for all audio sources
        
        Returns:
            Dict containing statistics from all sources
        """
        if not self.is_running:
            return {}
            
        self.is_running = False
        all_stats = {}
        
        for source_name, processor in self.processors.items():
            try:
                stats = processor.stop_streaming()
                all_stats[source_name] = stats
                print(f"🛑 Stopped streaming for {source_name}")
            except Exception as e:
                print(f"⚠️  Error stopping {source_name}: {e}")
                all_stats[source_name] = {"error": str(e)}
                
        return all_stats
        
    def get_accumulated_transcripts(self, source_name: Optional[str] = None):
        """
        Get accumulated transcripts from one or all sources
        
        Args:
            source_name: Specific source name, or None for all sources
            
        Returns:
            Dict or List of transcripts
        """
        if source_name:
            if source_name in self.processors:
                return self.processors[source_name].get_accumulated_transcripts()
            else:
                return []
        else:
            # Return transcripts from all sources, sorted by timestamp
            all_transcripts = []
            for processor in self.processors.values():
                all_transcripts.extend(processor.get_accumulated_transcripts())
            
            # Sort by timestamp
            all_transcripts.sort(key=lambda x: x.get('timestamp', ''))
            return all_transcripts
            
    def _on_transcript_from_source(self, event_data):
        """Internal callback to handle transcripts from individual sources"""
        # Add source information to the event data
        if 'data' in event_data:
            event_data['data']['source_manager'] = 'multi_source'
            
        # Forward to the main callback
        if self.callback:
            self.callback(event_data)
            
    def get_stats(self) -> Dict[str, Any]:
        """Get statistics from all audio sources"""
        stats = {
            'total_sources': len(self.processors),
            'active_sources': sum(1 for p in self.processors.values() if p.is_running),
            'sources': {}
        }
        
        for source_name, processor in self.processors.items():
            stats['sources'][source_name] = {
                'is_running': processor.is_running,
                'transcript_count': len(processor.accumulated_transcripts),
                'audio_source': processor.audio_source,
                'audio_device_id': processor.audio_device_id
            }
            
        return stats
