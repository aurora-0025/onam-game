import type { Server, Socket } from "socket.io";
import { generateInviteCode } from "../utils";
import { createGame } from "./game.handler";

type Player = {
  id: string;
  name: string;
  socket: Socket;
};

type Team = {
  id: string;
  name: string;
  participants: Set<Player>;
  leaderId: string;
  inQueue: boolean;
};

type TeamMap = Map<string, Team>;

type TeamCreateDto = { name: string; teamName: string };
type TeamJoinDto = { name: string; inviteCode: string };

export const teams: TeamMap = new Map();
const playerTeam: Map<string, string> = new Map();

const MAX_TEAM_SIZE = 5;

// Matchmaking queue keyed by team size
const teamQueues: Map<number, Team[]> = new Map();

type Game = {
  id: string;
  teamA: Team;
  teamB: Team;
  createdAt: number;
};
const games: Map<string, Game> = new Map();

/* ---------- Helpers ---------- */

function teamSize(team: Team) {
  return team.participants.size;
}

function broadcastTeam(io: Server, team: Team, event: string, data: any) {
  io.to(team.id).emit(event, data);
}

function enqueueTeam(io: Server, team: Team) {
  const size = teamSize(team);
  let list = teamQueues.get(size);
  if (!list) {
    list = [];
    teamQueues.set(size, list);
  }
  if (!list.find(t => t.id === team.id)) {
    list.push(team);
    team.inQueue = true;
    broadcastTeam(io, team, "team:match:queued", { teamId: team.id, size });
  }
  attemptMatch(io, size);
}

function dequeueTeam(io: Server, team: Team, reason: string) {
  if (!team.inQueue) return;
  const size = teamSize(team);
  const list = teamQueues.get(size);
  if (list) {
    const idx = list.findIndex(t => t.id === team.id);
    if (idx !== -1) {
      list.splice(idx, 1);
      if (list.length === 0) teamQueues.delete(size);
    }
  }
  team.inQueue = false;
  broadcastTeam(io, team, "team:match:cancelled", { teamId: team.id, reason });
}

function attemptMatch(io: Server, size: number) {
  const list = teamQueues.get(size);
  if (!list || list.length < 2) return;

  const teamA = list.shift()!;
  const teamB = list.shift()!;
  if (list.length === 0) teamQueues.delete(size);

  teamA.inQueue = false;
  teamB.inQueue = false;

  const gameId = "game-" + generateInviteCode();
  createGame(gameId, teamA, teamB);

  const baseGameData = {
    gameId,
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
    barPosition: 0,
    status: "active" as const,
    winThreshold: 25
  };

  // Send to teamA players with yourTeamIsA: true
  teamA.participants.forEach(player => {
    io.to(player.id).emit("game:started", {
      ...baseGameData,
      yourTeamIsA: true
    });
  });

  // Send to teamB players with yourTeamIsA: false
  teamB.participants.forEach(player => {
    io.to(player.id).emit("game:started", {
      ...baseGameData,
      yourTeamIsA: false
    });
  });
}

/* ---------- Events ---------- */

