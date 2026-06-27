// ===== LUDO GAME ENGINE WITH P2P SYNC =====
const CELL = 15; // 15x15 grid
const COLORS = { red: '#ef4444', blue: '#3b82f6', green: '#22c55e', yellow: '#eab308' };
const LIGHT = { red: '#fca5a5', blue: '#93c5fd', green: '#86efac', yellow: '#fde047' };
const BG_QUAD = { red: '#fecaca', blue: '#bfdbfe', green: '#bbf7d0', yellow: '#fef08a' };

// Outer track: 52 cells as [row, col] on a 15x15 grid, clockwise
const TRACK = [
  [6,1],[6,2],[6,3],[6,4],[6,5],
  [5,6],[4,6],[3,6],[2,6],[1,6],[0,6],
  [0,7],[0,8],
  [1,8],[2,8],[3,8],[4,8],[5,8],
  [6,9],[6,10],[6,11],[6,12],[6,13],[6,14],
  [7,14],[8,14],
  [8,13],[8,12],[8,11],[8,10],[8,9],
  [9,8],[10,8],[11,8],[12,8],[13,8],[14,8],
  [14,7],[14,6],
  [13,6],[12,6],[11,6],[10,6],[9,6],
  [8,5],[8,4],[8,3],[8,2],[8,1],[8,0],
  [7,0],[6,0]
];

// Home stretch for each color (6 cells toward center)
const HOME_STRETCH = {
  red:    [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],
  blue:   [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]],
  green:  [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],
  yellow: [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]]
};

// Track index where each color ENTERS the board (on rolling 6 from base)
const START_IDX = { red: 0, green: 13, blue: 26, yellow: 39 };
// Track index AFTER which a color enters home stretch
// Safe spots (star positions + start positions)
const SAFE_SPOTS = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

// Base positions for pieces in home base (pixel offsets computed later)
const BASE_POS = {
  red:    [[2,2],[2,3],[3,2],[3,3]],
  green:  [[2,11],[2,12],[3,11],[3,12]],
  yellow: [[11,2],[11,3],[12,2],[12,3]],
  blue:   [[11,11],[11,12],[12,11],[12,12]]
};

// ===== DOM =====
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const lobbyLoading = document.getElementById('lobby-loading');
const lobbyHost = document.getElementById('lobby-host');
const lobbyShare = document.getElementById('lobby-share');
const lobbyJoin = document.getElementById('lobby-join');
const createGameBtn = document.getElementById('create-game-btn');
const joinGameBtn = document.getElementById('join-game-btn');
const shareLinkInput = document.getElementById('share-link');
const copyLinkBtn = document.getElementById('copy-link-btn');
const rollDiceBtn = document.getElementById('roll-dice-btn');
const diceFace = document.getElementById('dice-face');
const diceMsg = document.getElementById('dice-msg');
const turnIndicator = document.getElementById('turn-indicator');
const canvas = document.getElementById('ludo-board');
const ctx = canvas.getContext('2d');

// Chat DOM
const chatToggleBtn = document.getElementById('chat-toggle-btn');
const chatDrawer = document.getElementById('chat-drawer');
const chatOverlay = document.getElementById('chat-overlay');
const chatCloseBtn = document.getElementById('chat-close-btn');
const chatMessagesArea = document.getElementById('ludo-chat-messages');
const chatForm = document.getElementById('ludo-chat-form');
const chatInput = document.getElementById('ludo-chat-input');
const gifToggleBtn = document.getElementById('gif-toggle-btn');
const gifPickerArea = document.getElementById('gif-picker-area');
const gifSearch = document.getElementById('gif-search');
const gifResults = document.getElementById('gif-results');
const chatBadge = document.getElementById('chat-badge');

let peer = null, conn = null, isHost = false;
let myColor = 'red', oppColor = 'blue';
let cellSize = 0;

