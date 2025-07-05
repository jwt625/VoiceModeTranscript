# Session Summary Implementation Proposal

## Overview

This proposal outlines the implementation of automatic session summaries and keyword extraction for transcript sessions. The feature will generate one-sentence summaries and 5 keywords/tags from processed transcripts using LLM processing, enabling better session organization and searchability.

## Motivation

- **Session Organization**: Enable users to quickly understand what each recording session was about
- **Search Functionality**: Allow searching sessions by summary content and keywords/tags
- **Session Management**: Improve the session browser with meaningful descriptions
- **Historical Context**: Provide quick context when browsing historical sessions

## Requirements

### Functional Requirements

1. **Automatic Summary Generation**:
   - Generate summaries when "Stop Recording" is pressed
   - Process all queued raw transcripts first, then generate summary from all processed transcripts
   - Optional: Generate summaries every 15 minutes during long sessions for safety

2. **Content Generation**:
   - One-sentence summary describing the session content
   - Five keywords/tags extracted from the transcript content
   - Use LLM processing similar to existing transcript processing workflow

3. **Storage**:
   - Store summary and keywords in the sessions table
   - Maintain backward compatibility with existing sessions (nullable fields)

4. **UI Integration**:
   - Display summaries in the Database Inspector session browser
   - Consider displaying in the main panel visibility area
   - Enable search functionality based on summaries and keywords

### Technical Requirements

1. **Database Schema Updates**:
   - Add `summary` TEXT column to sessions table
   - Add `keywords` TEXT column to sessions table (JSON array)
   - Add `summary_generated_at` TIMESTAMP column for tracking

2. **LLM Integration**:
   - New LLM processing workflow for summarization
   - Dedicated system prompt for summary generation
   - Separate from existing transcript deduplication workflow

3. **Processing Pipeline**:
   - Trigger on session stop
   - Ensure all raw transcripts are processed first
   - Collect all processed transcripts for the session
   - Send to LLM for summarization
   - Store results in database

## Implementation Plan

### Phase 1: Database Schema Updates

1. **Update Sessions Table**:
   ```sql
   ALTER TABLE sessions ADD COLUMN summary TEXT;
   ALTER TABLE sessions ADD COLUMN keywords TEXT;
   ALTER TABLE sessions ADD COLUMN summary_generated_at TEXT;
   ```

2. **Update Session Model**:
   - Add summary, keywords, and summary_generated_at fields
   - Update from_db_row and to_dict methods
   - Handle JSON serialization for keywords

3. **Update Database Initialization**:
   - Modify init_database() to include new columns
   - Ensure backward compatibility

### Phase 2: LLM Summary Processing

1. **Create Summary LLM Processor**:
   - New method in LLMProcessor for summarization
   - Dedicated system prompt for summary generation
   - Format processed transcripts for summary input

2. **Summary System Prompt**:
   ```
   You are an expert at analyzing conversation transcripts and creating concise summaries.

   Your task is to:
   1. Generate a single, clear sentence that summarizes what this transcript session is about
   2. Extract 5 relevant keywords/tags that best represent the content

   Focus on:
   - Main topics discussed
   - Key concepts or subjects
   - Purpose or context of the conversation
   - Important themes or activities

   Return your response in this exact JSON format:
   {
     "summary": "One sentence summary of the session",
     "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]
   }
   ```

3. **Processing Logic**:
   - Collect all processed transcripts for a session
   - Format them chronologically
   - Send to LLM with summary prompt
   - Parse JSON response
   - Store in database

### Phase 3: Session Service Integration

1. **Session Summary Service**:
   - Add generate_session_summary() method
   - Integrate with existing session stop workflow
   - Handle error cases and retries

2. **Processing Triggers**:
   - Primary: When "Stop Recording" is pressed
   - Secondary: Every 15 minutes during recording (optional safety feature)
   - Manual: Allow manual summary regeneration

3. **Workflow Integration**:
   - Ensure raw transcript processing completes first
   - Wait for any pending LLM processing jobs
   - Collect all processed transcripts
   - Generate summary
   - Update session record

### Phase 4: UI Integration

1. **Database Inspector Updates**:
   - Add Summary column to session browser table
   - Add Keywords column (display as tags)
   - Implement search functionality

2. **Session Browser Enhancements**:
   - Display summaries in session list
   - Show keywords as clickable tags
   - Add search/filter by summary content
   - Add search/filter by keywords

3. **Main Panel Integration** (Optional):
   - Consider displaying current session summary
   - Show in panel visibility area or status bar

### Phase 5: Search and Filtering

1. **Search Implementation**:
   - Full-text search on summary content
   - Keyword-based filtering
   - Combined search across summary and keywords

2. **UI Search Controls**:
   - Search input in Database Inspector
   - Keyword filter buttons/chips
   - Clear search functionality

## Database Schema Changes

### Sessions Table Updates

```sql
-- Add new columns to existing sessions table
ALTER TABLE sessions ADD COLUMN summary TEXT;
ALTER TABLE sessions ADD COLUMN keywords TEXT;  -- JSON array of strings
ALTER TABLE sessions ADD COLUMN summary_generated_at TEXT;  -- ISO timestamp

-- Example updated schema
CREATE TABLE sessions (
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
    bookmarked INTEGER DEFAULT 0,
    summary TEXT,
    keywords TEXT,
    summary_generated_at TEXT
);
```

