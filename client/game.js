// 1. SETUP CANVAS
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false; 
const W = canvas.width;
const H = canvas.height;

// MAP JAUH LEBIH LUAS! (50 x 50 kotak)
const TILE_SIZE = 16;
const COLS = 50;
const ROWS = 50;

// 2. STATE GAME
const game = {
  player: {
    x: W / 2, y: H / 2,
    size: 14,
    speed: 120, 
    color: '#fbbf24',
    level: 1,
    hp: 100, maxHp: 100,
    mp: 50, maxMp: 50,
    xp: 0, xpNext: 20,
    invincibleTimer: 0,
    animTime: 0, // Buat animasi jalan
    // INVENTORY
    gold: 0, ore: 0, potions: 2, medkits: 0,
    // SKILL POINTS
    skillPoints: 1,
    healthLvl: 0,
    manaLvl: 0,
    luckLvl: 0
  },
  keys: {},
  enemies: [],
  chests: [],
  map: [],
  spawnTimer: 0,
  attackCooldown: 0,
  promptText: "",
  
  // KAMERA (Biar map berasa luas)
  camera: { x: 0, y: 0 },
  
  // UI MENU SKILL
  showSkillMenu: false
};

// 3. INPUT
document.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  game.keys[key] = true;
  
  if (key === 'e') openNearestChest();
  if (key === 't') game.showSkillMenu = !game.showSkillMenu; // T = Buka Skill Tree
  
  // Minum Potion (Tombol 1)
  if (key === '1' && game.player.potions > 0 && game.player.hp < game.player.maxHp) {
    game.player.potions--;
    game.player.hp = Math.min(game.player.maxHp, game.player.hp + 50);
  }
});
document.addEventListener('keyup', (e) => game.keys[e.key.toLowerCase()] = false);
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0 && !game.showSkillMenu) attackEnemy(e);
});

// 4. GENERATE DUNGEON BESAR
function generateDungeon() {
  game.map = [];
  game.chests = [];
  for (let y = 0; y < ROWS; y++) {
    let row = [];
    for (let x = 0; x < COLS; x++) {
      // Pinggir map = tembok
      if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) row.push(1);
      else row.push(0);
    }
    game.map.push(row);
  }
  // Tembok acak (bikin kerasa kaya labirin)
  for (let y = 1; y < ROWS - 1; y++) {
    for (let x = 1; x < COLS - 1; x++) {
      if (Math.random() < 0.15) game.map[y][x] = 1;
    }
  }
  
  // Bersihin area spawn player
  const spawnGX = Math.floor(COLS / 2);
  const spawnGY = Math.floor(ROWS / 2);
  game.player.x = spawnGX * TILE_SIZE;
  game.player.y = spawnGY * TILE_SIZE;
  for (let y = -2; y <= 2; y++) {
    for (let x = -2; x <= 2; x++) {
      game.map[spawnGY + y][spawnGX + x] = 0;
    }
  }

  // Spawn 10 Chest tersebar
  let chestCount = 0;
  while (chestCount < 10) {
    let cx = Math.floor(Math.random() * (COLS - 2)) + 1;
    let cy = Math.floor(Math.random() * (ROWS - 2)) + 1;
    if (game.map[cy][cx] === 0) {
      game.chests.push({ gx: cx, gy: cy, x: cx*TILE_SIZE + TILE_SIZE/2, y: cy*TILE_SIZE + TILE_SIZE/2, opened: false });
      chestCount++;
    }
  }
}

