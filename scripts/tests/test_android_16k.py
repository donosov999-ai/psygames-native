"""Synthetic static-gate regressions; these fixtures do not prove device support."""

import json
from pathlib import Path
import runpy
import struct
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
import warnings
import zipfile


SCRIPT = Path(__file__).resolve().parents[1] / 'check_android_16k.py'
CHECKER = SimpleNamespace(**runpy.run_path(str(SCRIPT)))
PAGE = 16384


def elf_fixture(*, elf_class=2, byte_order=1, machine=None,
                alignments=(PAGE,), segment_type=1, file_offset=0,
                virtual_address=65536, file_size=None, memory_size=None):
    """Construct minimal ELF headers and segments, without invoking the checker."""
    wide = elf_class == 2
    endian = '<' if byte_order == 1 else '>'
    header_size, entry_size = (64, 56) if wide else (52, 32)
    size = header_size + entry_size * len(alignments)
    data = bytearray(size)
    data[:16] = b'\x7fELF' + bytes((elf_class, byte_order, 1)) + bytes(9)
    machine = (183 if wide else 40) if machine is None else machine
    struct.pack_into(endian + 'HHI', data, 16, 3, machine, 1)
    struct.pack_into(endian + ('Q' if wide else 'I'), data,
                     32 if wide else 28, header_size)
    struct.pack_into(endian + 'HHH', data, 52 if wide else 40,
                     header_size, entry_size, len(alignments))
    filesz = size if file_size is None else file_size
    memsz = filesz if memory_size is None else memory_size
    for index, alignment in enumerate(alignments):
        entry = ((segment_type, 5, file_offset, virtual_address, 0,
                  filesz, memsz, alignment) if wide else
                 (segment_type, file_offset, virtual_address, 0,
                  filesz, memsz, 5, alignment))
        struct.pack_into(endian + ('IIQQQQQQ' if wide else 'IIIIIIII'),
                         data, header_size + index * entry_size, *entry)
    return bytes(data)


