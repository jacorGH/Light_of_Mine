import * as THREE from 'three';
import { events } from '../engine/EventBus.js';

/**
 * MapUI — Minimap (always visible) + Full Map overlay with waypoints and notes.
 * 
 * - Minimap: small circle top-right, shows biome grid + player position/direction
 * - Full Map: M key or radial menu, shows full grid with labels + waypoint placement
 * - Waypoints: tap map to place, named markers with notes
 * - Serializable for save/load
 */
export class MapUI {
  constructor(engine) {
    this.engine = engine;
    this.cellSize = 64;
    this.cells = [];
    this.waypoints = [];
    this.nextWaypointId = 1;
    this.isFullMapOpen = false;

    this.createMinimap();
    this.createFullMap();
    this.setupInput();

    events.on('world:cells_changed', () => this.refreshCells());
    setTimeout(() => this.refreshCells(), 500);
  }

  refreshCells() {
    const wg = this.engine.worldGrid;
    if (wg && wg.worldData && wg.worldData.cells) {
      this.cells = wg.worldData.cells;
      this.cellSize = wg.cellSize || 64;
      this.drawMinimap();
    }
  }

  getBiomeColor(biome) {
    const c = { beach:'#c2a86b', coast:'#7a7a6e', forest:'#3d6b2e', village:'#6b8a4a', ruins:'#5a6b4a', swamp:'#3a4a2a', mountain:'#6a6a5e' };
    return c[biome] || '#5a8a3c';
  }

  // ─── MINIMAP ────────────────────────────────────────────────────

  createMinimap() {
    this.minimapEl = document.createElement('div');
    Object.assign(this.minimapEl.style, {
      position:'fixed', top:'50px', right:'10px', width:'80px', height:'80px',
      borderRadius:'50%', border:'2px solid rgba(255,200,100,0.3)',
      background:'rgba(0,0,0,0.5)', overflow:'hidden', zIndex:'900', pointerEvents:'none',
    });
    document.body.appendChild(this.minimapEl);

    this.mmCanvas = document.createElement('canvas');
    this.mmCanvas.width = 80; this.mmCanvas.height = 80;
    this.mmCanvas.style.cssText = 'width:100%;height:100%';
    this.minimapEl.appendChild(this.mmCanvas);
    this.mmCtx = this.mmCanvas.getContext('2d');

    // Player dot
    const dot = document.createElement('div');
    Object.assign(dot.style, {
      position:'absolute', top:'50%', left:'50%', width:'6px', height:'6px',
      marginTop:'-3px', marginLeft:'-3px', background:'#fff', borderRadius:'50%',
      boxShadow:'0 0 4px #fff', zIndex:'2',
    });
    this.minimapEl.appendChild(dot);

    // Direction triangle
    this.dirEl = document.createElement('div');
    Object.assign(this.dirEl.style, {
      position:'absolute', top:'50%', left:'50%',
      width:'0', height:'0', borderLeft:'3px solid transparent', borderRight:'3px solid transparent',
      borderBottom:'10px solid #ffcc66', marginTop:'-12px', marginLeft:'-3px',
      transformOrigin:'3px 12px', zIndex:'3',
    });
    this.minimapEl.appendChild(this.dirEl);
  }

  drawMinimap() {
    const ctx = this.mmCtx;
    ctx.clearRect(0, 0, 80, 80);
    if (!this.cells.length) return;

    let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
    for (const c of this.cells) { minX=Math.min(minX,c.x); maxX=Math.max(maxX,c.x); minY=Math.min(minY,c.y); maxY=Math.max(maxY,c.y); }
    const gW=maxX-minX+1, gH=maxY-minY+1;
    const cp = Math.min(80/gW, 80/gH)*0.85;
    const ox=(80-gW*cp)/2, oy=(80-gH*cp)/2;

    for (const c of this.cells) {
      ctx.fillStyle = this.getBiomeColor(c.biome);
      ctx.fillRect(ox+(c.x-minX)*cp, oy+(c.y-minY)*cp, cp-1, cp-1);
    }
    for (const wp of this.waypoints) {
      const px=ox+((wp.x/this.cellSize)-minX)*cp, py=oy+((wp.z/this.cellSize)-minY)*cp;
      ctx.fillStyle=wp.color||'#ff4444'; ctx.beginPath(); ctx.arc(px,py,2,0,Math.PI*2); ctx.fill();
    }
    this._mmBounds={minX,minY,cp,ox,oy};
  }

