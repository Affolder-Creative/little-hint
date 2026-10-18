"""Assemble deterministic source bundles from the reviewed, hash-pinned inputs."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import struct
import zlib
import hashlib
import io
import json
from pathlib import Path
import tarfile
import urllib.request
import urllib.error
import time
import shutil
import tempfile


class StoredGzip:
    """Fixed 65,535-byte DEFLATE stored blocks, independent of zlib versions."""
    def __init__(self, stream):
        self.stream = stream
        self.buffer = bytearray()
        self.crc = self.size = 0
        stream.write(bytes.fromhex('1f8b08000000000000ff'))

    def block(self, data, final):
        self.stream.write(bytes([int(final)]) + struct.pack('<HH', len(data), 65535 - len(data)))
        self.stream.write(data)

    def write(self, data):
        self.crc = zlib.crc32(data, self.crc)
        self.size += len(data)
        self.buffer.extend(data)
        while len(self.buffer) >= 65535:
            self.block(self.buffer[:65535], False)
            del self.buffer[:65535]
        return len(data)

    def __enter__(self):
        return self

    def __exit__(self, *exception):
        self.block(self.buffer, True)
        self.stream.write(struct.pack('<II', self.crc, self.size % 2**32))


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def fetch(entry, cache):
    target = cache / entry['sha256']
    if target.exists():
        if target.stat().st_size != entry['size'] or digest(target) != entry['sha256']:
            raise ValueError(f"Corrupt source cache: {entry['file']}")
        return target
    with tempfile.NamedTemporaryFile(dir=cache, delete=False) as stream:
        temporary = Path(stream.name)
        try:
            request = urllib.request.Request(entry['url'], headers={'User-Agent':'Little-Hint-source-review/1.0'})
            for attempt in range(3):
                try:
                    stream.seek(0)
                    stream.truncate()
                    with urllib.request.urlopen(request, timeout=120) as response:
                        if not response.url.startswith('https://'):
                            raise ValueError('Source redirect must retain HTTPS')
                        shutil.copyfileobj(response, stream)
                    break
                except (urllib.error.URLError, TimeoutError):
                    if attempt == 2:
                        raise
                    time.sleep(2 ** attempt)
            stream.flush()
            if temporary.stat().st_size != entry['size'] or digest(temporary) != entry['sha256']:
                raise ValueError(f"Source checksum/size mismatch: {entry['file']}")
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
    return target


def add(tar, name, data):
    info = tarfile.TarInfo(name)
    info.size = len(data)
    info.mode = 0o644
    tar.addfile(info, io.BytesIO(data))


def bundle(artifact, output, cache):
    with ThreadPoolExecutor(max_workers=8) as pool:
        paths = list(pool.map(lambda entry: fetch(entry, cache), artifact['inputs']))
    destination = output / artifact['file']
    temporary = destination.with_suffix('.partial')
    root = artifact['file'].removesuffix('.tar.gz')
    try:
        with temporary.open('wb') as raw, StoredGzip(raw) as zipped, tarfile.open(fileobj=zipped, mode='w|') as tar:
            add(tar, root + '/MANIFEST.json', (json.dumps(artifact, indent=2) + '\n').encode())
            for local in sorted(artifact['localFiles'], key=lambda item: item['file']):
                add(tar, root + '/' + local['file'], Path(local['path']).read_bytes())
            for entry, path in sorted(zip(artifact['inputs'], paths), key=lambda pair: pair[0]['file']):
                info = tarfile.TarInfo(root + '/' + entry['file'])
                info.size = path.stat().st_size
                info.mode = 0o644
                with path.open('rb') as stream:
                    tar.addfile(info, stream)
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
    return {'file': artifact['file'], 'sha256': digest(destination), 'size': destination.stat().st_size, 'covers': artifact['covers']}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('plan')
    parser.add_argument('output')
    parser.add_argument('--cache', default='.local/source-cache')
    args = parser.parse_args()
    output, cache = Path(args.output), Path(args.cache)
    output.mkdir(parents=True, exist_ok=True)
    cache.mkdir(parents=True, exist_ok=True)
    results = []
    for artifact in json.loads(Path(args.plan).read_text()):
        result = bundle(artifact, output, cache)
        print(f"Verified {artifact['file']}: {len(artifact['inputs'])} inputs, {result['size']} bytes", flush=True)
        results.append(result)
    (output / 'BUNDLES.json').write_text(json.dumps(results, indent=2) + '\n')


if __name__ == '__main__':
    main()
