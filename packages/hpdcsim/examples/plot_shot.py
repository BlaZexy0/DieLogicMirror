"""Render the six-panel shot overview for a JSON-configured process.

Run from the package root: python3 examples/plot_shot.py [config.json]
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import matplotlib
matplotlib.use("Agg")

from hpdcsim import load_process
from hpdcsim.plotting import shot_overview


def main():
    config = sys.argv[1] if len(sys.argv) > 1 else \
        Path(__file__).with_name("demo.json")
    process = load_process(config)
    out = Path(__file__).with_name("shot_overview.png")
    shot_overview(process, filename=out)
    print(f"saved {out}")


if __name__ == "__main__":
    main()
