// Holds ONE CDP WebSocket to the user's running Chrome (each new connection may
// trigger Chrome's "Allow remote debugging" prompt) and serves a small HTTP API.
// No dependencies: Node 22+ (global WebSocket).
//
//   POST /send     {method, params, sessionId?}  raw CDP; sessionId defaults to attached tab
//   GET  /targets                                 page targets
//   GET  /attach?target=<id|url/title substring>  attach + enable Page/DOM/Network/Accessibility
//   GET  /ax?q=<text>&max=<n>                     compact accessibility tree, refs = backendDOMNodeId
//   GET  /click?ref=<n>                           scroll into view + real mouse click at node centre
//   GET  /type?ref=<n>&text=<s>&clear=1           focus, optionally select-all, insert text
//   GET  /key?key=Enter|Escape|Tab|...            key press on focused element
//   GET  /shot?path=<file>&ref=<n>                PNG screenshot (viewport or node clip)
//   GET  /eval?expr=<js>                          Runtime.evaluate (awaitPromise, returnByValue)
//   GET  /events                                  drain buffered CDP events (non-Network)
//
// Env: CDP_PORT_FILE (DevToolsActivePort path), CDP_BRIDGE_PORT (9339),
//      CDP_OUT (./cdp-out), CDP_NET_FILTER (regex on URL, default: all XHR/Fetch).
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT_FILES = [
    process.env.CDP_PORT_FILE,
    '.config/google-chrome/DevToolsActivePort',
    '.config/google-chrome-beta/DevToolsActivePort',
    '.config/chromium/DevToolsActivePort',
    'Library/Application Support/Google/Chrome/DevToolsActivePort',
]
    .filter(Boolean)
    .map(p => (path.isAbsolute(p) ? p : path.join(os.homedir(), p)));
const portFile = PORT_FILES.find(p => fs.existsSync(p));
if (!portFile) {
    console.error('DevToolsActivePort not found. Enable chrome://inspect/#remote-debugging or set CDP_PORT_FILE.');
    process.exit(1);
}
const [cdpPort, wsPath] = fs.readFileSync(portFile, 'utf8').trim().split('\n');

const OUT = path.resolve(process.env.CDP_OUT ?? 'cdp-out');
const NET_DIR = path.join(OUT, 'net');
fs.mkdirSync(NET_DIR, { recursive: true });
const netFilter = process.env.CDP_NET_FILTER ? new RegExp(process.env.CDP_NET_FILTER) : null;

const ws = new WebSocket(`ws://127.0.0.1:${cdpPort}${wsPath}`);
let msgId = 0;
let session = null;
const pending = new Map();
const events = [];
const requests = new Map();
let netSeq = 0;

const send = (method, params = {}, sessionId = session) =>
    new Promise(resolve => {
        const id = ++msgId;
        pending.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
        setTimeout(() => {
            if (pending.delete(id)) resolve({ error: { message: `timeout: ${method}` } });
        }, 60_000);
    });

const call = async (method, params, sessionId) => {
    const res = await send(method, params, sessionId);
    if (res.error) throw new Error(`${method}: ${res.error.message}`);
    return res.result;
};

// Network capture: every matching XHR/Fetch request+response is written to disk as it
// completes, so evidence survives a bridge restart.
const onNetwork = async ({ method, params }) => {
    if (method === 'Network.requestWillBeSent') {
        const { requestId, request, type } = params;
        if (!['XHR', 'Fetch'].includes(type)) return;
        if (netFilter && !netFilter.test(request.url)) return;
        if (request.method === 'OPTIONS') return;
        requests.set(requestId, { time: new Date().toISOString(), request });
    } else if (method === 'Network.responseReceived') {
        const entry = requests.get(params.requestId);
        if (entry) entry.response = { status: params.response.status, headers: params.response.headers };
    } else if (method === 'Network.loadingFinished' || method === 'Network.loadingFailed') {
        const entry = requests.get(params.requestId);
        if (!entry) return;
        requests.delete(params.requestId);
        if (method === 'Network.loadingFailed') {
            entry.error = params.errorText;
        } else {
            try {
                const { body, base64Encoded } = await call('Network.getResponseBody', { requestId: params.requestId });
                const text = base64Encoded ? Buffer.from(body, 'base64').toString('utf8') : body;
                entry.response = { ...entry.response, body: tryJson(text) };
            } catch (e) {
                entry.response = { ...entry.response, bodyError: e.message };
            }
        }
        if (entry.request.postData) entry.request.postData = tryJson(entry.request.postData);
        const url = new URL(entry.request.url);
        const slug = `${url.host}${url.pathname}`.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 80);
        const file = path.join(NET_DIR, `${String(++netSeq).padStart(3, '0')}-${entry.request.method}-${slug}.json`);
        fs.writeFileSync(file, JSON.stringify(entry, null, 2));
        console.log(`net ${entry.response?.status ?? entry.error} ${entry.request.method} ${entry.request.url} -> ${file}`);
    }
};

