// 1. SETUP
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false; 
const W = canvas.width, H = canvas.height;
const TILE_SIZE = 16, COLS = 50, ROWS = 50;

// KONEKSI SERVER
const socket = io("pixel-ascension-production.up.railway.app"); 
let otherPlayers = {};
let serverEnemies = []; // Monster dari server
let serverChests = []; // Peti dari server

// 2. STATE GAME
const game = {
  isPlaying: false,
  player: {
    x: W/2, y: H/2, size: 14, speed: 120, color: '#fbbf24',
    level: 1, hp: 100, maxHp: 100, mp: 50, maxMp: 50,
    xp: 0, xpNext: 20, invincibleTimer: 0, animTime: 0,
    gold: 0, ore: 0, potions: 2, medkits: 0,
    skillPoints: 1, healthLvl: 0, manaLvl: 0, luckLvl: 0,
    weapon: { name: "Tangan Kosong", minDmg: 4, maxDmg: 8, element: "none", color: "#ccc" }
  },
  keys: {}, map: [], camera: { x: 0, y: 0 },
  attackCooldown: 0, promptText: "", showSkillMenu: false, showForgeMenu: false
};

// 3. SOCKET LISTENERS (Menerima Data dari Server)
socket.on('currentState', (data) => {
    otherPlayers = data.players;
    delete otherPlayers[socket.id]; // Hapus diri sendiri dari list
    serverEnemies = data.enemies;
    serverChests = data.chests;
});

socket.on('newPlayer', (p) => otherPlayers[p.id] = p);
socket.on('playerMoved', (p) => { if(otherPlayers[p.id]) { otherPlayers[p.id].x = p.x; otherPlayers[p.id].y = p.y; }});
socket.on('playerDisconnected', (id) => delete otherPlayers[id]);

socket.on('enemiesUpdate', (enemies) => { serverEnemies = enemies; });
socket.on('enemyDied', (id) => { serverEnemies = serverEnemies.filter(e => e.id !== id); });
socket.on('gainReward', (reward) => {
    game.player.gold += reward.gold;
    gainXP(reward.xp);
});

socket.on('chestOpened', (data) => {
    const chest = serverChests.find(c => c.id === data.chestId);
    if (chest) chest.opened = true;
    alert(`Seseorang membuka peti! Dapat: ${data.loot}`);
});

// 4. LOBBY
document.getElementById('playBtn').addEventListener('click', () => {
  document.getElementById('mainMenu').style.display = 'none';
  game.isPlaying = true;
  generateMap();
});

// 5. INPUT
document.addEventListener('keydown', (e) => {
  if (!game.isPlaying) return;
  const key = e.key.toLowerCase();
  game.keys[key] = true;
  
  if (key === 'e') interact();
  if (key === 't') game.showSkillMenu = !game.showSkillMenu;
  if (key === 'f') game.showForgeMenu = !game.showForgeMenu;
  if (key === '1' && game.player.potions > 0 && game.player.hp < game.player.maxHp) {
    game.player.potions--; game.player.hp = Math.min(game.player.maxHp, game.player.hp + 50);
  }
  if (key === 'q' && game.player.mp >= 15) { /* Sihir (bisa dikembangkan nanti) */ }
  
  if (game.showForgeMenu) {
    if (key === '1') craftWeapon("Pedang Kayu", 20, 5, 12, "none", "#a16207");
    if (key === '2') craftWeapon("Pedang Besi", 80, 15, 25, "none", "#cbd5e1");
  }
  if (game.showSkillMenu && game.player.skillPoints > 0) {
    const p = game.player;
    if (key === 'h') { p.healthLvl++; p.maxHp += 20; p.hp += 20; p.skillPoints--; }
    if (key === 'm') { p.manaLvl++; p.maxMp += 10; p.mp += 10; p.skillPoints--; }
    if (key === 'l') { p.luckLvl++; p.skillPoints--; }
  }
});
document.addEventListener('keyup', (e) => game.keys[e.key.toLowerCase()] = false);

canvas.addEventListener('mousedown', (e) => {
  if (!game.isPlaying || game.showSkillMenu || game.showForgeMenu) return;
  if (e.button === 0) attackEnemy(e);
});

// 6. FUNGSI MAP (Hanya visual, tembok tidak di-sync)
function generateMap() {
  game.map = [];
  for (let y = 0; y < ROWS; y++) {
    let row = [];
    for (let x = 0; x < COLS; x++) {
      if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) row.push(1);
      else row.push(Math.random() < 0.15 ? 1 : 0);
    }
    game.map.push(row);
  }
  game.player.x = 400; game.player.y = 400; // Harus sama dengan spawn server
}

