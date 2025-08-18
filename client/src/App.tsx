import { useState, useEffect } from "react";
import { io } from "socket.io-client";
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

const socket = io(
  import.meta.env.PROD
    ? (typeof window !== "undefined" ? window.location.origin : "")
    : "http://localhost:3000"
);

function App() {
  const [roomState, setRoomState] = useState<RoomState>({ inRoom: false, players: [], size: 0 });
  const [gameState, setGameState] = useState<GameState | null>(null);
  
  useEffect(() => {
    const onConnectError = (err: Error & { description?: string; context?: unknown }) => {
      console.log("socket connect_error:", err.message, err.description, err.context);
      toast.error("Connection error: " + err.message);
    };
    const onDisconnect = (reason: string) => {
      console.log("socket disconnected:", reason);
    };
    const onReconnect = () => {
      console.log("socket reconnected");
      socket.emit("room:status");
    };

    socket.on("connect_error", onConnectError);
    socket.on("disconnect", onDisconnect);
    socket.on("reconnect", onReconnect);

    return () => {
      socket.off("connect_error", onConnectError);
      socket.off("disconnect", onDisconnect);
      socket.off("reconnect", onReconnect);
    };
  }, []);
  
  useEffect(() => {
    socket.on("room:created", () => {
      socket.emit("room:status");
    });

    socket.on("room:joined", () => {
      socket.emit("room:status");
    });

    socket.on("room:status", (data: RoomState) => {
      const players = data.players ?? [];
      setRoomState({
        ...data,
        players,
        size: players.length
      });
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
        return {
            ...prev,
            players: updated,
            size: updated.length
        };
      });
    });

    socket.on("room:playerLeft", (data: { playerId: string }) => {
      setRoomState(prev => {
        const players = prev.players ?? [];
        const updated = players.filter(p => p.id !== data.playerId);
        return {
          ...prev,
          players: updated,
          size: updated.length
        };
      });
    });

    socket.on("room:leaderChanged", (data: { leaderId: string }) => {
      setRoomState(prev => ({
        ...prev,
        leaderId: data.leaderId
      }));
    });

    socket.on("game:started", (data: GameState) => {
      if (!data) {
        console.error("Received empty game state");
        return;
      }
      setGameState(data);
      setRoomState(prev => ({ ...prev, inQueue: false }));
    });

    socket.emit("room:status");

    return () => {
      socket.off("room:created");
      socket.off("room:joined");
      socket.off("room:status");
      socket.off("room:error");
      socket.off("room:left");
      socket.off("room:playerJoined");
      socket.off("room:playerLeft");
      socket.off("room:leaderChanged");
      socket.off("game:started");
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
