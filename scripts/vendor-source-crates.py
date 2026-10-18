"""Run inside an extracted source bundle to prepare its verified Rust sources."""
import hashlib
import json
from pathlib import Path
import tarfile

root = Path(__file__).resolve().parent
manifest = json.loads((root / 'MANIFEST.json').read_text())
vendor = root / 'vendor'
vendor.mkdir(exist_ok=True)
for entry in manifest['inputs']:
    if not entry['file'].endswith('.crate'):
        continue
    archive = root / entry['file']
    with archive.open('rb') as stream:
        if hashlib.file_digest(stream, 'sha256').hexdigest() != entry['sha256']:
            raise ValueError(f"Checksum mismatch: {entry['file']}")
    with tarfile.open(archive) as tar:
        tar.extractall(vendor, filter='data')
    directory = vendor / archive.name.removesuffix('.crate')
    files = {}
    for path in directory.rglob('*'):
        if path.is_file() and path.name != '.cargo-checksum.json':
            files[str(path.relative_to(directory))] = hashlib.sha256(path.read_bytes()).hexdigest()
    (directory / '.cargo-checksum.json').write_text(json.dumps({'package': entry['sha256'], 'files': files}))
config = root / 'cargo-home'
config.mkdir(exist_ok=True)
(config / 'config.toml').write_text('[source.crates-io]\nreplace-with = "vendored-sources"\n[source.vendored-sources]\ndirectory = ' + json.dumps(str(vendor)) + '\n[net]\noffline = true\n')
print(f'Use CARGO_HOME={config} with an installed Rust toolchain. All crates are local; Cargo network access is disabled.')
