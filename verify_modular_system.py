#!/usr/bin/env python3
"""
Simple verification script for the modular frontend system.
Tests that all JavaScript files are accessible and the application loads.
"""

import sys
from urllib.parse import urljoin

import requests


def test_server_running():
    """Test that the server is running."""
    try:
        response = requests.get("http://localhost:5001", timeout=5)
        return response.status_code == 200
    except requests.exceptions.RequestException:
        return False


def test_javascript_files():
    """Test that all JavaScript files are accessible."""
    base_url = "http://localhost:5001"

    js_files = [
        # Core Infrastructure
        "/static/js/core/event-bus.js",
        "/static/js/core/state-store.js",
        "/static/js/core/module-base.js",
        # Module Configuration
        "/static/js/config/module-config.js",
        # Application Modules
        "/static/js/modules/utils.js",
        "/static/js/modules/sse.js",
        "/static/js/modules/ui.js",
        "/static/js/modules/device.js",
        "/static/js/modules/recording.js",
        "/static/js/modules/transcript.js",
        "/static/js/modules/llm.js",
        "/static/js/modules/database.js",
        # Main Application
        "/static/js/app-modular.js",
    ]

    results = {}

    for js_file in js_files:
        try:
            url = urljoin(base_url, js_file)
            response = requests.get(url, timeout=5)
            results[js_file] = {
                "status": response.status_code,
                "size": len(response.content),
                "success": response.status_code == 200,
            }
        except requests.exceptions.RequestException as e:
            results[js_file] = {
                "status": "ERROR",
                "size": 0,
                "success": False,
                "error": str(e),
            }

    return results


def test_api_endpoints():
    """Test that key API endpoints are accessible."""
    base_url = "http://localhost:5001"

    endpoints = ["/api/audio-devices", "/api/sessions"]

    results = {}

    for endpoint in endpoints:
        try:
            url = urljoin(base_url, endpoint)
            response = requests.get(url, timeout=5)
            results[endpoint] = {
                "status": response.status_code,
                "success": response.status_code == 200,
            }
        except requests.exceptions.RequestException as e:
            results[endpoint] = {"status": "ERROR", "success": False, "error": str(e)}

    return results


def main():
    """Run all verification tests."""
    print("🔍 Verifying Modular Frontend System")
    print("=" * 50)

    # Test 1: Server Running
    print("\n1. Testing server connectivity...")
    if test_server_running():
        print("   ✅ Server is running on http://localhost:5001")
    else:
        print("   ❌ Server is not running on http://localhost:5001")
        print("   Please start the server with: python app.py")
        sys.exit(1)

    # Test 2: JavaScript Files
    print("\n2. Testing JavaScript file accessibility...")
    js_results = test_javascript_files()

    success_count = 0
    total_count = len(js_results)

    for js_file, result in js_results.items():
        if result["success"]:
            print(f"   ✅ {js_file} ({result['size']} bytes)")
            success_count += 1
        else:
            print(f"   ❌ {js_file} - Status: {result['status']}")
            if "error" in result:
                print(f"      Error: {result['error']}")

    print(f"\n   📊 JavaScript Files: {success_count}/{total_count} successful")

    # Test 3: API Endpoints
    print("\n3. Testing API endpoint accessibility...")
    api_results = test_api_endpoints()

    api_success_count = 0
    api_total_count = len(api_results)

    for endpoint, result in api_results.items():
        if result["success"]:
            print(f"   ✅ {endpoint}")
            api_success_count += 1
        else:
            print(f"   ❌ {endpoint} - Status: {result['status']}")
            if "error" in result:
                print(f"      Error: {result['error']}")

    print(f"\n   📊 API Endpoints: {api_success_count}/{api_total_count} successful")

    # Summary
    print("\n" + "=" * 50)
    print("📋 VERIFICATION SUMMARY")
    print("=" * 50)

    if success_count == total_count and api_success_count == api_total_count:
        print("🎉 ALL TESTS PASSED!")
        print("✅ Modular frontend system is working correctly")
        print("✅ All JavaScript files are loading")
        print("✅ All API endpoints are accessible")
        print("\n🌐 You can now test the application at: http://localhost:5001")
        return True
    else:
        print("⚠️  SOME TESTS FAILED")
        if success_count < total_count:
            print(f"❌ {total_count - success_count} JavaScript files failed to load")
        if api_success_count < api_total_count:
            print(f"❌ {api_total_count - api_success_count} API endpoints failed")
        return False


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