// 5. UPDATE LOGIC
function update(dt) {
  if (game.showSkillMenu) return; // Pause game kalau menu kebuka

  const p = game.player;
  if (game.attackCooldown > 0) game.attackCooldown -= dt;
  if (p.invincibleTimer > 0) p.invincibleTimer -= dt;

  // Gerak
  let dx = 0, dy = 0;
  if (game.keys['w'] || game.keys['arrowup'])    dy -= 1;
  if (game.keys['s'] || game.keys['arrowdown'])  dy += 1;
  if (game.keys['a'] || game.keys['arrowleft'])  dx -= 1;
  if (game.keys['d'] || game.keys['arrowright']) dx += 1;

  const len = Math.hypot(dx, dy);
  if (len > 0) {
    p.animTime += dt * 10; // Animasi jalan
    const moveX = (dx / len) * p.speed * dt;
    const moveY = (dy / len) * p.speed * dt;
    if (!isWall(p.x + moveX, p.y)) p.x += moveX;
    if (!isWall(p.x, p.y + moveY)) p.y += moveY;
  } else {
    p.animTime = 0; // Reset animasi kalau diem
  }

  // KAMERA NGIKUTIN PLAYER
  game.camera.x = p.x - W / 2;
  game.camera.y = p.y - H / 2;
  // Batasi kamera biar ga keluar map
  game.camera.x = Math.max(0, Math.min(COLS * TILE_SIZE - W, game.camera.x));
  game.camera.y = Math.max(0, Math.min(ROWS * TILE_SIZE - H, game.camera.y));

  // Spawn Musuh (Maksimal 10 aja biar ga lag)
  game.spawnTimer -= dt;
  if (game.spawnTimer <= 0 && game.enemies.length < 10) {
    spawnEnemy();
    game.spawnTimer = 2.0;
  }

  // Update Musuh
  for (let i = game.enemies.length - 1; i >= 0; i--) {
    const e = game.enemies[i];
    const angle = Math.atan2(p.y - e.y, p.x - e.x);
    e.animTime = (e.animTime || 0) + dt * 15;
    
    const exMove = Math.cos(angle) * e.speed * dt;
    const eyMove = Math.sin(angle) * e.speed * dt;
    if (!isWall(e.x + exMove, e.y)) e.x += exMove;
    if (!isWall(e.x, e.y + eyMove)) e.y += eyMove;

    if (Math.hypot(p.x - e.x, p.y - e.y) < 15 && p.invincibleTimer <= 0) {
      p.hp -= 5; p.invincibleTimer = 1.0;
      if (p.hp <= 0) {
        alert("Kamu Mati! Mengulang Dungeon Baru...");
        p.hp = p.maxHp; game.enemies = []; generateDungeon();
      }
    }
  }

  // Prompt Peti
  game.promptText = "";
  for (let chest of game.chests) {
    if (!chest.opened && Math.hypot(p.x - chest.x, p.y - chest.y) < 30) {
      game.promptText = "[E] Buka Peti";
    }
  }
}