  updateMinimap() {
    if (!this._mmBounds||!this.cells.length) return;
    const {minX,minY,cp,ox,oy}=this._mmBounds;
    const pos=this.engine.camera.position;
    const px=ox+((pos.x/this.cellSize)-minX)*cp;
    const py=oy+((pos.z/this.cellSize)-minY)*cp;
    this.mmCanvas.style.transform=`translate(${40-px}px,${40-py}px)`;

    const euler=new THREE.Euler(0,0,0,'YXZ');
    euler.setFromQuaternion(this.engine.camera.quaternion,'YXZ');
    this.dirEl.style.transform=`rotate(${-euler.y*180/Math.PI}deg)`;
  }

  // ─── FULL MAP ───────────────────────────────────────────────────

  createFullMap() {
    this.fullMapEl = document.createElement('div');
    Object.assign(this.fullMapEl.style, {
      position:'fixed', inset:'0', background:'rgba(10,10,20,0.93)',
      zIndex:'4000', display:'none', flexDirection:'column',
      alignItems:'center', justifyContent:'center', fontFamily:'monospace',
    });
    document.body.appendChild(this.fullMapEl);

    const title = document.createElement('div');
    Object.assign(title.style, { color:'#ffcc66', fontSize:'16px', fontWeight:'bold', marginBottom:'10px' });
    title.textContent = 'Island of Ashvael';
    this.fullMapEl.appendChild(title);

    this.fmCanvas = document.createElement('canvas');
    this.fmCanvas.width=280; this.fmCanvas.height=280;
    Object.assign(this.fmCanvas.style, { border:'1px solid rgba(255,200,100,0.3)', borderRadius:'6px', cursor:'crosshair' });
    this.fmCanvas.addEventListener('click', (e) => this.onMapClick(e));
    this.fmCanvas.addEventListener('touchend', (e) => { e.preventDefault(); this.onMapClick(e.changedTouches[0]); });
    this.fullMapEl.appendChild(this.fmCanvas);
    this.fmCtx = this.fmCanvas.getContext('2d');

    const info = document.createElement('div');
    Object.assign(info.style, { marginTop:'10px', color:'#888', fontSize:'11px', textAlign:'center' });
    info.textContent = 'Tap to place waypoint | M to close';
    this.fullMapEl.appendChild(info);

    this.wpList = document.createElement('div');
    Object.assign(this.wpList.style, { marginTop:'8px', color:'#aaa', fontSize:'10px', maxHeight:'80px', overflowY:'auto', width:'260px' });
    this.fullMapEl.appendChild(this.wpList);

    const closeBtn = document.createElement('div');
    Object.assign(closeBtn.style, {
      position:'absolute', top:'10px', right:'10px', width:'30px', height:'30px', borderRadius:'50%',
      border:'1px solid rgba(255,255,255,0.3)', background:'rgba(0,0,0,0.5)',
      display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:'14px', cursor:'pointer',
    });
    closeBtn.textContent='✕';
    closeBtn.addEventListener('click', ()=>this.closeFullMap());
    closeBtn.addEventListener('touchend', (e)=>{e.preventDefault();this.closeFullMap();});
    this.fullMapEl.appendChild(closeBtn);
  }

  openFullMap() {
    this.isFullMapOpen=true;
    this.fullMapEl.style.display='flex';
    events.emit('game:paused');
    this.drawFullMap();
  }

  closeFullMap() {
    this.isFullMapOpen=false;
    this.fullMapEl.style.display='none';
    events.emit('game:resumed');
  }