// 7. INTERAKSI (Kirim sinyal buka peti ke server)
function interact() {
  const p = game.player;
  for (let chest of serverChests) {
    if (!chest.opened && Math.hypot(p.x - chest.x, p.y - chest.y) < 30) {
      socket.emit('openChest', chest.id); // Server yang nentuin isinya!
      return;
    }
  }
}

// 8. TEMPA & SKILL
function craftWeapon(name, cost, minDmg, maxDmg, element, color) {
  const p = game.player;
  if (p.gold < cost) { alert("Gold tidak cukup!"); return; }
  p.gold -= cost;
  p.weapon = { name, minDmg, maxDmg, element, color };
  alert(`🔨 Berhasil menempa ${name}!`);
}

// 9. UPDATE
function update(dt) {
  if (!game.isPlaying || game.showSkillMenu || game.showForgeMenu) return;
  const p = game.player;
  if (game.attackCooldown > 0) game.attackCooldown -= dt;
  if (p.invincibleTimer > 0) p.invincibleTimer -= dt;

  // Gerak & Kirim ke Server
  let dx = 0, dy = 0;
  if (game.keys['w'] || game.keys['arrowup'])    dy -= 1;
  if (game.keys['s'] || game.keys['arrowdown'])  dy += 1;
  if (game.keys['a'] || game.keys['arrowleft'])  dx -= 1;
  if (game.keys['d'] || game.keys['arrowright']) dx += 1;

  const len = Math.hypot(dx, dy);
  if (len > 0) {
    p.animTime += dt * 10;
    p.x += (dx / len) * p.speed * dt;
    p.y += (dy / len) * p.speed * dt;
    socket.emit('playerMovement', { x: p.x, y: p.y }); // Kabari server
  } else p.animTime = 0;

  // Kamera
  game.camera.x = Math.max(0, Math.min(COLS*TILE_SIZE - W, p.x - W/2));
  game.camera.y = Math.max(0, Math.min(ROWS*TILE_SIZE - H, p.y - H/2));

  // Cek Tabrakan Monster (Client-side cek biar respon cepat)
  for (let e of serverEnemies) {
    if (Math.hypot(p.x - e.x, p.y - e.y) < 15 && p.invincibleTimer <= 0) {
      p.hp -= 5; p.invincibleTimer = 1.0;
      if (p.hp <= 0) {
        alert("Kamu Mati!"); p.hp = p.maxHp; p.x = 400; p.y = 400;
        socket.emit('playerMovement', { x: p.x, y: p.y });
      }
    }
  }

  // Prompt Teks
  game.promptText = "";
  for (let chest of serverChests) {
    if (!chest.opened && Math.hypot(p.x - chest.x, p.y - chest.y) < 30) game.promptText = "[E] Buka Peti";
  }
}

