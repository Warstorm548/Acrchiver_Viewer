package archive

import (
	"bytes"
	"encoding/binary"
	"errors"
	"hash/crc32"
	"io"
	"os"
	"path/filepath"
	"testing"
)

func readTestdata(t *testing.T, name string) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func decodeXz(data []byte) ([]byte, error) {
	reader, err := newXzReader(bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	// small reads exercise the filters' carry-over of partial instructions
	var out bytes.Buffer
	buf := make([]byte, 7)
	for {
		n, err := reader.Read(buf)
		out.Write(buf[:n])
		if err == io.EOF {
			return out.Bytes(), nil
		}
		if err != nil {
			return out.Bytes(), err
		}
	}
}

func TestXzMatchesReferenceEncoder(t *testing.T) {
	input := readTestdata(t, "input.bin")
	for _, name := range []string{
		"x86", "x86-start", "powerpc", "ia64", "arm", "armthumb", "sparc", "delta",
		"crc32", "crc64", "sha256", "nocheck", "multiblock",
	} {
		t.Run(name, func(t *testing.T) {
			out, err := decodeXz(readTestdata(t, name+".xz"))
			if err != nil {
				t.Fatal(err)
			}
			if !bytes.Equal(out, input) {
				t.Fatalf("decoded %d bytes, differ from input.bin", len(out))
			}
		})
	}
}

func TestXzConcatenatedStreamsWithPadding(t *testing.T) {
	input := readTestdata(t, "input.bin")
	out, err := decodeXz(readTestdata(t, "concat.xz"))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(out, append(append([]byte{}, input...), input...)) {
		t.Fatal("concatenated streams decoded wrongly")
	}
}

func TestXzDetectsDamage(t *testing.T) {
	data := readTestdata(t, "crc64.xz")
	for _, offset := range []int{3, 13, 200, len(data) - 30, len(data) - 6} {
		damaged := append([]byte{}, data...)
		damaged[offset] ^= 0x55
		if _, err := decodeXz(damaged); !errors.Is(err, ErrCorrupt) {
			t.Errorf("flipped byte %d: want ErrCorrupt, got %v", offset, err)
		}
	}
	if _, err := decodeXz(data[:len(data)-20]); !errors.Is(err, ErrCorrupt) {
		t.Errorf("truncated: want ErrCorrupt, got %v", err)
	}
}

// withDictionary rewrites the first block header's LZMA2 dictionary byte (and its CRC).
func withDictionary(t *testing.T, data []byte, properties byte) []byte {
	t.Helper()
	out := append([]byte{}, data...)
	header := out[12:]
	size := (int(header[0]) + 1) * 4
	flags := header[1]
	if flags&0xc3 != 0 {
		t.Fatal("test expects a block header with one filter and no sizes")
	}
	// id 0x21, properties size 1, properties
	if header[2] != 0x21 || header[3] != 1 {
		t.Fatalf("unexpected filter bytes % x", header[2:4])
	}
	header[4] = properties
	binary.LittleEndian.PutUint32(header[size-4:], crc32.ChecksumIEEE(header[:size-4]))
	return out
}

func TestXzRefusesHugeDictionaryBeforeAllocating(t *testing.T) {
	data := readTestdata(t, "crc64.xz")
	// 40 = 4 GiB - 1, 36 = 1 GiB, 33 = 384 MiB, 32 = 256 MiB (the largest allowed)
	for properties, wantErr := range map[byte]error{40: ErrTooComplex, 36: ErrTooComplex, 33: ErrTooComplex, 41: ErrCorrupt} {
		_, err := newXzReaderAndFirstRead(withDictionary(t, data, properties))
		if !errors.Is(err, wantErr) {
			t.Errorf("properties %d: want %v, got %v", properties, wantErr, err)
		}
	}
	if lzma2DictionarySize(32) != MaxDictionarySize || lzma2DictionarySize(33) != 384<<20 {
		t.Fatalf("properties 32 = %d, 33 = %d", lzma2DictionarySize(32), lzma2DictionarySize(33))
	}
	// at the limit the header is accepted (the data then fails its check, since the stream was
	// encoded with a smaller dictionary, but nothing is refused for size)
	if _, err := newXzReaderAndFirstRead(withDictionary(t, data, 32)); errors.Is(err, ErrTooComplex) {
		t.Errorf("256 MiB dictionary refused: %v", err)
	}
}

func newXzReaderAndFirstRead(data []byte) (int, error) {
	reader, err := newXzReader(bytes.NewReader(data))
	if err != nil {
		return 0, err
	}
	return reader.Read(make([]byte, 1))
}

func TestXzUnsupportedFilter(t *testing.T) {
	data := readTestdata(t, "crc64.xz")
	out := append([]byte{}, data...)
	header := out[12:]
	size := (int(header[0]) + 1) * 4
	header[2] = 0x0a // ARM64 instead of LZMA2 as the last filter
	binary.LittleEndian.PutUint32(header[size-4:], crc32.ChecksumIEEE(header[:size-4]))
	if _, err := newXzReaderAndFirstRead(out); !errors.Is(err, ErrUnsupported) {
		t.Errorf("want ErrUnsupported, got %v", err)
	}
}
