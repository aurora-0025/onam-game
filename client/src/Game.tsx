import { useState, useEffect } from "react";
import type { Socket } from "socket.io-client";
import { Button } from "./components/ui/button";
import { toast } from "sonner";
import CharacterSprite from "./components/CharacterSprite";

/**
 * Matches server "game:started" / "game:update" payload (team.handler.ts + game.handler.ts)
 */
export type GameState = {
  gameId: string;
  teamA: {
    teamId: string;
    name: string;
    players: { id: string; name: string; clicks: number }[];
    leaderId: string;
    totalClicks: number;
  };
  teamB: {
    teamId: string;
    name: string;
    players: { id: string; name: string; clicks: number }[];
    leaderId: string;
    totalClicks: number;
  };
  barPosition: number;
  status: "active" | "finished";
  winner?: "teamA" | "teamB";
  winThreshold: number;
  yourTeamIsA: boolean;
};

interface GameProps {
  socket: Socket;
  gameState: GameState;          // Must already be in the new format
  onLeaveGame: () => void;
}

function Game({ socket, gameState: initialGameState, onLeaveGame }: GameProps) {
  const [gameState, setGameState] = useState<GameState>(initialGameState);
  const [ropeFrame, setRopeFrame] = useState(1);

  /* ---------- Animation (rope frames) ---------- */
  useEffect(() => {
    const i = setInterval(() => {
      setRopeFrame(r => (r === 3 ? 1 : r + 1));
    }, 200);
    return () => clearInterval(i);
  }, []);

  /* ---------- Socket events (game:started + game:update) ---------- */
  useEffect(() => {
    const onStarted = (data: GameState) => setGameState(data);
    const onUpdate = (data: GameState) => setGameState(data);
    const onError = (data: { message: string }) =>
      toast.error(`Game error: ${data.message}`, { duration: 4000 });
    const onLeft = () => onLeaveGame();

    socket.on("game:started", onStarted);
    socket.on("game:update", onUpdate);
    socket.on("game:error", onError);
    socket.on("game:left", onLeft);

    return () => {
      socket.off("game:started", onStarted);
      socket.off("game:update", onUpdate);
      socket.off("game:error", onError);
      socket.off("game:left", onLeft);
    };
  }, [socket, onLeaveGame]);

  /* ---------- Actions ---------- */
  const handleClick = () => {
    if (gameState.status === "active") socket.emit("game:click");
  };
  const handleLeaveGame = () => {
    socket.emit("game:leave");
    onLeaveGame();
  };

  /* ---------- Derived teams ---------- */
  const { teamA, teamB, yourTeamIsA, barPosition, winThreshold } = gameState;
  const yourTeam = yourTeamIsA ? teamA : teamB;
  const opponentTeam = yourTeamIsA ? teamB : teamA;

  /* ---------- Win / end conditions ---------- */
  const isGameOver = gameState.status === "finished";
  const opponentTeamEmpty = opponentTeam.players.length === 0;
  const yourTeamEmpty = yourTeam.players.length === 0;

  let myTeamWon = false;
  let winReason = "";
  if (isGameOver) {
    myTeamWon =
      (yourTeamIsA && gameState.winner === "teamA") ||
      (!yourTeamIsA && gameState.winner === "teamB");
    winReason = myTeamWon ? "Your team won!" : "Opponent team won!";
  } else if (opponentTeamEmpty && !yourTeamEmpty) {
    myTeamWon = true;
    winReason = "All opponents disconnected!";
  } else if (yourTeamEmpty && !opponentTeamEmpty) {
    myTeamWon = false;
    winReason = "Your team has no players left!";
  }
  const showWinScreen = isGameOver || opponentTeamEmpty || yourTeamEmpty;

  /* ---------- Visual helpers ---------- */
  const adjustedBarPosition = yourTeamIsA ? barPosition : -barPosition;

  const getLeftTeamPositions = (count: number) =>
    ({
      1: [15],
      2: [15, 35],
      3: [15, 32, 44],
      4: [15, 25, 35, 45],
      5: [10, 15, 20, 25, 30],
    }[count] || []);

  const getRightTeamPositions = (count: number) =>
    ({
      1: [85],
      2: [65, 85],
      3: [56, 68, 85],
      4: [55, 65, 75, 85],
      5: [70, 75, 80, 85, 90],
    }[count] || []);

  const leftPositions = getLeftTeamPositions(yourTeam.players.length);
  const rightPositions = getRightTeamPositions(opponentTeam.players.length);

  return (
    <div className="w-full relative min-h-screen">
      <div className="relative z-10 space-y-6">
        {showWinScreen && (
          <div
            className={`text-center p-6 rounded-lg backdrop-blur-sm ${
              myTeamWon ? "bg-green-100/90 text-green-800" : "bg-red-100/90 text-red-800"
            }`}
          >
            <h2 className="text-3xl font-bold mb-2">
              {myTeamWon ? "🎉 Victory!" : "💔 Defeat!"}
            </h2>
            <p className="text-lg">{winReason}</p>
            {opponentTeamEmpty && !isGameOver && (
              <p className="text-sm mt-2 text-gray-600">
                Game will end automatically when all opponents disconnect.
              </p>
            )}
          </div>
        )}

        {/* Arena */}
        <div
          className="p-2 min-h-[200px] space-y-2 flex items-center justify-center relative"
          style={{
            backgroundSize: "cover",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "bottom",
            backgroundImage: "url('/game-bg.png')",
          }}
        >
          {/* Threshold markers */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full h-32 pointer-events-none">
            <div
              className={`absolute bottom-1/2 w-2 h-20 shadow-lg transition-colors duration-300 ${
                adjustedBarPosition <= -winThreshold ? "bg-green-400" : "bg-white"
              }`}
              style={{
                left: "calc(50% - 50px)",
                transform: "skewX(-10deg)",
                opacity: 0.9,
              }}
            />
            <div
              className={`absolute bottom-1/2 w-2 h-20 shadow-lg transition-colors duration-300 ${
                adjustedBarPosition >= winThreshold ? "bg-red-400" : "bg-white"
              }`}
              style={{
                left: "calc(50% + 35px)",
                transform: "skewX(10deg)",
                opacity: 0.9,
              }}
            />
          </div>

          <div className="relative w-full max-w-4xl h-40 flex items-center justify-center">
            {/* Rope */}
            <div
              className="absolute -top-8 scale-y-50 bg-contain bg-no-repeat bg-center transition-all duration-300"
              style={{
                width: "100%",
                height: "100%",
                backgroundImage: `url('/rope${ropeFrame}.png')`,
                transform: `translateX(${adjustedBarPosition * 2}px)`,
                filter:
                  adjustedBarPosition <= -winThreshold
                    ? "hue-rotate(120deg) brightness(1.2)"
                    : adjustedBarPosition >= winThreshold
                    ? "hue-rotate(0deg) brightness(1.2)"
                    : "none",
              }}
            />

            {/* Your team (left) */}
            {yourTeam.players.map((p, i) => {
              const base = leftPositions[i] || 35;
              const finalPos = base + adjustedBarPosition / 3;
              return (
                <div
                  key={`yt-${p.id}`}
                  className="absolute -top-4 transition-all duration-300 -translate-x-full"
                  style={{
                    left: `${Math.max(5, Math.min(85, finalPos))}%`,
                    zIndex: yourTeam.players.length - i,
                  }}
                >
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-20">
                    <span className="text-xs font-semibold text-white px-2 py-1 rounded-full whitespace-nowrap shadow-sm">
                      {p.name.length > 10 ? `${p.name.slice(0, 10)}...` : p.name}
                    </span>
                  </div>
                  <CharacterSprite scale={0.18} imgSrc="man" />
                </div>
              );
            })}

            {/* Opponent (right) */}
            {opponentTeam.players.map((p, i) => {
              const base = rightPositions[i] || 65;
              const finalPos = base + adjustedBarPosition / 3;
              return (
                <div
                  key={`opp-${p.id}`}
                  className="absolute -top-4 transition-all duration-300 scale-x-[-1]"
                  style={{
                    left: `${Math.max(15, Math.min(95, finalPos))}%`,
                    zIndex: opponentTeam.players.length - i,
                  }}
                >
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-20 scale-x-[-1]">
                    <span className="text-xs font-semibold text-white px-2 py-1 rounded-full whitespace-nowrap shadow-sm">
                      {p.name.length > 10 ? `${p.name.slice(0, 10)}...` : p.name}
                    </span>
                  </div>
                  <CharacterSprite scale={0.18} imgSrc="man2" />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Click Button */}
      <div className="text-center space-y-4">
        <Button
          onClick={handleClick}
          disabled={showWinScreen || yourTeamEmpty}
          className="w-32 h-32 text-2xl font-bold rounded-full bg-green-500 hover:bg-green-600 disabled:bg-gray-400 transition-all duration-200 active:scale-95 shadow-lg"
        >
          {showWinScreen ? "Game Over" : yourTeamEmpty ? "No Team" : "PULL!"}
        </Button>
      </div>

      <div className="text-center">
        <Button
          variant="outline"
          onClick={handleLeaveGame}
          className="bg-red-50/90 hover:bg-red-100/90 text-red-600 backdrop-blur-sm border-red-200"
        >
          Leave Game
        </Button>
      </div>
    </div>
  );
}

export default Game;