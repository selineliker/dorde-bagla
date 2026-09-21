/* ═══════════════════════════════════════════
   Dörde Bağla — Oyun Mantığı (Client)
   ═══════════════════════════════════════════ */

const socket = io({
  transports: ['polling', 'websocket'],
  upgrade: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 5000,
  timeout: 30000,
});

// ── Bağlantı durumu ───────────────────────
socket.on('connect', () => {
  console.log('✅ Sunucuya bağlandı:', socket.id);

  // Bağlantı göstergesini kaldır
  const banner = document.getElementById('connection-banner');
  if (banner) banner.classList.add('hidden');

  // Otomatik yeniden bağlanma — kayıtlı oda varsa rejoin et
  const saved = sessionStorage.getItem('dordeBaglaRoom');
  if (saved) {
    try {
      const info = JSON.parse(saved);
      console.log('🔄 Odaya yeniden bağlanılıyor:', info.code);
      socket.emit('rejoin-room', info);
    } catch (e) {
      sessionStorage.removeItem('dordeBaglaRoom');
    }
  }
});

socket.on('disconnect', () => {
  console.log('⚠️ Bağlantı koptu, yeniden bağlanılıyor...');
  showConnectionBanner('Bağlantı koptu, yeniden bağlanılıyor...');
});

socket.on('reconnect_attempt', (attempt) => {
  showConnectionBanner(`Yeniden bağlanılıyor... (${attempt})`);
});

socket.on('connect_error', (err) => {
  console.log('❌ Bağlantı hatası:', err.message);
});

function showConnectionBanner(text) {
  let banner = document.getElementById('connection-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'connection-banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#ff3b4a;color:#fff;text-align:center;padding:8px;font-size:0.85rem;font-weight:600;z-index:9999;font-family:Inter,sans-serif;';
    document.body.prepend(banner);
  }
  banner.textContent = text;
  banner.classList.remove('hidden');
}

// Oda bilgisini kaydet
function saveRoomInfo(code, playerNumber, playerName) {
  sessionStorage.setItem('dordeBaglaRoom', JSON.stringify({ code, playerNumber, playerName }));
}

function clearRoomInfo() {
  sessionStorage.removeItem('dordeBaglaRoom');
}

// ── DOM Elemanları ─────────────────────────
const screens = {
  lobby: document.getElementById('lobby-screen'),
  waiting: document.getElementById('waiting-screen'),
  game: document.getElementById('game-screen'),
};

const els = {
  playerName: document.getElementById('player-name'),
  btnCreate: document.getElementById('btn-create'),
  btnJoinToggle: document.getElementById('btn-join-toggle'),
  joinSection: document.getElementById('join-section'),
  roomCodeInput: document.getElementById('room-code-input'),
  btnJoin: document.getElementById('btn-join'),
  lobbyError: document.getElementById('lobby-error'),
  roomCodeText: document.getElementById('room-code-text'),
  btnCopyCode: document.getElementById('btn-copy-code'),
  copyHint: document.getElementById('copy-hint'),
  scoreP1: document.getElementById('score-p1'),
  scoreP2: document.getElementById('score-p2'),
  nameP1: document.getElementById('name-p1'),
  nameP2: document.getElementById('name-p2'),
  turnIndicator: document.getElementById('turn-indicator'),
  turnDot: document.getElementById('turn-dot'),
  turnText: document.getElementById('turn-text'),
  board: document.getElementById('board'),
  gameOverOverlay: document.getElementById('game-over-overlay'),
  gameOverEmoji: document.getElementById('game-over-emoji'),
  gameOverTitle: document.getElementById('game-over-title'),
  gameOverSubtitle: document.getElementById('game-over-subtitle'),
  btnPlayAgain: document.getElementById('btn-play-again'),
  rematchStatus: document.getElementById('rematch-status'),
  disconnectOverlay: document.getElementById('disconnect-overlay'),
  btnBackLobby: document.getElementById('btn-back-lobby'),
};

// ── Oyun Durumu ────────────────────────────
let state = {
  myPlayerNumber: 0,
  currentTurn: 0,
  board: null,
  gameActive: false,
  myName: '',
  opponentName: '',
};

