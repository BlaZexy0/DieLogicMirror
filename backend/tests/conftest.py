import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

# Tests laufen gegen eine frische SQLite-Datei — muss vor dem ersten Import
# von backend.db gesetzt sein (die Engine entsteht beim Import).
_tmp = Path(tempfile.mkdtemp(prefix="dielogic-test-"))
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp / 'test.db'}"
os.environ["DIELOGIC_ADMIN_EMAIL"] = "owner@example.com"
os.environ["DIELOGIC_ADMIN_TOKEN"] = "bootstrap-token-for-tests"
os.environ["DIELOGIC_DEMO_PASSWORD"] = "demo-demo-demo"
