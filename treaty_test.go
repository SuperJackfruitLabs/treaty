package treaty

import (
	"encoding/json"
	"errors"
	"os"
	"reflect"
	"testing"

	"github.com/SuperJackfruitLabs/treaty/internal/contract"
)

// The module embeds every JSON file the repository holds under the roots. go:embed leaves out
// names starting with "." or "_", so a file named that way would be in the npm package and
// missing here; this test says so.
func TestEmbedHoldsEveryJSONFile(t *testing.T) {
	disk, err := contract.Load(os.DirFS("."))
	if err != nil {
		t.Fatal(err)
	}
	want := disk.Manifest("").Files
	got := Manifest().Files
	if len(got) == 0 {
		t.Fatal("the module embeds no files")
	}
	for path, sum := range want {
		if got[path] != sum {
			t.Errorf("%s: embedded %q, on disk %q", path, got[path], sum)
		}
	}
	for path := range got {
		if _, ok := want[path]; !ok {
			t.Errorf("%s is embedded but not on disk", path)
		}
	}
}

// The module and the npm package carry the same files at the same tag. The package's manifest
// exists after `bun run build`; CI and the release build it first and set
// TREATY_REQUIRE_PACKAGE_DATA=1, so the comparison cannot be skipped there.
func TestManifestEqualsThePackageManifest(t *testing.T) {
	const path = "packages/contracts/data/manifest.json"
	text, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) && os.Getenv("TREATY_REQUIRE_PACKAGE_DATA") != "1" {
		t.Skipf("%s is not built; run bun run build", path)
	}
	if err != nil {
		t.Fatal(err)
	}
	var pkg ManifestFile
	if err := json.Unmarshal(text, &pkg); err != nil {
		t.Fatal(err)
	}
	if got := Manifest().Files; !reflect.DeepEqual(got, pkg.Files) {
		for p, sum := range pkg.Files {
			if got[p] != sum {
				t.Errorf("%s: the module has %q, the npm package %q", p, got[p], sum)
			}
		}
		for p := range got {
			if _, ok := pkg.Files[p]; !ok {
				t.Errorf("%s is in the module, not in the npm package", p)
			}
		}
	}
}

func TestVersionIsEmptyOutsideARelease(t *testing.T) {
	if v := Manifest().Treaty; v != "" {
		t.Errorf("a test of the module itself knows no release, got %q", v)
	}
}

func TestPublicAPI(t *testing.T) {
	const ref = "schemas/common/error.v1.json"
	if mismatches := RunCases(ref, func(body []byte) error { return Validate(ref, body) }); len(mismatches) != 0 {
		t.Errorf("%v", mismatches)
	}
	if err := Validate(ref, map[string]any{}); !errors.Is(err, ErrInvalid) {
		t.Errorf("an empty object is not an error envelope: %v", err)
	}
	if _, err := ReadFile("contracts/registry.json"); err != nil {
		t.Error(err)
	}
	if got := RunCases("schemas/nope.v1.json", func([]byte) error { return nil }); len(got) != 1 {
		t.Errorf("no cases is one mismatch, got %v", got)
	}
}
