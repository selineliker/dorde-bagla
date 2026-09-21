const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, 'public')));

// ── Oyun odaları ──────────────────────────────────────────
const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

function createEmptyBoard() {
  // 7 satır x 6 sütun, 0 = boş, 1 = oyuncu1, 2 = oyuncu2
  return Array.from({ length: 7 }, () => Array(6).fill(0));
}

function checkWin(board, player) {
  const rows = 7, cols = 6;
  const directions = [
    [0, 1],   // yatay
    [1, 0],   // dikey
    [1, 1],   // çapraz sağ-aşağı
    [1, -1],  // çapraz sol-aşağı
  ];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board[r][c] !== player) continue;

      for (const [dr, dc] of directions) {
        const cells = [[r, c]];
        let valid = true;
        for (let i = 1; i < 4; i++) {
          const nr = r + dr * i;
          const nc = c + dc * i;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || board[nr][nc] !== player) {
            valid = false;
            break;
          }
          cells.push([nr, nc]);
        }
        if (valid) return cells; // kazanan 4 hücreyi döndür
      }
    }
  }
  return null;
}

function isBoardFull(board) {
  return board[0].every(cell => cell !== 0);
}

function dropPiece(board, col, player) {
  for (let row = 6; row >= 0; row--) {
    if (board[row][col] === 0) {
      board[row][col] = player;
      return row;
    }
  }
  return -1; // sütun dolu
}

