import type { Server, Socket } from "socket.io";
import { generateInviteCode } from "../utils";
import { createGame } from "./game.handler";

type Player = {
  id: string;
  name: string;
  socket: Socket;
};

type Room = {
  id: string;
  name: string;
  participants: Set<Player>;
  leaderId: string;
  inQueue: boolean;
};

type RoomMap = Map<string, Room>;

type RoomCreateDto = { name: string };
type RoomJoinDto = { name: string; inviteCode: string };

export const rooms: RoomMap = new Map();
const playerRoom: Map<string, string> = new Map();

// Matchmaking queue keyed by team size
const teamQueues: Map<number, Room[]> = new Map();

type Game = {
  id: string;
  teamA: Room;
  teamB: Room;
  createdAt: number;
};
const games: Map<string, Game> = new Map();

/* ---------- Helpers ---------- */

function roomSize(room: Room) {
  return room.participants.size;
}

function broadcastRoom(io: Server, room: Room, event: string, data: any) {
  io.to(room.id).emit(event, data);
}

function enqueueRoom(io: Server, room: Room) {
  const size = roomSize(room);
  let list = teamQueues.get(size);
  if (!list) {
    list = [];
    teamQueues.set(size, list);
  }
  if (!list.find(r => r.id === room.id)) {
    list.push(room);
    room.inQueue = true;
    broadcastRoom(io, room, "team:match:queued", { roomId: room.id, size });
  }
  attemptMatch(io, size);
}

function dequeueRoom(io: Server, room: Room, reason: string) {
  if (!room.inQueue) return;
  const size = roomSize(room);
  const list = teamQueues.get(size);
  if (list) {
    const idx = list.findIndex(r => r.id === room.id);
    if (idx !== -1) {
      list.splice(idx, 1);
      if (list.length === 0) teamQueues.delete(size);
    }
  }
  room.inQueue = false;
  broadcastRoom(io, room, "team:match:cancelled", { roomId: room.id, reason });
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

  const payloadFor = (self: Room, opp: Room) => ({
    gameId,
    yourTeam: {
      roomId: self.id,
      name: self.name,
      players: [...self.participants].map(p => ({ id: p.id, name: p.name })),
      leaderId: self.leaderId
    },
    opponent: {
      roomId: opp.id,
      name: opp.name,
      players: [...opp.participants].map(p => ({ id: p.id, name: p.name })),
      leaderId: opp.leaderId
    },
    barPosition: 0,
    status: 'active',
    maxClicks: 1000
  });

  // Emit to each team room
  io.to(teamA.id).emit("game:started", payloadFor(teamA, teamB));
  io.to(teamB.id).emit("game:started", payloadFor(teamB, teamA));
}

/* ---------- Events ---------- */

export function handleRoomEvents(io: Server, socket: Socket) {
  // Create team
  socket.on("room:create", (data: RoomCreateDto) => {
    if (playerRoom.has(socket.id)) {
      socket.emit("room:error", { message: "Already in a team" });
      return;
    }
    const player: Player = { id: socket.id, name: data.name, socket };
    const room: Room = {
      id: generateInviteCode(),
      name: data.name,
      participants: new Set([player]),
      leaderId: player.id,
      inQueue: false
    };
    rooms.set(room.id, room);
    playerRoom.set(socket.id, room.id);
    socket.join(room.id);
    socket.emit("room:created", { inviteCode: room.id, leader: true });
  });

  // Join team
  socket.on("room:join", (data: RoomJoinDto) => {
    if (playerRoom.has(socket.id)) {
      socket.emit("room:error", { message: "Already in a team" });
      return;
    }
    const room = rooms.get(data.inviteCode);
    if (!room) {
      socket.emit("room:error", { message: "Team not found" });
      return;
    }
    if (room.inQueue) {
      dequeueRoom(io, room, "Player joined");
    }
    const player: Player = { id: socket.id, name: data.name, socket };
    room.participants.add(player);
    playerRoom.set(socket.id, room.id);
    socket.join(room.id);
    socket.to(room.id).emit("room:playerJoined", { playerId: socket.id, playerName: player.name });
    socket.emit("room:joined", { inviteCode: room.id, leader: room.leaderId === socket.id });
  });

  // Leave team
  socket.on("room:leave", () => {
    const roomId = playerRoom.get(socket.id);
    if (!roomId) return;
    const room = rooms.get(roomId);
    playerRoom.delete(socket.id);
    if (!room) return;

    if (room.inQueue) dequeueRoom(io, room, "Player left");

    const player = [...room.participants].find(p => p.id === socket.id);
    if (player) {
      room.participants.delete(player);
      socket.to(roomId).emit("room:playerLeft", { playerId: socket.id, playerName: player.name });
    }

    if (room.leaderId === socket.id && room.participants.size > 0) {
      const newLeader = [...room.participants][0];
      room.leaderId = newLeader!.id;
      broadcastRoom(io, room, "room:leaderChanged", { roomId, leaderId: newLeader!.id });
    }

    socket.leave(roomId);
    if (room.participants.size === 0) {
      rooms.delete(roomId);
    }
    socket.emit("room:left", { inviteCode: roomId });
  });

  // Leader starts matchmaking
  socket.on("team:match:start", () => {
    const roomId = playerRoom.get(socket.id);
    if (!roomId) {
      socket.emit("team:match:error", { message: "Not in a team" });
      return;
    }
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit("team:match:error", { message: "Team missing" });
      return;
    }
    if (room.leaderId !== socket.id) {
      socket.emit("team:match:error", { message: "Only leader can start" });
      return;
    }
    if (room.inQueue) {
      socket.emit("team:match:error", { message: "Already queued" });
      return;
    }
    enqueueRoom(io, room);
  });

  // Leader cancels matchmaking
  socket.on("team:match:cancel", () => {
    const roomId = playerRoom.get(socket.id);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    if (room.leaderId !== socket.id) {
      socket.emit("team:match:error", { message: "Only leader can cancel" });
      return;
    }
    if (!room.inQueue) {
      socket.emit("team:match:error", { message: "Not queued" });
      return;
    }
    dequeueRoom(io, room, "Leader cancelled");
  });

  // Status
  socket.on("room:status", () => {
    const roomId = playerRoom.get(socket.id);
    if (!roomId) {
      socket.emit("room:status", { inRoom: false });
      return;
    }
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit("room:status", { inRoom: false });
      return;
    }
    socket.emit("room:status", {
      inRoom: true,
      roomId,
      name: room.name,
      players: [...room.participants].map(p => ({ id: p.id, name: p.name })),
      leaderId: room.leaderId,
      inQueue: room.inQueue,
      size: roomSize(room)
    });
  });

  // Disconnect
  socket.on("disconnect", () => {
    const roomId = playerRoom.get(socket.id);
    if (!roomId) return;
    const room = rooms.get(roomId);
    playerRoom.delete(socket.id);
    if (!room) return;

    if (room.inQueue) dequeueRoom(io, room, "Disconnect");

    room.participants.forEach(p => {
      if (p.id === socket.id) room.participants.delete(p);
    });

    if (room.leaderId === socket.id && room.participants.size > 0) {
      const newLeader = [...room.participants][0];
      room.leaderId = newLeader!.id;
      broadcastRoom(io, room, "room:leaderChanged", { roomId, leaderId: newLeader!.id });
    }

    socket.to(room.id).emit("room:playerLeft", { playerId: socket.id });

    if (room.participants.size === 0) {
      rooms.delete(room.id);
    }
  });
}