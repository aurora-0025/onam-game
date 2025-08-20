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
  status: 'countdown' | 'active' | 'finished';
  winner?: 'teamA' | 'teamB';
  barPosition: number; // -25 to 25, negative = teamA winning, positive = teamB winning
  createdAt: number;
  endedAt?: number;
  countdownRemaining?: number; // seconds left before game becomes active
  restartVotesA: Set<string>;
  restartVotesB: Set<string>;
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
const countdownTimers: Map<string, NodeJS.Timeout> = new Map();
const restartLocks: Set<string> = new Set();

const GAME_CONFIG = {
  CLICK_POWER: 1,
  WIN_THRESHOLD: 25,
  COUNTDOWN_SECONDS: 3
};

function calculateBarPosition(teamAClicks: number, teamBClicks: number): number {
  const difference = teamBClicks - teamAClicks;
  const position = difference * GAME_CONFIG.CLICK_POWER;
  return Math.max(-GAME_CONFIG.WIN_THRESHOLD, Math.min(GAME_CONFIG.WIN_THRESHOLD, position));
}

function checkGameEnd(game: GameState): boolean {
  const barPos = game.barPosition;
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
  game.restartVotesA.forEach(id => {
    if (!game.teamA.players.some(p => p.id === id)) game.restartVotesA.delete(id);
  });
  game.restartVotesB.forEach(id => {
    if (!game.teamB.players.some(p => p.id === id)) game.restartVotesB.delete(id);
  });

  const baseGameData = {
    gameId: game.id,
    teamA: game.teamA,
    teamB: game.teamB,
    barPosition: game.barPosition,
    status: game.status,
    winner: game.winner,
    winThreshold: GAME_CONFIG.WIN_THRESHOLD,
    countdownRemaining: game.countdownRemaining,
    restartVotesA: Array.from(game.restartVotesA),
    restartVotesB: Array.from(game.restartVotesB)
  };

  // Early exit if countdown still running (still broadcast but don't evaluate empties/end)
  if (game.status !== 'countdown') {
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
  }

  game.teamA.players.forEach(player => {
    io.to(player.id).emit('game:update', { ...baseGameData, yourTeamIsA: true });
  });
  game.teamB.players.forEach(player => {
    io.to(player.id).emit('game:update', { ...baseGameData, yourTeamIsA: false });
  });
}

function startCountdown(io: Server, game: GameState) {
  game.status = 'countdown';
  game.countdownRemaining = GAME_CONFIG.COUNTDOWN_SECONDS;
  broadcastGameUpdate(io, game);

  const tick = () => {
    const g = activeGames.get(game.id);
    if (!g) {
      clearInterval(timer);
      countdownTimers.delete(game.id);
      return;
    }
    if (g.status !== 'countdown') {
      clearInterval(timer);
      countdownTimers.delete(game.id);
      return;
    }
    if ((g.countdownRemaining ?? 0) <= 1) {
      g.countdownRemaining = 0;
      g.status = 'active';
      broadcastGameUpdate(io, g);
      clearInterval(timer);
      countdownTimers.delete(g.id);
    } else {
      g.countdownRemaining!--;
      broadcastGameUpdate(io, g);
    }
  };

  const timer = setInterval(tick, 1000);
  countdownTimers.set(game.id, timer);
}

function restartGame(io: Server, game: GameState) {
  if (game.status !== 'finished') return;
  if (game.teamA.players.length === 0 || game.teamB.players.length === 0) return;
  if (restartLocks.has(game.id)) return;
  restartLocks.add(game.id);

  // Reset per-round state
  game.teamA.players.forEach(p => (p.clicks = 0));
  game.teamB.players.forEach(p => (p.clicks = 0));
  game.teamA.totalClicks = 0;
  game.teamB.totalClicks = 0;
  game.barPosition = 0;
  game.winner = undefined;
  game.status = 'countdown';
  game.createdAt = Date.now();
  game.endedAt = undefined;
  game.countdownRemaining = GAME_CONFIG.COUNTDOWN_SECONDS;
  game.restartVotesA.clear();
  game.restartVotesB.clear();

  // Release lock shortly after countdown starts
  setTimeout(() => restartLocks.delete(game.id), 500);

  startCountdown(io, game);
}