// ── Ekran Yönetimi ─────────────────────────
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

// ── LOBİ ───────────────────────────────────
function showError(msg) {
  els.lobbyError.textContent = msg;
  els.lobbyError.classList.remove('hidden');
  setTimeout(() => els.lobbyError.classList.add('hidden'), 3000);
}

function getPlayerName() {
  const name = els.playerName.value.trim();
  if (!name) {
    showError('Lütfen ismini gir!');
    els.playerName.focus();
    return null;
  }
  return name;
}

els.btnCreate.addEventListener('click', () => {
  const name = getPlayerName();
  if (!name) return;
  state.myName = name;
  socket.emit('create-room', name);
});

els.btnJoinToggle.addEventListener('click', () => {
  els.joinSection.classList.toggle('hidden');
  if (!els.joinSection.classList.contains('hidden')) {
    els.roomCodeInput.focus();
  }
});

els.btnJoin.addEventListener('click', () => {
  const name = getPlayerName();
  if (!name) return;
  const code = els.roomCodeInput.value.trim();
  if (!code || code.length !== 4) {
    showError('4 haneli oda kodunu gir!');
    return;
  }
  state.myName = name;
  socket.emit('join-room', { code, playerName: name });
});

els.roomCodeInput.addEventListener('keyup', (e) => {
  if (e.key === 'Enter') els.btnJoin.click();
});

els.playerName.addEventListener('keyup', (e) => {
  if (e.key === 'Enter') {
    if (!els.joinSection.classList.contains('hidden')) {
      els.roomCodeInput.focus();
    } else {
      els.btnCreate.click();
    }
  }
});

// Kopyala butonu
els.btnCopyCode.addEventListener('click', () => {
  const code = els.roomCodeText.textContent;
  navigator.clipboard.writeText(code).then(() => {
    els.copyHint.textContent = 'Kopyalandı! ✓';
    els.copyHint.style.color = '#34d058';
    setTimeout(() => {
      els.copyHint.textContent = 'Kodu kopyalamak için tıkla';
      els.copyHint.style.color = '';
    }, 2000);
  });
});

// ── TAHTA OLUŞTURMA ────────────────────────
function renderBoard(boardData) {
  els.board.innerHTML = '';
  const isMyTurn = state.currentTurn === state.myPlayerNumber;

  if (isMyTurn && state.gameActive) {
    els.board.classList.add('my-turn');
  } else {
    els.board.classList.remove('my-turn');
  }

  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 6; col++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.row = row;
      cell.dataset.col = col;

      if (boardData[row][col] === 1) {
        cell.classList.add('player1');
      } else if (boardData[row][col] === 2) {
        cell.classList.add('player2');
      } else if (isMyTurn && state.gameActive) {
        cell.classList.add('hoverable');
        cell.classList.add(state.myPlayerNumber === 1 ? 'hover-red' : 'hover-yellow');
      }

      cell.addEventListener('click', () => onCellClick(col));
      els.board.appendChild(cell);
    }
  }
}

function updateTurnIndicator() {
  const isMyTurn = state.currentTurn === state.myPlayerNumber;

  if (isMyTurn) {
    els.turnText.textContent = 'Sıra sende!';
    els.turnDot.classList.remove('waiting');
    els.turnDot.style.background = '';
  } else {
    els.turnText.textContent = 'Rakibin oynuyor...';
    els.turnDot.classList.add('waiting');
  }
}

function updateScores(scores) {
  // game-start'ta renkler swap ediliyor, bu yüzden
  // sol taraf her zaman "Sen", sağ taraf her zaman "Rakip"
  if (state.myPlayerNumber === 1) {
    els.scoreP1.textContent = scores[0];
    els.scoreP2.textContent = scores[1];
  } else {
    els.scoreP1.textContent = scores[1];
    els.scoreP2.textContent = scores[0];
  }
}

function onCellClick(col) {
  if (!state.gameActive) return;
  if (state.currentTurn !== state.myPlayerNumber) return;
  socket.emit('make-move', col);
}