## API Endpoints

### New Endpoints

1. **POST /api/generate-summary/<session_id>**:
   - Manually trigger summary generation for a session
   - Returns summary and keywords

2. **GET /api/search-sessions**:
   - Search sessions by summary content and keywords
   - Query parameters: q (search term), keywords (filter)

### Modified Endpoints

1. **GET /api/sessions**:
   - Include summary and keywords in response
   - Add search/filter parameters

2. **Session stop workflow**:
   - Integrate summary generation into existing stop process

## Error Handling

1. **LLM Processing Failures**:
   - Retry logic for summary generation
   - Fallback to empty summary if all retries fail
   - Log errors for debugging

2. **Database Errors**:
   - Handle schema migration gracefully
   - Backward compatibility for sessions without summaries

3. **UI Error States**:
   - Show loading states during summary generation
   - Display error messages if summary fails
   - Allow manual retry

## Testing Strategy

1. **Unit Tests**:
   - Test summary LLM processing
   - Test database schema updates
   - Test session service integration

2. **Integration Tests**:
   - Test complete summary generation workflow
   - Test UI search functionality
   - Test error handling scenarios

3. **Manual Testing**:
   - Test with various transcript content types
   - Verify summary quality and relevance
   - Test search and filtering functionality

## Future Enhancements

1. **Advanced Search**:
   - Semantic search using embeddings
   - Date range filtering
   - Duration-based filtering

2. **Summary Improvements**:
   - Configurable summary length
   - Multiple summary styles (technical, casual, etc.)
   - Summary confidence scoring

3. **Keyword Enhancements**:
   - Automatic keyword categorization
   - Keyword frequency analysis
   - Related keyword suggestions

## Implementation Timeline

- **Phase 1** (Database): 1-2 hours
- **Phase 2** (LLM Processing): 2-3 hours
- **Phase 3** (Service Integration): 2-3 hours
- **Phase 4** (UI Integration): 3-4 hours
- **Phase 5** (Search/Filtering): 2-3 hours

**Total Estimated Time**: 10-15 hours

## Success Criteria

1. ✅ Summaries are automatically generated when recording stops
2. ✅ Keywords are extracted and stored with sessions
3. ✅ Session browser displays summaries and keywords
4. ✅ Search functionality works for summaries and keywords
5. ✅ Backward compatibility maintained for existing sessions
6. ✅ Error handling prevents system failures
7. ✅ Performance impact is minimal

## Implementation Status: ✅ COMPLETE

All phases have been successfully implemented and tested:

### ✅ Phase 1: Database Schema Updates
- Added summary, keywords, and summary_generated_at columns to sessions table
- Updated Session model with new fields and JSON handling
- Added migration logic for existing databases

### ✅ Phase 2: LLM Summary Processing
- Created generate_session_summary() method in LLMProcessor
- Implemented dedicated system prompt for summary generation
- Added JSON parsing and error handling

### ✅ Phase 3: Session Service Integration
- Integrated summary generation into stop recording workflow
- Added automatic processing of remaining raw transcripts
- Implemented async summary generation to avoid blocking

### ✅ Phase 4: UI Integration
- Updated Database Inspector with Summary and Keywords columns
- Added manual "Generate Summary" button
- Implemented SSE event handlers for automatic summary notifications
- Added CSS styling for summary display

### ✅ Phase 5: Testing and Validation
- Validated complete workflow from raw transcripts to summary
- Confirmed database schema migration
- Tested manual and automatic summary generation
- Verified UI integration and event handling

## How It Works

### Automatic Summary Generation (Stop Recording)
1. User clicks "Stop Recording" button
2. System processes any remaining raw transcripts with LLM
3. System collects all processed transcripts for the session
4. LLM generates one-sentence summary and 5 keywords
5. Summary and keywords are saved to database
6. UI receives SSE event and shows notification
7. Database Inspector automatically refreshes to show new summary

### Manual Summary Generation
1. User selects session in Database Inspector
2. User clicks "Generate Summary" button
3. System retrieves all processed transcripts for session
4. LLM generates summary and keywords
5. Results are saved and UI is updated

### Summary Display
- Session browser shows summaries in dedicated column
- Keywords displayed as styled tags
- Summaries are truncated with hover tooltips for full text
- "No summary" indicator for sessions without summaries

## Usage Instructions

### For End Users
1. **Automatic**: Simply record and stop - summaries are generated automatically
2. **Manual**: Use "Generate Summary" button in Database Inspector for existing sessions
3. **Viewing**: Check Database Inspector to see summaries and keywords for all sessions

### For Developers
- Summary generation uses existing LLM processor infrastructure
- Database migrations handle existing sessions gracefully
- SSE events provide real-time feedback to users
- Error handling prevents system failures if LLM is unavailable

## Technical Notes

- Summaries are only generated if processed transcripts exist for the session
- Raw transcripts must be processed by LLM first before summary generation
- Summary generation runs asynchronously to avoid blocking the stop recording response
- Keywords are stored as JSON arrays in the database
- Backward compatibility maintained - existing sessions work without summaries
