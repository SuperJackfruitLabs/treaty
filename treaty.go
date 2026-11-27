// Package treaty holds the contracts between the suite's products as data: every JSON Schema,
// OpenAPI document, fixture corpus and registry file treaty releases, at its treaty path
// (schemas/…, fixtures/…, contracts/…), embedded in the module.
//
// The module is versioned by treaty's own release tags (vX.Y.Z), so `go get
// github.com/SuperJackfruitLabs/treaty@vX.Y.Z` pins the same release as
// `@superjackfruitlabs/treaty-contracts@X.Y.Z` on npm, with the same files and the same sha256s.
//
//   - Manifest: the release's files with their sha256, as the npm package's data/manifest.json.
//   - Validate: checks a value against a schema, offline (every $ref resolves from the release).
//   - RunCases: feeds every valid and invalid case of a contract to your parse function and
//     reports where it disagrees with the corpus.
//
// There are no generated types: a consumer keeps its own and proves them with RunCases.
package treaty

import (
	"embed"
	"io/fs"
	"runtime/debug"
	"strings"
	"sync"

	"github.com/SuperJackfruitLabs/treaty/internal/contract"
)

// ModulePath is this module's path, which a consumer's go.mod requires.
const ModulePath = "github.com/SuperJackfruitLabs/treaty"

//go:embed schemas fixtures contracts
var data embed.FS

var load = sync.OnceValues(func() (*contract.Bundle, error) { return contract.Load(data) })

func bundle() *contract.Bundle {
	b, err := load()
	if err != nil {
		// The embedded files are checked by this module's own tests; a release that cannot read
		// them is broken, not a consumer's input.
		panic(err)
	}
	return b
}

// FS is the release's files at their treaty paths: schemas/, fixtures/ and contracts/.
func FS() fs.FS { return data }

// ReadFile is one file of the release, by treaty path (schemas/common/error.v1.json).
func ReadFile(path string) ([]byte, error) { return data.ReadFile(path) }

// ManifestFile is the release's manifest: its version and every JSON file's sha256 by treaty
// path. It has the shape of the npm package's data/manifest.json.
type ManifestFile = contract.Manifest

// Manifest is the release's version and the sha256 of every JSON file under schemas/, fixtures/
// and contracts/, the same set and the same sums as the npm package's data/manifest.json for the
// same tag. Treaty is the module's version without its "v" as the build records it, or empty
// when the build does not know it (a test of this module itself, or a replace directive).
func Manifest() ManifestFile { return bundle().Manifest(version()) }

func version() string {
	info, ok := debug.ReadBuildInfo()
	if !ok {
		return ""
	}
	mods := append([]*debug.Module{&info.Main}, info.Deps...)
	for _, m := range mods {
		if m == nil || m.Path != ModulePath {
			continue
		}
		if m.Replace != nil || !strings.HasPrefix(m.Version, "v") {
			return ""
		}
		return strings.TrimPrefix(m.Version, "v")
	}
	return ""
}

// ErrInvalid is wrapped by the error Validate returns when the schema refuses the value
// (errors.Is(err, treaty.ErrInvalid)); any other error means the reference could not be read.
var ErrInvalid = contract.ErrInvalid

// Validate checks a value against a schema treaty holds, under JSON Schema 2020-12 with formats
// asserted and patterns read as ECMA-262, as the TypeScript package checks them. Nil means it
// holds. The reference is
//
//   - a schema's treaty path: schemas/common/error.v1.json
//   - a path and a JSON pointer: schemas/http/agentpod/fleet.v1.openapi.json#/components/schemas/X
//   - an OpenAPI operation's body: <document>#<operationId>/request or #<operationId>/<status>
//     (an operation with no operationId is keyed "METHOD /path")
//   - a schema's full $id.
//
// A []byte or json.RawMessage value is JSON text; any other value is encoded with
// encoding/json first, so a struct is checked as it would travel.
func Validate(path string, value any) error { return bundle().Validate(path, value) }

// Mismatch is one case your parse function read the other way from the corpus.
type Mismatch = contract.Mismatch

// RunCases feeds every valid and invalid case treaty holds for a contract to parse, as the
// release's bytes, and returns each case parse read the other way: a valid case it refused or an
// invalid case it accepted. A reference with no cases returns one Mismatch, so a typo never
// passes. The reference is a schema's treaty path (its cases where the registry names them, else
// fixtures/<path>.cases.json), or <document>#<operationId>/request or #<operationId>/<status> for
// an OpenAPI operation, the same cases `treaty cases` prints.
func RunCases(path string, parse func([]byte) error) []Mismatch {
	return bundle().RunCases(path, parse)
}