// ── Taş animasyonu ─────────────────────────
function animateDrop(row, col, player) {
  const index = row * 6 + col;
  const cell = els.board.children[index];
  if (!cell) return;

  cell.className = 'cell';
  cell.classList.add(player === 1 ? 'player1' : 'player2');
  cell.classList.add('drop-anim');

  // Animasyon sonrası class temizle
  setTimeout(() => cell.classList.remove('drop-anim'), 550);
}

// ── Confetti ───────────────────────────────
function launchConfetti() {
  const container = document.createElement('div');
  container.className = 'confetti-container';
  document.body.appendChild(container);

  const colors = ['#ff3b4a', '#ffb020', '#34d058', '#3b82f6', '#a855f7', '#ec4899'];

  for (let i = 0; i < 60; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + '%';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.width = (Math.random() * 8 + 5) + 'px';
    piece.style.height = (Math.random() * 8 + 5) + 'px';
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    piece.style.animationDuration = (Math.random() * 2 + 1.5) + 's';
    piece.style.animationDelay = (Math.random() * 0.8) + 's';
    container.appendChild(piece);
  }

  setTimeout(() => container.remove(), 4000);
}

// ── Kazanan hücreleri vurgula ───────────────
function highlightWinCells(winCells) {
  if (!winCells) return;
  winCells.forEach(([r, c]) => {
    const index = r * 6 + c;
    const cell = els.board.children[index];
    if (cell) cell.classList.add('win-cell');
  });
}

// ── SOCKET OLAYLARI ────────────────────────

// Oda oluşturuldu
socket.on('room-created', ({ code, playerNumber, playerName }) => {
  state.myPlayerNumber = playerNumber;
  els.roomCodeText.textContent = code;
  saveRoomInfo(code, playerNumber, playerName || state.myName);
  showScreen('waiting');
});

// Odaya katılma hatası
socket.on('join-error', (msg) => {
  showError(msg);
});

// Odaya katıldım
socket.on('room-joined', ({ code, playerNumber, playerName, opponentName }) => {
  state.myPlayerNumber = playerNumber;
  state.opponentName = opponentName;
  saveRoomInfo(code, playerNumber, playerName || state.myName);
});

// Yeniden bağlanma başarılı
socket.on('rejoin-success', ({ code, playerNumber, board, currentTurn, gameActive, player1, player2, scores }) => {
  state.myPlayerNumber = playerNumber;
  state.board = board;
  state.currentTurn = currentTurn;
  state.gameActive = gameActive;

  const p1Info = document.querySelector('.player1-info');
  const p2Info = document.querySelector('.player2-info');

  if (state.myPlayerNumber === 1) {
    els.nameP1.textContent = 'Sen';
    els.nameP2.textContent = player2;
    els.scoreP1.textContent = scores[0];
    els.scoreP2.textContent = scores[1];
    p1Info.className = 'player-info player1-info';
    p2Info.className = 'player-info player2-info';
  } else {
    els.nameP1.textContent = 'Sen';
    els.nameP2.textContent = player1;
    els.scoreP1.textContent = scores[1];
    els.scoreP2.textContent = scores[0];
    p1Info.className = 'player-info player2-info';
    p2Info.className = 'player-info player1-info';
  }

  renderBoard(board);
  updateTurnIndicator();
  els.gameOverOverlay.classList.add('hidden');
  els.disconnectOverlay.classList.add('hidden');
  showScreen('game');
  console.log('✅ Odaya yeniden bağlanıldı!');
});

socket.on('rejoin-error', () => {
  clearRoomInfo();
  // Lobiye dön
});

// Rakip katıldı (oda sahibine)
socket.on('opponent-joined', ({ opponentName }) => {
  state.opponentName = opponentName;
});

