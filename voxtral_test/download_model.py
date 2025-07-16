#!/usr/bin/env python3
"""
Script to download Voxtral-Mini-3B-2507 model manually without authentication
"""

import sys
from pathlib import Path

import requests
from tqdm import tqdm


def download_file(url, filepath, description=""):
    """Download a file with progress bar"""
    print(f"📥 Downloading {description}...")

    try:
        response = requests.get(url, stream=True)
        response.raise_for_status()

        total_size = int(response.headers.get("content-length", 0))

        with open(filepath, "wb") as file, tqdm(
            desc=description,
            total=total_size,
            unit="B",
            unit_scale=True,
            unit_divisor=1024,
        ) as pbar:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    file.write(chunk)
                    pbar.update(len(chunk))

        print(f"✅ Downloaded: {filepath}")
        return True

    except Exception as e:
        print(f"❌ Failed to download {description}: {e}")
        return False


def check_disk_space(required_gb=10):
    """Check if there's enough disk space"""
    try:
        import shutil

        free_bytes = shutil.disk_usage(".").free
        free_gb = free_bytes / (1024**3)

        if free_gb >= required_gb:
            print(
                f"✅ Disk space check: {free_gb:.1f} GB available (need ~{required_gb} GB)"
            )
            return True
        else:
            print(
                f"❌ Insufficient disk space: {free_gb:.1f} GB available (need ~{required_gb} GB)"
            )
            return False
    except Exception as e:
        print(f"⚠️  Could not check disk space: {e}")
        return True  # Proceed anyway


def main():
    """Main download function"""
    print("📦 Voxtral-Mini-3B-2507 Manual Download")
    print("=" * 50)

    # Check disk space
    if not check_disk_space():
        print("💡 Free up some disk space and try again")
        return

    # Create models directory
    model_dir = Path("models/voxtral-mini-3b")
    model_dir.mkdir(parents=True, exist_ok=True)
    print(f"📁 Model directory: {model_dir.absolute()}")

    # Files to download
    base_url = "https://huggingface.co/mistralai/Voxtral-Mini-3B-2507/resolve/main"
    files_to_download = [
        {
            "filename": "consolidated.safetensors",
            "description": "Model weights (~9.35 GB)",
            "size_gb": 9.35,
        },
        {
            "filename": "params.json",
            "description": "Model parameters (731 B)",
            "size_gb": 0.001,
        },
        {
            "filename": "tekken.json",
            "description": "Tokenizer (~14.9 MB)",
            "size_gb": 0.015,
        },
        {
            "filename": "README.md",
            "description": "Model documentation",
            "size_gb": 0.01,
        },
    ]

    print("\n📋 Files to download:")
    total_size = 0
    for file_info in files_to_download:
        print(f"   • {file_info['filename']} - {file_info['description']}")
        total_size += file_info["size_gb"]
    print(f"📊 Total download size: ~{total_size:.2f} GB")

    # Ask for confirmation
    response = input("\n❓ Proceed with download? (y/N): ").strip().lower()
    if response not in ["y", "yes"]:
        print("❌ Download cancelled")
        return

    # Download files
    print("\n🚀 Starting download...")
    success_count = 0

    for file_info in files_to_download:
        filename = file_info["filename"]
        filepath = model_dir / filename

        # Skip if file already exists
        if filepath.exists():
            print(f"⏭️  Skipping {filename} (already exists)")
            success_count += 1
            continue

        url = f"{base_url}/{filename}"
        if download_file(url, filepath, file_info["description"]):
            success_count += 1
        else:
            print(f"❌ Failed to download {filename}")
            break

    # Check results
    if success_count == len(files_to_download):
        print("\n🎉 Download complete!")
        print(f"📁 Model location: {model_dir.absolute()}")
        print("\n✅ You can now run: python start_voxtral_server.py")
        print("   The script will automatically detect and use the local model")
    else:
        print(
            f"\n❌ Download incomplete ({success_count}/{len(files_to_download)} files)"
        )
        print("💡 You can run this script again to resume the download")


if __name__ == "__main__":
    # Check if requests and tqdm are available
    try:
        import requests
        import tqdm
    except ImportError as e:
        print(f"❌ Missing dependency: {e}")
        print("📦 Install with: pip install requests tqdm")
        sys.exit(1)

    main()
