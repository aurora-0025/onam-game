import type { Server, Socket } from "socket.io";

type GamePlayer = {
  id: string;
  name: string;
  clicks: number;
};

type GameTeam = {
  teamId: string;
  name: string;
  players: GamePlayer[];
  leaderId: string;
  totalClicks: number;
};

type GameState = {
  id: string;
  teamA: GameTeam;
  teamB: GameTeam;
  status: 'active' | 'finished';
  winner?: 'teamA' | 'teamB';
  barPosition: number; // -25 to 25, negative = teamA winning, positive = teamB winning
  createdAt: number;
  endedAt?: number;
};

// Import Team type from team.handler.ts
type Team = {
  id: string;
  name: string;
  participants: Set<{ id: string; name: string; socket: Socket }>;
  leaderId: string;
  inQueue: boolean;
};

const activeGames: Map<string, GameState> = new Map();
const playerToGame: Map<string, string> = new Map();

const GAME_CONFIG = {
  CLICK_POWER: 1, // How much each click moves the bar
  WIN_THRESHOLD: 25 // Distance from center to win - game ends in 25 clicks max
};

function calculateBarPosition(teamAClicks: number, teamBClicks: number): number {
  // Simple calculation: difference between team clicks
  // If teamA has 25 clicks and teamB has 0, barPosition = -25 (teamA wins)
  // If teamB has 25 clicks and teamA has 0, barPosition = +25 (teamB wins)
  const difference = teamBClicks - teamAClicks;
  const position = difference * GAME_CONFIG.CLICK_POWER;
  
  // Clamp to win threshold
  return Math.max(-GAME_CONFIG.WIN_THRESHOLD, Math.min(GAME_CONFIG.WIN_THRESHOLD, position));
}

function checkGameEnd(game: GameState): boolean {
  const barPos = game.barPosition;
  
  // Win condition: reaches the win threshold (25 from center)
  if (barPos <= -GAME_CONFIG.WIN_THRESHOLD) {
    game.status = 'finished';
    game.winner = 'teamA';
    game.endedAt = Date.now();
    return true;
  } else if (barPos >= GAME_CONFIG.WIN_THRESHOLD) {
    game.status = 'finished';
    game.winner = 'teamB';
    game.endedAt = Date.now();
    return true;
  }
  
  return false;
}

function broadcastGameUpdate(io: Server, game: GameState) {
  const baseGameData = {
    gameId: game.id,
    teamA: game.teamA,
    teamB: game.teamB,
    barPosition: game.barPosition,
    status: game.status,
    winner: game.winner,
    winThreshold: GAME_CONFIG.WIN_THRESHOLD
  };

  // Check if one team is completely empty and end the game
  if (game.teamA.players.length === 0 && game.teamB.players.length > 0) {
    game.status = 'finished';
    game.winner = 'teamB';
    game.endedAt = Date.now();
    baseGameData.status = game.status;
    baseGameData.winner = game.winner;
  } else if (game.teamB.players.length === 0 && game.teamA.players.length > 0) {
    game.status = 'finished';
    game.winner = 'teamA';
    game.endedAt = Date.now();
    baseGameData.status = game.status;
    baseGameData.winner = game.winner;
  }

  // Send to teamA players with yourTeamIsA: true
  game.teamA.players.forEach(player => {
    io.to(player.id).emit('game:update', {
      ...baseGameData,
      yourTeamIsA: true
    });
  });

  // Send to teamB players with yourTeamIsA: false
  game.teamB.players.forEach(player => {
    io.to(player.id).emit('game:update', {
      ...baseGameData,
      yourTeamIsA: false
    });
  });
}

export function createGame(gameId: string, teamA: Team, teamB: Team): GameState {
  const game: GameState = {
    id: gameId,
    teamA: {
      teamId: teamA.id,
      name: teamA.name,
      players: [...teamA.participants].map(p => ({ 
        id: p.id, 
        name: p.name, 
        clicks: 0 
      })),
      leaderId: teamA.leaderId,
      totalClicks: 0
    },
    teamB: {
      teamId: teamB.id,
      name: teamB.name,
      players: [...teamB.participants].map(p => ({ 
        id: p.id, 
        name: p.name, 
        clicks: 0 
      })),
      leaderId: teamB.leaderId,
      totalClicks: 0
    },
    status: 'active',
    barPosition: 0,
    createdAt: Date.now()
  };

  activeGames.set(gameId, game);
  
  // Map all players to this game
  [...game.teamA.players, ...game.teamB.players].forEach(player => {
    playerToGame.set(player.id, gameId);
  });

  return game;
}

