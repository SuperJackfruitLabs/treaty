package contract

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

// The methods an OpenAPI path item may hold, in the order packages/contracts reads them.
var methods = []string{"get", "put", "post", "delete", "patch", "head", "options"}

const jsonMedia = "application/json"

// operation is one operation of an OpenAPI document: its key (`operationId`, or `METHOD path`
// when it has none) and the pointers to its bodies' schemas.
type operation struct {
	key       string
	request   string            // pointer to the request body's schema, or ""
	responses map[string]string // status → pointer to the body's schema, or "" for no body
}

// token escapes one token of a JSON pointer (RFC 6901).
func token(s string) string {
	return strings.ReplaceAll(strings.ReplaceAll(s, "~", "~0"), "/", "~1")
}

// pointerTo walks a JSON pointer through a decoded document.
func pointerTo(doc any, pointer string) (any, bool) {
	if pointer == "" || pointer == "/" {
		return doc, true
	}
	node := doc
	for _, raw := range strings.Split(pointer[1:], "/") {
		t := strings.ReplaceAll(strings.ReplaceAll(raw, "~1", "/"), "~0", "~")
		switch n := node.(type) {
		case map[string]any:
			v, ok := n[t]
			if !ok {
				return nil, false
			}
			node = v
		case []any:
			var i int
			if _, err := fmt.Sscanf(t, "%d", &i); err != nil || i < 0 || i >= len(n) {
				return nil, false
			}
			node = n[i]
		default:
			return nil, false
		}
	}
	return node, true
}

// deref follows local `$ref`s (`#/components/...`) until it reaches a node that is not one.
func deref(doc, node any, pointer string) (map[string]any, string, bool) {
	at := pointer
	for hops := 0; hops < 32; hops++ {
		obj, ok := node.(map[string]any)
		if !ok {
			return nil, "", false
		}
		ref, isRef := obj["$ref"].(string)
		if !isRef || !strings.HasPrefix(ref, "#/") {
			return obj, at, true
		}
		at = ref[1:]
		if node, ok = pointerTo(doc, at); !ok {
			return nil, "", false
		}
	}
	return nil, "", false
}

// bodySchema is the pointer to a request body's or response's JSON schema, or "".
func bodySchema(doc, holder any, pointer string) string {
	obj, at, ok := deref(doc, holder, pointer)
	if !ok {
		return ""
	}
	content, _ := obj["content"].(map[string]any)
	media, _ := content[jsonMedia].(map[string]any)
	if _, ok := media["schema"]; !ok {
		return ""
	}
	return at + "/content/" + token(jsonMedia) + "/schema"
}

func operationsOf(doc any) []operation {
	root, _ := doc.(map[string]any)
	paths, _ := root["paths"].(map[string]any)
	keys := make([]string, 0, len(paths))
	for p := range paths {
		keys = append(keys, p)
	}
	sort.Strings(keys)
	var found []operation
	for _, path := range keys {
		item, _ := paths[path].(map[string]any)
		for _, method := range methods {
			op, ok := item[method].(map[string]any)
			if !ok {
				continue
			}
			at := "/paths/" + token(path) + "/" + method
			key, _ := op["operationId"].(string)
			if key == "" {
				key = strings.ToUpper(method) + " " + path
			}
			o := operation{key: key, responses: map[string]string{}}
			if body, ok := op["requestBody"]; ok {
				o.request = bodySchema(doc, body, at+"/requestBody")
			}
			responses, _ := op["responses"].(map[string]any)
			for status, response := range responses {
				o.responses[status] = bodySchema(doc, response, at+"/responses/"+token(status))
			}
			found = append(found, o)
		}
	}
	return found
}

func (b *Bundle) operations(path string) ([]operation, error) {
	if ops, ok := b.ops[path]; ok {
		return ops, nil
	}
	var doc any
	if err := json.Unmarshal(b.files[path], &doc); err != nil {
		return nil, fmt.Errorf("treaty: %s is not JSON: %w", path, err)
	}
	ops := operationsOf(doc)
	b.ops[path] = ops
	return ops, nil
}

// splitOperation splits `<operationId>/<part>` at its last slash: an operation key with no
// operationId (`GET /v1/runs`) holds slashes, a part (`request`, `200`, `4XX`) never does.
func splitOperation(address string) (key, part string, ok bool) {
	i := strings.LastIndex(address, "/")
	if i <= 0 || i == len(address)-1 {
		return "", "", false
	}
	return address[:i], address[i+1:], true
}

// operationBody is the pointer to the schema of an operation's request (`<id>/request`) or of
// one response (`<id>/<status>`) in an OpenAPI document.
func (b *Bundle) operationBody(path, address string) (string, error) {
	key, part, ok := splitOperation(address)
	if !ok {
		return "", fmt.Errorf("treaty: %s#%s names no operation: use #<operationId>/request or #<operationId>/<status>", path, address)
	}
	ops, err := b.operations(path)
	if err != nil {
		return "", err
	}
	for _, op := range ops {
		if op.key != key {
			continue
		}
		pointer := op.request
		if part != "request" {
			pointer = op.responses[part]
		}
		if pointer == "" {
			return "", fmt.Errorf("treaty: %s: %s has no JSON body for %s", path, key, part)
		}
		return pointer, nil
	}
	return "", fmt.Errorf("treaty: %s has no operation %s", path, key)
}