// ── Socket.io olayları ────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`Bağlandı: ${socket.id}`);

  // Oda oluştur
  socket.on('create-room', (playerName) => {
    const code = generateRoomCode();
    const room = {
      code,
      players: [{ id: socket.id, name: playerName, score: 0 }],
      board: createEmptyBoard(),
      currentTurn: 1, // oyuncu 1 başlar
      gameActive: false,
      winner: null,
    };
    rooms.set(code, room);
    socket.join(code);
    socket.roomCode = code;
    socket.playerNumber = 1;

    socket.emit('room-created', { code, playerNumber: 1, playerName });
    console.log(`Oda oluşturuldu: ${code} — ${playerName}`);
  });

  // Odaya katıl
  socket.on('join-room', ({ code, playerName }) => {
    const roomCode = code.toUpperCase().trim();
    const room = rooms.get(roomCode);

    if (!room) {
      socket.emit('join-error', 'Oda bulunamadı! Kodu kontrol edin.');
      return;
    }
    if (room.players.length >= 2) {
      socket.emit('join-error', 'Oda dolu!');
      return;
    }

    room.players.push({ id: socket.id, name: playerName, score: 0 });
    room.gameActive = true;
    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.playerNumber = 2;

    socket.emit('room-joined', {
      code: roomCode,
      playerNumber: 2,
      playerName,
      opponentName: room.players[0].name,
    });

    // Oyuncu 1'e bildir
    io.to(room.players[0].id).emit('opponent-joined', {
      opponentName: playerName,
    });

    // Oyunu başlat
    io.to(roomCode).emit('game-start', {
      board: room.board,
      currentTurn: room.currentTurn,
      player1: room.players[0].name,
      player2: room.players[1].name,
      scores: [room.players[0].score, room.players[1].score],
    });

    console.log(`${playerName} odaya katıldı: ${roomCode}`);
  });

  // Hamle yap
  socket.on('make-move', (col) => {
    const room = rooms.get(socket.roomCode);
    if (!room || !room.gameActive) return;
    if (room.currentTurn !== socket.playerNumber) return;
    if (col < 0 || col > 5) return;

    const row = dropPiece(room.board, col, socket.playerNumber);
    if (row === -1) return; // sütun dolu

    const winCells = checkWin(room.board, socket.playerNumber);

    if (winCells) {
      room.gameActive = false;
      room.winner = socket.playerNumber;
      room.players[socket.playerNumber - 1].score++;

      io.to(socket.roomCode).emit('move-made', {
        row,
        col,
        player: socket.playerNumber,
        board: room.board,
        currentTurn: room.currentTurn,
      });

      io.to(socket.roomCode).emit('game-over', {
        winner: socket.playerNumber,
        winnerName: room.players[socket.playerNumber - 1].name,
        winCells,
        scores: [room.players[0].score, room.players[1].score],
      });
      return;
    }

    if (isBoardFull(room.board)) {
      room.gameActive = false;
      io.to(socket.roomCode).emit('move-made', {
        row,
        col,
        player: socket.playerNumber,
        board: room.board,
        currentTurn: room.currentTurn,
      });
      io.to(socket.roomCode).emit('game-over', {
        winner: 0,
        winnerName: null,
        winCells: null,
        scores: [room.players[0].score, room.players[1].score],
      });
      return;
    }

    room.currentTurn = room.currentTurn === 1 ? 2 : 1;

    io.to(socket.roomCode).emit('move-made', {
      row,
      col,
      player: socket.playerNumber,
      board: room.board,
      currentTurn: room.currentTurn,
    });
  });

  // Yeniden oyna
  socket.on('play-again', () => {
    const room = rooms.get(socket.roomCode);
    if (!room) return;

    if (!room.playAgainVotes) room.playAgainVotes = new Set();
    room.playAgainVotes.add(socket.playerNumber); // socket.id yerine playerNumber kullan

    if (room.playAgainVotes.size === 2) {
      room.board = createEmptyBoard();
      // Kaybeden başlar, beraberlikteyse sıra değişir
      room.currentTurn = room.winner ? (room.winner === 1 ? 2 : 1) : (room.currentTurn === 1 ? 2 : 1);
      room.gameActive = true;
      room.winner = null;
      room.playAgainVotes = new Set();

      io.to(socket.roomCode).emit('game-start', {
        board: room.board,
        currentTurn: room.currentTurn,
        player1: room.players[0].name,
        player2: room.players[1].name,
        scores: [room.players[0].score, room.players[1].score],
      });
    } else {
      // Diğer oyuncuya bildir
      const otherPlayer = room.players.find(p => p.id !== socket.id);
      if (otherPlayer) {
        io.to(otherPlayer.id).emit('opponent-wants-rematch');
      }
    }
  });

  // ── Odaya yeniden bağlanma (reconnect) ──────────────────
  socket.on('rejoin-room', ({ code, playerNumber, playerName }) => {
    const roomCode = code.toUpperCase().trim();
    const room = rooms.get(roomCode);

    if (!room) {
      socket.emit('rejoin-error', 'Oda artık mevcut değil.');
      return;
    }

    const playerIndex = playerNumber - 1;
    if (playerIndex < 0 || playerIndex >= room.players.length) {
      socket.emit('rejoin-error', 'Geçersiz oyuncu.');
      return;
    }

    // Disconnect timer'ı iptal et
    if (room.disconnectTimers && room.disconnectTimers[playerIndex]) {
      clearTimeout(room.disconnectTimers[playerIndex]);
      room.disconnectTimers[playerIndex] = null;
      console.log(`Reconnect timer iptal: Oyuncu ${playerNumber} (${playerName})`);
    }

    // Oyuncu bilgilerini güncelle
    room.players[playerIndex].id = socket.id;
    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.playerNumber = playerNumber;

    // Diğer oyuncuya bildir
    const otherPlayer = room.players.find((p, i) => i !== playerIndex);
    if (otherPlayer) {
      io.to(otherPlayer.id).emit('opponent-reconnected');
    }

    // Mevcut oyun durumunu gönder
    socket.emit('rejoin-success', {
      code: roomCode,
      playerNumber,
      board: room.board,
      currentTurn: room.currentTurn,
      gameActive: room.gameActive,
      player1: room.players[0].name,
      player2: room.players[1].name,
      scores: [room.players[0].score, room.players[1].score],
    });

    console.log(`Yeniden bağlandı: ${playerName} (Oyuncu ${playerNumber}) → Oda ${roomCode}`);
  });

  // ── Bağlantı kopması (60 sn tolerans) ──────────────────
  socket.on('disconnect', () => {
    console.log(`Bağlantı koptu: ${socket.id}`);
    const room = rooms.get(socket.roomCode);
    if (!room) return;

    const playerIndex = room.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) return;

    // Diğer oyuncuya "geçici kopma" bildir
    const otherPlayer = room.players.find(p => p.id !== socket.id);
    if (otherPlayer) {
      io.to(otherPlayer.id).emit('opponent-connection-lost');
    }

    // 60 saniye bekle — bu sürede geri dönmezse odayı sil
    if (!room.disconnectTimers) room.disconnectTimers = {};
    room.disconnectTimers[playerIndex] = setTimeout(() => {
      console.log(`Zaman aşımı: Oyuncu ${playerIndex + 1} geri dönmedi, oda siliniyor: ${socket.roomCode}`);

      if (otherPlayer) {
        io.to(otherPlayer.id).emit('opponent-disconnected');
      }
      rooms.delete(socket.roomCode);
    }, 60000); // 60 saniye

    console.log(`60 sn bekleniyor: ${socket.roomCode} (Oyuncu ${playerIndex + 1})`);
  });
});

// ── Sunucuyu başlat ───────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎮 Dörde Bağla sunucusu çalışıyor: http://localhost:${PORT}`);
});