// 6. RENDER
function render() {
  const p = game.player;
  ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H);

  // Gambar Map (Hanya gambar yang keliatan di kamera biar ga lag)
  const startX = Math.floor(game.camera.x / TILE_SIZE);
  const endX = startX + Math.ceil(W / TILE_SIZE) + 1;
  const startY = Math.floor(game.camera.y / TILE_SIZE);
  const endY = startY + Math.ceil(H / TILE_SIZE) + 1;

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      if (y < 0 || y >= ROWS || x < 0 || x >= COLS) continue;
      
      const screenX = (x * TILE_SIZE) - game.camera.x;
      const screenY = (y * TILE_SIZE) - game.camera.y;

      if (game.map[y][x] === 1) {
        ctx.fillStyle = '#4a4a5a'; ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
        ctx.fillStyle = '#2a2a3a'; ctx.fillRect(screenX, screenY + 12, TILE_SIZE, 4);
      } else {
        ctx.fillStyle = '#2a2a3a'; ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
        ctx.strokeStyle = '#222230'; ctx.strokeRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
      }
    }
  }

  // Gambar Chest
  for (let chest of game.chests) {
    const sx = chest.x - game.camera.x;
    const sy = chest.y - game.camera.y;
    if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue; // Culling

    if (chest.opened) {
      ctx.fillStyle = '#555'; ctx.fillRect(sx - 6, sy, 12, 8);
    } else {
      ctx.fillStyle = '#fbbf24'; ctx.fillRect(sx - 6, sy - 4, 12, 10);
      ctx.fillStyle = '#d97706'; ctx.fillRect(sx - 6, sy - 6, 12, 3);
      ctx.fillStyle = '#fff'; ctx.fillRect(sx - 1, sy - 2, 2, 3);
    }
  }

  // Gambar Musuh (DENGAN ANIMASI SQUISH/BOUNCE)
  for (const e of game.enemies) {
    const sx = e.x - game.camera.x;
    const sy = e.y - game.camera.y;
    
    // Animasi melayang/memantul
    const bounce = Math.abs(Math.sin(e.animTime || 0)) * 4;
    
    ctx.fillStyle = e.color;
    // Gambar musuh dengan tinggi yang berubah (squish effect)
    ctx.fillRect(sx - e.size/2, sy - e.size/2 - bounce, e.size, e.size + bounce);
    
    ctx.fillStyle = '#000';
    ctx.fillRect(sx - 3, sy - 3 - bounce, 2, 2); 
    ctx.fillRect(sx + 1, sy - 3 - bounce, 2, 2);
  }

  // Gambar Player (DENGAN ANIMASI JALAN / BOB)
  const px = p.x - game.camera.x;
  const py = p.y - game.camera.y;
  
  // Animasi naik turun kalau jalan
  const bob = Math.sin(p.animTime) * 2;
  
  if (p.invincibleTimer <= 0 || Math.floor(p.invincibleTimer * 10) % 2 === 0) {
    ctx.fillStyle = p.color;
    ctx.fillRect(px - p.size/2, py - p.size/2 + bob, p.size, p.size);
    // Mata player
    ctx.fillStyle = '#000';
    ctx.fillRect(px - 3, py - 2 + bob, 2, 2);
    ctx.fillRect(px + 1, py - 2 + bob, 2, 2);
  }

  // ================= UI HUD =================
  ctx.fillStyle = '#fff'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'left';
  ctx.fillText(`Lv.${p.level}`, 10, 20);
  ctx.fillStyle = '#000'; ctx.fillRect(50, 10, 80, 10);
  ctx.fillStyle = '#e84a3a'; ctx.fillRect(50, 10, (p.hp/p.maxHp)*80, 10);
  ctx.fillStyle = '#000'; ctx.fillRect(50, 22, 80, 10);
  ctx.fillStyle = '#4a5ae8'; ctx.fillRect(50, 22, (p.mp/p.maxMp)*80, 10);

  // Inventory & Info (Kanan)
  ctx.textAlign = 'right';
  ctx.fillStyle = '#fbbf24'; ctx.fillText(`💰 ${p.gold}g`, W - 10, 20);
  ctx.fillStyle = '#94a3b8'; ctx.fillText(`🪨 ${p.ore} Ore`, W - 10, 32);
  ctx.fillStyle = '#4ade80'; ctx.fillText(`🧪 ${p.potions} Potion [1]`, W - 10, 44);
  
  // Info Skill Point
  if (p.skillPoints > 0) {
    ctx.fillStyle = '#a855f7'; ctx.fillText(`🌟 Skill Point: ${p.skillPoints} [T]`, W - 10, 60);
  } else {
    ctx.fillStyle = '#555'; ctx.fillText(`[T] Skill Tree`, W - 10, 60);
  }

  // XP Bar (Bawah)
  ctx.fillStyle = '#111'; ctx.fillRect(0, H - 6, W, 6);
  ctx.fillStyle = '#fbbf24'; ctx.fillRect(0, H - 6, (p.xp/p.xpNext)*W, 6);

  // Prompt
  if (game.promptText) {
    ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(W/2 - 60, H - 40, 120, 20);
    ctx.fillStyle = '#fbbf24'; ctx.textAlign = 'center'; ctx.fillText(game.promptText, W/2, H - 26);
  }

  // ================= MENU SKILL TREE =================
  if (game.showSkillMenu) {
    ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff'; ctx.font = 'bold 20px monospace';
    ctx.fillText("SKILL TREE [T untuk Tutup]", W/2, 40);
    
    if (p.skillPoints > 0) {
      ctx.fillStyle = '#a855f7'; ctx.font = '14px monospace';
      ctx.fillText(`Sisa Poin: ${p.skillPoints} (Tekan tombol di bawah)`, W/2, 65);
    }

    // Pilihan 1: Health
    ctx.fillStyle = '#e84a3a'; ctx.font = 'bold 14px monospace';
    ctx.fillText(`❤️ HEALTH (Lv.${p.healthLvl})`, W/4, 110);
    ctx.fillStyle = '#fff'; ctx.font = '11px monospace';
    ctx.fillText("Max HP +20", W/4, 130);
    if (p.skillPoints > 0) { ctx.fillStyle = '#fbbf24'; ctx.fillText("[Tekan H]", W/4, 150); }

    // Pilihan 2: Mana
    ctx.fillStyle = '#4a5ae8'; ctx.font = 'bold 14px monospace';
    ctx.fillText(`🔮 MANA (Lv.${p.manaLvl})`, W/2, 110);
    ctx.fillStyle = '#fff'; ctx.font = '11px monospace';
    ctx.fillText("Max MP +10", W/2, 130);
    if (p.skillPoints > 0) { ctx.fillStyle = '#fbbf24'; ctx.fillText("[Tekan M]", W/2, 150); }

    // Pilihan 3: Luck
    ctx.fillStyle = '#4ade80'; ctx.font = 'bold 14px monospace';
    ctx.fillText(`🍀 LUCK (Lv.${p.luckLvl})`, (W/4)*3, 110);
    ctx.fillStyle = '#fff'; ctx.font = '11px monospace';
    ctx.fillText("Loot & Crit +", (W/4)*3, 130);
    if (p.skillPoints > 0) { ctx.fillStyle = '#fbbf24'; ctx.fillText("[Tekan L]", (W/4)*3, 150); }
    
    ctx.fillStyle = '#666'; ctx.font = '10px monospace';
    ctx.fillText("Pilih upgrade dengan menekan H, M, atau L", W/2, H - 30);
  }
}

