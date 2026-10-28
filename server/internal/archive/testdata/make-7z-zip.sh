#!/bin/sh
# Regenerates the 7z and ZIP test files with the reference 7-Zip (Ubuntu package "7zip", command
# 7z) and Python's zipfile. Run from this folder. Every archive holds the same small tree
# (sevenZipTree in sevenzip_test.go): files, an empty file, an empty folder, a symlink and a
# Unicode name, dated 2023-11-14 22:13:20 UTC.
set -e
command -v 7z >/dev/null || { echo "7z not found (sudo apt install 7zip)" >&2; exit 1; }
here=$(pwd)
tree=$(mktemp -d)
trap 'rm -rf "$tree"' EXIT
cd "$tree"
mkdir -p docs deep/er/still emptydir "ünïcødé"
printf 'read me\n' > docs/readme.txt
printf 'ten' > docs/file10.txt
printf 'two' > docs/file2.txt
python3 -I -c "open('deep/er/still/data.bin', 'wb').write(b'\x00\x01\x02' * 5000)"
: > empty.txt
printf 'unicode' > "ünïcødé/文件.txt"
ln -s docs/readme.txt link
find . -exec touch -h -d @1700000000 {} +

seven() { name=$1; shift; rm -f "$here/$name"; 7z a -bso0 -bsp0 -snl "$@" "$here/$name" . ; }

# 7z: one per codec or filter
seven sample-lzma2.7z -t7z
seven sample-lzma.7z -t7z -m0=LZMA -ms=off
seven sample-ppmd.7z -t7z -m0=PPMd
seven sample-bzip2.7z -t7z -m0=BZip2
seven sample-deflate.7z -t7z -m0=Deflate
seven sample-deflate64.7z -t7z -m0=Deflate64
seven sample-arm64.7z -t7z -mf=ARM64
# IA-64 is a filter the Go library doesn't implement: the files are listed as unreadable
seven sample-ia64.7z -t7z -mf=IA64
seven sample-aes.7z -t7z -pSecret
seven sample-aes-header.7z -t7z -pSecret -mhe=on
# stored (uncompressed) headers, so tests can patch coder properties in place
seven raw-header-lzma2.7z -t7z -m0=LZMA2 -mhc=off
seven raw-header-ppmd.7z -t7z -m0=PPMd -mhc=off

# ZIP: one per method
seven sample-store.zip -tzip -mm=Copy
seven sample-deflate.zip -tzip -mm=Deflate
seven sample-deflate64.zip -tzip -mm=Deflate64
seven sample-bzip2.zip -tzip -mm=BZip2
seven sample-lzma.zip -tzip -mm=LZMA
seven sample-ppmd.zip -tzip -mm=PPMd
seven sample-zipcrypto.zip -tzip -pSecret -mem=ZipCrypto
seven sample-aes.zip -tzip -pSecret -mem=AES256

# Deflate64's 64 KiB window: 40,000 random bytes twice, so matches reach back over 32 KiB
window=$(mktemp -d)
python3 -I -c "
import random
r = random.Random(7)
block = bytes(r.getrandbits(8) for _ in range(40000))
open('$window/window.bin', 'wb').write(block + block)"
touch -d @1700000000 "$window/window.bin"
rm -f "$here/deflate64-window.zip"
(cd "$window" && 7z a -bso0 -bsp0 -tzip -mm=Deflate64 -mx=9 "$here/deflate64-window.zip" window.bin)
rm -rf "$window"

# Python: LZMA with the end-marker flag, and names in CP437 without the UTF-8 flag
python3 -I - "$here" <<'EOF'
import sys, zipfile
out = sys.argv[1]
with zipfile.ZipFile(out + '/python-lzma.zip', 'w', zipfile.ZIP_LZMA) as z:
    z.writestr(zipfile.ZipInfo('docs/readme.txt', (2023, 11, 14, 22, 13, 20)), b'read me\n', zipfile.ZIP_LZMA)
    z.writestr(zipfile.ZipInfo('deep/data.bin', (2023, 11, 14, 22, 13, 20)), b'\x00\x01\x02' * 5000, zipfile.ZIP_LZMA)
with zipfile.ZipFile(out + '/cp437-names.zip', 'w', zipfile.ZIP_STORED) as z:
    z.writestr(zipfile.ZipInfo('café/naïve ½.txt', (2023, 11, 14, 22, 13, 20)), b'cp437')
EOF
