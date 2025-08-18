import { useState, useEffect } from "react";
import { io, Socket } from "socket.io-client";
import { Toaster, toast } from "sonner";
import Room from "./Room";
import MainMenu from "./MainMenu";
import Game, { type GameState } from "./Game";

export type RoomState = {
  inRoom: boolean;
  roomId?: string;
  name?: string;
  players?: { id: string; name: string }[];
  leaderId?: string;
  inQueue?: boolean;
  size?: number;
};

// --- Socket init with explicit config + debug ---
const socket: Socket = io("https://onam-game-production.up.railway.app");

// Debug wrappers
const originalEmit = socket.emit.bind(socket);
socket.emit = (event: string, ...args: unknown[]) => {
  console.log("[socket][send]", event, args[0] ?? "");
  return originalEmit(event, ...args);
};
socket.onAny((event, ...args) => {
  console.log("[socket][recv]", event, args[0] ?? "");
});

function App() {
  const [roomState, setRoomState] = useState<RoomState>({ inRoom: false, players: [], size: 0 });
  const [gameState, setGameState] = useState<GameState | null>(null);

  useEffect(() => {
    socket.on("connect", () => {
      console.log("[socket] connected", socket.id);
      socket.emit("room:status");
    });
    socket.on("disconnect", (reason) => {
      console.log("[socket] disconnected", reason);
    });
    socket.on("connect_error", (err) => {
      console.error("[socket] connect_error", err.message);
      toast.error("Connection error: " + err.message);
    });
    socket.on("reconnect_attempt", (n) => console.log("[socket] reconnect_attempt", n));
    socket.on("reconnect_failed", () => console.warn("[socket] reconnect_failed"));
    socket.on("error", (e) => console.error("[socket] error", e));

    // Room / game events
    socket.on("room:created", () => {
      console.log("Room Created");
      
      socket.emit("room:status")
  });
    socket.on("room:joined", () => socket.emit("room:status"));
    socket.on("room:status", (data: RoomState) => {
      const players = data.players ?? [];
      setRoomState({ ...data, players, size: players.length });
    });
    socket.on("room:error", (data: { message: string }) => {
      console.error("Room error:", data.message);
      toast.error(data.message);
    });
    socket.on("room:left", () => {
      setRoomState({ inRoom: false, players: [], size: 0 });
    });
    socket.on("room:playerJoined", (data: { playerId: string; playerName: string }) => {
      setRoomState(prev => {
        const players = prev.players ?? [];
        if (players.some(p => p.id === data.playerId)) return prev;
        const updated = [...players, { id: data.playerId, name: data.playerName }];
        return { ...prev, players: updated, size: updated.length };
      });
    });
    socket.on("room:playerLeft", (data: { playerId: string }) => {
      setRoomState(prev => {
        const players = prev.players ?? [];
        const updated = players.filter(p => p.id !== data.playerId);
        return { ...prev, players: updated, size: updated.length };
      });
    });
    socket.on("room:leaderChanged", (data: { leaderId: string }) => {
      setRoomState(prev => ({ ...prev, leaderId: data.leaderId }));
    });
    socket.on("game:started", (data: GameState) => {
      if (!data) return;
      setGameState(data);
      setRoomState(prev => ({ ...prev, inQueue: false }));
    });

    return () => {
      socket.removeAllListeners();
    };
  }, []);

  const handleLeaveGame = () => {
    setGameState(null);
    socket.emit("room:status");
  };

  if (gameState) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <Game socket={socket} gameState={gameState} onLeaveGame={handleLeaveGame} />
        <Toaster richColors position="top-right" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      {roomState.inRoom ? (
        <Room socket={socket} roomState={roomState} setRoomState={setRoomState} />
      ) : (
        <MainMenu socket={socket} />
      )}
      <Toaster richColors position="top-right" />
    </div>
  );
}

export default App;