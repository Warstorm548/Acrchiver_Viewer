# XZ and LZMA Decoder — `src/engine/xz.ts`, `lzmaAlone.ts`, `lzma/`

Pure-JavaScript decoder for `.xz` / `.tar.xz` / `.txz` and the legacy `.lzma` / `.tar.lzma` /
`.tlz` format, added in rework step 4b. Runs in the decompression worker (see
[archive-engine](archive-engine.md)). No npm package fit: `xz-decompress` uses WebAssembly and
`xz-compat` is Node-only.

## Files

| File                   | Role                                                                                                                   | Origin                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `xz.ts`                | XZ container: stream header/footer, blocks, filter chains, checks, index, padding, concatenated streams                | Written from "The .xz File Format" spec                                             |
| `lzmaAlone.ts`         | Legacy `.lzma`: 13-byte header (props, dictionary size, 64-bit size or unknown) + LZMA stream with optional end marker | Written from the LZMA SDK format description                                        |
| `lzma/lzmaDecoder.ts`  | LZMA decoder: literal/match/rep states, length and distance decoding                                                   | Adapted from xz-compat (MIT), itself a port of Igor Pavlov's public-domain LZMA SDK |
| `lzma/lzma2.ts`        | LZMA2 chunks: control byte, uncompressed chunks, state/property/dictionary resets                                      | Written from the LZMA2 format                                                       |
| `lzma/rangeDecoder.ts` | Range decoder + bit-tree helpers                                                                                       | Adapted from xz-compat; unsigned arithmetic                                         |
| `lzma/filters.ts`      | Delta and BCJ x86, ARM, ARM-Thumb, PowerPC, IA-64, SPARC (decode)                                                      | Follows liblzma's simple filters (public domain / 0BSD)                             |
| `lzma/checks.ts`       | CRC32, CRC64 (ECMA-182 on two 32-bit halves), SHA-256 (`crypto.subtle`)                                                | Standard algorithms                                                                 |
| `lzma/output.ts`       | `Output extends GrowableBuffer` (`../buffer.ts`): byte/match writes; the output doubles as the LZMA dictionary         | New                                                                                 |

## Design notes

- **Output = dictionary.** The whole result is kept in memory anyway, so matches copy straight
  from earlier output; a dictionary reset (each XZ block, LZMA2 control `0x01`/`0xE0+`) just moves
  `dictStart`, and distances reaching before it → `corrupt`.
- **Sized up front.** `unxz` sizes the output from the totals in the stream indexes, read
  backwards from the end (`recordedSize`); `unlzma` from the header when it records a size. The
  indexes are still verified while decoding. See [archive-engine](archive-engine.md#memory).
- **Unsigned range coder.** `range`/`code` are kept as unsigned 32-bit values in plain numbers
  (`>>> 0`), and long distances are computed with multiplication — no reliance on signed-int
  overflow like the original Java/JS ports.
- **Matches across LZMA2 chunks** are carried over (`pendingLen`) instead of overshooting the
  chunk's uncompressed size.
- **Strictness:** block header/index/footer CRC32s, backward size, stream flags, padding bytes,
  declared compressed/uncompressed sizes and the index records are all verified. Integers are read
  up to 2^53 (xz-compat stops at 28 bits).
- **Checks:** CRC32, CRC64 and SHA-256 are verified per block; other (reserved) check types are
  skipped, as xz does.
- **Filters** run after LZMA2 in reverse chain order, per block, with fresh state; the BCJ start
  offset property is honoured. Unknown filters are named in the error: ARM64 (`0x0a`) and RISC-V
  (`0x0b`) → "Unsupported xz filter: ARM64" (`unsupported-format`). ARM64 is not implemented
  because Python's `lzma` here can't produce it to test against.
- **Legacy `.lzma`:** with a declared size, output must match it exactly; with an unknown size,
  decoding stops at the end marker (`maxSize` still caps memory). `looksLikeLzmaAlone` (first byte
  < 225, 13-byte header) is the only "signature" since the format has no magic.

## Verification (step 4b)

- `tests/unit/engine/xzSamples.ts`: 27 samples made with Python 3.12 `lzma` (reference liblzma),
  each also decoded with the `xz` command-line tool — presets 0/6/9e, every check type, every
  supported filter (each verified to really rewrite the data: 380–1,955 bytes changed), BCJ start
  offset, delta 1/4 and delta+x86 chains, lc0/lp2/pb0, concatenated streams with padding,
  multi-chunk data, empty input, a tar, 1 MB of zeros, and three legacy `.lzma` variants.
- `xz.spec.ts`: all byte-identical, plus damaged CRC64/SHA-256 data, damaged stream header,
  truncation, size limit, and a crafted ARM64 filter id.
- One-off stress run (not kept): a 9.4 MB tar of real source code compressed by the `xz` tool as
  `-9e`, `-0`, `--x86` and `--format=lzma` decoded byte-identical at 72, 27, 64 and 105 MB/s.

## Performance

Roughly 25–100 MB/s in Node on this machine depending on settings, in a worker in the browser.
A 128 MiB archive (the mobile limit) decodes in a few seconds; the page stays responsive. If the
CSP blocks the worker, decoding runs on the main thread and the page freezes meanwhile.

## When changing

Re-run `pnpm test:unit --run`; regenerate `xzSamples.ts` with Python `lzma` if formats change;
update this doc, [archive-engine](archive-engine.md) and `THIRD-PARTY-NOTICES.md`.
