"""Inventory the installed, pinned Python tools without regenerating artwork."""
import json
from importlib.metadata import distribution
from pathlib import Path

expected = {
    "fonttools": ("4.67.0", "MIT"),
    "uharfbuzz": ("0.56.3", "Apache License 2.0"),
}
inventory, notices = [], []
for requirement in Path("brand/little-hint-final/source/requirements.txt").read_text().splitlines():
    if not requirement.strip() or requirement.startswith("#"):
        continue
    name, version = requirement.split("==")
    dist = distribution(name)
    license_name = dist.metadata.get("License-Expression") or dist.metadata.get("License")
    if expected.get(name) != (version, license_name) or dist.version != version:
        raise SystemExit(f"Review the Python tool license before updating: {name} {version} {license_name}")
    files = [p for p in dist.files if ".dist-info/licenses/" in str(p)]
    if not files:
        raise SystemExit(f"No bundled license texts found: {name}")
    inventory.append({"name": name, "version": version, "license": license_name,
                      "license_files": [str(p) for p in files]})
    for file in files:
        notices.append(f"{name} {version}: {file}\n{dist.locate_file(file).read_text()}")
output = Path(".local/brand-compliance")
output.mkdir(parents=True, exist_ok=True)
(output / "python-inventory.json").write_text(json.dumps(inventory, indent=2) + "\n")
(output / "python-notices.txt").write_text("\n\n".join(notices))
print(f"Reviewed {len(inventory)} pinned Python brand tools and their bundled notices.")