// Game State
let state = {
  turn: 'red', // whose turn
  dice: 0,
  rolled: false, // has current player rolled?
  consecutiveRolls: 0, // max 2 extra rolls allowed
  pieces: {
    red: [-1,-1,-1,-1],   // -1=base, 0-50=track, 51-56=home stretch, 57=HOME
    blue: [-1,-1,-1,-1]
  },
  winner: null
};

// ===== PEER CONNECTION =====
function initPeer() {
  lobbyLoading.classList.remove('hidden');
  peer = new Peer({ 
      debug: 2,
      config: {
          iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
              { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
              { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" }
          ]
      }
  });

  peer.on('open', () => {
    lobbyLoading.classList.add('hidden');
    const hash = location.hash.substring(1);
    if (hash) {
      isHost = false; myColor = 'blue'; oppColor = 'red';
      lobbyJoin.classList.remove('hidden');
    } else {
      isHost = true; myColor = 'red'; oppColor = 'blue';
      lobbyHost.classList.remove('hidden');
    }
  });

  peer.on('connection', c => {
    if (isHost) { 
        if (conn && conn.open) {
            console.warn("Blocked a trespasser from joining a full room.");
            c.on('open', () => {
                c.send({ type: 'error', message: 'Room is already full.' });
                setTimeout(() => c.close(), 500);
            });
            return;
        }
        conn = c; 
        setupConn(); 
        conn.on('open', () => startGame()); 
    }
  });

  peer.on('error', e => { alert('Connection error: ' + e.message); });
  
  peer.on('disconnected', () => {
      console.log('Peer disconnected from server, attempting reconnect...');
      peer.reconnect();
  });
}

let reconnectInterval = null;
let reconnectAttempts = 0;

function handleDisconnection() {
    showToast('Connection lost.');
    if (isHost) {
        conn = null;
        document.getElementById('reconnect-overlay').classList.remove('hidden');
        document.getElementById('reconnect-message').textContent = 'Waiting for partner to reconnect...';
        document.getElementById('reconnect-cancel-btn').classList.remove('hidden');
    } else {
        document.getElementById('reconnect-overlay').classList.remove('hidden');
        document.getElementById('reconnect-message').textContent = 'Reconnecting to partner...';
        document.getElementById('reconnect-cancel-btn').classList.remove('hidden');
        
        reconnectAttempts = 0;
        const hostId = location.hash.substring(1);
        
        if (reconnectInterval) clearInterval(reconnectInterval);
        reconnectInterval = setInterval(() => {
            reconnectAttempts++;
            if (reconnectAttempts > 20) {
                clearInterval(reconnectInterval);
                document.getElementById('reconnect-message').textContent = 'Reconnection failed.';
                document.getElementById('reconnect-spinner').classList.add('hidden');
                return;
            }
            if (!conn || !conn.open) {
                console.log('Attempting reconnect to host...', hostId);
                conn = peer.connect(hostId);
                setupConn();
            } else {
                clearInterval(reconnectInterval);
            }
        }, 3000);
    }
}

function setupConn() {
  conn.on('open', () => {
      document.getElementById('reconnect-overlay').classList.add('hidden');
      if (reconnectInterval) {
          clearInterval(reconnectInterval);
          reconnectInterval = null;
          showToast('Reconnected successfully!');
      }
      if (isHost) {
          setTimeout(() => sendState(), 500);
      }
  });

  conn.on('data', d => {
    if (d.type === 'error') {
        alert(d.message);
        window.location.href = 'ludo.html';
        return;
    }
    if (d.type === 'state') { state = d.state; onStateUpdate(); }
    if (d.type === 'start') startGame();
    if (d.type === 'chat') handlePeerChat(d);
    if (d.type === 'dice') handlePeerDice(d.value);
    if (d.type === 'move') handlePeerMove(d.color, d.idx, d.dice, d.startPos);
  });
  conn.on('close', () => {
      handleDisconnection();
  });
  conn.on('error', () => {
      handleDisconnection();
  });
}

function sendState() {
  if (conn && conn.open) conn.send({ type: 'state', state });
}

// ===== LOBBY =====
createGameBtn.addEventListener('click', () => {
  lobbyHost.classList.add('hidden');
  lobbyShare.classList.remove('hidden');
  const url = location.origin + location.pathname + '#' + peer.id;
  shareLinkInput.value = url;
});

copyLinkBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(shareLinkInput.value).then(() => {
    copyLinkBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
    setTimeout(() => { copyLinkBtn.innerHTML = '<i class="fa-solid fa-copy"></i>'; }, 1500);
  });
});

