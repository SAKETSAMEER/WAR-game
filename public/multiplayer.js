const socket = io(); // Replace with your backend URL if deployed
let currentMap = null;
let isMyTurn = false;

// --- DOM Elements ---
const statusText = document.getElementById('status');
const playerCountText = document.getElementById('playerCount');

// --- Functions ---
function joinServer(mapId) {
  if (currentMap) {
    // This now calls your custom popup for 2 seconds (2000ms)
    showPopup("You are already in a server. Please leave first.", 2000);
    return;
  }

  currentMap = mapId;
  const playerData = {
    name: playerName,
    stats: stats,
    playerCards: playerCards,
    battleImage: getPlayerBattleImage() // Use the new function to get the unique image URL
  };

  socket.emit('join_server', { mapId, playerData });
  statusText.innerText = `Joined ${mapId}. Waiting for an opponent...`;
}

// In multiplayer.js

function leaveServer() {
  if (currentMap) {
    socket.emit('leave_server'); // <<< ADD THIS LINE
    currentMap = null;
    statusText.innerText = 'You have left the server.';
    playerCountText.innerText = 'Players in server: 0';
  }
}
// Inside multiplayer.js
function sendPvPAction(action) {
  if (!isMyTurn) {
    console.log("Not your turn!");
    return;
  }
  socket.emit('battle_action', action);
  // The end_turn event will now be sent from script.js
}

// --- Socket Event Listeners ---
socket.on('update_count', count => {
  if (playerCountText) {
    playerCountText.innerText = `Players in server: ${count}`;
  }
});
// In multiplayer.js, with your other socket listeners

socket.on('get_attack_cards', ({ requesterId, originalCardName }) => {
  const opponentAttackCards = battle_playerCards.filter(c => c.type === 'attack');
  if (opponentAttackCards.length > 0) {
    const cardToCopy = opponentAttackCards[Math.floor(Math.random() * opponentAttackCards.length)];
    // Send the randomly selected card back to the server
    socket.emit('send_attack_cards', { requesterId, cardToCopy, originalCardName });
  }
});

socket.on('copy_card_data', ({ cardToCopy, originalCardName }) => {
  if (!cardToCopy) {
    battle_logMessage("Opponent has no attack techniques to copy!");
    return;
  }
  
  const mimicCardIndex = battle_playerCards.findIndex(c => c.name === originalCardName);

  if (mimicCardIndex !== -1) {
    const copiedCard = {
      ...cardToCopy,
      name: `${cardToCopy.name} (Copied)`,
      isCopied: true,
      cooldownTurnsLeft: 0,
      gif_target: 'opponent',
      damage: {
          min: (cardToCopy.damage.min || 0) + 30,
          max: (cardToCopy.damage.max || 0) + 50
      },
      desc: `(Copied) ${cardToCopy.desc}<br><b style="color:#67ee67ff;">Damage increased!</b>`
    };

    battle_playerCards[mimicCardIndex] = copiedCard;
    battle_logMessage(`You copied <b>${cardToCopy.name}</b> and infused it with your own power!`);
    
    if (document.getElementById('battle_cardContainer').style.display === 'block') {
      battle_updateCardButtons();
    }
  }
});
// In multiplayer.js

socket.on('you_are_defeated', () => {
  // The server has confirmed that you lost (e.g., from a one-shot).
  handlePvPBattleEnd(false); // Show the defeat screen
});

socket.on('battle_start', ({ battleId, opponentData, isMyTurn: myTurn }) => {
  console.log('Battle starting!', { battleId, opponentData });
  isMyTurn = myTurn;
  startOnlineBattle(opponentData, isMyTurn); // This function will be in script.js
});

socket.on('opponent_action', action => {
  console.log('Opponent action received:', action);
  handleOpponentAction(action); // This function will be in script.js
});

// in multiplayer.js
// in multiplayer.js
// in multiplayer.js

// This listener handles the victory confirmation
// in multiplayer.js

socket.on('opponent_defeated', () => {
  // Set health to 0 for the UI
  battle_opponentHP = 0;
  battle_updateHealthBars();

  // Disable all controls
  document.querySelectorAll('#battle-panel .buttons button').forEach(btn => btn.disabled = true);
  document.getElementById('battle_cardContainer').style.display = 'none';

  // Officially end the battle and show the victory button
  handlePvPBattleEnd(true); 
});
// --- END OF FIX ---

// MODIFY THIS LISTENER IN MULTIPLAYER.JS
// REPLACE your existing 'turn_change' listener in multiplayer.js with this one
// REPLACE your turn_change listener in multiplayer.js with this one
socket.on('turn_change', ({ isMyTurn: myTurn }) => {
  // This check is essential
  if (battle_isOver) {
    return;
  }
  
  
  isMyTurn = myTurn;

  // --- Process Effects for the Player Whose Turn Just ENDED ---
  if (isMyTurn) { // This means the OPPONENT'S turn just ended
    // Decrement durations of buffs on the opponent and debuffs on the player
    battle_activeOpponentBuffs = battle_activeOpponentBuffs.filter(b => {
      b.duration--;
      if (b.duration <= 0) {
        battle_logMessage(`<b>${battle_opponentData.name}</b>'s ${b.name} has worn off.`);
        if (b.subType === 'damage_reduction') battle_opponentDamageReduction = 1;
        return false;
      }
      return true;
    });
    battle_activePlayerDebuffs = battle_activePlayerDebuffs.filter(d => {
      d.duration--;
      if (d.duration <= 0) {
        battle_logMessage(`The ${d.name} effect on you has worn off.`);
        return false;
      }
      return true;
    });

  } else { // This means MY turn just ended
    // Decrement my card cooldowns
    battle_decrementPlayerCooldowns();

    // Decrement durations of buffs on me and debuffs on the opponent
    battle_activePlayerBuffs = battle_activePlayerBuffs.filter(b => {
      b.duration--;
      if (b.duration <= 0) {
        battle_logMessage(`Your ${b.name} has worn off.`);
        if (b.subType === 'damage_reduction') battle_playerDamageReduction = 1;
        return false;
      }
      return true;
    });
    battle_activeOpponentDebuffs = battle_activeOpponentDebuffs.filter(d => {
      d.duration--;
      if (d.duration <= 0) {
        battle_logMessage(`The ${d.name} effect on <b>${battle_opponentData.name}</b> has worn off.`);
        return false;
      }
      return true;
    });

    // Handle opponent's stun wearing off
    if (battle_opponentStunnedTurns > 0) {
      battle_opponentStunnedTurns--;
      battle_logMessage(`<b>${battle_opponentData.name}</b>'s stun decreases to ${battle_opponentStunnedTurns}.`);
      if (battle_opponentStunnedTurns <= 0) {
        document.getElementById('opponent-stun-gif').classList.add('hidden');
      }
    }
  }

  updateTurnIndicator(isMyTurn);

  // --- Automatic Turn Skip Logic (runs at the START of my turn) ---
  if (isMyTurn && battle_playerStunnedTurns > 0) {
    setTimeout(() => {
      battle_playerStunnedTurns--;
      battle_logMessage(`<span style="color: #bf4c4cff">You are stunned! Turn skipped. (${battle_playerStunnedTurns} left)</span>`);
      socket.emit('end_turn');
      if (battle_playerStunnedTurns <= 0) {
        document.getElementById('player-stun-gif').classList.add('hidden');
      }
    }, 1000);
  }
});

socket.on('connect_error', (err) => {
  statusText.innerText = "Connection failed. Is the server running?";
  console.error("Connection Error:", err.message);
});