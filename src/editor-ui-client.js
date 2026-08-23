const SVG = 'http://www.w3.org/2000/svg';
const canvas = document.getElementById('canvas');
const palette = document.getElementById('palette');
const inspector = document.getElementById('inspector');
const statusEl = document.getElementById('status');
const metrics = document.getElementById('metrics');

const state = {
    flow: { flows: [], rev: '0' }, types: [], tabId: null, selectedId: null,
    history: [], redo: [], baseline: new Map(), wireMode: false, wireFrom: null,
    zoom: 1, nodes: new Map(), wires: new Map(), drag: null,
};
const NODE_WIDTH = 150;
const locked = new Set(['id', 'type', 'z', 'wires', 'x', 'y', 'l', 'w', '_credentialId']);
const clone = value => JSON.parse(JSON.stringify(value));
const tabs = () => {
    const real = state.flow.flows.filter(node => node.type === 'tab');
    if (real.length) return real;
    const result = [], seen = new Set();
    for (const node of state.flow.flows) if (node.z && !seen.has(node.z)) {
        seen.add(node.z); result.push({ id: node.z, label: node.z });
    }
    return result;
};
const activeTab = () => tabs().find(tab => tab.id === state.tabId) || tabs()[0];
const nodes = () => state.flow.flows.filter(node => node.type !== 'tab' && node.type !== 'subflow' && node.wires !== undefined && (!activeTab() || node.z === activeTab().id));
const selected = () => state.flow.flows.find(node => node.id === state.selectedId) || null;
const modified = node => state.baseline.size > 0 && (!state.baseline.has(node.id) || JSON.stringify(node) !== state.baseline.get(node.id));
function setStatus(text, good) { statusEl.textContent = text; statusEl.style.color = good ? '#55d187' : '#8b9bad'; }
function saveHistory() { state.history.push(clone(state.flow)); state.redo.length = 0; if (state.history.length > 30) state.history.shift(); }
function restore(snapshot) { state.flow = snapshot; state.selectedId = null; renderTabs(); renderInspector(); renderNodes(); updateMetrics(); }
function undo() { const previous = state.history.pop(); if (!previous) return; state.redo.push(clone(state.flow)); restore(previous); setStatus('Undo'); }
function redo() { const next = state.redo.pop(); if (!next) return; state.history.push(clone(state.flow)); restore(next); setStatus('Redo'); }
function snap(value) { return Math.max(0, Math.round(value / 24) * 24); }
function point(event) { const box = canvas.getBoundingClientRect(); return { x: (event.clientX - box.left) / state.zoom, y: (event.clientY - box.top) / state.zoom }; }
function nodePoint(node, side) { return { x: Number(node.x) + (side === 'out' ? NODE_WIDTH : 0), y: Number(node.y) + 29 }; }
function wirePath(from, to) { const a = nodePoint(from, 'out'), b = nodePoint(to, 'in'); return 'M '+a.x+' '+a.y+' C '+(a.x + 70)+' '+a.y+', '+(b.x - 70)+' '+b.y+', '+b.x+' '+b.y; }
function updateMetrics() { metrics.textContent = nodes().length+' nodes · '+nodes().filter(modified).length+' modified'; }
function drawWires() {
    let layer = document.getElementById('wire-layer'); if (!layer) { layer = document.createElementNS(SVG, 'g'); layer.id = 'wire-layer'; canvas.append(layer); }
    layer.replaceChildren(); state.wires.clear(); const visible = new Map(nodes().map(node => [node.id, node]));
    for (const from of nodes()) {
        const targets = (from.wires || []).flat().concat(from.links || []);
        for (const id of targets) { const to = visible.get(id) || state.flow.flows.find(node => node.id === id); if (!to || to.z !== from.z) continue;
            const path = document.createElementNS(SVG, 'path'); path.setAttribute('class', 'wire'); path.dataset.from = from.id; path.dataset.to = to.id; path.setAttribute('d', wirePath(from, to)); layer.append(path); state.wires.set(from.id+'>'+to.id, path);
        }
    }
}
function updateWirePositions() { for (const path of state.wires.values()) { const from = state.flow.flows.find(node => node.id === path.dataset.from), to = state.flow.flows.find(node => node.id === path.dataset.to); if (from && to) path.setAttribute('d', wirePath(from, to)); } }
function selectNode(node) { state.selectedId = node ? node.id : null; renderInspector(); renderNodes(); }
function renderTabs() { const holder = document.getElementById('tabs'); holder.replaceChildren(); for (const tab of tabs()) { const button = document.createElement('button'); button.className = 'tab'+(activeTab() === tab ? ' active' : ''); button.textContent = tab.label || tab.name || tab.id; button.onclick = () => { state.tabId = tab.id; state.selectedId = null; renderTabs(); renderInspector(); renderNodes(); updateMetrics(); }; holder.append(button); } }
function makePort(x) { const port = document.createElementNS(SVG, 'circle'); port.setAttribute('class', 'port'); port.setAttribute('cx', x); port.setAttribute('cy', 29); port.setAttribute('r', 6); return port; }
function renderNodes() {
    let layer = document.getElementById('node-layer'); if (!layer) { layer = document.createElementNS(SVG, 'g'); layer.id = 'node-layer'; canvas.append(layer); }
    layer.replaceChildren(); state.nodes.clear();
    for (const node of nodes()) {
        const group = document.createElementNS(SVG, 'g'); group.dataset.id = node.id; group.setAttribute('class', 'node'+(state.selectedId === node.id ? ' selected' : '')+(modified(node) ? ' modified' : '')); group.setAttribute('transform', 'translate('+node.x+','+node.y+')');
        const rect = document.createElementNS(SVG, 'rect'); rect.setAttribute('width', NODE_WIDTH); rect.setAttribute('height', 58); rect.setAttribute('rx', 8);
        const title = document.createElementNS(SVG, 'text'); title.setAttribute('class', 'title'); title.setAttribute('x', 14); title.setAttribute('y', 24); title.textContent = node.name || node.type || node.id;
        const type = document.createElementNS(SVG, 'text'); type.setAttribute('class', 'type'); type.setAttribute('x', 14); type.setAttribute('y', 43); type.textContent = node.type || '';
        group.append(rect, title, type, makePort(0), makePort(NODE_WIDTH));
        group.addEventListener('pointerdown', event => {
            event.preventDefault(); event.stopPropagation(); state.selectedId = node.id; renderInspector();
            if (state.wireMode) { state.wireFrom = node; setStatus('Select target node'); return; }
            const cursor = point(event); state.drag = { node, group, dx: cursor.x - Number(node.x), dy: cursor.y - Number(node.y), pointerId: event.pointerId }; group.setPointerCapture(event.pointerId); saveHistory();
        });
        group.addEventListener('pointermove', event => { if (!state.drag || state.drag.node !== node) return; const cursor = point(event); node.x = snap(cursor.x - state.drag.dx); node.y = snap(cursor.y - state.drag.dy); group.setAttribute('transform', 'translate('+node.x+','+node.y+')'); updateWirePositions(); updateMetrics(); });
        group.addEventListener('pointerup', event => { if (!state.drag || state.drag.node !== node) return; state.drag = null; if (group.hasPointerCapture(event.pointerId)) group.releasePointerCapture(event.pointerId); renderNodes(); drawWires(); });
        group.addEventListener('click', event => { event.stopPropagation(); if (state.wireMode && state.wireFrom && state.wireFrom !== node) { connect(state.wireFrom, node); state.wireMode = false; state.wireFrom = null; } });
        layer.append(group); state.nodes.set(node.id, group);
    }
    drawWires();
}
function renderInspector() {
    const node = selected(); if (!node) { inspector.innerHTML = '<div class="empty">Select a node to edit its properties.</div>'; return; }
    inspector.replaceChildren(); const heading = document.createElement('div'); heading.className = 'field'; heading.innerHTML = '<strong>'+String(node.name || node.type || node.id)+'</strong>'; inspector.append(heading);
    for (const key in node) { if (locked.has(key) || key[0] === '_') continue; const field = document.createElement('div'); field.className = 'field'; const label = document.createElement('label'); label.textContent = key; field.append(label); const original = node[key]; let input;
        if (typeof original === 'boolean') { input = document.createElement('input'); input.type = 'checkbox'; input.checked = original; }
        else if (original && typeof original === 'object') { input = document.createElement('textarea'); input.value = JSON.stringify(original, null, 2); }
        else { input = document.createElement('input'); input.value = original == null ? '' : String(original); }
        input.addEventListener('input', () => { try { saveHistory(); if (input.type === 'checkbox') node[key] = input.checked; else if (original && typeof original === 'object') node[key] = JSON.parse(input.value); else if (typeof original === 'number') node[key] = Number(input.value); else node[key] = input.value; updateMetrics(); renderNodes(); setStatus('Local changes'); } catch { setStatus('Invalid '+key); } }); field.append(input); inspector.append(field);
    }
}
function connect(from, to) { saveHistory(); if (!from.wires) from.wires = [[]]; if (!from.wires[0]) from.wires[0] = []; if (!from.wires[0].includes(to.id)) from.wires[0].push(to.id); renderNodes(); setStatus('Wire added'); }
function renderPalette() { const query = document.getElementById('search').value.toLowerCase(); palette.replaceChildren(); for (const definition of state.types) { if (query && !definition.type.toLowerCase().includes(query)) continue; const button = document.createElement('button'); button.textContent = definition.type; button.onclick = () => { saveHistory(); const node = { id: 'ui-'+Math.random().toString(36).slice(2, 9), type: definition.type, x: 120, y: 120, wires: [[]] }; if (activeTab()) node.z = activeTab().id; state.flow.flows.push(node); selectNode(node); renderNodes(); updateMetrics(); }; palette.append(button); } }
async function deploy() { const before = await (await fetch('/api/editor/snapshot')).json(), old = new Map(before.flows.map(node => [node.id, node])), next = new Map(state.flow.flows.map(node => [node.id, node])), changes = []; for (const node of state.flow.flows) { const previous = old.get(node.id); if (!previous) { changes.push({ op: 'add-node', node }); continue; } const set = {}; for (const key in node) if (key !== 'id' && key !== 'wires' && JSON.stringify(node[key]) !== JSON.stringify(previous[key])) set[key] = node[key]; if (Object.keys(set).length) changes.push({ op: 'update-node', id: node.id, set }); if (JSON.stringify(node.wires || []) !== JSON.stringify(previous.wires || [])) changes.push({ op: 'replace-wires', id: node.id, wires: node.wires || [] }); } for (const node of before.flows) if (!next.has(node.id)) changes.push({ op: 'remove-node', id: node.id }); if (!changes.length) { setStatus('No changes', true); return; } const response = await fetch('/api/editor/deploy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ baseRev: before.rev, changes }) }); if (!response.ok) { setStatus((await response.json()).error || 'Deploy failed'); return; } setStatus('Deployed', true); load(); }
async function load() { state.flow = await (await fetch('/api/editor/snapshot')).json(); state.types = await (await fetch('/api/editor/node-types')).json(); state.tabId = tabs()[0] && tabs()[0].id; state.baseline = new Map(state.flow.flows.map(node => [node.id, JSON.stringify(node)])); renderTabs(); renderPalette(); renderInspector(); renderNodes(); updateMetrics(); setStatus('Ready · revision '+state.flow.rev, true); }
document.getElementById('deploy').onclick = deploy; document.getElementById('undo').onclick = () => { const previous = state.history.pop(); if (!previous) return; state.flow = previous; state.selectedId = null; renderTabs(); renderInspector(); renderNodes(); updateMetrics(); }; document.getElementById('wire').onclick = () => { state.wireMode = !state.wireMode; state.wireFrom = null; setStatus(state.wireMode ? 'Wire mode · select source then target' : 'Ready'); }; document.getElementById('add').onclick = () => { const first = palette.querySelector('button'); if (first) first.click(); }; document.getElementById('search').oninput = renderPalette; canvas.addEventListener('pointerdown', event => { if (event.target === canvas) { state.selectedId = null; renderInspector(); renderNodes(); } }); canvas.addEventListener('wheel', event => { event.preventDefault(); state.zoom = Math.max(.5, Math.min(2, state.zoom * (event.deltaY < 0 ? 1.1 : .9))); canvas.style.transform = 'scale('+state.zoom+')'; }, { passive: false }); document.addEventListener('keydown', event => { if (event.key === 'w' || event.key === 'W') document.getElementById('wire').click(); const node = selected(); if (event.key === 'Delete' && node) { saveHistory(); state.flow.flows = state.flow.flows.filter(item => item !== node); state.selectedId = null; renderInspector(); renderNodes(); updateMetrics(); } }); load().catch(error => setStatus('Load failed: '+error.message));
document.getElementById('undo').onclick = undo;
document.addEventListener('keydown', event => { if (!(event.ctrlKey || event.metaKey)) return; const key = event.key.toLowerCase(); if (key === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); } else if (key === 'y') { event.preventDefault(); redo(); } });