const tryJson = s => {
    try {
        return JSON.parse(s);
    } catch {
        return s;
    }
};

ws.addEventListener('open', () => console.log(`connected ${portFile}`));
ws.addEventListener('error', e => console.log('ws error', e.message ?? e));
ws.addEventListener('close', () => {
    console.log('closed');
    process.exit(1);
});
ws.addEventListener('message', ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
    } else if (msg.method?.startsWith('Network.')) {
        onNetwork(msg).catch(e => console.log('net error', e.message));
    } else if (msg.method) {
        events.push(msg);
        if (events.length > 500) events.shift();
    }
});

// Accessibility snapshot -----------------------------------------------------

const ALWAYS_SKIP = new Set(['InlineTextBox', 'LineBreak']);
const SKIP_UNNAMED = new Set(['generic', 'none', 'image', 'RootWebArea']);
const FLAGS = ['focused', 'disabled', 'checked', 'expanded', 'selected', 'required', 'invalid'];

const snapshot = async ({ q, max = 400 }) => {
    const { nodes } = await call('Accessibility.getFullAXTree');
    const byId = new Map(nodes.map(n => [n.nodeId, n]));
    const lines = [];
    const walk = (node, depth, parentName) => {
        const role = node.role?.value ?? '';
        const name = (node.name?.value ?? '').replace(/\s+/g, ' ').trim();
        const skip =
            node.ignored ||
            ALWAYS_SKIP.has(role) ||
            (SKIP_UNNAMED.has(role) && !name) ||
            (role === 'StaticText' && (!name || parentName.includes(name)));
        if (!skip) {
            const value = node.value?.value;
            const flags = (node.properties ?? [])
                .filter(p => FLAGS.includes(p.name) && p.value?.value && p.value.value !== 'false')
                .map(p => (p.value.value === true ? p.name : `${p.name}=${p.value.value}`));
            lines.push(
                `${'  '.repeat(depth)}[${node.backendDOMNodeId}] ${role === 'StaticText' ? 'text' : role}` +
                    (name ? ` "${name.slice(0, 120)}"` : '') +
                    (value !== undefined && value !== '' ? ` value="${String(value).slice(0, 80)}"` : '') +
                    (flags.length ? ` (${flags.join(', ')})` : ''),
            );
        }
        for (const childId of node.childIds ?? []) {
            const child = byId.get(childId);
            if (child) walk(child, skip ? depth : depth + 1, skip ? parentName : name || parentName);
        }
    };
    walk(nodes[0], 0, '');
    const matched = q ? lines.filter(l => l.toLowerCase().includes(q.toLowerCase())).map(l => l.trim()) : lines;
    const shown = matched.slice(0, Number(max));
    if (matched.length > shown.length) shown.push(`… ${matched.length - shown.length} more lines (use q= or max=)`);
    return shown.join('\n');
};

// Element actions ------------------------------------------------------------

const nodeCentre = async backendNodeId => {
    await call('DOM.scrollIntoViewIfNeeded', { backendNodeId }).catch(() => {});
    const { model } = await call('DOM.getBoxModel', { backendNodeId });
    const q = model.border;
    return { x: (q[0] + q[2] + q[4] + q[6]) / 4, y: (q[1] + q[3] + q[5] + q[7]) / 4, model };
};

const click = async ref => {
    const { x, y } = await nodeCentre(Number(ref));
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    return `clicked [${ref}] at ${Math.round(x)},${Math.round(y)}`;
};