export function createGame(io: Server, gameId: string, teamA: Team, teamB: Team): GameState {
  const game: GameState = {
    id: gameId,
    teamA: {
      teamId: teamA.id,
      name: teamA.name,
      players: [...teamA.participants].map(p => ({ id: p.id, name: p.name, clicks: 0 })),
      leaderId: teamA.leaderId,
      totalClicks: 0
    },
    teamB: {
      teamId: teamB.id,
      name: teamB.name,
      players: [...teamB.participants].map(p => ({ id: p.id, name: p.name, clicks: 0 })),
      leaderId: teamB.leaderId,
      totalClicks: 0
    },
    status: 'countdown',
    barPosition: 0,
    createdAt: Date.now(),
    countdownRemaining: GAME_CONFIG.COUNTDOWN_SECONDS,
    restartVotesA: new Set<string>(),
    restartVotesB: new Set<string>()
  };

  activeGames.set(gameId, game);

  [...game.teamA.players, ...game.teamB.players].forEach(player => {
    playerToGame.set(player.id, gameId);
  });

  startCountdown(io, game);

  return game;
}

export function handleGameEvents(io: Server, socket: Socket) {
  socket.on('game:restart', () => {
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
    if (game.status !== 'finished') {
      socket.emit('game:error', { message: 'Game not finished yet' });
      return;
    }
    if (game.teamA.players.length === 0 || game.teamB.players.length === 0) {
      socket.emit('game:error', { message: 'Cannot restart: a team is empty' });
      return;
    }

    const isTeamAPlayer = game.teamA.players.some(p => p.id === socket.id);
    if (isTeamAPlayer) {
      game.restartVotesA.add(socket.id);
    } else {
      game.restartVotesB.add(socket.id);
    }

    // Check if ALL players on both teams have voted
    const allATeamVoted = game.restartVotesA.size === game.teamA.players.length;
    const allBTeamVoted = game.restartVotesB.size === game.teamB.players.length;

    broadcastGameUpdate(io, game);

    if (allATeamVoted && allBTeamVoted) {
      restartGame(io, game);
    }
  });

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
    if (game.status === 'countdown') {
      socket.emit('game:error', { message: 'Game has not started yet' });
      return;
    }
    if (game.status !== 'active') {
      socket.emit('game:error', { message: 'Game is not active' });
      return;
    }

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

    player.clicks += GAME_CONFIG.CLICK_POWER;
    playerTeam.totalClicks += GAME_CONFIG.CLICK_POWER;

    game.barPosition = calculateBarPosition(game.teamA.totalClicks, game.teamB.totalClicks);

    const gameEnded = checkGameEnd(game);
    broadcastGameUpdate(io, game);

    if (gameEnded) {
      if (countdownTimers.has(gameId)) {
        clearInterval(countdownTimers.get(gameId)!);
        countdownTimers.delete(gameId);
      }
      // Cleanup instantly when game ends and both teams are empty
      if (
        game.teamA.players.length === 0 &&
        game.teamB.players.length === 0
      ) {
        activeGames.delete(gameId);
        [...game.teamA.players, ...game.teamB.players].forEach(p => playerToGame.delete(p.id));
      }
    }
  });

  socket.on('game:leave', () => {
    const gameId = playerToGame.get(socket.id);
    if (!gameId) return;
    const game = activeGames.get(gameId);
    if (!game) return;

    playerToGame.delete(socket.id);
    game.teamA.players = game.teamA.players.filter(p => p.id !== socket.id);
    game.teamB.players = game.teamB.players.filter(p => p.id !== socket.id);

    if (game.teamA.players.length === 0 && game.teamB.players.length === 0) {
      if (countdownTimers.has(gameId)) {
        clearInterval(countdownTimers.get(gameId)!);
        countdownTimers.delete(gameId);
      }
      activeGames.delete(gameId);
    } else {
      broadcastGameUpdate(io, game);
    }
    socket.emit('game:left', { gameId });
  });

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
      countdownRemaining: game.countdownRemaining,
      yourTeamIsA
    });
  });

  socket.on('disconnect', () => {
    const gameId = playerToGame.get(socket.id);
    if (!gameId) return;
    const game = activeGames.get(gameId);
    if (!game) return;

    playerToGame.delete(socket.id);
    game.teamA.players = game.teamA.players.filter(p => p.id !== socket.id);
    game.teamB.players = game.teamB.players.filter(p => p.id !== socket.id);

    if (game.teamA.players.length === 0 && game.teamB.players.length === 0) {
      if (countdownTimers.has(gameId)) {
        clearInterval(countdownTimers.get(gameId)!);
        countdownTimers.delete(gameId);
      }
      activeGames.delete(gameId);
    } else {
      broadcastGameUpdate(io, game);
    }
  });
}