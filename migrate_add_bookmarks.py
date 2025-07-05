#!/usr/bin/env python3
"""
Database migration script to add bookmark functionality to sessions table.

This script safely adds a 'bookmarked' column to the existing sessions table
and creates an index for efficient bookmark filtering.

Usage:
    python migrate_add_bookmarks.py

The script will:
1. Check if the bookmarked column already exists
2. Add the column if it doesn't exist (default: 0/false)
3. Create an index for bookmark filtering performance
4. Verify the migration was successful
"""

import sqlite3
import sys
from datetime import datetime


def check_column_exists(cursor, table_name, column_name):
    """Check if a column exists in the specified table"""
    cursor.execute(f"PRAGMA table_info({table_name})")
    columns = [row[1] for row in cursor.fetchall()]
    return column_name in columns


def backup_database():
    """Create a backup of the database before migration"""
    import shutil

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_name = f"transcripts_backup_{timestamp}.db"

    try:
        shutil.copy2("transcripts.db", backup_name)
        print(f"✅ Database backup created: {backup_name}")
        return backup_name
    except Exception as e:
        print(f"❌ Failed to create backup: {e}")
        return None


def migrate_add_bookmarks():
    """Main migration function"""
    print("🔄 Starting bookmark migration...")

    # Create backup first
    backup_file = backup_database()
    if not backup_file:
        print("❌ Migration aborted - could not create backup")
        return False

    try:
        # Connect to database
        conn = sqlite3.connect("transcripts.db")
        cursor = conn.cursor()

        # Check if bookmarked column already exists
        if check_column_exists(cursor, "sessions", "bookmarked"):
            print("ℹ️  Bookmarked column already exists - no migration needed")
            conn.close()
            return True

        # Get current session count
        cursor.execute("SELECT COUNT(*) FROM sessions")
        session_count = cursor.fetchone()[0]
        print(f"📊 Found {session_count} existing sessions")

        # Add bookmarked column
        print("🔧 Adding bookmarked column...")
        cursor.execute("ALTER TABLE sessions ADD COLUMN bookmarked BOOLEAN DEFAULT 0")

        # Create index for bookmark filtering
        print("🔧 Creating bookmark index...")
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_sessions_bookmarked ON sessions(bookmarked)"
        )

        # Verify the migration
        if check_column_exists(cursor, "sessions", "bookmarked"):
            print("✅ Bookmarked column added successfully")
        else:
            raise Exception("Failed to add bookmarked column")

        # Verify all existing sessions have bookmark status
        cursor.execute("SELECT COUNT(*) FROM sessions WHERE bookmarked IS NOT NULL")
        updated_count = cursor.fetchone()[0]

        if updated_count == session_count:
            print(
                f"✅ All {session_count} sessions have bookmark status (default: false)"
            )
        else:
            raise Exception(
                f"Bookmark status mismatch: {updated_count}/{session_count}"
            )

        # Commit changes
        conn.commit()
        conn.close()

        print("🎉 Bookmark migration completed successfully!")
        print(f"📁 Backup saved as: {backup_file}")
        return True

    except Exception as e:
        print(f"❌ Migration failed: {e}")
        print(f"🔄 Database backup available at: {backup_file}")
        if "conn" in locals():
            conn.rollback()
            conn.close()
        return False


def verify_migration():
    """Verify the migration was successful"""
    try:
        conn = sqlite3.connect("transcripts.db")
        cursor = conn.cursor()

        # Check schema
        cursor.execute("PRAGMA table_info(sessions)")
        columns = {row[1]: row[2] for row in cursor.fetchall()}

        if "bookmarked" not in columns:
            print("❌ Verification failed: bookmarked column not found")
            return False

        print(
            f"✅ Schema verification passed - bookmarked column type: {columns['bookmarked']}"
        )

        # Check index
        cursor.execute("PRAGMA index_list(sessions)")
        indexes = [row[1] for row in cursor.fetchall()]

        if "idx_sessions_bookmarked" in indexes:
            print("✅ Index verification passed - bookmark index exists")
        else:
            print("⚠️  Warning: bookmark index not found")

        # Check data
        cursor.execute(
            "SELECT COUNT(*) as total, COUNT(CASE WHEN bookmarked = 1 THEN 1 END) as bookmarked FROM sessions"
        )
        total, bookmarked = cursor.fetchone()
        print(f"📊 Sessions: {total} total, {bookmarked} bookmarked")

        conn.close()
        return True

    except Exception as e:
        print(f"❌ Verification failed: {e}")
        return False


if __name__ == "__main__":
    print("🔖 Session Bookmark Migration Tool")
    print("=" * 40)

    # Run migration
    success = migrate_add_bookmarks()

    if success:
        # Verify migration
        print("\n🔍 Verifying migration...")
        verify_migration()
        print("\n✅ Migration complete! You can now use bookmark functionality.")
    else:
        print("\n❌ Migration failed. Check the error messages above.")
        sys.exit(1)