export function handleTeamEvents(io: Server, socket: Socket) {

  socket.on("team:create", (data: TeamCreateDto) => {
    if (playerTeam.has(socket.id)) {
      socket.emit("team:error", { message: "Already in a team" });
      return;
    }
    const player: Player = { id: socket.id, name: data.name, socket };
    const team: Team = {
      id: generateInviteCode(),
      name: data.teamName, // Use the provided team name
      participants: new Set([player]),
      leaderId: player.id,
      inQueue: false
    };
    teams.set(team.id, team);
    playerTeam.set(socket.id, team.id);
    socket.join(team.id);
    socket.emit("team:created", { teamId: team.id, leader: true });
  });

  socket.on("team:join", (data: TeamJoinDto) => {
    if (playerTeam.has(socket.id)) {
      socket.emit("team:error", { message: "Already in a team" });
      return;
    }
    const team = teams.get(data.inviteCode);
    if (!team) {
      socket.emit("team:error", { message: "Team not found" });
      return;
    }
    if (team.participants.size >= MAX_TEAM_SIZE) {
      socket.emit("team:error", { message: "Team full" });
      return;
    }
    if (team.inQueue) {
      dequeueTeam(io, team, "Player joined");
    }
    const player: Player = { id: socket.id, name: data.name, socket };
    team.participants.add(player);
    playerTeam.set(socket.id, team.id);
    socket.join(team.id);
    socket.to(team.id).emit("team:playerJoined", { playerId: socket.id, playerName: player.name, teamId: team.id });
    socket.emit("team:joined", { teamId: team.id, leader: team.leaderId === socket.id });
  });

  socket.on("team:leave", () => {
    const teamId = playerTeam.get(socket.id);
    if (!teamId) return;
    const team = teams.get(teamId);
    playerTeam.delete(socket.id);
    if (!team) return;

    if (team.inQueue) {
      dequeueTeam(io, team, "Player left");
    }

    const player = [...team.participants].find(p => p.id === socket.id);
    if (player) {
      team.participants.delete(player);
      socket.to(teamId).emit("team:playerLeft", { playerId: socket.id, playerName: player.name, teamId });
    }

    if (team.leaderId === socket.id && team.participants.size > 0) {
      const newLeader = [...team.participants][0];
      team.leaderId = newLeader!.id;
      broadcastTeam(io, team, "team:leaderChanged", { teamId, leaderId: newLeader!.id });
    }

    socket.leave(teamId);
    if (team.participants.size === 0) {
      teams.delete(teamId);
    }
    socket.emit("team:left", { teamId });
  });

  socket.on("team:match:start", () => {
    const teamId = playerTeam.get(socket.id);
    if (!teamId) {
      socket.emit("team:match:error", { message: "Not in a team" });
      return;
    }
    const team = teams.get(teamId);
    if (!team) {
      socket.emit("team:match:error", { message: "Team missing" });
      return;
    }
    if (team.leaderId !== socket.id) {
      socket.emit("team:match:error", { message: "Only leader can start" });
      return;
    }
    if (team.inQueue) {
      socket.emit("team:match:error", { message: "Already queued" });
      return;
    }
    if (team.participants.size > MAX_TEAM_SIZE) {
      socket.emit("team:match:error", { message: "Team too large" });
      return;
    }
    enqueueTeam(io, team);
  });

  socket.on("team:match:cancel", () => {
    const teamId = playerTeam.get(socket.id);
    if (!teamId) return;
    const team = teams.get(teamId);
    if (!team) return;
    if (team.leaderId !== socket.id) {
      socket.emit("team:match:error", { message: "Only leader can cancel" });
      return;
    }
    if (!team.inQueue) {
      socket.emit("team:match:error", { message: "Not queued" });
      return;
    }
    dequeueTeam(io, team, "Leader cancelled");
  });

  socket.on("team:status", () => {
    const teamId = playerTeam.get(socket.id);
    if (!teamId) {
      socket.emit("team:status", { inTeam: false });
      return;
    }
    const team = teams.get(teamId);
    if (!team) {
      socket.emit("team:status", { inTeam: false });
      return;
    }
    socket.emit("team:status", {
      inTeam: true,
      teamId,
      name: team.name,
      players: [...team.participants].map(p => ({ id: p.id, name: p.name })),
      leaderId: team.leaderId,
      inQueue: team.inQueue,
      size: teamSize(team),
      maxSize: MAX_TEAM_SIZE
    });
  });

  socket.on("disconnect", () => {
    const teamId = playerTeam.get(socket.id);
    if (!teamId) return;
    const team = teams.get(teamId);
    playerTeam.delete(socket.id);
    if (!team) return;

    if (team.inQueue) {
      dequeueTeam(io, team, "Disconnect");
    }

    const player = [...team.participants].find(p => p.id === socket.id);
    if (player) team.participants.delete(player);

    if (team.leaderId === socket.id && team.participants.size > 0) {
      const newLeader = [...team.participants][0];
      team.leaderId = newLeader!.id;
      broadcastTeam(io, team, "team:leaderChanged", { teamId, leaderId: newLeader!.id });
    }

    socket.to(team.id).emit("team:playerLeft", { playerId: socket.id, teamId });

    if (team.participants.size === 0) {
      teams.delete(team.id);
    }
  });
}