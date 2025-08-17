import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import { Toaster } from "sonner";
import Room from "./Room";
import MainMenu from "./MainMenu";
import Game, { type GameState } from "./Game";

const socket = io("http://localhost:3000");

export type RoomState = {
  inRoom: boolean;
  roomId?: string;
  name?: string;
  players?: { id: string; name: string }[];
  leaderId?: string;
  inQueue?: boolean;
  size?: number;
};

function App() {
  const [roomState, setRoomState] = useState<RoomState>({ inRoom: false });
  const [gameState, setGameState] = useState<GameState | null>(null);

  useEffect(() => {
    // Listen for room events
    socket.on("room:created", (data) => {
      console.log("Room created:", data);
      socket.emit("room:status"); // Get full room state
    });

    socket.on("room:joined", (data) => {
      console.log("Room joined:", data);
      socket.emit("room:status"); // Get full room state
    });

    socket.on("room:status", (data: RoomState) => {
      console.log("Room status:", data);
      setRoomState(data);
    });

    socket.on("room:error", (data) => {
      console.error("Room error:", data.message);
      alert(data.message);
    });

    socket.on("room:left", () => {
      setRoomState({ inRoom: false });
    });

    // Listen for player join/leave events to update UI
    socket.on("room:playerJoined", (data) => {
      console.log("Player joined:", data);
      setRoomState(prevState => {
        if (!prevState.players) return prevState;
        const newPlayer = { id: data.playerId, name: data.playerName };
        // Check if player already exists to avoid duplicates
        const playerExists = prevState.players.some(p => p.id === data.playerId);
        if (playerExists) return prevState;
        
        return {
          ...prevState,
          players: [...prevState.players, newPlayer],
          size: (prevState.size || 0) + 1
        };
      });
    });

    socket.on("room:playerLeft", (data) => {
      console.log("Player left:", data);
      setRoomState(prevState => {
        if (!prevState.players) return prevState;
        
        return {
          ...prevState,
          players: prevState.players.filter(p => p.id !== data.playerId),
          size: Math.max((prevState.size || 1) - 1, 0)
        };
      });
    });

    socket.on("room:leaderChanged", (data) => {
      console.log("Leader changed:", data);
      setRoomState(prevState => ({
        ...prevState,
        leaderId: data.leaderId
      }));
    });

    // Listen for game events
    socket.on("game:started", (data: GameState) => {
      console.log("Game started:", data);
      setGameState(data);
      setRoomState(prevState => ({
        ...prevState,
        inQueue: false
      }));
    });

    // Check initial room status
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
    socket.emit("room:status"); // Refresh room state
  };

  // Game takes priority over room
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