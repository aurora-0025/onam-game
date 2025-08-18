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
  console.log(`📡 Broadcasting to room ${room.id}: ${event}`, data);
  io.to(room.id).emit(event, data);
}

function enqueueRoom(io: Server, room: Room) {
  const size = roomSize(room);
  console.log(`🔄 Enqueueing room ${room.id} with ${size} players`);
  
  let list = teamQueues.get(size);
  if (!list) {
    list = [];
    teamQueues.set(size, list);
    console.log(`📝 Created new queue for team size ${size}`);
  }
  
  if (!list.find(r => r.id === room.id)) {
    list.push(room);
    room.inQueue = true;
    console.log(`✅ Room ${room.id} added to queue. Queue size for ${size} players: ${list.length}`);
    broadcastRoom(io, room, "team:match:queued", { roomId: room.id, size });
  } else {
    console.log(`⚠️ Room ${room.id} already in queue`);
  }
  
  attemptMatch(io, size);
}

function dequeueRoom(io: Server, room: Room, reason: string) {
  if (!room.inQueue) {
    console.log(`⚠️ Attempted to dequeue room ${room.id} but it's not in queue`);
    return;
  }
  
  const size = roomSize(room);
  console.log(`🔄 Dequeueing room ${room.id} (${size} players). Reason: ${reason}`);
  
  const list = teamQueues.get(size);
  if (list) {
    const idx = list.findIndex(r => r.id === room.id);
    if (idx !== -1) {
      list.splice(idx, 1);
      console.log(`✅ Room ${room.id} removed from queue. Queue size now: ${list.length}`);
      if (list.length === 0) {
        teamQueues.delete(size);
        console.log(`🗑️ Queue for team size ${size} deleted (empty)`);
      }
    }
  }
  
  room.inQueue = false;
  broadcastRoom(io, room, "team:match:cancelled", { roomId: room.id, reason });
}

function attemptMatch(io: Server, size: number) {
  const list = teamQueues.get(size);
  console.log(`🎯 Attempting match for team size ${size}. Queue length: ${list?.length || 0}`);
  
  if (!list || list.length < 2) {
    console.log(`❌ Not enough teams in queue for size ${size}. Need 2, have ${list?.length || 0}`);
    return;
  }
  
  const teamA = list.shift()!;
  const teamB = list.shift()!;
  console.log(`🏁 Matching teams: ${teamA.id} vs ${teamB.id}`);
  
  if (list.length === 0) {
    teamQueues.delete(size);
    console.log(`🗑️ Queue for team size ${size} deleted after match`);
  }

  teamA.inQueue = false;
  teamB.inQueue = false;

  const gameId = "game-" + generateInviteCode();
  console.log(`🎮 Creating game ${gameId} with teams ${teamA.id} and ${teamB.id}`);
  
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
  console.log(`📤 Sending game:started to team A (${teamA.id})`);
  io.to(teamA.id).emit("game:started", payloadFor(teamA, teamB));
  
  console.log(`📤 Sending game:started to team B (${teamB.id})`);
  io.to(teamB.id).emit("game:started", payloadFor(teamB, teamA));
}

/* ---------- Events ---------- */