// 10. RENDER
function render() {
  if (!game.isPlaying) return;
  const p = game.player;
  ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H);

  // Render Map
  const startX = Math.floor(game.camera.x / TILE_SIZE), endX = startX + Math.ceil(W / TILE_SIZE) + 1;
  const startY = Math.floor(game.camera.y / TILE_SIZE), endY = startY + Math.ceil(H / TILE_SIZE) + 1;
  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      if (y < 0 || y >= ROWS || x < 0 || x >= COLS) continue;
      const sx = (x * TILE_SIZE) - game.camera.x, sy = (y * TILE_SIZE) - game.camera.y;
      if (game.map[y][x] === 1) {
        ctx.fillStyle = '#4a4a5a'; ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
        ctx.fillStyle = '#2a2a3a'; ctx.fillRect(sx, sy + 12, TILE_SIZE, 4);
      } else {
        ctx.fillStyle = '#2a2a3a'; ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
        ctx.strokeStyle = '#222230'; ctx.strokeRect(sx, sy, TILE_SIZE, TILE_SIZE);
      }
    }
  }

  // Render Peti (Dari Server)
  for (let chest of serverChests) {
    const sx = chest.x - game.camera.x, sy = chest.y - game.camera.y;
    if (chest.opened) { ctx.fillStyle = '#555'; ctx.fillRect(sx - 6, sy, 12, 8); }
    else {
      ctx.fillStyle = '#fbbf24'; ctx.fillRect(sx - 6, sy - 4, 12, 10);
      ctx.fillStyle = '#d97706'; ctx.fillRect(sx - 6, sy - 6, 12, 3);
    }
  }

  // Render Pemain Lain
  for (const id in otherPlayers) {
    const op = otherPlayers[id];
    const sx = op.x - game.camera.x, sy = op.y - game.camera.y;
    ctx.fillStyle = op.color; ctx.fillRect(sx - 7, sy - 7, 14, 14);
    ctx.fillStyle = '#000'; ctx.fillRect(sx - 3, sy - 2, 2, 2); ctx.fillRect(sx + 1, sy - 2, 2, 2);
  }

  // Render Player
  const px = p.x - game.camera.x, py = p.y - game.camera.y;
  const bob = Math.sin(p.animTime) * 2;
  if (p.invincibleTimer <= 0 || Math.floor(p.invincibleTimer * 10) % 2 === 0) {
    ctx.fillStyle = p.color; ctx.fillRect(px - p.size/2, py - p.size/2 + bob, p.size, p.size);
    ctx.fillStyle = p.weapon.color; ctx.fillRect(px + 6, py - 2 + bob, 8, 4);
  }

  // Render Musuh (Dari Server)
  for (const e of serverEnemies) {
    const sx = e.x - game.camera.x, sy = e.y - game.camera.y;
    ctx.fillStyle = '#ef4444'; ctx.fillRect(sx - e.size/2, sy - e.size/2, e.size, e.size);
    // HP Bar
    ctx.fillStyle = '#000'; ctx.fillRect(sx - 8, sy - e.size/2 - 6, 16, 3);
    ctx.fillStyle = '#ef4444'; ctx.fillRect(sx - 8, sy - e.size/2 - 6, 16 * (e.hp/e.maxHp), 3);
  }

  // ================= UI =================
  ctx.textAlign = 'left'; ctx.font = 'bold 12px monospace';
  ctx.fillStyle = '#fff'; ctx.fillText(`Lv.${p.level}`, 10, 20);
  ctx.fillStyle = '#000'; ctx.fillRect(50, 10, 80, 10); ctx.fillStyle = '#e84a3a'; ctx.fillRect(50, 10, (p.hp/p.maxHp)*80, 10);
  ctx.fillStyle = '#000'; ctx.fillRect(50, 22, 80, 10); ctx.fillStyle = '#4a5ae8'; ctx.fillRect(50, 22, (p.mp/p.maxMp)*80, 10);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#fbbf24'; ctx.fillText(`💰 ${p.gold}g`, W - 10, 20);
  ctx.fillStyle = '#94a3b8'; ctx.fillText(`🪨 ${p.ore} Ore`, W - 10, 32);
  ctx.fillStyle = '#f87171'; ctx.fillText(`⚔️ ${p.weapon.name}`, W - 10, 44);
  
  ctx.fillStyle = '#111'; ctx.fillRect(0, H - 6, W, 6); ctx.fillStyle = '#fbbf24'; ctx.fillRect(0, H - 6, (p.xp/p.xpNext)*W, 6);

  if (game.promptText) {
    ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(W/2 - 70, H - 40, 140, 20);
    ctx.fillStyle = '#fbbf24'; ctx.textAlign = 'center'; ctx.fillText(game.promptText, W/2, H - 26);
  }
}

// FUNGSI PENDUKUNG
function attackEnemy(mouseEvent) {
  if (game.attackCooldown > 0) return;
  const rect = canvas.getBoundingClientRect();
  const clickX = (mouseEvent.clientX - rect.left) * (W / rect.width) + game.camera.x;
  const clickY = (mouseEvent.clientY - rect.top) * (H / rect.height) + game.camera.y;
  
  for (let e of serverEnemies) {
    if (Math.hypot(clickX - e.x, clickY - e.y) < 20 && Math.hypot(game.player.x - e.x, game.player.y - e.y) < 60) {
      socket.emit('playerAttack', e.id); // Kirim perintah serang ke server!
      game.attackCooldown = 0.3;
      break;
    }
  }
}

function gainXP(amount) {
  game.player.xp += amount;
  if (game.player.xp >= game.player.xpNext) {
    game.player.xp -= game.player.xpNext;
    game.player.level++; game.player.maxHp += 20; game.player.maxMp += 10;
    game.player.xpNext = Math.floor(game.player.xpNext * 1.5);
    game.player.hp = game.player.maxHp; game.player.mp = game.player.maxMp;
    game.player.skillPoints++;
  }
}

// GAME LOOP
let lastTime = performance.now();
function gameLoop(now) {
  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);