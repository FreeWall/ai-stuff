---
name: chrome-cdp
description: Drive the user's already-running Chrome (their logged-in tabs, wallets, devices) over raw Chrome DevTools Protocol, without Chrome DevTools MCP. Uses an accessibility-tree snapshot with refs for clicking/typing and writes XHR/Fetch traffic to disk. Use when asked to test, click through, or inspect a page in the user's own browser, or when Chrome DevTools MCP is unavailable.
---

# Chrome via raw CDP

A dependency-free Node bridge holds **one** CDP WebSocket to the user's Chrome. The `cdp` CLI talks to it over HTTP.

-   `scripts/bridge.mjs` is the bridge (Node 22+).
-   `scripts/cdp` is the CLI.

`SKILL_DIR` below is this skill's directory.

## Setup

1.  Remote debugging must be enabled in the user's Chrome at `chrome://inspect/#remote-debugging` (Chrome 144+).
    -   Chrome writes the port and WebSocket path to `~/.config/google-chrome/DevToolsActivePort`.
    -   The `/json/*` HTTP endpoints return 404; this is expected, and the bridge connects to the WebSocket path directly.
2.  Start the bridge as a **long-running background process**. Every new connection triggers Chrome's "Allow remote debugging" prompt, so start it once and keep it alive. Tell the user to click **Allow**.

    ```bash
    CDP_OUT=<evidence dir> CDP_NET_FILTER='<url regex>' node $SKILL_DIR/scripts/bridge.mjs
    ```

    -   `CDP_OUT` defaults to `./cdp-out`. Screenshots and `net/` go there.
    -   `CDP_NET_FILTER` limits which XHR/Fetch requests are saved, for example `localhost:3000|api\.example\.com`. Without it, every XHR/Fetch request is saved.
    -   `CDP_BRIDGE_PORT` defaults to 9339.
3.  Attach to the tab: `cdp attach <url or title substring | targetId prefix>`. Use `cdp targets` to list tabs.
    -   Restarting the bridge drops the attachment, so attach again afterwards.

In sandboxed agents, run the bridge and every `cdp` call **outside the sandbox**, because both need localhost network access.

## Loop

```bash
C=$SKILL_DIR/scripts/cdp
$C ax                      # snapshot: [ref] role "name" value=… (flags)
$C ax "confirm"            # only the lines matching the text (cheap)
$C click 583               # ref = backendDOMNodeId from the snapshot
$C type 1311 0.0003 --clear
$C key Enter
$C waitfor "Review your swap" 20
$C shot 03-review.png      # viewport; `shot el.png <ref>` clips to an element
$C eval 'location.pathname'
$C send Page.reload '{}'   # any raw CDP method on the attached tab
```

-   **Find elements with `ax` (and the `ax "<text>"` filter), not screenshots.**
    -   Refs stay valid until the DOM node is re-rendered. After navigation or a re-render, take a new snapshot.
    -   `ax` cuts output at 400 lines (`ax "" 1000` raises the limit).
-   **Take screenshots only as evidence or to check visual state** (layout, blur, modals). They cost a lot of tokens.
-   `click` scrolls the node into view and sends a real mouse press and release at the centre of its box. This works with React handlers.
    -   If a button is `(disabled)` in the snapshot, wait instead of clicking.
-   `type --clear` selects all, then deletes, then inserts text. This works on React controlled inputs.
-   Network evidence is written as each request finishes:
    -   Path: `$CDP_OUT/net/NNN-METHOD-host-path.json`.
    -   Contents: `{request, response: {status, headers, body}}`, with JSON bodies parsed.
    -   Inspect them with `jq`.
    -   Requests the page aborted have `error: "net::ERR_ABORTED"`; these are normal for superseded requests.

## Safety

-   **Real profile, real accounts.** Never submit payments, sign, send, delete, or post unless the user asked for that exact action.
-   When a step needs a hardware device, a password, a passphrase or 2FA:
    -   Stop and hand over to the user.
    -   Never type secrets, even when a field seems prefilled.
-   Saved request headers may contain auth tokens. Keep `CDP_OUT` local and never share it.

## Limits

-   The snapshot covers the main frame only. For iframe content, use `send` with `Target.getTargets` and attach to the frame target, or use `eval`.
-   There is one attached tab at a time; `attach` switches tabs.
-   Stop the bridge with `pkill -f "[b]ridge.mjs"`. The bracket stops pkill from matching its own shell.