export function handleGameEvents(io: Server, socket: Socket) {
  // Player clicks in game
  socket.on('game:click', () => {
    const gameId = playerToGame.get(socket.id);
    if (!gameId) {
      socket.emit('game:error', { message: 'Not in a game' });
      return;
    }

    const game = activeGames.get(gameId);
    if (!game) {
      socket.emit('game:error', { message: 'Game not found' });
      return;
    }

    if (game.status !== 'active') {
      socket.emit('game:error', { message: 'Game is not active' });
      return;
    }

    // Find which team the player belongs to
    let playerTeam: GameTeam | null = null;
    let player: GamePlayer | null = null;

    if (game.teamA.players.some(p => p.id === socket.id)) {
      playerTeam = game.teamA;
      player = game.teamA.players.find(p => p.id === socket.id)!;
    } else if (game.teamB.players.some(p => p.id === socket.id)) {
      playerTeam = game.teamB;
      player = game.teamB.players.find(p => p.id === socket.id)!;
    }

    if (!playerTeam || !player) {
      socket.emit('game:error', { message: 'Player not found in game' });
      return;
    }

    // Increment player clicks
    player.clicks += GAME_CONFIG.CLICK_POWER;
    playerTeam.totalClicks += GAME_CONFIG.CLICK_POWER;

    // Recalculate bar position
    game.barPosition = calculateBarPosition(game.teamA.totalClicks, game.teamB.totalClicks);

    // Check if game ended
    const gameEnded = checkGameEnd(game);

    // Broadcast update to all players
    broadcastGameUpdate(io, game);

    if (gameEnded) {
      // Clean up game after a delay
      setTimeout(() => {
        activeGames.delete(gameId);
        [...game.teamA.players, ...game.teamB.players].forEach(p => {
          playerToGame.delete(p.id);
        });
      }, 10000); // 10 seconds delay before cleanup
    }
  });

  // Player leaves game
  socket.on('game:leave', () => {
    const gameId = playerToGame.get(socket.id);
    if (!gameId) return;

    const game = activeGames.get(gameId);
    if (!game) return;

    // Remove player from game
    playerToGame.delete(socket.id);
    
    // Remove from team
    game.teamA.players = game.teamA.players.filter(p => p.id !== socket.id);
    game.teamB.players = game.teamB.players.filter(p => p.id !== socket.id);

    // If no players left, end game
    if (game.teamA.players.length === 0 && game.teamB.players.length === 0) {
      activeGames.delete(gameId);
    } else {
      broadcastGameUpdate(io, game);
    }

    socket.emit('game:left', { gameId });
  });

  // Get game status
  socket.on('game:status', () => {
    const gameId = playerToGame.get(socket.id);
    if (!gameId) {
      socket.emit('game:status', { inGame: false });
      return;
    }

    const game = activeGames.get(gameId);
    if (!game) {
      socket.emit('game:status', { inGame: false });
      return;
    }

    // Determine if this player is in teamA
    const yourTeamIsA = game.teamA.players.some(p => p.id === socket.id);

    socket.emit('game:status', {
      inGame: true,
      gameId: game.id,
      teamA: game.teamA,
      teamB: game.teamB,
      barPosition: game.barPosition,
      status: game.status,
      winner: game.winner,
      winThreshold: GAME_CONFIG.WIN_THRESHOLD,
      yourTeamIsA
    });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    const gameId = playerToGame.get(socket.id);
    if (!gameId) return;

    const game = activeGames.get(gameId);
    if (!game) return;

    playerToGame.delete(socket.id);
    
    // Remove from team
    game.teamA.players = game.teamA.players.filter(p => p.id !== socket.id);
    game.teamB.players = game.teamB.players.filter(p => p.id !== socket.id);

    // If no players left, end game
    if (game.teamA.players.length === 0 && game.teamB.players.length === 0) {
      activeGames.delete(gameId);
    } else {
      broadcastGameUpdate(io, game);
    }
  });
}