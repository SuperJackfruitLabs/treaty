package contract

import (
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
)

// Case is one body of the corpus, byte for byte as the release holds it.
type Case struct {
	// Name is a valid case's label, or why an invalid case is invalid.
	Name  string
	Valid bool
	// RefusedBy is what refuses an invalid case, when the corpus says (the Matrix corpus does):
	// "schema", "unique" (two entries share an id the schema cannot compare) or "recorded" (it
	// contradicts an earlier event the reader recorded, so no parse of the body alone can refuse
	// it). Empty means the schema refuses it.
	RefusedBy string
	Body      json.RawMessage
}

// rawAt walks a JSON pointer through raw JSON, keeping the bytes of the node it reaches.
func rawAt(doc json.RawMessage, pointer string) (json.RawMessage, bool) {
	if pointer == "" || pointer == "/" {
		return doc, true
	}
	node := doc
	for _, raw := range strings.Split(pointer[1:], "/") {
		t := strings.ReplaceAll(strings.ReplaceAll(raw, "~1", "/"), "~0", "~")
		var obj map[string]json.RawMessage
		if json.Unmarshal(node, &obj) == nil {
			next, ok := obj[t]
			if !ok {
				return nil, false
			}
			node = next
			continue
		}
		var arr []json.RawMessage
		if json.Unmarshal(node, &arr) != nil {
			return nil, false
		}
		i, err := strconv.Atoi(t)
		if err != nil || i < 0 || i >= len(arr) {
			return nil, false
		}
		node = arr[i]
	}
	return node, true
}

// casesIn reads `{ "valid": {label: body}, "invalid": [{why, body}] }`, or false when the node is
// not that shape (as isCases in packages/contracts/src/cases.ts).
func casesIn(node json.RawMessage) ([]Case, bool) {
	var shape struct {
		Valid   map[string]json.RawMessage `json:"valid"`
		Invalid []json.RawMessage          `json:"invalid"`
	}
	if json.Unmarshal(node, &shape) != nil || shape.Valid == nil || shape.Invalid == nil {
		return nil, false
	}
	labels := make([]string, 0, len(shape.Valid))
	for l := range shape.Valid {
		labels = append(labels, l)
	}
	sort.Strings(labels)
	out := make([]Case, 0, len(labels)+len(shape.Invalid))
	for _, l := range labels {
		out = append(out, Case{Name: l, Valid: true, Body: shape.Valid[l]})
	}
	for _, raw := range shape.Invalid {
		var c struct {
			Why       *string         `json:"why"`
			RefusedBy string          `json:"refusedBy"`
			Body      json.RawMessage `json:"body"`
		}
		if json.Unmarshal(raw, &c) != nil || c.Why == nil || c.Body == nil {
			return nil, false
		}
		out = append(out, Case{Name: *c.Why, Valid: false, RefusedBy: c.RefusedBy, Body: c.Body})
	}
	return out, true
}

// registryCases is the registry's map of schema path → "<fixture path>#<JSON pointer>".
func (b *Bundle) registryCases() []map[string]string {
	var reg struct {
		Crossings []struct {
			Cases map[string]string `json:"cases"`
		} `json:"crossings"`
	}
	_ = json.Unmarshal(b.files["contracts/registry.json"], &reg)
	out := make([]map[string]string, 0, len(reg.Crossings))
	for _, c := range reg.Crossings {
		out = append(out, c.Cases)
	}
	return out
}

// conventional is where a contract's cases sit by convention:
// schemas/x/y.v1.json → fixtures/x/y.v1.cases.json, and
// schemas/http/a/b.v1.openapi.json → fixtures/http/a/b.v1.cases.json.
func conventional(path string) string {
	p := "fixtures/" + strings.TrimPrefix(path, "schemas/")
	if strings.HasSuffix(p, ".openapi.json") {
		return strings.TrimSuffix(p, ".openapi.json") + ".cases.json"
	}
	return strings.TrimSuffix(p, ".json") + ".cases.json"
}

// Cases is every valid and invalid case the corpus holds for a reference:
//
//   - a schema path: where the registry names its cases, else fixtures/<path>.cases.json, as
//     `treaty cases <schema path>` finds them;
//   - an OpenAPI operation: <document>#<operationId>/request or #<operationId>/<status>, as
//     `treaty cases <document> --operation <id> --part <part>` finds them.
func (b *Bundle) Cases(ref string) ([]Case, error) {
	path, address, isOp := strings.Cut(ref, "#")
	if isOp {
		key, part, ok := splitOperation(address)
		if !ok || !strings.HasSuffix(path, ".openapi.json") {
			return nil, fmt.Errorf("treaty: %s names no operation: use <document>#<operationId>/request or /<status>", ref)
		}
		pointer := "/operations/" + token(key) + "/request"
		if part != "request" {
			pointer = "/operations/" + token(key) + "/responses/" + token(part)
		}
		if node, ok := rawAt(b.files[conventional(path)], pointer); ok {
			if cases, ok := casesIn(node); ok {
				return cases, nil
			}
		}
		return nil, fmt.Errorf("treaty holds no cases for %s", ref)
	}
	for _, named := range b.registryCases() {
		location, ok := named[path]
		if !ok {
			continue
		}
		file, pointer, _ := strings.Cut(location, "#")
		if node, ok := rawAt(b.files[file], pointer); ok {
			if cases, ok := casesIn(node); ok {
				return cases, nil
			}
		}
	}
	if node, ok := b.files[conventional(path)]; ok {
		if cases, ok := casesIn(node); ok {
			return cases, nil
		}
	}
	return nil, fmt.Errorf("treaty holds no cases for %s", ref)
}

// Mismatch is a case the consumer's parse function read the other way from the corpus: a valid
// case it refused, an invalid case it accepted, or a reference treaty holds no cases for.
type Mismatch struct {
	// Case is the valid case's label or the invalid case's why; empty when there were no cases.
	Case string
	// Valid is what the corpus says the case is.
	Valid bool
	// Err is parse's error for a refused valid case, or what went wrong finding the cases.
	Err error
}

func (m Mismatch) String() string {
	switch {
	case m.Case == "" && m.Err != nil:
		return m.Err.Error()
	case m.Valid:
		return fmt.Sprintf("valid case %q was refused: %v", m.Case, m.Err)
	default:
		return fmt.Sprintf("invalid case %q was accepted", m.Case)
	}
}

// RunCases feeds every case to parse and returns the ones it read the other way. A reference with
// no cases is one mismatch, never an empty pass. An invalid case refused by "recorded" state is
// not fed: parse sees one body, and that case is valid on its own.
func (b *Bundle) RunCases(ref string, parse func([]byte) error) []Mismatch {
	cases, err := b.Cases(ref)
	if err != nil {
		return []Mismatch{{Err: err}}
	}
	var out []Mismatch
	for _, c := range cases {
		if c.RefusedBy == "recorded" {
			continue
		}
		err := parse(c.Body)
		switch {
		case c.Valid && err != nil:
			out = append(out, Mismatch{Case: c.Name, Valid: true, Err: err})
		case !c.Valid && err == nil:
			out = append(out, Mismatch{Case: c.Name, Valid: false})
		}
	}
	return out
}
