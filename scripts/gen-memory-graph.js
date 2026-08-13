// Generates a graphify-style dense vis-network graph from the user's memory
// preferences (data/rag.db). category = community. Output: public/graphify/memory.html
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const DB = path.join(__dirname, "..", "data", "rag.db");
const OUT = path.join(__dirname, "..", "public", "graphify", "memory.html");

const PALETTE = ["#4E79A7", "#F28E2B", "#E15759", "#76B7B2", "#59A14F",
    "#EDC948", "#B07AA1", "#FF9DA7", "#9C755F", "#BAB0AC"];

function shade(hex, pct) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.round(r + (255 - r) * pct); g = Math.round(g + (255 - g) * pct); b = Math.round(b + (255 - b) * pct);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

const db = new Database(DB, { readonly: true });
const cats = db.prepare("select category, count(*) c from preferences group by category order by c desc").all();
const catIdx = new Map(cats.map((r, i) => [r.category, i]));

const nodes = [];
const edges = [];
const deg = new Map();
const bump = id => deg.set(id, (deg.get(id) || 0) + 1);

// Central hub
nodes.push({
    id: "MEMORY", label: "MEMORY", community: -1, community_name: "Memory",
    color: { background: "#a78bfa", border: "#c4b5fd", highlight: { background: "#c4b5fd", border: "#fff" } },
    size: 34, font: { size: 22, color: "#ffffff", strokeWidth: 4, strokeColor: "#0f0f1a" },
    title: "MEMORY - " + cats.reduce((a, r) => a + r.c, 0) + " preferences",
    _category: "memory", _key: "Memory hub", _value: cats.reduce((a, r) => a + r.c, 0) + " preferences across " + cats.length + " categories",
});

// Category hubs
cats.forEach((r, i) => {
    const color = PALETTE[i % PALETTE.length];
    nodes.push({
        id: "cat:" + r.category, label: r.category.toUpperCase(), community: i, community_name: r.category,
        color: { background: color, border: shade(color, 0.3), highlight: { background: shade(color, 0.2), border: "#fff" } },
        size: 16 + Math.sqrt(r.c) * 1.6, font: { size: 16, color: "#ffffff", strokeWidth: 4, strokeColor: "#0f0f1a" },
        title: r.category + " - " + r.c + " preferences",
        _category: r.category, _key: r.category, _value: r.c + " preferences",
    });
    edges.push({ from: "MEMORY", to: "cat:" + r.category, width: 2, color: { color: color, opacity: 0.55 } });
    bump("MEMORY"); bump("cat:" + r.category);
});

// Preference leaves
const prefs = db.prepare("select id, category, key, value, confidence from preferences order by category").all();
prefs.forEach(p => {
    const i = catIdx.get(p.category);
    const color = PALETTE[i % PALETTE.length];
    const leaf = shade(color, 0.18);
    const vlen = (p.value || "").length;
    nodes.push({
        id: "pref:" + p.id, label: p.key, community: i, community_name: p.category,
        color: { background: leaf, border: color, highlight: { background: "#fff", border: color } },
        size: 5 + Math.min(8, Math.sqrt(vlen) * 0.45), font: { size: 0, color: "#e0e0e0" },
        title: p.key + ": " + (p.value || "").slice(0, 220),
        _category: p.category, _key: p.key, _value: p.value || "",
    });
    edges.push({ from: "cat:" + p.category, to: "pref:" + p.id, width: 1, color: { color: color, opacity: 0.28 } });
    bump("cat:" + p.category); bump("pref:" + p.id);
});

nodes.forEach(n => { n.degree = deg.get(n.id) || 0; });

const LEGEND = cats.map((r, i) => ({ cid: i, color: PALETTE[i % PALETTE.length], label: r.category, count: r.c }));

const head = fs.readFileSync(path.join(__dirname, "..", "graphify-out", "graph.html"), "utf8");
const styleBlock = head.slice(head.indexOf("<style>"), head.indexOf("</style>") + 8);

