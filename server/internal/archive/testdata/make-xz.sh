#!/bin/sh
# Regenerates the .xz test files with the reference xz (XZ Utils). Run from this folder.
# input.bin (16 KiB): 6 KiB of seeded random bytes (ARM/Thumb/PowerPC/SPARC patterns), x86
# call/jump sequences with varying gaps (exercising the x86 filter's look-back state), IA-64
# branch bundles, then text.
set -e
python3 -I -c "
import random
r = random.Random(42)
data = bytearray(r.getrandbits(8) for _ in range(6144))
for k in range(400):
    data += bytes([0xe8 if k % 3 else 0xe9, k & 255, (k * 7) & 255]) + (b'\x00\x00' if k % 5 else b'\xff\xff')
    data += b'\x90' * (k % 7)
for k in range(64):
    # template 0x10 (branch in slot 2) with opcode 5 in bits 37-40 of the slot
    bundle = bytearray(r.getrandbits(8) for _ in range(16))
    bundle[0] = 0x10
    slot = int.from_bytes(bundle[10:16], 'little') >> 7
    slot = (slot & ~((0xf << 37) | (0x7 << 9))) | (0x5 << 37)
    value = (int.from_bytes(bundle[10:16], 'little') & 0x7f) | (slot << 7)
    bundle[10:16] = (value & (2**48 - 1)).to_bytes(6, 'little')
    data += bundle
data += b'archive helper test line\n' * 400
open('input.bin', 'wb').write(bytes(data[:16384]))
"
x() { name=$1; shift; xz --format=xz "$@" -c input.bin > "$name.xz"; }
x x86 --x86 --lzma2=preset=6
x powerpc --powerpc --lzma2=preset=6
x ia64 --ia64 --lzma2=preset=6
x arm --arm --lzma2=preset=6
x armthumb --armthumb --lzma2=preset=6
x sparc --sparc --lzma2=preset=6
x delta --delta=dist=4 --lzma2=preset=6
x x86-start --x86=start=4096 --lzma2=preset=6
x crc32 --check=crc32
x crc64 --check=crc64
x sha256 --check=sha256
x nocheck --check=none
x multiblock --block-size=4KiB
# two streams with stream padding between them: decodes to input.bin twice
xz --format=xz -c input.bin > a.tmp
xz --format=xz --check=sha256 -c input.bin > b.tmp
{ cat a.tmp; printf '\0\0\0\0\0\0\0\0'; cat b.tmp; } > concat.xz
rm a.tmp b.tmp
xz --format=lzma -c input.bin > input.lzma
