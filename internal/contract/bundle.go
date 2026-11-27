// Package contract reads treaty's data from a file system laid out like the repository:
// schemas/, fixtures/ and contracts/ at their treaty paths. The root package embeds that data and
// re-exports what consumers use; this package holds the logic so it can be tested against any
// file system.
package contract

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io/fs"
	"sort"
	"strings"
	"sync"

	"github.com/santhosh-tekuri/jsonschema/v6"
)

// Roots are the directories a release carries, as packages/contracts/scripts/bundle.ts copies
// them into the npm package.
var Roots = []string{"schemas", "fixtures", "contracts"}

// SchemaBase is where treaty's files are published. Every schema's $id starts here.
const SchemaBase = "https://raw.githubusercontent.com/SuperJackfruitLabs/treaty/main/"

// IDOf is the address a file is published at, which is also its $id when it is a schema.
func IDOf(path string) string { return SchemaBase + path }

// Manifest is the shape of the npm package's data/manifest.json: the release version and the
// sha256 of every JSON file, by treaty path.
type Manifest struct {
	Treaty string            `json:"treaty"`
	Files  map[string]string `json:"files"`
}

// Bundle is treaty's JSON files, read once, with validators built on first use.
type Bundle struct {
	files map[string][]byte

	mu       sync.Mutex
	compiler *jsonschema.Compiler
	compiled map[string]*jsonschema.Schema
	ops      map[string][]operation
	compErr  error
}

// Load reads every .json file under the roots of fsys, as bundle.ts does.
func Load(fsys fs.FS) (*Bundle, error) {
	files := map[string][]byte{}
	for _, root := range Roots {
		err := fs.WalkDir(fsys, root, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if d.IsDir() || !strings.HasSuffix(path, ".json") {
				return nil
			}
			b, err := fs.ReadFile(fsys, path)
			if err != nil {
				return err
			}
			files[path] = b
			return nil
		})
		if err != nil {
			return nil, fmt.Errorf("treaty: reading %s: %w", root, err)
		}
	}
	return &Bundle{files: files, compiled: map[string]*jsonschema.Schema{}, ops: map[string][]operation{}}, nil
}

// Paths lists every file in the bundle, sorted.
func (b *Bundle) Paths() []string {
	out := make([]string, 0, len(b.files))
	for p := range b.files {
		out = append(out, p)
	}
	sort.Strings(out)
	return out
}

// File is one file's bytes, as the release holds them.
func (b *Bundle) File(path string) ([]byte, bool) {
	f, ok := b.files[path]
	return f, ok
}

// Manifest is every file's sha256, with the given version.
func (b *Bundle) Manifest(version string) Manifest {
	m := Manifest{Treaty: version, Files: make(map[string]string, len(b.files))}
	for p, f := range b.files {
		sum := sha256.Sum256(f)
		m.Files[p] = hex.EncodeToString(sum[:])
	}
	return m
}