const statLine = nodes.length + " nodes &middot; " + edges.length + " edges &middot; " + cats.length + " categories";

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>memory map - preferences</title>
<script src="https://unpkg.com/vis-network@9.1.6/standalone/umd/vis-network.min.js"
        integrity="sha384-Ux6phic9PEHJ38YtrijhkzyJ8yQlH8i/+buBR8s3mAZOJrP1gwyvAcIYl3GWtpX1"
        crossorigin="anonymous"></script>
${styleBlock}
</head>
<body>
<div id="graph"></div>
<div id="sidebar">
  <div id="search-wrap">
    <input id="search" type="text" placeholder="Search preferences..." autocomplete="off">
    <div id="search-results"></div>
  </div>
  <div id="info-panel">
    <h3>Preference</h3>
    <div id="info-content"><span class="empty">Click a node to inspect it</span></div>
  </div>
  <div id="legend-wrap">
    <h3>Categories</h3>
    <div id="legend-controls">
      <label><input type="checkbox" id="select-all-cb" checked onchange="toggleAllCommunities(!this.checked)">Select All</label>
    </div>
    <div id="legend"></div>
  </div>
  <div id="stats">${statLine}</div>
</div>
<script>
const RAW_NODES = ${JSON.stringify(nodes)};
const RAW_EDGES = ${JSON.stringify(edges)};
const LEGEND = ${JSON.stringify(LEGEND)};

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

const nodesDS = new vis.DataSet(RAW_NODES.map(n => ({
  id: n.id, label: n.label, color: n.color, size: n.size, font: n.font, title: n.title,
  _community: n.community, _community_name: n.community_name,
  _category: n._category, _key: n._key, _value: n._value, _degree: n.degree,
})));

const edgesDS = new vis.DataSet(RAW_EDGES.map((e, i) => ({
  id: i, from: e.from, to: e.to, label: '', width: e.width, color: e.color,
})));

const container = document.getElementById('graph');
const network = new vis.Network(container, { nodes: nodesDS, edges: edgesDS }, {
  physics: {
    enabled: true, solver: 'forceAtlas2Based',
    forceAtlas2Based: { gravitationalConstant: -55, centralGravity: 0.008, springLength: 110, springConstant: 0.08, damping: 0.4, avoidOverlap: 0.6 },
    stabilization: { iterations: 220, fit: true },
  },
  interaction: { hover: true, tooltipDelay: 120, hideEdgesOnDrag: true, navigationButtons: false, keyboard: false },
  nodes: { shape: 'dot', borderWidth: 1.5 },
  edges: { smooth: { type: 'continuous', roundness: 0.2 }, selectionWidth: 3 },
});
network.once('stabilizationIterationsDone', () => network.setOptions({ physics: { enabled: false } }));

function showInfo(nodeId) {
  const n = nodesDS.get(nodeId);
  if (!n) return;
  const neighborIds = network.getConnectedNodes(nodeId).slice(0, 60);
  const neighborItems = neighborIds.map(nid => {
    const nb = nodesDS.get(nid);
    const color = nb ? nb.color.border || nb.color.background : '#555';
    return '<span class="neighbor-link" style="border-left-color:' + esc(color) + '" onclick="focusNode(' + JSON.stringify(nid) + ')">' + esc(nb ? nb.label : nid) + '</span>';
  }).join('');
  const total = network.getConnectedNodes(nodeId).length;
  document.getElementById('info-content').innerHTML =
    '<div class="field"><b>' + esc(n._key) + '</b></div>' +
    '<div class="field">Category: ' + esc(n._community_name) + '</div>' +
    (n._value ? '<div class="field" style="color:#bbb">' + esc(n._value) + '</div>' : '') +
    (total ? '<div class="field" style="margin-top:8px;color:#aaa;font-size:11px">Connected (' + total + ')</div><div id="neighbors-list">' + neighborItems + '</div>' : '');
}

