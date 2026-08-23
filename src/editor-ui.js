const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Flow editor</title>
<style>
body{margin:0;font:14px system-ui;background:#20252b;color:#eee;display:grid;grid-template-columns:1fr 280px;height:100vh}
header{position:fixed;z-index:2;left:0;right:280px;padding:8px;background:#161a1f}button{margin-right:8px}
svg{width:100%;height:100%;background:#2b3138}.node rect{fill:#3b82f6;stroke:#bfdbfe;stroke-width:1}.node text{fill:#fff;pointer-events:none}.wire{stroke:#94a3b8;fill:none}
aside{padding:58px 12px 12px;background:#15191e}textarea{width:100%;height:360px;box-sizing:border-box;background:#0b0d0f;color:#ddd;border:1px solid #475569}
</style></head><body><header><button id="deploy">Deploy</button><span id="rev"></span><span id="result"></span></header><svg id="canvas"></svg><aside><h3>Node</h3><textarea id="config" spellcheck="false"></textarea><button id="apply">Apply node</button></aside>
<script>
const canvas=document.getElementById('canvas'), config=document.getElementById('config'), rev=document.getElementById('rev'), result=document.getElementById('result');
let model={flows:[],rev:'0'}, selected=null;
const svgNS='http://www.w3.org/2000/svg';
function nodeList(){return model.flows.filter(n=>n.type!=='tab'&&n.type!=='subflow'&&n.wires!==undefined)}
function draw(){canvas.replaceChildren();const nodes=nodeList(), byId=new Map(nodes.map(n=>[n.id,n]));
for(const n of nodes){for(const outputs of n.wires||[]){for(const targetId of outputs||[]){const t=byId.get(targetId);if(!t)continue;const line=document.createElementNS(svgNS,'line');line.setAttribute('class','wire');line.setAttribute('x1',n.x||80);line.setAttribute('y1',n.y||80);line.setAttribute('x2',t.x||80);line.setAttribute('y2',t.y||80);canvas.append(line)}}}
for(const n of nodes){const g=document.createElementNS(svgNS,'g');g.setAttribute('class','node');g.setAttribute('transform','translate('+(n.x||80)+','+(n.y||80)+')');const r=document.createElementNS(svgNS,'rect');r.setAttribute('width',150);r.setAttribute('height',42);r.setAttribute('rx',6);const text=document.createElementNS(svgNS,'text');text.setAttribute('x',10);text.setAttribute('y',26);text.textContent=n.name||n.type||n.id;g.append(r,text);g.addEventListener('click',()=>{selected=n;config.value=JSON.stringify(n,null,2)});let drag=false, sx=0, sy=0;g.addEventListener('pointerdown',e=>{drag=true;sx=e.clientX-(n.x||80);sy=e.clientY-(n.y||80);g.setPointerCapture(e.pointerId)});g.addEventListener('pointermove',e=>{if(!drag)return;n.x=Math.max(0,e.clientX-sx);n.y=Math.max(0,e.clientY-sy);draw()});g.addEventListener('pointerup',()=>{drag=false});canvas.append(g)}}
async function load(){const r=await fetch('/api/editor/snapshot');model=await r.json();rev.textContent='rev '+model.rev;draw()}
document.getElementById('apply').onclick=()=>{if(!selected)return;try{const next=JSON.parse(config.value);for(const k in selected)delete selected[k];Object.assign(selected,next);draw()}catch(e){result.textContent=' invalid JSON'}};
document.getElementById('deploy').onclick=async()=>{const before=await (await fetch('/api/editor/snapshot')).json(), old=new Map(before.flows.map(n=>[n.id,n])), changes=[];for(const n of model.flows){const o=old.get(n.id);if(!o)continue;const set={};for(const k in n)if(k!=='id'&&k!=='wires'&&JSON.stringify(n[k])!==JSON.stringify(o[k]))set[k]=n[k];if(Object.keys(set).length)changes.push({op:'update-node',id:n.id,set});if(JSON.stringify(n.wires||[])!==JSON.stringify(o.wires||[]))changes.push({op:'replace-wires',id:n.id,wires:n.wires||[]})}const r=await fetch('/api/editor/deploy',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({baseRev:before.rev,changes})});const body=await r.json();if(r.ok){model.rev=body.rev;rev.textContent='rev '+body.rev;result.textContent=' deployed';}else result.textContent=' '+(body.error||'deploy failed')};
load();
</script></body></html>`;

module.exports = function mountEditorUi(app) {
    app.get('/', (req, res) => res.redirect('/editor'));
    app.get('/editor', (req, res) => res.type('html').send(html));
};