// Oyun başladı
socket.on('game-start', ({ board, currentTurn, player1, player2, scores }) => {
  state.board = board;
  state.currentTurn = currentTurn;
  state.gameActive = true;

  // İsimleri ve renkleri doğru eşleştir
  const p1Info = document.querySelector('.player1-info');
  const p2Info = document.querySelector('.player2-info');

  if (state.myPlayerNumber === 1) {
    // Ben kırmızıyım (player1)
    els.nameP1.textContent = 'Sen';
    els.nameP2.textContent = player2;
    els.scoreP1.textContent = scores[0];
    els.scoreP2.textContent = scores[1];
    // Renkler: Sol=kırmızı(ben), Sağ=sarı(rakip)
    p1Info.className = 'player-info player1-info';
    p2Info.className = 'player-info player2-info';
  } else {
    // Ben sarıyım (player2)
    els.nameP1.textContent = 'Sen';
    els.nameP2.textContent = player1;
    els.scoreP1.textContent = scores[1];
    els.scoreP2.textContent = scores[0];
    // Renkler: Sol=sarı(ben), Sağ=kırmızı(rakip)
    p1Info.className = 'player-info player2-info';
    p2Info.className = 'player-info player1-info';
  }

  renderBoard(board);
  updateTurnIndicator();

  // Overlay'leri gizle ve butonları sıfırla
  els.gameOverOverlay.classList.add('hidden');
  els.disconnectOverlay.classList.add('hidden');
  els.rematchStatus.classList.add('hidden');
  els.btnPlayAgain.style.display = '';

  showScreen('game');
});

// Hamle yapıldı
socket.on('move-made', ({ row, col, player, board, currentTurn }) => {
  state.board = board;
  state.currentTurn = currentTurn;

  renderBoard(board);
  animateDrop(row, col, player);
  updateTurnIndicator();
});

// Oyun bitti
socket.on('game-over', ({ winner, winnerName, winCells, scores }) => {
  state.gameActive = false;
  updateScores(scores);

  const winnerNum = parseInt(winner);
  const myNum = parseInt(state.myPlayerNumber);

  // ── Zamanlama: taş düşsün → 4'lü parlasın → sonuç ekranı ──
  // Adım 1: Taş düşme animasyonu (move-made zaten oynatıyor) → 600ms bekle
  setTimeout(() => {
    // Adım 2: Kazanan 4'lüyü vurgula (2 saniye yanıp sönsün)
    if (winCells) {
      highlightWinCells(winCells);
    }

    // Adım 3: 2.5 saniye sonra sonuç ekranını göster
    setTimeout(() => {
      if (winnerNum === 0) {
        els.gameOverEmoji.textContent = '🤝';
        els.gameOverTitle.textContent = 'Berabere!';
        els.gameOverSubtitle.textContent = 'İyi mücadeleydi!';
      } else if (winnerNum === myNum) {
        els.gameOverEmoji.textContent = '🎉';
        els.gameOverTitle.textContent = 'Kazandın!';
        els.gameOverSubtitle.textContent = 'Tebrikler! 🏆';
        launchConfetti();
      } else {
        els.gameOverEmoji.textContent = '😔';
        els.gameOverTitle.textContent = 'Kaybettin!';
        els.gameOverSubtitle.textContent = `${winnerName} kazandı.`;
      }

      els.gameOverOverlay.classList.remove('hidden');
    }, 2500);
  }, 600);
});

// Tekrar oyna
els.btnPlayAgain.addEventListener('click', () => {
  socket.emit('play-again');
  els.rematchStatus.textContent = 'Rakip bekleniyor...';
  els.rematchStatus.classList.remove('hidden');
  els.btnPlayAgain.style.display = 'none';
});

// Rakip tekrar oynamak istiyor
socket.on('opponent-wants-rematch', () => {
  els.rematchStatus.textContent = 'Rakip tekrar oynamak istiyor!';
  els.rematchStatus.classList.remove('hidden');
});

// Rakip geçici bağlantı kopması
socket.on('opponent-connection-lost', () => {
  els.turnText.textContent = 'Rakibin bağlantısı koptu, bekleniyor...';
  els.turnDot.classList.add('waiting');
});

// Rakip geri döndü
socket.on('opponent-reconnected', () => {
  updateTurnIndicator();
});

// Rakip kalıcı olarak ayrıldı (60 sn geçti)
socket.on('opponent-disconnected', () => {
  state.gameActive = false;
  clearRoomInfo();
  els.gameOverOverlay.classList.add('hidden');
  els.disconnectOverlay.classList.remove('hidden');
});

// Lobiye dön
els.btnBackLobby.addEventListener('click', () => {
  clearRoomInfo();
  location.reload();
});
