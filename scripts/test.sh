#!/usr/bin/env bash
# Build the public site and run the unit and browser checks.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -m pip install -r requirements.txt
python3 build.py
python3 test/test_build.py
python3 test/test_tokens.py
python3 test/test_site.py
python3 test/test_ux.py
python3 test/test_map_layer.py
python3 test/test_travel.py
python3 test/test_duration.py
python3 test/test_moovit.py
