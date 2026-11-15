import { scalarStrings } from "./superbench-workspace-response-decode";

type ObjectValue = Record<string, unknown>;
function isObject(value: unknown): value is ObjectValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
const object = (value: unknown): ObjectValue => (isObject(value) ? value : {});
const items = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];
const text = (value: unknown): string =>
  typeof value === "string" ? value : "";
const size = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).length;
const growth = new Set(["create", "recover", "lease", "run", "setup"]);

// Proof booleans come from the producer test's independent authority assertions,
// never from the wire peer or submitted request. They cannot confer runtime power.
export type ExpectedResponse = {
  operation: string;
  request_id?: string;
  key?: string;
  holder?: string;
  inventory_keys?: string[];
  lease_token?: string;
  checkpoint?: boolean;
  authorized_grant?: boolean;
  verified_fence?: boolean;
};

function ordered(values: unknown[], property: string): boolean {
  return values.every((value, i) => {
    const name = text(object(value)[property]);
    return (
      name !== "" && (i === 0 || text(object(values[i - 1])[property]) < name)
    );
  });
}
function timestamp(value: unknown): number {
  const input = text(value);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/u.test(input))
    return NaN;
  const parsed = Date.parse(input);
  return Number.isFinite(parsed) &&
    new Date(parsed).toISOString().slice(0, 19) === input.slice(0, 19)
    ? parsed
    : NaN;
}
function branch(value: unknown): boolean {
  const input = text(value);
  return (
    new TextEncoder().encode(input).length <= 255 &&
    input !== "" &&
    input !== "HEAD" &&
    input !== "@" &&
    !input.startsWith("-") &&
    !input.startsWith("refs/") &&
    !/[~^:?*[\\]/u.test(input) &&
    !Array.from(input).some((character) => {
      const point = character.codePointAt(0) ?? 0;
      return point <= 32 || point === 127;
    }) &&
    !/\.\.|@\{|\/\/|(^|\/)\.|\.lock(\/|$)|[./]$/u.test(input)
  );
}
function archiveErrors(w: ObjectValue): string[] {
  const errors: string[] = [];
  const phase = text(w.phase ?? w.state);
  const archived = ["archived", "reaping", "reaped"].includes(phase);
  if (
    archived !== (w.archive !== undefined) ||
    (archived && (w.lease !== undefined || w.pending !== undefined))
  )
    errors.push("archive_state");
  if (!archived) return errors;
  const a = object(w.archive);
  const start = timestamp(a.archived_at);
  const end = timestamp(a.reap_after);
  if (
    !Number.isFinite(start) ||
    (a.reap_after !== undefined &&
      (!Number.isFinite(end) || end < start || end - start > 365 * 86400000))
  )
    errors.push("archive_time");
  for (const field of ["frozen_at", "reaped_at"])
    if (
      a[field] !== undefined &&
      (!Number.isFinite(timestamp(a[field])) || timestamp(a[field]) < start)
    )
      errors.push("archive_time");
  if (w.kind !== "scalar") {
    if (
      (phase !== "archived" &&
        (a.frozen_at === undefined || a.reaping_digest === undefined)) ||
      (phase === "reaped") !== (a.reaped_at !== undefined) ||
      (phase === "archived" && a.reaping_digest !== undefined)
    )
      errors.push("archive_state");
  }
  return errors;
}
function workspaceErrors(w: ObjectValue): string[] {
  const errors = archiveErrors(w);
  const ready =
    w.phase === "ready" &&
    w.lease === undefined &&
    w.pending === undefined &&
    w.archive === undefined &&
    w.transfer_state === undefined;
  if (w.ready_for_acquisition !== ready) errors.push("readiness");
  if (
    w.transfer_state !== undefined &&
    (!["relinquishing", "transferred"].includes(text(w.transfer_state)) ||
      !["ready", "archived", "reaping", "reaped"].includes(text(w.phase)) ||
      w.lease !== undefined ||
      w.pending !== undefined ||
      w.checkpoint === undefined ||
      (w.transfer_state === "relinquishing" && w.phase !== "ready"))
  )
    errors.push("transfer_availability");
  if (
    ["ready", "archived", "reaping", "reaped"].includes(text(w.phase)) &&
    w.checkpoint === undefined
  )
    errors.push("checkpoint_state");
  if (
    ["materializing", "initializing", "prepared"].includes(text(w.phase)) &&
    (w.lease === undefined || object(w.lease).holder !== "initialization")
  )
    errors.push("initialization_owner");
  if (object(w.recovered_from).bench_id === w.bench_id)
    errors.push("recovery_identity");
  const cp = object(w.checkpoint),
    pending = object(w.pending);
  const vectors = [w.checkpoint, w.pending].filter(
    (value) => value !== undefined,
  );
  for (const value of vectors) {
    const vector = items(object(value).members);
    if (vector.length !== w.member_count || !ordered(vector, "name"))
      errors.push("member_vector");
  }
  if (
    w.pending !== undefined &&
    (pending.previous_seal !== cp.seal ||
      pending.generation_id === cp.generation_id)
  )
    errors.push("checkpoint_chain");
  if (
    vectors.length === 2 &&
    JSON.stringify(items(cp.members).map((v) => object(v).name)) !==
      JSON.stringify(items(pending.members).map((v) => object(v).name))
  )
    errors.push("member_vector");
  if (w.kind === "workspace") {
    const members = items(w.members);
    if (
      members.length !== w.member_count ||
      !ordered(members, "name") ||
      !members.some((member) => object(member).name === w.checkpoint_repository)
    )
      errors.push("member_vector");
    for (let i = 0; i < members.length; i++) {
      const member = object(members[i]);
      if (!branch(member.branch) || !branch(member.base))
        errors.push("branch_name");
      const width = member.object_format === "sha1" ? 40 : 64;
      if (text(member.source_commit).length !== width)
        errors.push("object_format");
      for (const value of vectors) {
        const commit = object(items(object(value).members)[i]);
        if (commit.name !== member.name || text(commit.commit).length !== width)
          errors.push("member_vector");
      }
      if (
        member.name === w.checkpoint_repository &&
        w.checkpoint !== undefined &&
        text(cp.seal).length !== width
      )
        errors.push("object_format");
    }
  }
  if (w.lease !== undefined) {
    const lease = object(w.lease);
    if ((lease.mode === "supervised") !== (lease.execution !== undefined))
      errors.push("lease_mode");
  }
  return errors;
}

export function responseErrors(
  status: number,
  value: unknown,
  expected: ExpectedResponse,
): string[] {
  const b = object(value),
    result = object(b.result),
    error = object(b.error);
  const errors: string[] = [];
  if (new TextEncoder().encode(text(error.message)).length > 256)
    errors.push("message_bytes");
  const op = text(b.operation),
    code = text(error.code);
  if (!scalarStrings(value)) errors.push("unicode_scalars");
  if (size(value) > 1 << 20 || (growth.has(op) && size(value) > 64 << 10))
    errors.push("response_size");
  const statuses: Record<string, number[]> = {
    invalid_request: [400, 405, 413, 415],
    forbidden: [403],
    not_found: [404],
    conflict: [409],
    in_progress: [409],
    operation_in_doubt: [409, 503],
    unavailable: [503],
    operation_failed: [422],
  };
  if (b.ok === true ? status !== 200 : !(statuses[code] ?? []).includes(status))
    errors.push("http_status");
  if (!op) {
    if (
      !["invalid_request", "forbidden", "not_found", "unavailable"].includes(
        code,
      ) ||
      b.result !== undefined ||
      b.request_id !== undefined
    )
      errors.push("identity");
    return errors;
  }
  if (op !== expected.operation || b.request_id !== expected.request_id)
    errors.push("identity");
  if (growth.has(op) !== (b.request_id !== undefined)) errors.push("identity");
  if (b.result === undefined) return errors;
  if (
    code === "in_progress" ||
    (code === "operation_in_doubt" && status === 409) ||
    code === "forbidden"
  )
    errors.push("failure_result");
  if (op === "status") {
    const benches = items(result.benches);
    if (!ordered(benches, "key") && benches.length !== 0)
      errors.push("status_order");
    if (
      expected.inventory_keys &&
      JSON.stringify(benches.map((entry) => object(entry).key)) !==
        JSON.stringify(expected.inventory_keys)
    )
      errors.push("status_complete");
    if (
      expected.key &&
      (benches.length !== 1 || object(benches[0]).key !== expected.key)
    )
      errors.push("identity");
    for (const bench of benches) {
      const inventory = object(bench);
      if (inventory.kind === "workspace")
        errors.push(...workspaceErrors(inventory));
      else {
        errors.push(...archiveErrors(inventory));
        if (!branch(inventory.branch)) errors.push("branch_name");
      }
    }
    return errors;
  }
  if (op === "host_status") return errors;
  const w = object(result.workspace),
    lease = object(w.lease);
  errors.push(...workspaceErrors(w));
  if (expected.key && w.key !== expected.key) errors.push("identity");
  if (
    expected.lease_token &&
    expected.holder &&
    lease.holder !== expected.holder
  )
    errors.push("holder_identity");
  if (result.grant !== undefined) {
    let authorized =
      expected.authorized_grant !== false &&
      expected.lease_token === undefined &&
      w.lease !== undefined &&
      w.archive === undefined &&
      w.transfer_state === undefined;
    if (["create", "recover"].includes(op))
      authorized &&=
        b.ok === false &&
        ["materializing", "initializing", "prepared"].includes(text(w.phase)) &&
        lease.holder === "initialization";
    else if (op === "stop_admin")
      authorized &&=
        b.ok === true &&
        expected.verified_fence !== false &&
        lease.stop_requested === true &&
        (!lease.execution || object(lease.execution).phase === "stopped");
    else authorized &&= ["lease", "run", "setup"].includes(op);
    if (!authorized) errors.push("grant_authority");
  }
  const root = text(result.root_path);
  if (
    result.root_path !== undefined &&
    ((!["create", "recover"].includes(op) && result.grant === undefined) ||
      new TextEncoder().encode(root).length > 4096 ||
      root
        .split("/")
        .some((component) => component === "." || component === "..") ||
      root.includes("//"))
  )
    errors.push("root_path");
  if (
    (result.grant !== undefined || ["create", "recover"].includes(op)) &&
    result.root_path === undefined
  )
    errors.push("root_path");
  if (
    b.ok === true &&
    (op === "setup" || (op === "run" && expected.checkpoint !== false)) &&
    (w.lease !== undefined || w.pending !== undefined)
  )
    errors.push("completion");
  if (b.ok === true) {
    if (
      ["create", "recover"].includes(op) &&
      ["materializing", "initializing", "prepared"].includes(text(w.phase))
    )
      errors.push("completion");
    if (op === "release" && (w.lease !== undefined || w.pending !== undefined))
      errors.push("completion");
    if (
      op === "checkpoint" &&
      (w.checkpoint === undefined || w.pending !== undefined)
    )
      errors.push("completion");
    if (
      op === "archive" &&
      (w.archive === undefined || object(w.archive).frozen_at === undefined)
    )
      errors.push("completion");
    if (
      ["stop", "stop_admin"].includes(op) &&
      w.lease !== undefined &&
      (lease.stop_requested !== true ||
        (lease.execution !== undefined &&
          object(lease.execution).phase !== "stopped"))
    )
      errors.push("stop_completion");
    if (result.exit_code !== undefined && result.exit_code !== 0)
      errors.push("execution_outcome");
  }
  if (op === "setup") {
    const preparation = items(result.preparation);
    if (
      !ordered(preparation, "name") ||
      preparation.length > Number(w.member_count) ||
      (b.ok === true &&
        preparation.some((p) => object(p).status !== "prepared"))
    )
      errors.push("preparation");
  }
  if (
    (result.exit_code !== undefined && result.execution === undefined) ||
    (result.execution !== undefined &&
      object(result.execution).phase !== "stopped")
  )
    errors.push("execution_outcome");
  return errors;
}
