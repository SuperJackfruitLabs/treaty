# SuperBench checkpoint generations

Status: proposed producer-first extension for multi-repository benches. The
accepted lifecycle boundary keeps checkpoint and recovery authority in
SuperBench. This format adds no issuer, audience, remote HTTP endpoint or
authority to a work-run identity.
The accepted `superbench.v1` operation schema and its fixture bytes are unchanged.
Multi-repository service operations and suite consumers require their own
versioned rollout; a manifest parser alone does not implement those operations.

## Manifest

Canonical schema: `schemas/superbench/checkpoint.v1.json`. Shared structural and
semantic cases: `fixtures/superbench-api/checkpoints.json`. Go producers consume
plain data pinned at a committed treaty revision, with source hashes. The
TypeScript fixture adapter checks data constraints; it does not execute a
checkpoint, fence writers or prove live consumer conformance.

The generated UTF-8 `checkpoint.json` file is at most 256 KiB. Decode rejects
duplicate keys at every depth, null fields, invalid UTF-8, unpaired Unicode
surrogates, unknown fields and trailing documents. Strings contain Unicode
scalar values; valid astral characters remain supported. Whitespace and
object-key order may vary. An external
`manifest_sha256` hashes the **exact file bytes**, without decoding or
reserializing them. The digest is not embedded in its own input.

| Field                      | Meaning                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| `version`                  | Exactly `superbench.checkpoint.v1`                                                            |
| `bench_id`                 | Stable 32-character lowercase hexadecimal identity, independent of a local lookup key         |
| `generation_id`            | Unique 32-character lowercase hexadecimal checkpoint attempt; never reused for another vector |
| `checkpoint_repository`    | Logical member whose remote stores the final manifest                                         |
| `previous_manifest_commit` | Optional prior metadata commit; omitted for genesis, never null                               |
| `members`                  | Complete vector of 1–32 members, sorted by logical name                                       |

Each member has exactly `name`, `repository`, `task_ref`, `pin_ref`,
`object_format` and `commit`. Names match `[a-z0-9][a-z0-9_-]{0,63}` and derive
checkout directory names; no caller-supplied filesystem paths appear here.
Names are unique, as are `(repository, task_ref)` pairs. One remote may contain
multiple distinct task branches. The checkpoint repository must be a member.

`task_ref` is a fully qualified Git branch ref; `pin_ref` is a fully qualified
generation tag ref. The commit is
lowercase hexadecimal, 40 characters for `sha1` or 64 for `sha256`. The previous
metadata commit uses the checkpoint repository's object format. Mixed object
formats across members are valid. Git ref grammar applies, including its
restrictions on control characters, traversal-like components and lock suffixes;
ordinary Unicode and slash-separated branch names are allowed.

Repository identities are exact strings, at most 4096 UTF-8 bytes, never command
options or strings containing NUL/newline. Credential-free HTTP(S), SSH,
`user@host:path`, absolute local Git paths and local `file:` URLs are supported.
HTTP(S) userinfo is forbidden. SSH may name a username, but never a password.
URI query/fragment selectors, including empty `?` and `#`, are forbidden; file
URLs have an empty or `localhost` authority. SCP uses an ASCII username matching
`[A-Za-z0-9_.-]+`, a DNS-like host matching `[A-Za-z0-9][A-Za-z0-9.-]*` or a
bracketed IPv6 address, and a nonempty opaque path. Colons, spaces, `?` and `#`
are literal in that path, not URI selectors. Relative paths, unknown schemes
and bare `host:path` are rejected. Authentication uses separately configured Git
credentials; a manifest must not contain tokens, passwords or keys. A repository
identity is not an authorization grant. Recovery needs an explicit configured
allowlist and must never fetch a newly discovered identity automatically.

Local Git remotes are useful for standalone operation and conformance tests;
their continued availability is required for recovery. The format does not turn
a lost local remote into durable remote storage.

## Remote namespace and completion boundary

The final metadata branch is:

```text
refs/heads/superbench/checkpoints/<bench_id>
```

Every member's exact pin is:

