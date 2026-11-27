package contract

import (
	"encoding/json"
	"errors"
	"os"
	"sort"
	"strings"
	"testing"
	"testing/fstest"
)

// The repository root, which holds the data at its treaty paths.
func repo(t *testing.T) *Bundle {
	t.Helper()
	b, err := Load(os.DirFS("../.."))
	if err != nil {
		t.Fatal(err)
	}
	return b
}

// Every reference treaty holds cases for: each schema the registry names cases for, each schema
// with a conventional cases file, and each OpenAPI operation body its cases file covers.
func references(t *testing.T, b *Bundle) []string {
	t.Helper()
	seen := map[string]bool{}
	for _, named := range b.registryCases() {
		for path := range named {
			seen[path] = true
		}
	}
	for _, path := range b.Paths() {
		if !strings.HasPrefix(path, "schemas/") || strings.HasSuffix(path, ".openapi.json") {
			continue
		}
		if node, ok := b.files[conventional(path)]; ok {
			if _, ok := casesIn(node); ok {
				seen[path] = true
			}
		}
	}
	for _, path := range b.Paths() {
		if !strings.HasSuffix(path, ".openapi.json") {
			continue
		}
		var file struct {
			Operations map[string]struct {
				Request   json.RawMessage            `json:"request"`
				Responses map[string]json.RawMessage `json:"responses"`
			} `json:"operations"`
		}
		if err := json.Unmarshal(b.files[conventional(path)], &file); err != nil {
			t.Fatalf("%s: %v", conventional(path), err)
		}
		for key, op := range file.Operations {
			if op.Request != nil {
				seen[path+"#"+key+"/request"] = true
			}
			for status := range op.Responses {
				seen[path+"#"+key+"/"+status] = true
			}
		}
	}
	out := make([]string, 0, len(seen))
	for r := range seen {
		out = append(out, r)
	}
	sort.Strings(out)
	return out
}

// References the registry names cases for whose cases file is not the cases shape. Empty: every
// corpus now reads. An entry here must fail the test once its fixture is fixed.
var knownNoCases = map[string]bool{}

// The Go validator reads every case as the corpus labels it, as the TypeScript validator does in
// `bun run test`: the two languages cannot disagree on what a contract accepts.
func TestEveryCaseValidatesAsLabelled(t *testing.T) {
	b := repo(t)
	refs := references(t, b)
	var schemas, operations, cases int
	for _, ref := range refs {
		if strings.Contains(ref, "#") {
			operations++
		} else {
			schemas++
		}
		all, err := b.Cases(ref)
		if knownNoCases[ref] {
			if err == nil {
				t.Errorf("%s: its cases now read; remove it from knownNoCases", ref)
			}
			continue
		}
		if err != nil {
			t.Errorf("%s: %v", ref, err)
			continue
		}
		cases += len(all)
		if strings.HasPrefix(ref, "schemas/urls/") {
			// A URL shape's cases are URLs, checked by urlShape in the TypeScript package, not by
			// a JSON Schema.
			continue
		}
		for _, c := range all {
			err := b.Validate(ref, c.Body)
			// The schema refuses exactly the invalid cases it is said to refuse; "unique" and
			// "recorded" ones are refused by a reader, never by the schema (as
			// scripts/matrix-schemas.test.ts holds for the TypeScript validator).
			schemaRefuses := !c.Valid && (c.RefusedBy == "" || c.RefusedBy == "schema")
			if (err != nil) != schemaRefuses {
				t.Errorf("%s: case %q (valid %v, refusedBy %q): schema error %v", ref, c.Name, c.Valid, c.RefusedBy, err)
			}
		}
	}
	// A floor, so a reader that silently finds nothing cannot pass.
	if schemas < 50 || operations < 100 || cases < 1000 {
		t.Errorf("found %d schemas, %d operation bodies and %d cases; expected the whole corpus", schemas, operations, cases)
	}
	t.Logf("%d schemas, %d operation bodies, %d cases", schemas, operations, cases)
}

func TestRunCasesReportsBothWays(t *testing.T) {
	b := repo(t)
	const ref = "schemas/common/error.v1.json"
	all, err := b.Cases(ref)
	if err != nil {
		t.Fatal(err)
	}
	var valid, invalid int
	for _, c := range all {
		if c.Valid {
			valid++
		} else {
			invalid++
		}
	}
	if valid == 0 || invalid == 0 {
		t.Fatalf("%s: %d valid, %d invalid cases", ref, valid, invalid)
	}
	accepts := b.RunCases(ref, func([]byte) error { return nil })
	if len(accepts) != invalid {
		t.Errorf("accepting everything: %d mismatches, want %d", len(accepts), invalid)
	}
	for _, m := range accepts {
		if m.Valid || m.Err != nil || !strings.HasPrefix(m.String(), "invalid case") {
			t.Errorf("unexpected %#v", m)
		}
	}
	refuses := b.RunCases(ref, func([]byte) error { return errors.New("no") })
	if len(refuses) != valid {
		t.Errorf("refusing everything: %d mismatches, want %d", len(refuses), valid)
	}
	for _, ref := range []string{"schemas/nope.v1.json", "schemas/http/agentpod/fleet.v1.openapi.json#nope/request", "schemas/http/agentpod/fleet.v1.openapi.json#request"} {
		got := b.RunCases(ref, func([]byte) error { return nil })
		if len(got) != 1 || got[0].Err == nil || got[0].Case != "" {
			t.Errorf("%s: want one mismatch saying there are no cases, got %v", ref, got)
		}
	}
}

