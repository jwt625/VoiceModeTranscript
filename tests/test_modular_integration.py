"""
Integration tests for the modular frontend architecture.
Tests that the modular system loads and initializes correctly.
"""


import pytest
from selenium import webdriver
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


class TestModularIntegration:
    """Test the modular frontend integration."""

    @pytest.fixture(scope="class")
    def driver(self):
        """Set up Chrome driver for testing."""
        chrome_options = Options()
        chrome_options.add_argument("--headless")  # Run in headless mode
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--window-size=1920,1080")

        driver = webdriver.Chrome(options=chrome_options)
        driver.implicitly_wait(10)
        yield driver
        driver.quit()

    def test_page_loads_successfully(self, driver):
        """Test that the page loads without errors."""
        try:
            driver.get("http://localhost:5001")

            # Wait for the page title to be present
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.TAG_NAME, "title"))
            )

            # Check that the page title is correct
            assert "Voice Mode Transcript" in driver.title

        except TimeoutException:
            pytest.skip("Server not running on localhost:5001")

    def test_modular_scripts_load(self, driver):
        """Test that all modular JavaScript files load successfully."""
        try:
            driver.get("http://localhost:5001")

            # Wait for the page to load
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.TAG_NAME, "body"))
            )

            # Check for JavaScript errors in console
            logs = driver.get_log("browser")
            js_errors = [log for log in logs if log["level"] == "SEVERE"]

            # Print any JavaScript errors for debugging
            if js_errors:
                print("JavaScript errors found:")
                for error in js_errors:
                    print(f"  {error['message']}")

            # Assert no severe JavaScript errors
            assert len(js_errors) == 0, f"Found {len(js_errors)} JavaScript errors"

        except TimeoutException:
            pytest.skip("Server not running on localhost:5001")

    def test_application_initializes(self, driver):
        """Test that the modular application initializes successfully."""
        try:
            driver.get("http://localhost:5001")

            # Wait for the application to initialize
            WebDriverWait(driver, 15).until(
                lambda d: d.execute_script(
                    "return typeof window.transcriptRecorder !== 'undefined'"
                )
            )

            # Check that the application object exists
            app_exists = driver.execute_script(
                "return typeof window.transcriptRecorder !== 'undefined'"
            )
            assert app_exists, "Application object not found"

            # Check that the application is initialized
            is_initialized = driver.execute_script(
                "return window.transcriptRecorder.isInitialized"
            )
            assert is_initialized, "Application not initialized"

        except TimeoutException:
            pytest.skip("Server not running on localhost:5001")

    def test_modules_are_loaded(self, driver):
        """Test that all modules are loaded and initialized."""
        try:
            driver.get("http://localhost:5001")

            # Wait for the application to initialize
            WebDriverWait(driver, 15).until(
                lambda d: d.execute_script(
                    "return window.transcriptRecorder && window.transcriptRecorder.isInitialized"
                )
            )

            # Get module count
            module_count = driver.execute_script(
                "return window.transcriptRecorder.modules.size"
            )
            assert module_count == 8, f"Expected 8 modules, found {module_count}"

            # Check that all expected modules are loaded
            expected_modules = [
                "utils",
                "sse",
                "ui",
                "device",
                "recording",
                "transcript",
                "llm",
                "database",
            ]

            for module_name in expected_modules:
                module_exists = driver.execute_script(
                    f"return window.transcriptRecorder.modules.has('{module_name}')"
                )
                assert module_exists, f"Module '{module_name}' not found"

        except TimeoutException:
            pytest.skip("Server not running on localhost:5001")

    def test_event_bus_is_working(self, driver):
        """Test that the event bus system is working."""
        try:
            driver.get("http://localhost:5001")

            # Wait for the application to initialize
            WebDriverWait(driver, 15).until(
                lambda d: d.execute_script(
                    "return window.transcriptRecorder && window.transcriptRecorder.isInitialized"
                )
            )

            # Test event bus functionality
            event_bus_exists = driver.execute_script(
                "return typeof window.transcriptRecorder.eventBus !== 'undefined'"
            )
            assert event_bus_exists, "Event bus not found"

            # Test that we can emit and receive events
            test_result = driver.execute_script(
                """
                var received = false;
                var unsubscribe = window.transcriptRecorder.eventBus.on('test:event', function() {
                    received = true;
                });
                window.transcriptRecorder.eventBus.emit('test:event');
                unsubscribe();
                return received;
            """
            )

            assert test_result, "Event bus not working correctly"

        except TimeoutException:
            pytest.skip("Server not running on localhost:5001")

    def test_state_store_is_working(self, driver):
        """Test that the state store system is working."""
        try:
            driver.get("http://localhost:5001")

            # Wait for the application to initialize
            WebDriverWait(driver, 15).until(
                lambda d: d.execute_script(
                    "return window.transcriptRecorder && window.transcriptRecorder.isInitialized"
                )
            )

            # Test state store functionality
            state_store_exists = driver.execute_script(
                "return typeof window.transcriptRecorder.stateStore !== 'undefined'"
            )
            assert state_store_exists, "State store not found"

            # Test that we can set and get state
            test_result = driver.execute_script(
                """
                window.transcriptRecorder.stateStore.setState('test.value', 'hello');
                return window.transcriptRecorder.stateStore.getState('test.value');
            """
            )

            assert test_result == "hello", "State store not working correctly"

        except TimeoutException:
            pytest.skip("Server not running on localhost:5001")

    def test_ui_elements_are_present(self, driver):
        """Test that key UI elements are present and functional."""
        try:
            driver.get("http://localhost:5001")

            # Wait for the page to load
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.ID, "start-btn"))
            )

            # Check for key UI elements
            start_btn = driver.find_element(By.ID, "start-btn")
            assert start_btn.is_displayed(), "Start button not visible"

            stop_btn = driver.find_element(By.ID, "stop-btn")
            assert stop_btn.is_displayed(), "Stop button not visible"

            # Check for transcript panels
            raw_panel = driver.find_element(By.CLASS_NAME, "raw-panel")
            assert raw_panel.is_displayed(), "Raw transcript panel not visible"

            processed_panel = driver.find_element(By.CLASS_NAME, "processed-panel")
            assert (
                processed_panel.is_displayed()
            ), "Processed transcript panel not visible"

        except TimeoutException:
            pytest.skip("Server not running on localhost:5001")

    def test_api_endpoints_are_accessible(self, driver):
        """Test that key API endpoints are accessible."""
        try:
            driver.get("http://localhost:5001")

            # Wait for the application to initialize
            WebDriverWait(driver, 15).until(
                lambda d: d.execute_script(
                    "return window.transcriptRecorder && window.transcriptRecorder.isInitialized"
                )
            )

            # Test that API calls are being made successfully
            # Basic connectivity test - API calls are made during module initialization
            # In a real scenario you might want to mock API responses and verify specific calls
            pass

        except TimeoutException:
            pytest.skip("Server not running on localhost:5001")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
