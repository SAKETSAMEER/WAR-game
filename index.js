const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
// Add these two lines
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const rooms = {}; // Store room data, including player info

io.on('connection', socket => {
  console.log('User connected:', socket.id);
  // In index.js, inside io.on('connection', ...)

  socket.on('request_copy', ({ originalCardName }) => {
    const opponentSocket = io.sockets.sockets.get(socket.opponentId);
    if (opponentSocket) {
      // Ask the opponent for their attack cards
      opponentSocket.emit('get_attack_cards', { requesterId: socket.id, originalCardName });
    }
  });

  socket.on('send_attack_cards', ({ requesterId, cardToCopy, originalCardName }) => {
    const requesterSocket = io.sockets.sockets.get(requesterId);
    if (requesterSocket) {
      // Send the chosen card back to the original player
      requesterSocket.emit('copy_card_data', { cardToCopy, originalCardName });
    }
  });

  socket.on('join_server', payload => {
    const { mapId, playerData } = payload;

    if (!rooms[mapId]) {
      rooms[mapId] = [];
    }
    // --- START OF FIX ---
    // Check if this socket is already in the room
    const alreadyInRoom = rooms[mapId].find(s => s.id === socket.id);
    if (alreadyInRoom) {
      console.log(`Socket ${socket.id} tried to join ${mapId} but is already there.`);
      return; // Stop the function to prevent joining twice
    }
    // --- END OF FIX ---

    // Store player data with their socket
    socket.playerData = playerData;
    socket.currentRoom = mapId; // Keep track of the socket's current room
    rooms[mapId].push(socket);
    socket.join(mapId);

    console.log(`Socket ${socket.id} (${playerData.name}) joined ${mapId}`);
    io.to(mapId).emit('update_count', rooms[mapId].length);

    // If room is full (2 players), start the match
    if (rooms[mapId].length === 2) {
      const player1 = rooms[mapId][0];
      const player2 = rooms[mapId][1];

      const battleId = `${mapId}-${Date.now()}`;
      player1.battleId = battleId;
      player2.battleId = battleId;
      player1.opponentId = player2.id;
      player2.opponentId = player1.id;

      // Exchange player data to start the battle
      player1.emit('battle_start', { battleId, opponentData: player2.playerData, isMyTurn: true });
      player2.emit('battle_start', { battleId, opponentData: player1.playerData, isMyTurn: false });

      // Clear the room for the next pair
      rooms[mapId] = [];
    }
  });

  socket.on('battle_action', (action) => {
    const opponentSocket = io.sockets.sockets.get(socket.opponentId);
    if (opponentSocket) {
      // Relay the action to the opponent
      opponentSocket.emit('opponent_action', action);
    }
  });

  socket.on('end_turn', () => {
    const opponentSocket = io.sockets.sockets.get(socket.opponentId);
    if (opponentSocket) {
      // Always notify both players about the turn change
      socket.emit('turn_change', { isMyTurn: false });
      opponentSocket.emit('turn_change', { isMyTurn: true });
    }
  });

  socket.on('leave_server', () => {
    const mapId = socket.currentRoom;
    if (mapId && rooms[mapId]) {
      const index = rooms[mapId].findIndex(s => s.id === socket.id);
      if (index !== -1) {
        rooms[mapId].splice(index, 1);
        socket.leave(mapId);
        socket.currentRoom = null;
        io.to(mapId).emit('update_count', rooms[mapId].length);
        console.log(`Socket ${socket.id} manually left ${mapId}`);
      }
    }
  });
  // --- START OF FIX ---
  // In index.js

  // --- START OF FIX for 'one_shot' ---
  socket.on('battle_over', ({ winnerId }) => {
    // Determine the loser's ID based on the winner's ID
    const loserId = socket.id === winnerId ? socket.opponentId : socket.id;

    const winnerSocket = io.sockets.sockets.get(winnerId);
    const loserSocket = io.sockets.sockets.get(loserId);

    if (winnerSocket) {
      // Notify the winner that the battle is officially over
      winnerSocket.emit('opponent_defeated');
    }
    if (loserSocket) {
      // If the loser is still connected (e.g., in a one-shot),
      // tell them they have been defeated.
      loserSocket.emit('you_are_defeated');
    }
  });
  // --- END OF FIX ---
  // --- END OF FIX ---

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Find which room the user was in and remove them
    // --- START OF FIX ---
    const mapId = socket.currentRoom;
    if (mapId && rooms[mapId]) {
      const index = rooms[mapId].findIndex(s => s.id === socket.id);
      if (index !== -1) {
        rooms[mapId].splice(index, 1);
        io.to(mapId).emit('update_count', rooms[mapId].length);
        console.log(`Socket ${socket.id} removed from ${mapId}`);
      }
    }
    // --- END OF FIX ---
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server listening on', PORT));