package contract

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"

	"github.com/dlclark/regexp2"
	"github.com/santhosh-tekuri/jsonschema/v6"
)

// offline refuses every load: every $ref resolves from the bundle or not at all.
type offline struct{}

func (offline) Load(u string) (any, error) {
	return nil, fmt.Errorf("treaty validates offline: %s is not in the release", u)
}

// ecmaRegexp runs `pattern` as JSON Schema means it: an ECMA-262 regular expression. Go's RE2
// refuses lookahead, which treaty's schemas use to anchor a string's end.
type ecmaRegexp regexp2.Regexp

func (re *ecmaRegexp) MatchString(s string) bool {
	ok, err := (*regexp2.Regexp)(re).MatchString(s)
	return err == nil && ok
}

func (re *ecmaRegexp) String() string { return (*regexp2.Regexp)(re).String() }

func ecmaCompile(s string) (jsonschema.Regexp, error) {
	re, err := regexp2.Compile(s, regexp2.ECMAScript)
	if err != nil {
		return nil, err
	}
	return (*ecmaRegexp)(re), nil
}

// newCompiler registers every schema under schemas/ by its $id (or the address of its path),
// as the TypeScript validator does: a copy that kept its original's $id is skipped, the first
// wins.
func (b *Bundle) newCompiler() (*jsonschema.Compiler, error) {
	c := jsonschema.NewCompiler()
	c.DefaultDraft(jsonschema.Draft2020)
	c.AssertFormat()
	c.UseLoader(offline{})
	c.UseRegexpEngine(ecmaCompile)
	seen := map[string]bool{}
	for _, path := range b.Paths() {
		if !strings.HasPrefix(path, "schemas/") {
			continue
		}
		doc, err := jsonschema.UnmarshalJSON(bytes.NewReader(b.files[path]))
		if err != nil {
			return nil, fmt.Errorf("treaty: %s is not JSON: %w", path, err)
		}
		obj, ok := doc.(map[string]any)
		if !ok {
			continue
		}
		id := IDOf(path)
		if s, ok := obj["$id"].(string); ok {
			id = s
		}
		if seen[id] {
			continue
		}
		seen[id] = true
		if err := c.AddResource(id, obj); err != nil {
			return nil, fmt.Errorf("treaty: %s: %w", path, err)
		}
	}
	return c, nil
}

// fragment encodes a JSON pointer for use as a URI fragment (RFC 6901 §6).
func fragment(pointer string) string {
	tokens := strings.Split(pointer, "/")
	for i, t := range tokens {
		tokens[i] = url.PathEscape(t)
	}
	return strings.Join(tokens, "/")
}

// location is the absolute schema location a reference names:
//
//   - a repository path: schemas/common/error.v1.json
//   - a path and a JSON pointer: schemas/http/x.openapi.json#/components/schemas/Card
//   - an OpenAPI operation's body: schemas/http/x.openapi.json#<operationId>/request, or
//     #<operationId>/<status> for a response
//   - a schema's full $id
func (b *Bundle) location(ref string) (string, error) {
	where, frag, hasFrag := strings.Cut(ref, "#")
	if !strings.HasPrefix(where, "https://") {
		if _, ok := b.files[where]; !ok {
			return "", fmt.Errorf("treaty holds no %s", where)
		}
	}
	base := where
	if !strings.HasPrefix(where, "https://") {
		base = b.idFor(where)
	}
	switch {
	case !hasFrag:
		return base, nil
	case frag == "" || strings.HasPrefix(frag, "/"):
		return base + "#" + fragment(frag), nil
	default:
		pointer, err := b.operationBody(where, frag)
		if err != nil {
			return "", err
		}
		return base + "#" + fragment(pointer), nil
	}
}

// idFor is the address a file is registered under: its own $id when it carries one (a schema
// treaty holds under its owner's published address, contracts/published-ids.json), otherwise
// the address of its path.
func (b *Bundle) idFor(path string) string {
	var head struct {
		ID string `json:"$id"`
	}
	if json.Unmarshal(b.files[path], &head) == nil && strings.HasPrefix(head.ID, "https://") {
		return head.ID
	}
	return IDOf(path)
}

// Schema is the compiled schema a reference names (see location for the forms).
func (b *Bundle) Schema(ref string) (*jsonschema.Schema, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if s, ok := b.compiled[ref]; ok {
		return s, nil
	}
	if b.compiler == nil && b.compErr == nil {
		b.compiler, b.compErr = b.newCompiler()
	}
	if b.compErr != nil {
		return nil, b.compErr
	}
	loc, err := b.location(ref)
	if err != nil {
		return nil, err
	}
	s, err := b.compiler.Compile(loc)
	if err != nil {
		return nil, fmt.Errorf("treaty: %s does not compile: %w", ref, err)
	}
	b.compiled[ref] = s
	return s, nil
}

// instance turns a Go value into the JSON model the validator reads. A []byte or
// json.RawMessage is JSON text; anything else is encoded with encoding/json first, so a struct
// is checked as it would travel.
func instance(value any) (any, error) {
	var text []byte
	switch v := value.(type) {
	case json.RawMessage:
		text = v
	case []byte:
		text = v
	default:
		var err error
		if text, err = json.Marshal(value); err != nil {
			return nil, fmt.Errorf("treaty: the value does not encode as JSON: %w", err)
		}
	}
	doc, err := jsonschema.UnmarshalJSON(bytes.NewReader(text))
	if err != nil {
		return nil, fmt.Errorf("treaty: the value is not JSON: %w", err)
	}
	return doc, nil
}

// ErrInvalid is wrapped by every error Validate returns for a value the schema refuses, so a
// caller can tell a refused value from a reference treaty does not hold.
var ErrInvalid = errors.New("does not match")

// Validate checks a value against the schema a reference names. Nil means it holds.
func (b *Bundle) Validate(ref string, value any) error {
	s, err := b.Schema(ref)
	if err != nil {
		return err
	}
	doc, err := instance(value)
	if err != nil {
		return err
	}
	if err := s.Validate(doc); err != nil {
		return fmt.Errorf("%w %s: %w", ErrInvalid, ref, err)
	}
	return nil
}
