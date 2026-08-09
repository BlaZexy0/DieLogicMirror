"""Minimal test runner for environments without pytest.

Usage: python3 tests/run_tests.py
"""
import importlib
import sys
import traceback
from pathlib import Path


def main():
    tests_dir = Path(__file__).resolve().parent
    sys.path.insert(0, str(tests_dir))
    sys.path.insert(0, str(tests_dir.parent))
    passed = failed = 0
    for file in sorted(tests_dir.glob("test_*.py")):
        module = importlib.import_module(file.stem)
        for name in sorted(dir(module)):
            if name.startswith("test_") and callable(getattr(module, name)):
                try:
                    getattr(module, name)()
                    passed += 1
                except Exception:
                    failed += 1
                    print(f"FAIL {file.stem}.{name}")
                    traceback.print_exc()
    print(f"{passed} passed, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
