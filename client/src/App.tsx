import { useState, useEffect } from "react";
import { io, Socket } from "socket.io-client";
import { Toaster, toast } from "sonner";

import MainMenu from "./MainMenu";
import Game, { type GameState } from "./Game";
import Team from "./Team";

export type TeamState = {
  inTeam: boolean;
  teamId?: string;
  name?: string;
  players?: { id: string; name: string }[];
  leaderId?: string;
  inQueue?: boolean;
  size?: number;
  maxSize?: number;
};

const socket: Socket = io(import.meta.env.VITE_SOCKET_URL || "http://localhost:3000");
const originalEmit = socket.emit.bind(socket);
socket.emit = (event: string, ...args: unknown[]) => {
  console.log("[socket][send]", event, args[0] ?? "");
  return originalEmit(event, ...args);
};
socket.onAny((event, ...args) => {
  console.log("[socket][recv]", event, args[0] ?? "");
});

function App() {
  const [teamState, setTeamState] = useState<TeamState>({ inTeam: false, players: [], size: 0 });
  const [gameState, setGameState] = useState<GameState | null>(null);

  useEffect(() => {
    socket.on("connect", () => {
      socket.emit("team:status");
    });
    socket.on("disconnect", () => {});
    socket.on("connect_error", (err) => {
      toast.error("Connection error: " + err.message);
    });

    // Team / game events
    socket.on("team:created", () => {
      socket.emit("team:status");
    });
    socket.on("team:joined", () => socket.emit("team:status"));
    socket.on("team:status", (data: TeamState) => {
      const players = data.players ?? [];
      setTeamState({ ...data, players, size: players.length });
    });
    socket.on("team:error", (data: { message: string }) => {
      toast.error(data.message);
    });
    socket.on("team:left", () => {
      setTeamState({ inTeam: false, players: [], size: 0 });
    });
    socket.on("team:playerJoined", (data: { playerId: string; playerName: string }) => {
      setTeamState(prev => {
        const players = prev.players ?? [];
        if (players.some(p => p.id === data.playerId)) return prev;
        const updated = [...players, { id: data.playerId, name: data.playerName }];
        return { ...prev, players: updated, size: updated.length };
      });
    });
    socket.on("team:playerLeft", (data: { playerId: string }) => {
      setTeamState(prev => {
        const players = prev.players ?? [];
        const updated = players.filter(p => p.id !== data.playerId);
        return { ...prev, players: updated, size: updated.length };
      });
    });
    socket.on("team:leaderChanged", (data: { leaderId: string }) => {
      setTeamState(prev => ({ ...prev, leaderId: data.leaderId }));
    });
    socket.on("game:started", (data: GameState) => {
      if (!data) return;
      setGameState(data);
      setTeamState(prev => ({ ...prev, inQueue: false }));
    });

    return () => {
      socket.removeAllListeners();
    };
  }, []);

  const handleLeaveGame = () => {
    setGameState(null);
    socket.emit("team:status");
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
      {teamState.inTeam ? (
        <Team socket={socket} teamState={teamState} setTeamState={setTeamState} />
      ) : (
        <MainMenu socket={socket} />
      )}
      <Toaster richColors position="top-right" />
    </div>
  );
}

export default App;