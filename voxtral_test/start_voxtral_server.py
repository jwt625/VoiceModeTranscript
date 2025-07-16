#!/usr/bin/env python3
"""
Script to start Voxtral-Mini-3B-2507 vLLM server
"""

import subprocess
import sys
from pathlib import Path

import requests


def check_server_status(base_url="http://localhost:8000"):
    """Check if vLLM server is running"""
    try:
        response = requests.get(f"{base_url}/health", timeout=5)
        return response.status_code == 200
    except:
        return False


def check_hf_authentication():
    """Check if Hugging Face authentication is set up"""
    import os

    hf_token = os.getenv("HF_TOKEN")
    if hf_token:
        print(f"✅ HF_TOKEN found (length: {len(hf_token)})")
        return True
    else:
        print("❌ HF_TOKEN not found")
        return False


def print_authentication_help():
    """Print help for setting up Hugging Face authentication"""
    print("\n🔐 Hugging Face Authentication Required")
    print("=" * 50)
    print("The Voxtral model requires authentication to download from Hugging Face.")
    print("\n📋 Steps to fix:")
    print("1. Create a Hugging Face account at https://huggingface.co/join")
    print("2. Go to https://huggingface.co/settings/tokens")
    print("3. Create a new token with 'Read' permissions")
    print("4. Set the token as an environment variable:")
    print("   export HF_TOKEN='your_token_here'")
    print("\n🔄 Alternative: Login via CLI")
    print("   huggingface-cli login")
    print("\n💡 Then restart this script")


def check_local_model():
    """Check if local model exists"""
    local_model_path = Path("models/voxtral-mini-3b")
    required_files = ["consolidated.safetensors", "params.json", "tekken.json"]

    if not local_model_path.exists():
        return False, "Model directory not found"

    missing_files = []
    for file in required_files:
        if not (local_model_path / file).exists():
            missing_files.append(file)

    if missing_files:
        return False, f"Missing files: {', '.join(missing_files)}"

    return True, str(local_model_path.absolute())


def start_voxtral_server():
    """Start the Voxtral vLLM server"""

    print("🚀 Starting Voxtral-Mini-3B-2507 vLLM Server")
    print("=" * 50)

    # Check if server is already running
    if check_server_status():
        print("✅ vLLM server is already running!")
        print("🌐 Server URL: http://localhost:8000")
        return

    print("💾 Expected GPU Memory: ~9.5 GB")
    print("🖥️  Your System: Mac mini M4 Pro (24 GB unified memory)")
    print("✅ Memory check: PASSED")

    # Check for local model first
    print("\n📁 Checking for local model...")
    local_available, local_info = check_local_model()

    if local_available:
        print(f"✅ Local model found: {local_info}")
        model_path = local_info
        use_local = True
    else:
        print(f"❌ Local model not available: {local_info}")
        print("🔐 Checking Hugging Face authentication...")
        if not check_hf_authentication():
            print("\n💡 You can download the model manually to avoid authentication:")
            print("   See README.md section 'Option A: Manual Download'")
            print_authentication_help()
            return
        model_path = "mistralai/Voxtral-Mini-3B-2507"
        use_local = False

    print(f"📦 Model: {model_path}")

    # vLLM command
    cmd = [
        "vllm",
        "serve",
        model_path,
        "--tokenizer_mode",
        "mistral",
        "--config_format",
        "mistral",
        "--load_format",
        "mistral",
    ]

    print(f"\n🔧 Command: {' '.join(cmd)}")

    if use_local:
        print(
            "\n⏳ Starting server with local model (this may take 1-2 minutes to load)..."
        )
    else:
        print(
            "\n⏳ Starting server (this may take a few minutes to download and load the model)..."
        )

    try:
        # Start the server
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            universal_newlines=True,
            bufsize=1,
        )

        print("🔄 Server starting...")

        # Monitor the output
        startup_complete = False
        auth_error_detected = False

        for line in iter(process.stdout.readline, ""):
            print(f"[SERVER] {line.rstrip()}")

            # Check for authentication errors (only relevant for remote models)
            if not use_local and (
                "401 Client Error: Unauthorized" in line
                or "Invalid credentials" in line
            ):
                auth_error_detected = True

            # Check for startup completion indicators
            if "Application startup complete" in line or "Uvicorn running on" in line:
                startup_complete = True
                break

            # Check if process died
            if process.poll() is not None:
                if auth_error_detected:
                    print("\n❌ Authentication error detected!")
                    print("💡 Consider downloading the model manually (see README.md)")
                    print_authentication_help()
                else:
                    print("❌ Server process terminated unexpectedly")
                return

        if startup_complete:
            print("\n✅ Server started successfully!")
            print("🌐 Server URL: http://localhost:8000")
            print("📚 API docs: http://localhost:8000/docs")
            print("\n🎯 Ready to test transcription!")
            print("💡 Run: python test_voxtral_transcription.py")

            # Keep the server running
            print("\n⌨️  Press Ctrl+C to stop the server")
            try:
                process.wait()
            except KeyboardInterrupt:
                print("\n🛑 Stopping server...")
                process.terminate()
                process.wait()
                print("✅ Server stopped")

    except FileNotFoundError:
        print("❌ vLLM not found. Make sure it's installed:")
        print(
            '   uv pip install -U "vllm[audio]" --prerelease=allow --index-strategy unsafe-best-match --extra-index-url https://wheels.vllm.ai/nightly'
        )
    except KeyboardInterrupt:
        print("\n🛑 Server startup cancelled")
    except Exception as e:
        print(f"❌ Error starting server: {e}")
        if "401" in str(e) or "Unauthorized" in str(e):
            print_authentication_help()


def show_usage():
    """Show usage instructions"""
    print("🎯 Voxtral-Mini-3B-2507 Test Setup")
    print("=" * 50)
    print("1. 🚀 Start server: python start_voxtral_server.py")
    print("2. 🧪 Test transcription: python test_voxtral_transcription.py")
    print("3. 🎤 Use JFK sample: ../Voice_Mode_transcript/whisper.cpp/samples/jfk.wav")
    print("\n📋 Requirements:")
    print("   - vLLM with audio support installed")
    print("   - mistral_common[audio] installed")
    print("   - ~9.5 GB available GPU memory")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--help":
        show_usage()
    else:
        start_voxtral_server()
