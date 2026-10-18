"""Exercise bundle integrity and deterministic packaging without network access."""
import hashlib
import importlib.util
import json
import io
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('bundles', Path(__file__).with_name('bundle-sources.py'))
bundles = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bundles)


class BundleTests(unittest.TestCase):
    def test_download_checksum_mismatch_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            cache = Path(temporary)
            response = io.BytesIO(b'wrong source')
            response.url = 'https://invalid.example/source'
            entry = {'file':'source.txt','url':response.url,'sha256':'a'*64,'size':12}
            with patch.object(bundles.urllib.request, 'urlopen', return_value=response):
                with self.assertRaisesRegex(ValueError, 'checksum/size mismatch'):
                    bundles.fetch(entry, cache)
            self.assertEqual(list(cache.iterdir()), [])

    def test_cached_sources_are_verified_and_output_is_reproducible(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            cache, output = root / 'cache', root / 'output'
            cache.mkdir()
            output.mkdir()
            source = b'original source bytes\n'
            sha = hashlib.sha256(source).hexdigest()
            (cache / sha).write_bytes(source)
            note = root / 'README.md'
            note.write_text('Preserved upstream sources and licenses.\n')
            artifact = {'file':'fixture.tar.gz', 'covers':['native:fixture@1'],
                'inputs':[{'file':'source.txt','url':'https://invalid.example/source','sha256':sha,'size':len(source)}],
                'localFiles':[{'file':'README.md','path':str(note)}]}
            with patch.object(bundles.urllib.request, 'urlopen', side_effect=AssertionError('Network should not be used')):
                first = bundles.bundle(artifact, output, cache)
                second = bundles.bundle(artifact, output, cache)
                self.assertEqual(first, second)
                with tarfile.open(output / 'fixture.tar.gz') as tar:
                    self.assertEqual(tar.extractfile('fixture/source.txt').read(), source)
                    self.assertEqual(json.load(tar.extractfile('fixture/MANIFEST.json')), artifact)
                (cache / sha).write_bytes(b'tampered source bytes')
                with self.assertRaisesRegex(ValueError, 'Corrupt source cache'):
                    bundles.bundle(artifact, output, cache)


if __name__ == '__main__':
    unittest.main()