  drawFullMap() {
    const ctx=this.fmCtx, w=280, h=280;
    ctx.clearRect(0,0,w,h); ctx.fillStyle='#0a0a1a'; ctx.fillRect(0,0,w,h);
    if (!this.cells.length) return;

    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(const c of this.cells){minX=Math.min(minX,c.x);maxX=Math.max(maxX,c.x);minY=Math.min(minY,c.y);maxY=Math.max(maxY,c.y);}
    const gW=maxX-minX+1,gH=maxY-minY+1;
    const cp=Math.min((w-16)/gW,(h-16)/gH);
    const ox=(w-gW*cp)/2, oy=(h-gH*cp)/2;

    for(const c of this.cells){
      const px=ox+(c.x-minX)*cp, py=oy+(c.y-minY)*cp;
      ctx.fillStyle=this.getBiomeColor(c.biome); ctx.fillRect(px+1,py+1,cp-2,cp-2);
      ctx.strokeStyle='rgba(255,200,100,0.15)'; ctx.strokeRect(px+1,py+1,cp-2,cp-2);
      ctx.fillStyle='rgba(255,255,255,0.6)'; ctx.font='7px monospace'; ctx.textAlign='center';
      ctx.fillText(c.name||'',px+cp/2,py+cp/2+2);
    }

    for(const wp of this.waypoints){
      const px=ox+((wp.x/this.cellSize)-minX)*cp, py=oy+((wp.z/this.cellSize)-minY)*cp;
      ctx.fillStyle=wp.color||'#ff4444'; ctx.beginPath(); ctx.arc(px,py,4,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='#fff'; ctx.lineWidth=1; ctx.stroke();
      if(wp.name){ctx.fillStyle='#fff';ctx.font='8px monospace';ctx.textAlign='center';ctx.fillText(wp.name,px,py-7);}
    }

    // Player
    const pos=this.engine.camera.position;
    const ppx=ox+((pos.x/this.cellSize)-minX)*cp, ppy=oy+((pos.z/this.cellSize)-minY)*cp;
    ctx.fillStyle='#ffcc66'; ctx.beginPath(); ctx.arc(ppx,ppy,5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(ppx,ppy,3,0,Math.PI*2); ctx.fill();

    this._fmBounds={minX,minY,cp,ox,oy};
    this.updateWpList();
  }

  onMapClick(e) {
    const rect=this.fmCanvas.getBoundingClientRect();
    const mx=(e.clientX||e.pageX)-rect.left, my=(e.clientY||e.pageY)-rect.top;
    if(!this._fmBounds) return;
    const {minX,minY,cp,ox,oy}=this._fmBounds;
    const wx=((mx-ox)/cp+minX)*this.cellSize, wz=((my-oy)/cp+minY)*this.cellSize;
    const name=prompt('Waypoint name:');
    if(name===null) return;
    this.addWaypoint(wx,wz,name||`WP${this.nextWaypointId}`);
    this.drawFullMap(); this.drawMinimap();
  }

  // ─── WAYPOINTS ──────────────────────────────────────────────────

  addWaypoint(x,z,name,note='',color='#ff4444'){
    const wp={id:this.nextWaypointId++,x,z,name,note,color};
    this.waypoints.push(wp);
    events.emit('map:waypoint_added',wp);
    return wp;
  }
  removeWaypoint(id){this.waypoints=this.waypoints.filter(w=>w.id!==id);this.drawFullMap();this.drawMinimap();}
  updateWpList(){
    if(!this.waypoints.length){this.wpList.innerHTML='<span style="color:#555">No waypoints</span>';return;}
    this.wpList.innerHTML=this.waypoints.map(wp=>`<div style="margin-bottom:3px"><span style="color:${wp.color}">●</span> ${wp.name} <span style="color:#555">(${Math.round(wp.x)},${Math.round(wp.z)})</span></div>`).join('');
  }

  // ─── INPUT ──────────────────────────────────────────────────────

  setupInput(){
    document.addEventListener('keydown',(e)=>{
      if(e.code==='KeyM'){e.preventDefault();if(this.isFullMapOpen)this.closeFullMap();else this.openFullMap();}
    });
  }

  // ─── UPDATE ─────────────────────────────────────────────────────

  update(){if(!this.isFullMapOpen)this.updateMinimap();}

  // ─── SERIALIZE ──────────────────────────────────────────────────

  serialize(){return{waypoints:this.waypoints,nextWaypointId:this.nextWaypointId};}
  deserialize(data){if(!data)return;this.waypoints=data.waypoints||[];this.nextWaypointId=data.nextWaypointId||1;this.drawMinimap();}
}