```text
refs/tags/superbench/pins/<bench_id>/<generation_id>/<name>
```

The metadata branch uses the existing mirror's explicit branch fetch. Pins use
bounded explicit tag fetches; ordinary mirror refresh need not fetch every tag.
A pin is a lightweight tag pointing directly at one generation/member's exact
commit. Normal Git pushes refuse replacement of an existing tag, including a
fast-forward replacement. The producer never uses force flags, overwrites pins
or deletes them. An existing pin at another commit is a conflict. This is
producer behavior, not a claim that a remote administrator cannot rewrite refs.

A complete checkpoint requires this sequence:

1. Hold the single bench-wide lease, prove all supervised writers stopped, and
   inspect every checkout. Capture the whole clean HEAD vector before pushing.
2. Journal the immutable vector and generation identity outside bounded bench
   data, before remote mutation. Retry uses the same vector and generation.
3. Push and confirm each task branch without force. Publish and confirm every
   generation pin at its exact member commit. Partial pushes retain ownership;
   there is no rollback or deletion of successfully published work.
4. Reconfirm the complete task/pin vector. Build a Git metadata commit containing
   only the generated `checkpoint.json`, with the previous manifest commit as
   its sole parent, or no parent for genesis. Use an isolated tree/index: never
   stage, auto-commit or modify the user's checkout. A journaled timestamp makes
   recovery of the same metadata candidate deterministic.
5. Publish the metadata branch with a normal fast-forward update and confirm
   the exact metadata commit and manifest digest before recording completion
   or releasing the lease.

Git has no atomic push across unrelated repositories. The final metadata commit
is the seal that distinguishes a completed vector from partial newer task tips.
If a task push, pin, seal push or confirmation fails, the generation remains
incomplete and ownership stays held. A conflicting metadata-head update requires
inspection; it never authorizes a force push or a replacement generation.
Ambiguous replies are inspected against the same journal, not blindly repeated
as new work. A body flag or transport timeout cannot assert writer fencing.

Successive generations preserve the member set, repository identities, task
refs and checkpoint-repository choice. Membership migration needs a separate
contract; this format does not silently change a bench's layout.

## Recovery

Recovery selects one exact metadata commit and expected raw-file SHA256 digest
from an explicitly authorized checkpoint remote. Validate its single-file tree,
format, complete member set, metadata parent and coordinator identity. Confirm
and fetch every exact member pin/commit before registering a recovered bench.
The metadata commit selects the vector; independently current task tips do not.

Journal all selected sources before materialization. A missing member, changed
pin, mismatched digest, unknown repository or partial checkout prevents complete
recovery and preserves existing files for reconciliation. In particular, a lost
host after the second task branch failed to push must not make the first newer
tip look like part of a completed checkpoint.

After a partial newer push, recovery of an older seal may require new task
branches under a new bench identity. Never reset or force original branches
backward. The caller must select that recovery/fork relationship explicitly;
a manifest does not settle ownership of an old live bench. Independent evidence
must establish the prior writer stopped before reassignment.

If no valid seal is known, report **no complete multi-repository checkpoint**.
Operator-selected salvage may preserve exact chosen commits as unverified,
held work; it must not invent a completed generation. A generated `bench.json`
inside the bench is a projection, not authoritative lease/checkpoint state.
SuperWitness may observe the evidence; it is not a required coordinator or
alternative authority for standalone recovery.

## Rollout and verification

Publish the schema/corpus before a producer pin. Implement and verify the
dual-version producer before new CLI or suite consumers use group operations.
Existing single-repository v1 behavior remains supported. A v1 client addressing
a multi-repository bench must receive an explicit pre-effect refusal rather
than a misleading scalar checkpoint or permission to release one member.

Producer acceptance must exercise two-or-more-repository success, failure during
the second task push and pin, seal rejection, lost replies, journal/state
failure, old-seal recovery after partial newer pushes, missing/changed pins and
explicit authorization of every remote. Those executions are separate evidence
from schema/vector validation. No suite deployment, production tag or completed
multi-repository lifecycle is claimed by publishing this proposed format.
