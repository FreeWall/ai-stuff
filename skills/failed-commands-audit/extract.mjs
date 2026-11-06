#!/usr/bin/env node
// Dump failed tool calls from T3 Code's DB as JSONL, with the follow-up the agent took.
// Usage: node extract.mjs [--since 2026-10-01] [--db ~/.t3/userdata/statev2.sqlite] > failures.jsonl
import { DatabaseSync } from 'node:sqlite';
import { homedir } from 'node:os';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    db: { type: 'string', default: `${homedir()}/.t3/userdata/statev2.sqlite` },
    since: { type: 'string', default: '1970-01-01' },
  },
});

const db = new DatabaseSync(args.db, { readOnly: true });

const clip = (s, n) => (typeof s === 'string' && s.length > n ? `${s.slice(0, n)}…` : s);
const tail = (s, n) => (typeof s === 'string' && s.length > n ? `…${s.slice(-n)}` : s);

const rows = db
  .prepare(
    `SELECT i.thread_id, i.ordinal, i.type, i.status, i.payload_json, p.workspace_root
     FROM orchestration_v2_projection_turn_items i
     JOIN orchestration_v2_projection_threads t USING (thread_id)
     LEFT JOIN projection_projects p USING (project_id)
     WHERE i.type IN ('command_execution', 'dynamic_tool', 'file_change', 'file_search')
       AND i.updated_at >= ?
       AND (
         i.status = 'failed'
         OR coalesce(json_extract(i.payload_json, '$.exitCode'), 0) != 0
         OR json_extract(i.payload_json, '$.output') LIKE 'Error: Exit code%'
       )
     ORDER BY i.updated_at`,
  )
  .all(args.since);

// Next assistant message + next command in the same thread = recovery evidence.
const next = db.prepare(
  `SELECT type, payload_json FROM orchestration_v2_projection_turn_items
   WHERE thread_id = ? AND ordinal > ? AND type IN ('assistant_message', 'command_execution')
   ORDER BY ordinal LIMIT 6`,
);

for (const r of rows) {
  const p = JSON.parse(r.payload_json);
  const after = next.all(r.thread_id, r.ordinal).map((n) => ({ type: n.type, ...JSON.parse(n.payload_json) }));
  const msg = after.find((n) => n.type === 'assistant_message');
  const retry = after.find((n) => n.type === 'command_execution');
  console.log(
    JSON.stringify({
      at: p.updatedAt,
      threadId: r.thread_id,
      driver: p.nativeItemRef?.driver ?? null,
      project: r.workspace_root,
      type: r.type,
      status: r.status,
      exitCode: p.exitCode ?? null,
      title: p.title,
      input: clip(typeof p.input === 'string' ? p.input : JSON.stringify(p.input), 600),
      output: tail(typeof p.output === 'string' ? p.output : JSON.stringify(p.output), 800),
      nextAssistant: clip(msg?.text ?? msg?.content ?? null, 400),
      nextCommand: clip(retry?.input ?? null, 300),
    }),
  );
}