// 7. FUNGSI PENDUKUNG
function isWall(x, y) {
  const gx = Math.floor(x / TILE_SIZE);
  const gy = Math.floor(y / TILE_SIZE);
  if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) return true;
  return game.map[gy][gx] === 1;
}

function spawnEnemy() {
  let x, y;
  // Spawn di sekitar player (radius 150 pixel) tapi jangan di dalam tembok
  do {
    const angle = Math.random() * Math.PI * 2;
    const dist = 150 + Math.random() * 100;
    x = game.player.x + Math.cos(angle) * dist;
    y = game.player.y + Math.sin(angle) * dist;
  } while (isWall(x, y));

  game.enemies.push({ x, y, size: 12, speed: 35, hp: 20, maxHp: 20, color: '#ef4444', xpDrop: 10, animTime: 0 });
}

function attackEnemy(mouseEvent) {
  if (game.attackCooldown > 0) return;
  const rect = canvas.getBoundingClientRect();
  const clickX = (mouseEvent.clientX - rect.left) * (W / rect.width) + game.camera.x;
  const clickY = (mouseEvent.clientY - rect.top) * (H / rect.height) + game.camera.y;
  
  for (let i = game.enemies.length - 1; i >= 0; i--) {
    const e = game.enemies[i];
    if (Math.hypot(clickX - e.x, clickY - e.y) < 20 && Math.hypot(game.player.x - e.x, game.player.y - e.y) < 60) {
      e.hp -= 10;
      game.attackCooldown = 0.3;
      if (e.hp <= 0) {
        gainXP(e.xpDrop);
        game.player.gold += 5;
        game.enemies.splice(i, 1);
      }
    }
  }
}

function openNearestChest() {
  if (game.showSkillMenu) return;
  const p = game.player;
  for (let chest of game.chests) {
    if (chest.opened) continue;
    if (Math.hypot(p.x - chest.x, p.y - chest.y) < 30) {
      chest.opened = true;
      const roll = Math.random() * 100;
      
      // Luck nambah peluang dapet item bagus
      const luckBonus = p.luckLvl * 5; 
      
      if (roll < (50 - luckBonus)) {
        const g = Math.floor(Math.random() * 20) + 10; p.gold += g;
        alert(`💰 +${g} Gold!`);
      } else if (roll < (80 - luckBonus)) {
        p.potions++; alert(`🧪 +1 Potion Heal!`);
      } else if (roll < (95 - luckBonus)) {
        p.ore += 2; alert(`🪨 +2 Ore Tambang!`);
      } else {
        p.medkits++; alert(`💉 +1 MEDKIT (Revive)!`);
      }
      return;
    }
  }
}

function gainXP(amount) {
  game.player.xp += amount;
  if (game.player.xp >= game.player.xpNext) {
    game.player.xp -= game.player.xpNext;
    game.player.level++;
    game.player.maxHp += 20; game.player.maxMp += 10;
    game.player.xpNext = Math.floor(game.player.xpNext * 1.5);
    game.player.hp = game.player.maxHp; game.player.mp = game.player.maxMp;
    game.player.skillPoints++; // DAPET SKILL POINT!
  }
}

// Hotkey buat nambah skill di dalam menu
document.addEventListener('keydown', (e) => {
  const p = game.player;
  if (game.showSkillMenu && p.skillPoints > 0) {
    if (e.key.toLowerCase() === 'h') { p.healthLvl++; p.maxHp += 20; p.hp += 20; p.skillPoints--; }
    if (e.key.toLowerCase() === 'm') { p.manaLvl++; p.maxMp += 10; p.mp += 10; p.skillPoints--; }
    if (e.key.toLowerCase() === 'l') { p.luckLvl++; p.skillPoints--; }
  }
});

// 8. GAME LOOP
let lastTime = performance.now();
function gameLoop(now) {
  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(gameLoop);
}

generateDungeon();
requestAnimationFrame(gameLoop);