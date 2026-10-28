#!/usr/bin/env python3
"""Fail-closed PT_LOAD and APK ZIP checks; no external ELF parser required.

This is a static alignment gate, not proof of 16KB runtime/RELRO acceptance.
AAB member offsets are not APK offsets: check ELF in both, ZIP only in APK.
"""
import argparse
import json
import struct
import sys
import zipfile
from pathlib import Path

PAGE = 16384
ABIS = {'arm64-v8a': (2, 183), 'x86_64': (2, 62), 'armeabi-v7a': (1, 40)}


def elf_alignment(data):
    if len(data) < 16 or data[:4] != b'\x7fELF':
        raise ValueError('missing ELF header')
    kind, encoding = data[4], data[5]
    if kind not in (1, 2) or encoding not in (1, 2):
        raise ValueError('unsupported ELF class/byte order')
    endian = '<' if encoding == 1 else '>'
    wide = kind == 2
    header_size = 64 if wide else 52
    if len(data) < header_size:
        raise ValueError('truncated ELF header')
    machine = struct.unpack_from(endian + 'H', data, 18)[0]
    offset = struct.unpack_from(endian + ('Q' if wide else 'I'), data, 32 if wide else 28)[0]
    size, count = struct.unpack_from(endian + 'HH', data, 54 if wide else 42)
    if count == 0 or count == 0xffff or size != (56 if wide else 32):
        raise ValueError('missing/unsupported program headers')
    if offset < header_size or offset + count * size > len(data):
        raise ValueError('program headers out of file')
    loads = []
    for index in range(count):
        p = struct.unpack_from(endian + ('IIQQQQQQ' if wide else 'IIIIIIII'), data, offset + size * index)
        if p[0] != 1:
            continue
        pos, addr, filesz, memsz, alignment = (p[2], p[3], p[5], p[6], p[7]) if wide else (p[1], p[2], p[4], p[5], p[7])
        if filesz > memsz or pos + filesz > len(data):
            raise ValueError('invalid/truncated PT_LOAD segment')
        if alignment < 1 or alignment & (alignment - 1):
            raise ValueError('PT_LOAD alignment is not a power of two')
        if pos % alignment != addr % alignment:
            raise ValueError('PT_LOAD offset/vaddr mismatch')
        loads.append({'alignment': alignment, 'congruent_16k': pos % PAGE == addr % PAGE})
    if not loads:
        raise ValueError('no PT_LOAD segments')
    return {'class': kind, 'machine': machine, 'loads': loads,
            'aligned_16k': all(x['alignment'] >= PAGE and x['congruent_16k'] for x in loads)}


def audit(path, required_abis=()):
    path = Path(path)
    errors, libraries, found = [], [], set()
    if path.suffix == '.so':
        result = elf_alignment(path.read_bytes())
        if result['class'] == 2 and not result['aligned_16k']:
            errors.append(f'{path.name}: PT_LOAD below 16KB')
        libraries.append({'name': path.name, **result})
        if required_abis:
            errors.append('ABI requirements need an APK/AAB')
    elif path.suffix in ('.apk', '.aab'):
        is_apk = path.suffix == '.apk'
        with path.open('rb') as raw, zipfile.ZipFile(path) as z:
            names = z.namelist()
            if len(names) != len(set(names)):
                raise ValueError('duplicate ZIP entries')
            for info in z.infolist():
                parts = info.filename.split('/')
                prefix = ['lib'] if is_apk else ['base', 'lib']
                if not info.filename.endswith('.so'):
                    continue
                if len(parts) != len(prefix) + 2 or parts[:len(prefix)] != prefix:
                    # An asset .so is not installed native code, do not infer ABI.
                    continue
                abi = parts[-2]
                if abi not in ABIS:
                    raise ValueError('unrecognised packaged ABI: ' + abi)
                found.add(abi)
                result = elf_alignment(z.read(info))
                if (result['class'], result['machine']) != ABIS[abi]:
                    errors.append(f'{info.filename}: ELF class/machine differs from ABI')
                if result['class'] == 2 and not result['aligned_16k']:
                    errors.append(f'{info.filename}: PT_LOAD below 16KB')
                row = {'name': info.filename, **result}
                if is_apk and result['class'] == 2 and info.compress_type == zipfile.ZIP_STORED:
                    raw.seek(info.header_offset)
                    header = raw.read(30)
                    if len(header) != 30 or header[:4] != b'PK\x03\x04':
                        raise ValueError('invalid local ZIP header')
                    name_size, extra_size = struct.unpack_from('<HH', header, 26)
                    data_offset = info.header_offset + 30 + name_size + extra_size
                    row['zip_aligned_16k'] = data_offset % PAGE == 0
                    if not row['zip_aligned_16k']:
                        errors.append(f'{info.filename}: uncompressed APK ZIP offset not 16KB aligned')
                libraries.append(row)
        if not any(x['class'] == 2 for x in libraries):
            errors.append('no 64-bit native libraries')
        for abi in required_abis:
            if abi not in found:
                errors.append('required ABI missing: ' + abi)
    else:
        raise ValueError('expected .so, .apk or .aab')
    return {'artifact': str(path), 'status': 'FAIL' if errors else 'PASS',
            'libraries': libraries, 'errors': errors,
            'scope': 'static PT_LOAD/ABI/APK ZIP alignment; runtime/RELRO require separate verification'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('paths', nargs='+', type=Path)
    parser.add_argument('--require-abi', action='append', default=[], choices=ABIS)
    args = parser.parse_args()
    reports = []
    for path in args.paths:
        try:
            reports.append(audit(path, args.require_abi))
        except (OSError, ValueError, struct.error, zipfile.BadZipFile, RuntimeError) as error:
            reports.append({'artifact': str(path), 'status': 'FAIL', 'errors': [str(error)]})
    print(json.dumps(reports, indent=2))
    return 1 if any(r['status'] != 'PASS' for r in reports) else 0


if __name__ == '__main__':
    sys.exit(main())