export function handleRoomEvents(io: Server, socket: Socket) {
  console.log(`🔌 Setting up room event handlers for socket ${socket.id}`);

  // Create team
  socket.on("room:create", (data: RoomCreateDto) => {
    console.log(`🏗️ Socket ${socket.id} attempting to create room with name: "${data.name}"`);
    
    if (playerRoom.has(socket.id)) {
      console.log(`❌ Socket ${socket.id} already in a team`);
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
    
    console.log(`✅ Room ${room.id} created by ${socket.id}. Total rooms: ${rooms.size}`);
    socket.emit("room:created", { inviteCode: room.id, leader: true });
  });

  // Join team
  socket.on("room:join", (data: RoomJoinDto) => {
    console.log(`🚪 Socket ${socket.id} attempting to join room ${data.inviteCode} with name: "${data.name}"`);
    
    if (playerRoom.has(socket.id)) {
      console.log(`❌ Socket ${socket.id} already in a team`);
      socket.emit("room:error", { message: "Already in a team" });
      return;
    }
    
    const room = rooms.get(data.inviteCode);
    if (!room) {
      console.log(`❌ Room ${data.inviteCode} not found`);
      socket.emit("room:error", { message: "Team not found" });
      return;
    }
    
    if (room.inQueue) {
      console.log(`⚠️ Room ${room.id} was in queue, removing due to player join`);
      dequeueRoom(io, room, "Player joined");
    }
    
    const player: Player = { id: socket.id, name: data.name, socket };
    room.participants.add(player);
    playerRoom.set(socket.id, room.id);
    socket.join(room.id);
    
    console.log(`✅ Socket ${socket.id} joined room ${room.id}. Room size now: ${room.participants.size}`);
    
    socket.to(room.id).emit("room:playerJoined", { playerId: socket.id, playerName: player.name });
    socket.emit("room:joined", { inviteCode: room.id, leader: room.leaderId === socket.id });
  });

  // Leave team
  socket.on("room:leave", () => {
    console.log(`🚪 Socket ${socket.id} attempting to leave room`);
    
    const roomId = playerRoom.get(socket.id);
    if (!roomId) {
      console.log(`❌ Socket ${socket.id} not in any room`);
      return;
    }
    
    const room = rooms.get(roomId);
    playerRoom.delete(socket.id);
    if (!room) {
      console.log(`❌ Room ${roomId} not found for socket ${socket.id}`);
      return;
    }

    if (room.inQueue) {
      console.log(`⚠️ Room ${room.id} was in queue, removing due to player leave`);
      dequeueRoom(io, room, "Player left");
    }

    const player = [...room.participants].find(p => p.id === socket.id);
    if (player) {
      room.participants.delete(player);
      console.log(`✅ Player ${player.name} (${socket.id}) left room ${room.id}. Room size now: ${room.participants.size}`);
      socket.to(roomId).emit("room:playerLeft", { playerId: socket.id, playerName: player.name });
    }

    if (room.leaderId === socket.id && room.participants.size > 0) {
      const newLeader = [...room.participants][0];
      room.leaderId = newLeader!.id;
      console.log(`👑 New leader for room ${room.id}: ${newLeader!.id}`);
      broadcastRoom(io, room, "room:leaderChanged", { roomId, leaderId: newLeader!.id });
    }

    socket.leave(roomId);
    if (room.participants.size === 0) {
      rooms.delete(roomId);
      console.log(`🗑️ Room ${roomId} deleted (empty). Total rooms: ${rooms.size}`);
    }
    socket.emit("room:left", { inviteCode: roomId });
  });

  // Leader starts matchmaking
  socket.on("team:match:start", () => {
    console.log(`🎯 Socket ${socket.id} attempting to start matchmaking`);
    
    const roomId = playerRoom.get(socket.id);
    if (!roomId) {
      console.log(`❌ Socket ${socket.id} not in a team`);
      socket.emit("team:match:error", { message: "Not in a team" });
      return;
    }
    
    const room = rooms.get(roomId);
    if (!room) {
      console.log(`❌ Room ${roomId} missing for socket ${socket.id}`);
      socket.emit("team:match:error", { message: "Team missing" });
      return;
    }
    
    if (room.leaderId !== socket.id) {
      console.log(`❌ Socket ${socket.id} is not leader of room ${roomId}. Leader is: ${room.leaderId}`);
      socket.emit("team:match:error", { message: "Only leader can start" });
      return;
    }
    
    if (room.inQueue) {
      console.log(`❌ Room ${roomId} already queued`);
      socket.emit("team:match:error", { message: "Already queued" });
      return;
    }
    
    console.log(`✅ Starting matchmaking for room ${roomId} with ${room.participants.size} players`);
    enqueueRoom(io, room);
  });

  // Leader cancels matchmaking
  socket.on("team:match:cancel", () => {
    console.log(`🛑 Socket ${socket.id} attempting to cancel matchmaking`);
    
    const roomId = playerRoom.get(socket.id);
    if (!roomId) {
      console.log(`❌ Socket ${socket.id} not in any room`);
      return;
    }
    
    const room = rooms.get(roomId);
    if (!room) {
      console.log(`❌ Room ${roomId} not found`);
      return;
    }
    
    if (room.leaderId !== socket.id) {
      console.log(`❌ Socket ${socket.id} is not leader of room ${roomId}`);
      socket.emit("team:match:error", { message: "Only leader can cancel" });
      return;
    }
    
    if (!room.inQueue) {
      console.log(`❌ Room ${roomId} not queued`);
      socket.emit("team:match:error", { message: "Not queued" });
      return;
    }
    
    console.log(`✅ Cancelling matchmaking for room ${roomId}`);
    dequeueRoom(io, room, "Leader cancelled");
  });

  // Status
  socket.on("room:status", () => {
    console.log(`📊 Socket ${socket.id} requesting room status`);
    
    const roomId = playerRoom.get(socket.id);
    if (!roomId) {
      console.log(`❌ Socket ${socket.id} not in any room`);
      socket.emit("room:status", { inRoom: false });
      return;
    }
    
    const room = rooms.get(roomId);
    if (!room) {
      console.log(`❌ Room ${roomId} not found for socket ${socket.id}`);
      socket.emit("room:status", { inRoom: false });
      return;
    }
    
    const status = {
      inRoom: true,
      roomId,
      name: room.name,
      players: [...room.participants].map(p => ({ id: p.id, name: p.name })),
      leaderId: room.leaderId,
      inQueue: room.inQueue,
      size: roomSize(room)
    };
    
    console.log(`✅ Sending room status for ${roomId}:`, status);
    socket.emit("room:status", status);
  });

  // Disconnect
  socket.on("disconnect", () => {
    console.log(`🔌 Socket ${socket.id} disconnected`);
    
    const roomId = playerRoom.get(socket.id);
    if (!roomId) {
      console.log(`ℹ️ Socket ${socket.id} was not in any room`);
      return;
    }
    
    const room = rooms.get(roomId);
    playerRoom.delete(socket.id);
    if (!room) {
      console.log(`❌ Room ${roomId} not found for disconnected socket ${socket.id}`);
      return;
    }

    if (room.inQueue) {
      console.log(`⚠️ Room ${room.id} was in queue, removing due to disconnect`);
      dequeueRoom(io, room, "Disconnect");
    }

    room.participants.forEach(p => {
      if (p.id === socket.id) {
        room.participants.delete(p);
        console.log(`✅ Removed disconnected player ${p.name} (${socket.id}) from room ${roomId}`);
      }
    });

    if (room.leaderId === socket.id && room.participants.size > 0) {
      const newLeader = [...room.participants][0];
      room.leaderId = newLeader!.id;
      console.log(`👑 New leader for room ${roomId} after disconnect: ${newLeader!.id}`);
      broadcastRoom(io, room, "room:leaderChanged", { roomId, leaderId: newLeader!.id });
    }

    socket.to(room.id).emit("room:playerLeft", { playerId: socket.id });

    if (room.participants.size === 0) {
      rooms.delete(room.id);
      console.log(`🗑️ Room ${roomId} deleted after disconnect (empty). Total rooms: ${rooms.size}`);
    }
  });

  console.log(`✅ Room event handlers set up for socket ${socket.id}`);
}