joinGameBtn.addEventListener('click', () => {
  const hostId = location.hash.substring(1);
  joinGameBtn.disabled = true;
  joinGameBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Connecting...';
  conn = peer.connect(hostId);
  setupConn();
  conn.on('open', () => {
    conn.send({ type: 'start' });
    startGame();
  });
});

function startGame() {
  lobbyScreen.classList.remove('active');
  gameScreen.classList.add('active');
  document.getElementById('label-red').textContent = myColor === 'red' ? 'You' : 'Partner';
  document.getElementById('label-blue').textContent = myColor === 'blue' ? 'You' : 'Partner';
  resizeBoard();
  onStateUpdate();
}

// ===== BOARD RENDERING =====
function resizeBoard() {
  const wrapper = document.querySelector('.board-wrapper');
  const maxW = wrapper.clientWidth - 16;
  const maxH = wrapper.clientHeight - 16;
  const size = Math.min(maxW, maxH, 500);
  canvas.width = size; canvas.height = size;
  cellSize = size / CELL;
  drawBoard();
}
window.addEventListener('resize', () => { if (gameScreen.classList.contains('active')) resizeBoard(); });

function drawBoard() {
  const s = cellSize;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Board background
  ctx.fillStyle = '#fefce8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Quadrant backgrounds
  drawQuad(0, 0, 6, 6, BG_QUAD.red);
  drawQuad(9, 0, 6, 6, BG_QUAD.green);
  drawQuad(0, 9, 6, 6, BG_QUAD.yellow);
  drawQuad(9, 9, 6, 6, BG_QUAD.blue);

  // Center home triangle
  drawCenterHome();

  // Grid lines for track
  drawTrackCells();

  // Home stretches
  for (const color of ['red','green','blue','yellow']) {
    HOME_STRETCH[color].forEach(([r,c]) => {
      ctx.fillStyle = LIGHT[color];
      ctx.fillRect(c*s, r*s, s, s);
      ctx.strokeStyle = '#d1d5db';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(c*s, r*s, s, s);
    });
  }

  // Safe spots (stars)
  SAFE_SPOTS.forEach(idx => {
    const [r,c] = TRACK[idx];
    drawStar(c*s + s/2, r*s + s/2, s*0.3, '#f59e0b');
  });

  // Start arrows
  drawStartArrow('red'); drawStartArrow('blue');

  // Base circles
  for (const color of ['red','blue']) {
    BASE_POS[color].forEach(([r,c]) => {
      ctx.beginPath();
      ctx.arc(c*s+s/2, r*s+s/2, s*0.35, 0, Math.PI*2);
      ctx.fillStyle = LIGHT[color];
      ctx.fill();
      ctx.strokeStyle = COLORS[color];
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }
  // Gray out unused colors
  for (const color of ['green','yellow']) {
    ctx.fillStyle = 'rgba(200,200,200,0.5)';
    const bp = BASE_POS[color];
    const minR = Math.min(...bp.map(p=>p[0]));
    const minC = Math.min(...bp.map(p=>p[1]));
    ctx.fillRect(minC*s-s*0.5, minR*s-s*0.5, s*3, s*3);
  }

  // Draw pieces
  drawPieces();
}

function drawQuad(col, row, w, h, color) {
  const s = cellSize;
  ctx.fillStyle = color;
  ctx.fillRect(col*s, row*s, w*s, h*s);
  ctx.strokeStyle = '#9ca3af';
  ctx.lineWidth = 2;
  ctx.strokeRect(col*s, row*s, w*s, h*s);
}

function drawCenterHome() {
  const s = cellSize;
  const cx = 7.5*s, cy = 7.5*s, r = 1.5*s;
  // Draw colored triangles pointing to center
  const dirs = [
    { color: COLORS.red, pts: [[6*s,6*s],[9*s,6*s],[7.5*s,7.5*s]] },
    { color: COLORS.green, pts: [[9*s,6*s],[9*s,9*s],[7.5*s,7.5*s]] },
    { color: COLORS.blue, pts: [[6*s,9*s],[9*s,9*s],[7.5*s,7.5*s]] },
    { color: COLORS.yellow, pts: [[6*s,6*s],[6*s,9*s],[7.5*s,7.5*s]] }
  ];
  dirs.forEach(d => {
    ctx.beginPath();
    ctx.moveTo(d.pts[0][0], d.pts[0][1]);
    ctx.lineTo(d.pts[1][0], d.pts[1][1]);
    ctx.lineTo(d.pts[2][0], d.pts[2][1]);
    ctx.closePath();
    ctx.fillStyle = d.color;
    ctx.globalAlpha = 0.6;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
  });
}

function drawTrackCells() {
  const s = cellSize;
  TRACK.forEach(([r,c]) => {
    ctx.fillStyle = '#fff';
    ctx.fillRect(c*s, r*s, s, s);
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(c*s, r*s, s, s);
  });
  // Color the start cells
  for (const color of ['red','green','blue','yellow']) {
    const [r,c] = TRACK[START_IDX[color]];
    ctx.fillStyle = LIGHT[color];
    ctx.fillRect(c*s, r*s, s, s);
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(c*s, r*s, s, s);
  }
}

function drawStar(cx, cy, r, color) {
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i*4*Math.PI/5) - Math.PI/2;
    const method = i === 0 ? 'moveTo' : 'lineTo';
    ctx[method](cx + r*Math.cos(a), cy + r*Math.sin(a));
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.7;
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawStartArrow(color) {
  const s = cellSize;
  const [r,c] = TRACK[START_IDX[color]];
  ctx.fillStyle = COLORS[color];
  ctx.font = `bold ${s*0.5}px Outfit`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('▶', c*s+s/2, r*s+s/2);
}



function drawPieces() {
  const s = cellSize;
  for (const color of ['red','blue']) {
    // Count pieces at each position for stacking
    const posCount = {};
    state.pieces[color].forEach((p,i) => {
      const key = p.toString();
      if (!posCount[key]) posCount[key] = [];
      posCount[key].push(i);
    });

    Object.entries(posCount).forEach(([posStr, indices]) => {
      const posVal = parseInt(posStr);
      indices.forEach((pieceIdx, stackIdx) => {
        let { x, y } = getPieceXY(color, pieceIdx);
        // Offset for stacking
        if (indices.length > 1) {
          const offsets = [[-4,-4],[4,-4],[-4,4],[4,4]];
          x += offsets[stackIdx][0];
          y += offsets[stackIdx][1];
        }
        const radius = s * 0.32;
        // Shadow
        ctx.beginPath();
        ctx.arc(x+1, y+2, radius, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fill();
        // Piece
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI*2);
        const grad = ctx.createRadialGradient(x-2, y-3, 1, x, y, radius);
        grad.addColorStop(0, LIGHT[color]);
        grad.addColorStop(1, COLORS[color]);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Piece number
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${s*0.28}px Outfit`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(pieceIdx+1, x, y+1);

        // Highlight movable pieces
        if (state.turn === myColor && state.rolled && color === myColor) {
          if (canMovePiece(color, pieceIdx, state.dice)) {
            ctx.beginPath();
            ctx.arc(x, y, radius+4, 0, Math.PI*2);
            ctx.strokeStyle = '#facc15';
            ctx.lineWidth = 2.5;
            ctx.setLineDash([4,3]);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      });
    });
  }
}

function getPieceXY(color, pieceIdx) {
  const s = cellSize;
  let posVal = state.pieces[color][pieceIdx];

  if (animState && animState.color === color && animState.idx === pieceIdx) {
    posVal = animState.pos;
  }

  if (posVal === -1) {
    const [br, bc] = BASE_POS[color][pieceIdx];
    return { x: bc*s+s/2, y: br*s+s/2 };
  }
  if (posVal >= 57) {
    // HOME
    return { x: 7.5*s, y: 7.5*s };
  }
  if (posVal >= 51) {
    const hsIdx = posVal - 51;
    const [r,c] = HOME_STRETCH[color][hsIdx];
    return { x: c*s+s/2, y: r*s+s/2 };
  }
  const absIdx = (START_IDX[color] + posVal) % 52;
  const [r,c] = TRACK[absIdx];
  return { x: c*s+s/2, y: r*s+s/2 };
}

// ===== GAME LOGIC =====
function canMovePiece(color, idx, dice) {
  const pos = state.pieces[color][idx];
  if (pos === -1) return dice === 6; // Need 6 to leave base
  if (pos >= 57) return false; // Already home
  const newPos = pos + dice;
  if (newPos > 57) return false; // Can't overshoot home
  // Can't land on own piece (unless stacking in base)
  const targetPos = newPos;
  for (let i = 0; i < 4; i++) {
    if (i !== idx && state.pieces[color][i] === targetPos && targetPos < 51) return false;
  }
  return true;
}

function hasAnyMove(color, dice) {
  for (let i = 0; i < 4; i++) {
    if (canMovePiece(color, i, dice)) return true;
  }
  return false;
}

// Animation helper vars
let isAnimating = false;
let isDiceAnimating = false;
let animState = null; // { color, idx, posVal }

async function movePiece(color, idx, dice) {
  if (isAnimating) return; // Prevent concurrent processing
  const pos = state.pieces[color][idx];

  // Send move to opponent so they can animate cell-by-cell too
  if (conn && conn.open) conn.send({ type: 'move', color, idx, dice, startPos: pos });

  if (pos === -1 && dice === 6) {
    await animateStepByStep(color, idx, pos, 0);
    resolveMoveRules(color, idx, 0, dice);
  } else {
    const targetPos = pos + dice;
    await animateStepByStep(color, idx, pos, targetPos);
    resolveMoveRules(color, idx, targetPos, dice);
  }
}

async function animateStepByStep(color, idx, startPos, endPos) {
  isAnimating = true;
  // Temporary state for the animating piece
  animState = { color, idx, pos: startPos };

  if (startPos === -1) {
    // Jump straight to 0 visually
    animState.pos = 0;
    drawBoard();
    await delay(300);
  } else {
    // Move step by step
    for (let p = startPos + 1; p <= endPos; p++) {
      animState.pos = p;
      drawBoard();
      await delay(200); 
    }
  }
  
  isAnimating = false;
  animState = null;
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function handlePeerMove(color, idx, dice, startPos) {
  // Wait for any ongoing animation to finish first
  while (isAnimating) {
    await delay(50);
  }
  const pos = startPos !== undefined ? startPos : state.pieces[color][idx];
  let targetPos;
  if (pos === -1 && dice === 6) {
    targetPos = 0;
  } else {
    targetPos = pos + dice;
  }
  await animateStepByStep(color, idx, pos, targetPos);
  // Update position locally in case state sync hasn't arrived yet
  state.pieces[color][idx] = targetPos;
  drawBoard();
}

function resolveMoveRules(color, idx, finalPos, dice) {
  state.pieces[color][idx] = finalPos;
  let gotCapture = false;

  if (finalPos === 0 && dice === 6) {
    showToast(`${color === myColor ? 'You' : 'Partner'} entered a piece!`);
  }

  if (finalPos > 0 && finalPos < 51) {
    const absIdx = (START_IDX[color] + finalPos) % 52;
    if (!SAFE_SPOTS.has(absIdx)) {
      const opp = color === 'red' ? 'blue' : 'red';
      for (let i = 0; i < 4; i++) {
        const oppPos = state.pieces[opp][i];
        if (oppPos >= 0 && oppPos < 51) {
          const oppAbs = (START_IDX[opp] + oppPos) % 52;
          if (oppAbs === absIdx) {
            state.pieces[opp][i] = -1; // capture
            gotCapture = true;
            showToast(`💥 ${color === myColor ? 'You' : 'Partner'} captured a piece!`);
          }
        }
      }
    }
  }
  
  if (finalPos === 57) showToast(`🏠 Piece reached home!`);
  if (state.pieces[color].every(p => p >= 57)) state.winner = color;

  // Next turn logic (Max 2 consecutive extra rolls)
  if ((dice === 6 || gotCapture) && state.consecutiveRolls < 2) {
    state.consecutiveRolls++;
    showToast('Extra Roll! 🎲');
  } else {
    // End sequence, turn changes
    state.consecutiveRolls = 0;
    state.turn = color === 'red' ? 'blue' : 'red';
  }

  state.rolled = false;
  state.dice = 0;

  sendState();
  onStateUpdate();
}

function rollDice() {
  if (state.turn !== myColor || state.rolled) return;
  rollDiceBtn.disabled = true;
  rollDiceBtn.classList.add('rolling');
  isDiceAnimating = true;

  const val = Math.floor(Math.random() * 6) + 1;
  // Animate dice
  let count = 0;
  const interval = setInterval(() => {
    diceFace.textContent = Math.floor(Math.random()*6)+1;
    count++;
    if (count > 10) {
      clearInterval(interval);
      diceFace.textContent = val;
      rollDiceBtn.classList.remove('rolling');
      isDiceAnimating = false;
      state.dice = val;
      state.rolled = true;

      // Send dice roll to opponent so they see the value
      if (conn && conn.open) conn.send({ type: 'dice', value: val });

      if (!hasAnyMove(myColor, val)) {
        showToast('No moves available!');
        setTimeout(() => {
          if (val === 6 && state.consecutiveRolls < 2) {
            state.consecutiveRolls++;
          } else {
            state.consecutiveRolls = 0;
            state.turn = myColor === 'red' ? 'blue' : 'red';
          }
          state.rolled = false;
          state.dice = 0;
          sendState();
          onStateUpdate();
        }, 1000);
      } else {
        // Count movable pieces
        const movable = [];
        for (let i = 0; i < 4; i++) {
          if (canMovePiece(myColor, i, val)) movable.push(i);
        }
        sendState();
        drawBoard();
        if (movable.length === 1) {
          diceMsg.textContent = 'Auto-moving...';
          const attemptAutoMove = () => {
            if (isAnimating) setTimeout(attemptAutoMove, 100);
            else movePiece(myColor, movable[0], val);
          };
          setTimeout(attemptAutoMove, 400);
        } else {
          diceMsg.textContent = 'Tap a piece to move';
        }
      }
    }
  }, 60);
}

rollDiceBtn.addEventListener('click', rollDice);

function handlePeerDice(value) {
  // Animate the dice on the opponent's screen
  rollDiceBtn.classList.add('rolling');
  isDiceAnimating = true;
  let count = 0;
  const interval = setInterval(() => {
    diceFace.textContent = Math.floor(Math.random() * 6) + 1;
    count++;
    if (count > 10) {
      clearInterval(interval);
      diceFace.textContent = value;
      rollDiceBtn.classList.remove('rolling');
      isDiceAnimating = false;
      diceMsg.textContent = 'Partner rolled!';
    }
  }, 60);
}

// ===== PIECE SELECTION VIA CANVAS TAP =====
canvas.addEventListener('click', e => {
  if (state.turn !== myColor || !state.rolled || state.dice === 0) return;

  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);

  // Find closest movable piece
  let bestIdx = -1, bestDist = Infinity;
  for (let i = 0; i < 4; i++) {
    if (canMovePiece(myColor, i, state.dice)) {
      const pos = getPieceXY(myColor, i);
      const dist = Math.hypot(pos.x - x, pos.y - y);
      if (dist < cellSize * 0.8 && dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
  }

  if (bestIdx >= 0) {
    movePiece(myColor, bestIdx, state.dice);
  }
});

// Touch support
canvas.addEventListener('touchend', e => {
  e.preventDefault();
  const touch = e.changedTouches[0];
  const clickEvent = new MouseEvent('click', {
    clientX: touch.clientX, clientY: touch.clientY
  });
  canvas.dispatchEvent(clickEvent);
});

// ===== UI UPDATES =====
function onStateUpdate() {
  drawBoard();
  updateUI();
  if (state.winner) showWin();
}

function updateUI() {
  if (isDiceAnimating) return; // Don't interrupt dice animation
  
  const isMyTurn = state.turn === myColor;
  rollDiceBtn.disabled = !isMyTurn || state.rolled;
  turnIndicator.textContent = isMyTurn ? 'Your Turn' : "Partner's Turn";
  turnIndicator.classList.toggle('your-turn', isMyTurn);

  const redInfo = document.getElementById('player-info-red');
  const blueInfo = document.getElementById('player-info-blue');
  redInfo.classList.toggle('active-player', state.turn === 'red');
  blueInfo.classList.toggle('active-player', state.turn === 'blue');

  document.getElementById('home-red').textContent = state.pieces.red.filter(p => p>=57).length + '/4';
  document.getElementById('home-blue').textContent = state.pieces.blue.filter(p => p>=57).length + '/4';

  if (isMyTurn && !state.rolled) {
    diceMsg.textContent = 'Tap to roll!';
    diceFace.textContent = '🎲';
  } else if (isMyTurn && state.rolled) {
    diceMsg.textContent = 'Tap a piece';
  } else {
    if (state.rolled && state.dice) {
      diceMsg.textContent = 'Partner rolled!';
      diceFace.textContent = state.dice;
    } else {
      diceMsg.textContent = 'Waiting...';
      diceFace.textContent = '⏳';
    }
  }
}

function showToast(msg) {
  const t = document.getElementById('game-toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 2500);
}

function showWin() {
  if (document.querySelector('.win-overlay')) return;
  const isMe = state.winner === myColor;
  const overlay = document.createElement('div');
  overlay.className = 'win-overlay';
  overlay.innerHTML = `
    <div class="win-card">
      <div class="win-emoji">${isMe ? '🎉' : '💔'}</div>
      <h2>${isMe ? 'You Won!' : 'Partner Won!'}</h2>
      <p>${isMe ? 'Amazing game, champion! ❤️' : 'Better luck next time! ❤️'}</p>
      <button class="btn-primary" onclick="location.href='ludo.html'">
        <i class="fa-solid fa-rotate-right"></i> Play Again
      </button>
    </div>
  `;
  document.body.appendChild(overlay);
}

// ===== CHAT & GIF SYSTEM =====
let unreadMessages = 0;

function toggleChat() {
  const isOpen = chatDrawer.classList.contains('open');
  if (isOpen) {
    chatDrawer.classList.remove('open');
    setTimeout(() => {
      chatOverlay.classList.remove('active');
      chatOverlay.classList.add('hidden');
      chatDrawer.classList.add('hidden');
    }, 300);
  } else {
    chatOverlay.classList.remove('hidden');
    chatDrawer.classList.remove('hidden');
    chatOverlay.classList.add('active');
    setTimeout(() => chatDrawer.classList.add('open'), 10);
    unreadMessages = 0;
    if (chatBadge) {
        chatBadge.classList.add('hidden');
    }
    chatMessagesArea.scrollTop = chatMessagesArea.scrollHeight;
  }
}

if (chatToggleBtn) chatToggleBtn.addEventListener('click', toggleChat);
if (chatCloseBtn) chatCloseBtn.addEventListener('click', toggleChat);
if (chatOverlay) chatOverlay.addEventListener('click', toggleChat);

function appendChatMsg(text, gifUrl, isSelf) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-msg ${isSelf ? 'self' : 'other'}`;
  if (text) {
    const textNode = document.createTextNode(text);
    msgDiv.appendChild(textNode);
  }
  if (gifUrl) {
    const img = document.createElement('img');
    img.src = gifUrl;
    msgDiv.appendChild(img);
  }
  chatMessagesArea.appendChild(msgDiv);
  chatMessagesArea.scrollTop = chatMessagesArea.scrollHeight;

  if (!isSelf && !chatDrawer.classList.contains('open')) {
    unreadMessages++;
    if (chatBadge) {
        chatBadge.textContent = unreadMessages;
        chatBadge.classList.remove('hidden');
    }
    if (chatToggleBtn) {
        chatToggleBtn.style.transform = 'scale(1.2)';
        setTimeout(() => chatToggleBtn.style.transform = '', 200);
    }
  }
}

function handlePeerChat(data) {
  appendChatMsg(data.text, data.gif, false);
}

if (chatForm) {
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = chatInput.value.trim();
      if (!text) return;
      appendChatMsg(text, null, true);
      if (conn && conn.open) conn.send({ type: 'chat', text: text, gif: null });
      chatInput.value = '';
    });
}

// TENOR API
const TENOR_KEY = 'LIVDSRZULELA';
let gifDebounce;

if (gifToggleBtn) {
    gifToggleBtn.addEventListener('click', () => {
      gifPickerArea.classList.toggle('hidden');
      if (!gifPickerArea.classList.contains('hidden')) {
        gifSearch.focus();
        if (gifResults.innerHTML.includes('Loading')) fetchGifs('excited');
      }
    });
}

if (gifSearch) {
    gifSearch.addEventListener('input', () => {
      clearTimeout(gifDebounce);
      const q = gifSearch.value.trim() || 'excited';
      gifDebounce = setTimeout(() => fetchGifs(q), 500);
    });
}

async function fetchGifs(query) {
  if (!gifResults) return;
  gifResults.innerHTML = '<div class="gif-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>';
  try {
    const res = await fetch(`https://g.tenor.com/v1/search?q=${encodeURIComponent(query)}&key=${TENOR_KEY}&limit=20`);
    const data = await res.json();
    gifResults.innerHTML = '';
    if (data.results && data.results.length > 0) {
      data.results.forEach(gif => {
        const url = gif.media[0].tinygif.url;
        const img = document.createElement('img');
        img.className = 'gif-result-img';
        img.src = url;
        img.addEventListener('click', () => sendGif(url));
        gifResults.appendChild(img);
      });
    } else {
      gifResults.innerHTML = '<div class="gif-loading">No GIFs found</div>';
    }
  } catch (err) {
    gifResults.innerHTML = '<div class="gif-loading">Failed to load GIFs</div>';
  }
}

function sendGif(url) {
  appendChatMsg(null, url, true);
  if (conn && conn.open) conn.send({ type: 'chat', text: null, gif: url });
  if (gifPickerArea) gifPickerArea.classList.add('hidden');
  if (chatInput) chatInput.focus();
}

// ===== INIT =====
initPeer();