func TestCasesKeepTheReleaseBytes(t *testing.T) {
	b := repo(t)
	all, err := b.Cases("schemas/common/error.v1.json")
	if err != nil {
		t.Fatal(err)
	}
	file := string(b.files["fixtures/common/error.v1.cases.json"])
	for _, c := range all {
		if !strings.Contains(file, string(c.Body)) {
			t.Errorf("%s: the body is not the release's bytes: %s", c.Name, c.Body)
		}
	}
}

func TestValidateRefusesWhatItCannotRead(t *testing.T) {
	fsys := fstest.MapFS{
		"schemas/a.v1.json": {Data: []byte(`{"$schema":"https://json-schema.org/draft/2020-12/schema","$ref":"https://example.com/elsewhere.json"}`)},
		"schemas/b.v1.json": {Data: []byte(`{"type":"string","pattern":"^[a-f0-9]{4}(?![\\s\\S])"}`)},
		"schemas/c.v1.json": {Data: []byte(`{"type":"string","format":"uuid"}`)},
		"fixtures/x.json":   {Data: []byte(`{}`)},
		"contracts/y.json":  {Data: []byte(`{}`)},
	}
	b, err := Load(fsys)
	if err != nil {
		t.Fatal(err)
	}
	// Never the network: a $ref outside the release is an error, not a fetch.
	if err := b.Validate("schemas/a.v1.json", "x"); err == nil || !strings.Contains(err.Error(), "offline") {
		t.Errorf("an outside $ref: %v", err)
	}
	if err := b.Validate("schemas/missing.v1.json", "x"); err == nil || errors.Is(err, ErrInvalid) {
		t.Errorf("a missing schema: %v", err)
	}
	// Patterns are ECMA-262: lookahead compiles and anchors the end.
	if err := b.Validate("schemas/b.v1.json", "abcd"); err != nil {
		t.Errorf("pattern accepts: %v", err)
	}
	if err := b.Validate("schemas/b.v1.json", "abcd\n"); !errors.Is(err, ErrInvalid) {
		t.Errorf("pattern refuses a trailing newline: %v", err)
	}
	// Formats are asserted, as the TypeScript validator asserts them.
	if err := b.Validate("schemas/c.v1.json", "not-a-uuid"); !errors.Is(err, ErrInvalid) {
		t.Errorf("format: %v", err)
	}
	// A struct is checked as it travels.
	type body struct {
		Code string `json:"code"`
	}
	if err := b.Validate("schemas/c.v1.json", body{Code: "x"}); !errors.Is(err, ErrInvalid) {
		t.Errorf("a struct is an object, not a string: %v", err)
	}
}

func TestOperationAddresses(t *testing.T) {
	doc := `{"openapi":"3.1.0","paths":{
	  "/v1/runs/{id}":{"get":{"responses":{"200":{"$ref":"#/components/responses/Run"},"204":{"description":"none"}}}},
	  "/v1/runs":{"post":{"operationId":"createRun","requestBody":{"content":{"application/json":{"schema":{"type":"object","required":["name"]}}}},"responses":{}}}},
	  "components":{"responses":{"Run":{"content":{"application/json":{"schema":{"type":"object","required":["id"]}}}}}}}`
	b, err := Load(fstest.MapFS{
		"schemas/http/x.v1.openapi.json": {Data: []byte(doc)},
		"fixtures/x.json":                {Data: []byte(`{}`)},
		"contracts/y.json":               {Data: []byte(`{}`)},
	})
	if err != nil {
		t.Fatal(err)
	}
	const d = "schemas/http/x.v1.openapi.json"
	for ref, want := range map[string]bool{
		d + "#createRun/request":     true,
		d + "#GET /v1/runs/{id}/200": false,
		d + "#/components/responses/Run/content/application~1json/schema": false,
	} {
		err := b.Validate(ref, map[string]any{"name": "n"})
		if (err == nil) != want {
			t.Errorf("%s: %v", ref, err)
		}
	}
	for _, ref := range []string{d + "#createRun/200", d + "#GET /v1/runs/{id}/204", d + "#nope/request", d + "#request"} {
		if err := b.Validate(ref, map[string]any{}); err == nil || errors.Is(err, ErrInvalid) {
			t.Errorf("%s: want an error naming the address, got %v", ref, err)
		}
	}
}

// A "recorded" case is valid on its own: parse never sees it. A "unique" one is fed, and a parse
// that checks only the schema accepts it.
func TestRunCasesSkipsRecordedCases(t *testing.T) {
	b := repo(t)
	const ref = "schemas/matrix/dev.superpipeline.gate.decision.v2.json"
	all, err := b.Cases(ref)
	if err != nil {
		t.Fatal(err)
	}
	var recorded int
	for _, c := range all {
		if c.RefusedBy == "recorded" {
			recorded++
		}
	}
	if recorded == 0 {
		t.Fatalf("%s has no recorded cases to skip", ref)
	}
	for _, m := range b.RunCases(ref, func(body []byte) error { return b.Validate(ref, body) }) {
		for _, c := range all {
			if c.Name == m.Case && c.RefusedBy == "recorded" {
				t.Errorf("a recorded case was fed: %s", m)
			}
		}
	}
}