const KEYS = {
    Enter: { code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
    Escape: { code: 'Escape', windowsVirtualKeyCode: 27 },
    Tab: { code: 'Tab', windowsVirtualKeyCode: 9 },
    Backspace: { code: 'Backspace', windowsVirtualKeyCode: 8 },
    ArrowDown: { code: 'ArrowDown', windowsVirtualKeyCode: 40 },
    ArrowUp: { code: 'ArrowUp', windowsVirtualKeyCode: 38 },
};

const pressKey = async (key, extra = {}) => {
    const def = KEYS[key] ?? { code: key, windowsVirtualKeyCode: 0 };
    await call('Input.dispatchKeyEvent', { type: def.text ? 'keyDown' : 'rawKeyDown', key, ...def, ...extra });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key, ...def, ...extra });
    return `pressed ${key}`;
};

const type = async (ref, text, clear) => {
    await call('DOM.focus', { backendNodeId: Number(ref) });
    if (clear) {
        const modifiers = process.platform === 'darwin' ? 4 : 2;
        await pressKey('a', { code: 'KeyA', windowsVirtualKeyCode: 65, modifiers, commands: ['selectAll'] });
        await pressKey('Backspace');
    }
    await call('Input.insertText', { text });
    return `typed into [${ref}]`;
};

const shot = async (file, ref) => {
    const params = { format: 'png' };
    if (ref) {
        const { model } = await nodeCentre(Number(ref));
        const xs = model.border.filter((_, i) => i % 2 === 0);
        const ys = model.border.filter((_, i) => i % 2 === 1);
        params.clip = {
            x: Math.min(...xs),
            y: Math.min(...ys),
            width: Math.max(...xs) - Math.min(...xs),
            height: Math.max(...ys) - Math.min(...ys),
            scale: 1,
        };
    }
    const { data } = await call('Page.captureScreenshot', params);
    const out = path.resolve(OUT, file || `shot-${Date.now()}.png`);
    fs.writeFileSync(out, Buffer.from(data, 'base64'));
    return out;
};

// Targets --------------------------------------------------------------------

const pages = async () => (await call('Target.getTargets', {}, null)).targetInfos.filter(t => t.type === 'page');

const attach = async target => {
    const all = await pages();
    const t =
        all.find(p => p.targetId.startsWith(target.toUpperCase())) ??
        all.find(p => p.url.includes(target) || p.title.toLowerCase().includes(target.toLowerCase()));
    if (!t) throw new Error(`no page matches "${target}"`);
    ({ sessionId: session } = await call('Target.attachToTarget', { targetId: t.targetId, flatten: true }, null));
    for (const domain of ['Page', 'DOM', 'Network', 'Accessibility']) await call(`${domain}.enable`);
    return `attached ${t.targetId} ${t.title} ${t.url}`;
};

// HTTP -----------------------------------------------------------------------

const routes = {
    '/targets': async () => (await pages()).map(p => `${p.targetId}  ${p.title}  ${p.url}`).join('\n'),
    '/attach': ({ target }) => attach(target),
    '/ax': snapshot,
    '/click': ({ ref }) => click(ref),
    '/type': ({ ref, text, clear }) => type(ref, text ?? '', clear === '1'),
    '/key': ({ key }) => pressKey(key),
    '/shot': ({ path: file, ref }) => shot(file, ref),
    '/eval': async ({ expr }) => {
        const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
        return JSON.stringify(r.exceptionDetails ?? r.result.value ?? null, null, 2);
    },
    '/events': () => JSON.stringify(events.splice(0)),
};

http.createServer((req, res) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', async () => {
        const url = new URL(req.url, 'http://x');
        try {
            if (url.pathname === '/send') {
                const { method, params, sessionId } = JSON.parse(body || '{}');
                res.end(JSON.stringify(await send(method, params, sessionId ?? session)));
                return;
            }
            const route = routes[url.pathname];
            if (!route) throw new Error(`unknown route ${url.pathname}`);
            if (url.pathname !== '/targets' && url.pathname !== '/attach' && !session)
                throw new Error('not attached; call /attach first');
            res.end(String(await route(Object.fromEntries(url.searchParams))) + '\n');
        } catch (e) {
            res.statusCode = 500;
            res.end(`error: ${e.message}\n`);
        }
    });
}).listen(Number(process.env.CDP_BRIDGE_PORT ?? 9339), '127.0.0.1', () =>
    console.log(`bridge on 127.0.0.1:${process.env.CDP_BRIDGE_PORT ?? 9339}, out ${OUT}`),
);