class Android16kTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix='android-16k-test-')
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)

    def library(self, data, name='fixture.so'):
        path = self.root / name
        path.write_bytes(data)
        return path

    def archive(self, entries, *, suffix='.apk', compressed=False, aligned=False):
        """Use real ZIP headers; an extra field optionally pads stored members."""
        path = self.root / ('fixture' + suffix)
        with zipfile.ZipFile(path, 'w') as archive:
            for name, data in entries:
                info = zipfile.ZipInfo(name)
                info.compress_type = (zipfile.ZIP_DEFLATED if compressed
                                      else zipfile.ZIP_STORED)
                if aligned:
                    padding = (-(archive.fp.tell() + 30 + len(name.encode('utf-8')))) % PAGE
                    if 0 < padding < 4:
                        padding += PAGE
                    if padding:
                        info.extra = struct.pack('<HH', 0xcafe, padding - 4) + bytes(padding - 4)
                archive.writestr(info, data)
        return path

    def cli(self, *arguments):
        return subprocess.run([sys.executable, str(SCRIPT), *map(str, arguments)],
                              capture_output=True, text=True, timeout=10, check=False)

    def test_16k_and_64k_64bit_libraries_pass(self):
        for alignment in (16384, 65536):
            with self.subTest(alignment=alignment):
                path = self.library(elf_fixture(alignments=(alignment,)))
                report = CHECKER.audit(path)
                self.assertEqual(report['status'], 'PASS')
                self.assertEqual(report['errors'], [])
                self.assertTrue(report['libraries'][0]['aligned_16k'])
                self.assertEqual(report['libraries'][0]['loads'],
                                 [{'alignment': alignment, 'congruent_16k': True}])

    def test_4k_64bit_library_fails(self):
        report = CHECKER.audit(self.library(elf_fixture(alignments=(4096,))))
        self.assertEqual(report['status'], 'FAIL')
        self.assertIn('fixture.so: PT_LOAD below 16KB', report['errors'])
        self.assertFalse(report['libraries'][0]['aligned_16k'])

    def test_all_load_segments_must_be_aligned(self):
        report = CHECKER.audit(self.library(elf_fixture(alignments=(PAGE, 4096))))
        self.assertEqual(report['status'], 'FAIL')
        self.assertEqual(len(report['libraries'][0]['loads']), 2)

    def test_32bit_4k_library_is_not_subject_to_64bit_gate(self):
        report = CHECKER.audit(self.library(elf_fixture(elf_class=1, alignments=(4096,))))
        self.assertEqual(report['status'], 'PASS')
        self.assertFalse(report['libraries'][0]['aligned_16k'])

    def test_supported_elf_classes_and_byte_orders(self):
        for elf_class in (1, 2):
            for byte_order in (1, 2):
                with self.subTest(elf_class=elf_class, byte_order=byte_order):
                    result = CHECKER.elf_alignment(elf_fixture(
                        elf_class=elf_class, byte_order=byte_order))
                    self.assertEqual(result['class'], elf_class)
                    self.assertEqual(result['machine'], 40 if elf_class == 1 else 183)
                    self.assertTrue(result['aligned_16k'])

    def test_missing_elf_header(self):
        for data in (b'', b'not an ELF', bytes(64), b'\x7fELF' + bytes(11)):
            with self.subTest(length=len(data)):
                with self.assertRaisesRegex(ValueError, 'missing ELF header'):
                    CHECKER.elf_alignment(data)

    def test_truncated_elf_headers(self):
        for elf_class, header_size in ((1, 52), (2, 64)):
            for length in (16, header_size - 1):
                with self.subTest(elf_class=elf_class, length=length):
                    with self.assertRaisesRegex(ValueError, 'truncated ELF header'):
                        CHECKER.elf_alignment(elf_fixture(elf_class=elf_class)[:length])

    def test_invalid_elf_class_and_byte_order(self):
        for index in (4, 5):
            for invalid in (0, 3, 255):
                with self.subTest(index=index, invalid=invalid):
                    data = bytearray(elf_fixture())
                    data[index] = invalid
                    with self.assertRaisesRegex(ValueError, 'unsupported ELF class/byte order'):
                        CHECKER.elf_alignment(data)

    def test_missing_or_unsupported_program_headers(self):
        for elf_class, field, entry_size in ((1, 42, 32), (2, 54, 56)):
            for size, count in ((entry_size, 0), (entry_size, 0xffff),
                                (0, 1), (entry_size - 1, 1)):
                with self.subTest(elf_class=elf_class, size=size, count=count):
                    data = bytearray(elf_fixture(elf_class=elf_class))
                    struct.pack_into('<HH', data, field, size, count)
                    with self.assertRaisesRegex(ValueError, 'missing/unsupported program headers'):
                        CHECKER.elf_alignment(data)

    def test_program_header_table_must_be_inside_file(self):
        for elf_class, field, fmt, header_size in ((1, 28, '<I', 52), (2, 32, '<Q', 64)):
            original = elf_fixture(elf_class=elf_class)
            for offset in (0, header_size - 1, len(original)):
                with self.subTest(elf_class=elf_class, offset=offset):
                    data = bytearray(original)
                    struct.pack_into(fmt, data, field, offset)
                    with self.assertRaisesRegex(ValueError, 'program headers out of file'):
                        CHECKER.elf_alignment(data)
            with self.subTest(elf_class=elf_class, truncated_table=True):
                with self.assertRaisesRegex(ValueError, 'program headers out of file'):
                    CHECKER.elf_alignment(original[:-1])

    def test_no_load_segments(self):
        for elf_class in (1, 2):
            with self.subTest(elf_class=elf_class):
                with self.assertRaisesRegex(ValueError, 'no PT_LOAD segments'):
                    CHECKER.elf_alignment(elf_fixture(elf_class=elf_class, segment_type=4))

    def test_invalid_or_truncated_load_segment(self):
        for elf_class in (1, 2):
            for fields in ({'file_size': 8, 'memory_size': 7},
                           {'file_size': 1000}, {'file_offset': 1000, 'file_size': 1}):
                with self.subTest(elf_class=elf_class, fields=fields):
                    with self.assertRaisesRegex(ValueError, 'invalid/truncated PT_LOAD segment'):
                        CHECKER.elf_alignment(elf_fixture(elf_class=elf_class, **fields))

    def test_load_alignment_must_be_positive_power_of_two(self):
        for elf_class in (1, 2):
            for alignment in (0, 3, 12288, 24576):
                with self.subTest(elf_class=elf_class, alignment=alignment):
                    with self.assertRaisesRegex(ValueError, 'not a power of two'):
                        CHECKER.elf_alignment(elf_fixture(
                            elf_class=elf_class, alignments=(alignment,)))

    def test_load_offset_and_virtual_address_must_be_congruent(self):
        for elf_class in (1, 2):
            with self.subTest(elf_class=elf_class):
                with self.assertRaisesRegex(ValueError, 'PT_LOAD offset/vaddr mismatch'):
                    CHECKER.elf_alignment(elf_fixture(
                        elf_class=elf_class, virtual_address=65537))

    def test_4k_congruence_is_not_16k_congruence(self):
        result = CHECKER.elf_alignment(elf_fixture(
            alignments=(4096,), virtual_address=4096))
        self.assertFalse(result['loads'][0]['congruent_16k'])
        self.assertFalse(result['aligned_16k'])

    def test_nonzero_congruent_load_offset_passes(self):
        result = CHECKER.elf_alignment(elf_fixture(
            file_offset=16, file_size=8, virtual_address=65552))
        self.assertTrue(result['aligned_16k'])

    def test_apk_stored_misaligned_zip_offset_fails(self):
        path = self.archive([('lib/arm64-v8a/libfixture.so', elf_fixture())])
        report = CHECKER.audit(path)
        self.assertEqual(report['status'], 'FAIL')
        self.assertTrue(report['libraries'][0]['aligned_16k'])
        self.assertFalse(report['libraries'][0]['zip_aligned_16k'])
        self.assertTrue(any('uncompressed APK ZIP offset not 16KB aligned' in error
                            for error in report['errors']))

    def test_apk_stored_aligned_zip_offsets_pass(self):
        path = self.archive([
            ('lib/arm64-v8a/libfixture.so', elf_fixture()),
            ('lib/x86_64/libfixture.so', elf_fixture(machine=62, alignments=(65536,))),
        ], aligned=True)
        report = CHECKER.audit(path, ('arm64-v8a', 'x86_64'))
        self.assertEqual(report['status'], 'PASS')
        self.assertEqual(len(report['libraries']), 2)
        self.assertTrue(all(row['zip_aligned_16k'] for row in report['libraries']))

    def test_apk_compressed_skips_zip_offset_gate(self):
        path = self.archive([('lib/arm64-v8a/libfixture.so', elf_fixture())], compressed=True)
        report = CHECKER.audit(path, ('arm64-v8a',))
        self.assertEqual(report['status'], 'PASS')
        self.assertNotIn('zip_aligned_16k', report['libraries'][0])

    def test_compression_does_not_hide_4k_elf_failure(self):
        path = self.archive([('lib/arm64-v8a/libfixture.so',
                              elf_fixture(alignments=(4096,)))], compressed=True)
        report = CHECKER.audit(path)
        self.assertEqual(report['status'], 'FAIL')
        self.assertTrue(any('PT_LOAD below 16KB' in error for error in report['errors']))

    def test_aab_skips_zip_offset_gate_but_keeps_elf_gate(self):
        for alignment, expected in ((PAGE, 'PASS'), (65536, 'PASS'), (4096, 'FAIL')):
            with self.subTest(alignment=alignment):
                path = self.archive([('base/lib/arm64-v8a/libfixture.so',
                                      elf_fixture(alignments=(alignment,)))], suffix='.aab')
                report = CHECKER.audit(path, ('arm64-v8a',))
                self.assertEqual(report['status'], expected)
                self.assertNotIn('zip_aligned_16k', report['libraries'][0])

    def test_packaged_abi_class_or_machine_mismatch_fails(self):
        for suffix, prefix in (('.apk', 'lib'), ('.aab', 'base/lib')):
            for abi, data in (
                ('arm64-v8a', elf_fixture(machine=62)),
                ('x86_64', elf_fixture()),
                ('arm64-v8a', elf_fixture(elf_class=1)),
                ('armeabi-v7a', elf_fixture()),
            ):
                with self.subTest(suffix=suffix, abi=abi, data_class=data[4]):
                    path = self.archive([(f'{prefix}/{abi}/libfixture.so', data)],
                                        suffix=suffix, compressed=True)
                    report = CHECKER.audit(path)
                    self.assertEqual(report['status'], 'FAIL')
                    self.assertTrue(any('ELF class/machine differs from ABI' in error
                                        for error in report['errors']))

    def test_required_abi_missing_fails(self):
        for suffix, prefix in (('.apk', 'lib'), ('.aab', 'base/lib')):
            with self.subTest(suffix=suffix):
                path = self.archive([(f'{prefix}/arm64-v8a/libfixture.so', elf_fixture())],
                                    suffix=suffix, compressed=True)
                report = CHECKER.audit(path, ('arm64-v8a', 'x86_64'))
                self.assertEqual(report['status'], 'FAIL')
                self.assertIn('required ABI missing: x86_64', report['errors'])

    def test_unknown_packaged_abi_is_rejected(self):
        path = self.archive([('lib/mips64/libfixture.so', elf_fixture())])
        with self.assertRaisesRegex(ValueError, 'unrecognised packaged ABI: mips64'):
            CHECKER.audit(path)

    def test_standalone_library_cannot_satisfy_packaged_abi_requirement(self):
        report = CHECKER.audit(self.library(elf_fixture()), ('arm64-v8a',))
        self.assertEqual(report['status'], 'FAIL')
        self.assertIn('ABI requirements need an APK/AAB', report['errors'])

    def test_32bit_only_archive_fails_without_64bit_library(self):
        path = self.archive([('lib/armeabi-v7a/libfixture.so',
                              elf_fixture(elf_class=1, alignments=(4096,)))])
        report = CHECKER.audit(path, ('armeabi-v7a',))
        self.assertEqual(report['status'], 'FAIL')
        self.assertEqual(report['errors'], ['no 64-bit native libraries'])

    def test_non_native_asset_so_does_not_satisfy_required_abi(self):
        path = self.archive([('assets/lib/arm64-v8a/asset.so', b'not an ELF')])
        report = CHECKER.audit(path, ('arm64-v8a',))
        self.assertEqual(report['libraries'], [])
        self.assertIn('required ABI missing: arm64-v8a', report['errors'])

    def test_empty_archives_fail(self):
        for suffix in ('.apk', '.aab'):
            with self.subTest(suffix=suffix):
                report = CHECKER.audit(self.archive([], suffix=suffix))
                self.assertEqual(report['status'], 'FAIL')
                self.assertEqual(report['libraries'], [])
                self.assertIn('no 64-bit native libraries', report['errors'])

    def test_duplicate_entries_are_rejected(self):
        for suffix, prefix in (('.apk', 'lib'), ('.aab', 'base/lib')):
            with self.subTest(suffix=suffix):
                entry = (f'{prefix}/arm64-v8a/libfixture.so', elf_fixture())
                with warnings.catch_warnings():
                    warnings.simplefilter('ignore', UserWarning)
                    path = self.archive([entry, entry], suffix=suffix)
                with self.assertRaisesRegex(ValueError, 'duplicate ZIP entries'):
                    CHECKER.audit(path)

    def test_cli_missing_file_returns_json_fail_and_nonzero_exit(self):
        missing = self.root / 'missing.apk'
        process = self.cli(missing)
        self.assertEqual(process.returncode, 1, process.stderr)
        self.assertEqual(process.stderr, '')
        reports = json.loads(process.stdout)
        self.assertEqual(len(reports), 1)
        self.assertEqual(reports[0]['artifact'], str(missing))
        self.assertEqual(reports[0]['status'], 'FAIL')
        self.assertTrue(reports[0]['errors'])

    def test_cli_valid_library_returns_pass_and_zero_exit(self):
        process = self.cli(self.library(elf_fixture()))
        self.assertEqual(process.returncode, 0, process.stderr)
        self.assertEqual(json.loads(process.stdout)[0]['status'], 'PASS')

    def test_cli_malformed_elf_and_zip_are_fail_closed(self):
        malformed_elf = self.library(b'not an ELF')
        malformed_zip = self.library(b'not a ZIP', name='broken.apk')
        process = self.cli(malformed_elf, malformed_zip)
        self.assertEqual(process.returncode, 1, process.stderr)
        reports = json.loads(process.stdout)
        self.assertEqual([report['status'] for report in reports], ['FAIL', 'FAIL'])
        self.assertTrue(all(report['errors'] for report in reports))


if __name__ == '__main__':
    unittest.main()
