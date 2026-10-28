# Third-Party Notices

This project (AGPL-3.0, see `LICENSE`) includes or bundles the following third-party code.

## seek-bzip 2.0.0 — MIT License (ported)

`src/engine/bzip2.ts` is a TypeScript port of the bzip2 decoder from
[seek-bzip](https://github.com/cscott/seek-bzip) (`lib/index.js`, `lib/bitreader.js`,
`lib/crc32.js`). Changes: Node `Buffer` replaced by `Uint8Array`, reading past the end of input
is an error, output size is capped, errors use `ArchiveError`, the CRC table is generated instead
of embedded, and the random-access/seek and streaming APIs were dropped. seek-bzip itself was
adapted from bzip2.js (antimatter15), based on micro-bunzip by Rob Landley, based on bzip2 by
Julian R Seward.

```
The MIT License (MIT)

Copyright (c) 2013-2015 C. Scott Ananian

Copyright (c) 2012-2015 Eli Skeggs

Copyright (c) 2011 Kevin Kwok

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## xz-compat 1.2.11 — MIT License (adapted)

`src/engine/lzma/lzmaDecoder.ts` and `src/engine/lzma/rangeDecoder.ts` adapt the LZMA decoder
structure from [xz-compat](https://github.com/kmalakoff/xz-compat) (`src/lzma/sync/*`), which ports
Igor Pavlov's LZMA SDK (public domain). Changes: Uint8Array instead of Node `Buffer`, unsigned
range-coder arithmetic, the output buffer used as the dictionary, matches carried across LZMA2
chunks, strict end-of-input handling. The XZ container (`src/engine/xz.ts`), LZMA2 chunk parser
and legacy `.lzma` reader were written from the format specifications; the BCJ/Delta filters
(`src/engine/lzma/filters.ts`) follow liblzma's simple filters (public domain / 0BSD).

License text copied verbatim from upstream, including its typo "wof this software" (sic).

```
The MIT License (MIT)

Copyright (c) 2020 Kevin Malakoff

Permission is hereby granted, free of charge, to any person obtaining a copy
wof this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

--------------------zip: https://github.com/kriskowal/zip/blob/master/LICENSE

Copyright 2009, 2010 Kristopher Michael Kowal. All rights reserved.
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to
deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
IN THE SOFTWARE.
```

## @zip.js/zip.js 2.24.0 — BSD 3-Clause License (bundled)

Bundled into the build output as a dependency (native build only, `lib/zip-native.js`).

```
BSD 3-Clause License

Copyright (c) 2023, Gildas Lormeau

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## github.com/ulikunitz/xz v0.5.17 — BSD 3-Clause-style License (server helper)

Compiled into the archive helper binary (`server/`), used for raw LZMA2 and legacy `.lzma`
decoding. Not part of the web app's release zip.

```
Copyright (c) 2014-2022  Ulrich Kunitz
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* My name, Ulrich Kunitz, may not be used to endorse or promote products
  derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## github.com/bodgit/sevenzip v1.6.5 — BSD 3-Clause License (server helper, patched copy)

Copied into `server/third_party/sevenzip` and compiled into the archive helper to read 7z.
Patched to cap header counts and header size (`server/third_party/sevenzip/PATCHES.md`). Its
license text, Copyright (c) 2020 Matt Dainty, is in `server/third_party/sevenzip/LICENSE`.

## Go `compress/flate` (go1.27.3) — BSD 3-Clause License (server helper, ported)

`server/internal/deflate64/` is Go's deflate decoder (`inflate.go`, `dict_decoder.go`) changed to
decode Deflate64. Its license text, Copyright 2009 The Go Authors, is in
`server/internal/deflate64/LICENSE`.

## Other Go modules in the server helper (0.4.0)

Compiled into the archive helper binary, unmodified; the image build downloads them from their
module paths, each with its full license text. None is part of the web app's release zip.

| Module                               | Version            | License      | Used for                             |
| ------------------------------------ | ------------------ | ------------ | ------------------------------------ |
| `github.com/klauspost/compress`      | v1.19.0            | BSD-3-Clause | zstd (ZIP method 93, 7z)             |
| `github.com/stangelandcl/ppmd`       | v0.1.1             | MIT          | PPMd (7z)                            |
| `github.com/andybalholm/brotli`      | v1.2.2             | MIT          | Brotli (7z, via sevenzip)            |
| `github.com/pierrec/lz4/v4`          | v4.1.27            | BSD-3-Clause | LZ4 (7z, via sevenzip)               |
| `github.com/bodgit/plumbing`         | v1.3.0             | BSD-3-Clause | Reader helpers (via sevenzip)        |
| `github.com/bodgit/windows`          | v1.0.1             | BSD-3-Clause | Windows file times (via sevenzip)    |
| `github.com/hashicorp/golang-lru/v2` | v2.0.7             | MPL-2.0      | Stream reader cache (via sevenzip)   |
| `github.com/spf13/afero`             | v1.15.0            | Apache-2.0   | File system interface (via sevenzip) |
| `go4.org`                            | v0.0.0-20260112195 | Apache-2.0   | Reader-at helpers (via sevenzip)     |
| `golang.org/x/text`                  | v0.40.0            | BSD-3-Clause | UTF-16 names (via sevenzip)          |

MPL-2.0 applies per file: golang-lru is used as published, and its source is available at its
module path.
