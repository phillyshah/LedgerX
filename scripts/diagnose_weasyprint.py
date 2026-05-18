#!/usr/bin/env python3
"""
Diagnostic for weasyprint setup on the VPS.

Run with:
    /opt/ledgerx/venv/bin/python3 /opt/ledgerx/diagnose_weasyprint.py

Checks:
  1. Can weasyprint be imported?
  2. Are required system libraries available?
  3. Can a simple HTML body be rendered to a real PDF?
"""

import ctypes.util
import sys

print("=== Python ===")
print(f"  executable: {sys.executable}")
print(f"  version: {sys.version}")

print()
print("=== System libraries ===")
for lib in ("pango-1.0", "pangoft2-1.0", "cairo", "harfbuzz", "fontconfig", "gobject-2.0"):
    path = ctypes.util.find_library(lib)
    status = path if path else "NOT FOUND"
    print(f"  {lib}: {status}")

print()
print("=== weasyprint import ===")
try:
    import weasyprint
    print(f"  ✓ imported (version {weasyprint.__version__})")
except Exception as ex:
    print(f"  ✗ import failed: {type(ex).__name__}: {ex}")
    sys.exit(1)

print()
print("=== Render test ===")
sample = """<html><body>
<h1>Test Receipt</h1>
<p>Vendor: Coffee Shop</p>
<p>Total: $4.50</p>
<p>Date: 2026-05-18</p>
</body></html>"""

try:
    def _no_net(url):
        return {"string": b"", "mime_type": "image/png"}
    pdf = weasyprint.HTML(string=sample, url_fetcher=_no_net).write_pdf()
    if pdf and pdf[:4] == b"%PDF":
        print(f"  ✓ Generated valid PDF ({len(pdf)} bytes)")
    else:
        print(f"  ✗ Output is not a valid PDF (len={len(pdf) if pdf else 0})")
        sys.exit(1)
except Exception as ex:
    print(f"  ✗ Render failed: {type(ex).__name__}: {ex}")
    sys.exit(1)

print()
print("=== Result: weasyprint is fully functional ===")