function focusNode(nodeId) {
  network.focus(nodeId, { scale: 1.3, animation: true });
  network.selectNodes([nodeId]);
  showInfo(nodeId);
}

let hoveredNodeId = null;
network.on('hoverNode', p => { hoveredNodeId = p.node; container.style.cursor = 'pointer'; });
network.on('blurNode', () => { hoveredNodeId = null; container.style.cursor = 'default'; });
network.on('click', p => {
  if (p.nodes.length > 0) showInfo(p.nodes[0]);
  else if (hoveredNodeId === null) document.getElementById('info-content').innerHTML = '<span class="empty">Click a node to inspect it</span>';
});

const searchInput = document.getElementById('search');
const searchResults = document.getElementById('search-results');
searchInput.addEventListener('input', () => {
  const q = searchInput.value.toLowerCase().trim();
  searchResults.innerHTML = '';
  if (!q) { searchResults.style.display = 'none'; return; }
  const matches = RAW_NODES.filter(n => n.label.toLowerCase().includes(q) || (n._value || '').toLowerCase().includes(q)).slice(0, 20);
  if (!matches.length) { searchResults.style.display = 'none'; return; }
  searchResults.style.display = 'block';
  matches.forEach(n => {
    const el = document.createElement('div');
    el.className = 'search-item';
    el.textContent = n.label;
    el.style.borderLeft = '3px solid ' + (n.color.border || n.color.background);
    el.style.paddingLeft = '8px';
    el.onclick = () => { network.focus(n.id, { scale: 1.5, animation: true }); network.selectNodes([n.id]); showInfo(n.id); searchResults.style.display = 'none'; searchInput.value = ''; };
    searchResults.appendChild(el);
  });
});
document.addEventListener('click', e => { if (!searchResults.contains(e.target) && e.target !== searchInput) searchResults.style.display = 'none'; });

const hiddenCommunities = new Set();
const selectAllCb = document.getElementById('select-all-cb');
function updateSelectAllState() {
  const hidden = hiddenCommunities.size;
  selectAllCb.checked = hidden === 0;
  selectAllCb.indeterminate = hidden > 0 && hidden < LEGEND.length;
}
function toggleAllCommunities(hide) {
  document.querySelectorAll('.legend-item').forEach(item => hide ? item.classList.add('dimmed') : item.classList.remove('dimmed'));
  document.querySelectorAll('.legend-cb').forEach(cb => cb.checked = !hide);
  LEGEND.forEach(c => { if (hide) hiddenCommunities.add(c.cid); else hiddenCommunities.delete(c.cid); });
  nodesDS.update(RAW_NODES.filter(n => n.community >= 0).map(n => ({ id: n.id, hidden: hide })));
  updateSelectAllState();
}

const legendEl = document.getElementById('legend');
LEGEND.forEach(c => {
  const item = document.createElement('div');
  item.className = 'legend-item';
  const cb = document.createElement('input');
  cb.type = 'checkbox'; cb.className = 'legend-cb'; cb.checked = true;
  cb.addEventListener('change', e => {
    e.stopPropagation();
    if (cb.checked) { hiddenCommunities.delete(c.cid); item.classList.remove('dimmed'); }
    else { hiddenCommunities.add(c.cid); item.classList.add('dimmed'); }
    nodesDS.update(RAW_NODES.filter(n => n.community === c.cid).map(n => ({ id: n.id, hidden: !cb.checked })));
    updateSelectAllState();
  });
  item.innerHTML = '<div class="legend-dot" style="background:' + c.color + '"></div><span class="legend-label">' + c.label + '</span><span class="legend-count">' + c.count + '</span>';
  item.prepend(cb);
  item.onclick = e => { if (e.target === cb) return; cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); };
  legendEl.appendChild(item);
});
</script>
</body>
</html>`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log("wrote " + OUT + " (" + nodes.length + " nodes, " + edges.length + " edges, " + (html.length / 1024).toFixed(0) + " KB)");
