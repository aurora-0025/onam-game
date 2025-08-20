import { useState, useEffect } from "react";
import type { Socket } from "socket.io-client";
import { Button } from "./components/ui/button";
import { toast } from "sonner";
import { Trophy, Skull, RotateCcw, Clock, Users, DoorOpen } from "lucide-react";
import CanvasArena from "./CanvasArena";

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
    status: "countdown" | "active" | "finished";
    winner?: "teamA" | "teamB";
    winThreshold: number;
    yourTeamIsA: boolean;
    countdownRemaining?: number;
    restartVotesA?: string[];
    restartVotesB?: string[];
};

interface GameProps {
    socket: Socket;
    gameState: GameState;
    onLeaveGame: () => void;
}

function Game({ socket, gameState: initialGameState, onLeaveGame }: GameProps) {
    const [gameState, setGameState] = useState<GameState>(initialGameState);
    const [ropeFrame, setRopeFrame] = useState(1);

    // Rope animation
    useEffect(() => {
        const i = setInterval(() => {
            setRopeFrame(r => (r === 3 ? 1 : r + 1));
        }, 200);
        return () => clearInterval(i);
    }, []);

    // Socket events
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

    // Actions
    const handleClick = () => {
        if (gameState.status === "active") {
            socket.emit("game:click");
        }
    };
    const handleLeaveGame = () => {
        socket.emit("game:leave");
        onLeaveGame();
    };
    const handleRestart = () => {
        socket.emit("game:restart");
    };

    // Derived teams
    const { teamA, teamB, yourTeamIsA } = gameState;
    const yourTeam = yourTeamIsA ? teamA : teamB;
    const opponentTeam = yourTeamIsA ? teamB : teamA;

    // Win / end conditions
    const isGameOver = gameState.status === "finished";
    const opponentTeamEmpty = opponentTeam.players.length === 0;
    const yourTeamEmpty = yourTeam.players.length === 0;

    const myId = socket.id!;
    const restartVotesA = gameState.restartVotesA || [];
    const restartVotesB = gameState.restartVotesB || [];
    const myTeamVotes = gameState.yourTeamIsA ? restartVotesA : restartVotesB;
    const otherTeamVotes = gameState.yourTeamIsA ? restartVotesB : restartVotesA;

    const myTeamAllVoted = gameState.yourTeamIsA
        ? restartVotesA.length === gameState.teamA.players.length
        : restartVotesB.length === gameState.teamB.players.length;

    const otherTeamAllVoted = gameState.yourTeamIsA
        ? restartVotesB.length === gameState.teamB.players.length
        : restartVotesA.length === gameState.teamA.players.length;

    const iVoted = myTeamVotes.includes(myId);

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

    return (
        <div className="w-full min-h-screen bg-gradient-to-br from-blue-50 to-green-50 relative overflow-hidden">
            {/* Background Pattern */}
            <div className="absolute inset-0 opacity-5">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,theme(colors.blue.500),transparent_50%)]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_50%,theme(colors.green.500),transparent_50%)]" />
            </div>

            {/* Game Status Bar */}
            <div className="relative z-20 bg-white/80 backdrop-blur-md shadow-sm border-b border-gray-200/50">
                <div className="max-w-6xl mx-auto px-4 py-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-6">
                            <div className="text-sm font-medium text-gray-600">
                                Game: {gameState.gameId}
                            </div>
                            <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                gameState.status === 'active' ? 'bg-green-100 text-green-700' :
                                gameState.status === 'countdown' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-gray-100 text-gray-700'
                            }`}>
                                {gameState.status === 'active' ? 'ACTIVE' :
                                 gameState.status === 'countdown' ? 'STARTING' : 'FINISHED'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="relative z-10 max-w-6xl mx-auto px-4 py-8">
                {/* Win Screen Overlay */}
                {showWinScreen && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
                        <div className={`max-w-md mx-4 p-8 rounded-2xl shadow-2xl border-2 ${
                            myTeamWon 
                                ? "bg-gradient-to-br from-green-50 to-emerald-100 border-green-200" 
                                : "bg-gradient-to-br from-red-50 to-rose-100 border-red-200"
                        }`}>
                            <div className="text-center">
                                <div className="flex justify-center mb-4">
                                    {myTeamWon ? <Trophy className="w-16 h-16 text-green-600" /> : <Skull className="w-16 h-16 text-red-600" />}
                                </div>
                                <h2 className={`text-4xl font-bold mb-3 ${
                                    myTeamWon ? "text-green-800" : "text-red-800"
                                }`}>
                                    {myTeamWon ? "Victory!" : "Defeat!"}
                                </h2>
                                <p className={`text-lg mb-6 ${
                                    myTeamWon ? "text-green-700" : "text-red-700"
                                }`}>
                                    {winReason}
                                </p>

                                {gameState.status === "finished" &&
                                    teamA.players.length > 0 &&
                                    teamB.players.length > 0 && (
                                    <div className="space-y-4">
                                        {!iVoted && !myTeamAllVoted && (
                                            <Button
                                                onClick={handleRestart}
                                                className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold py-3 px-6 rounded-lg shadow-lg transform transition-all duration-200 hover:scale-105"
                                            >
                                                <RotateCcw className="w-4 h-4 mr-2" />
                                                Ready to Restart
                                            </Button>
                                        )}

                                        {iVoted && !myTeamAllVoted && (
                                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                                <div className="flex items-center text-blue-800 font-medium">
                                                    <Clock className="w-4 h-4 mr-2" />
                                                    Waiting for teammates
                                                </div>
                                                <div className="text-blue-600 text-sm mt-1">
                                                    {myTeamVotes.length}/{gameState.yourTeamIsA ? gameState.teamA.players.length : gameState.teamB.players.length} ready
                                                </div>
                                            </div>
                                        )}

                                        {myTeamAllVoted && !otherTeamAllVoted && (
                                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                                                <div className="flex items-center text-amber-800 font-medium">
                                                    <Users className="w-4 h-4 mr-2" />
                                                    Your team is ready
                                                </div>
                                                <div className="text-amber-600 text-sm mt-1">
                                                    Waiting for other team ({otherTeamVotes.length}/{gameState.yourTeamIsA ? gameState.teamB.players.length : gameState.teamA.players.length})
                                                </div>
                                            </div>
                                        )}

                                        {myTeamAllVoted && otherTeamAllVoted && (
                                            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                                <div className="flex items-center text-green-700 font-medium animate-pulse">
                                                    <RotateCcw className="w-4 h-4 mr-2 animate-spin" />
                                                    Restarting game...
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="pt-6 border-t border-gray-200 mt-6">
                                    <Button
                                        onClick={handleLeaveGame}
                                        variant="outline"
                                        className="w-full border-gray-300 text-gray-700 hover:bg-gray-50"
                                    >
                                        <DoorOpen className="w-4 h-4 mr-2" />
                                        Leave Game
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Team Stats */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    {/* Your Team */}
                    <div className={`bg-white/80 backdrop-blur-sm rounded-xl shadow-lg p-6 border-2 ${
                        yourTeamIsA ? 'border-blue-200' : 'border-green-200'
                    }`}>
                        <div className="text-center">
                            <h3 className={`text-xl font-bold mb-2 ${
                                yourTeamIsA ? 'text-blue-700' : 'text-green-700'
                            }`}>
                                Your Team
                            </h3>
                            <div className="text-sm text-gray-600 mb-2">{yourTeam.name}</div>
                            <div className={`inline-flex items-center px-4 py-2 rounded-full text-lg font-bold ${
                                yourTeamIsA 
                                    ? 'bg-blue-100 text-blue-700' 
                                    : 'bg-green-100 text-green-700'
                            }`}>
                                {yourTeam.totalClicks} clicks
                            </div>
                            <div className="text-sm text-gray-500 mt-2">
                                {yourTeam.players.length} player{yourTeam.players.length !== 1 ? 's' : ''}
                            </div>
                        </div>
                    </div>

                    {/* Opponent Team */}
                    <div className={`bg-white/80 backdrop-blur-sm rounded-xl shadow-lg p-6 border-2 ${
                        !yourTeamIsA ? 'border-blue-200' : 'border-green-200'
                    }`}>
                        <div className="text-center">
                            <h3 className={`text-xl font-bold mb-2 ${
                                !yourTeamIsA ? 'text-blue-700' : 'text-green-700'
                            }`}>
                                Opponent Team
                            </h3>
                            <div className="text-sm text-gray-600 mb-2">{opponentTeam.name}</div>
                            <div className={`inline-flex items-center px-4 py-2 rounded-full text-lg font-bold ${
                                !yourTeamIsA 
                                    ? 'bg-blue-100 text-blue-700' 
                                    : 'bg-green-100 text-green-700'
                            }`}>
                                {opponentTeam.totalClicks} clicks
                            </div>
                            <div className="text-sm text-gray-500 mt-2">
                                {opponentTeam.players.length} player{opponentTeam.players.length !== 1 ? 's' : ''}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Canvas Arena */}
                <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl p-6 mb-8 border border-gray-200/50">
                    <CanvasArena gameState={gameState} ropeFrame={ropeFrame} />
                </div>

                {/* Action Button */}
                <div className="text-center mb-8">
                    {(() => {
                        const isCountdown = gameState.status === "countdown";
                        const effectiveCountdown = isCountdown ? (gameState.countdownRemaining ?? 3) : undefined;
                        
                        return (
                            <div className="relative">
                                <Button
                                    onClick={handleClick}
                                    disabled={showWinScreen || yourTeamEmpty || gameState.status !== "active"}
                                    className={`relative w-40 h-40 text-3xl font-bold rounded-full shadow-2xl border-4 transition-all duration-200 transform ${
                                        showWinScreen || yourTeamEmpty || gameState.status !== "active"
                                            ? 'bg-gray-400 border-gray-300 cursor-not-allowed'
                                            : isCountdown
                                                ? 'bg-gradient-to-br from-yellow-400 to-orange-500 border-orange-300 hover:from-yellow-500 hover:to-orange-600'
                                                : 'bg-gradient-to-br from-green-400 to-emerald-600 border-green-300 hover:from-green-500 hover:to-emerald-700 active:scale-95'
                                    }`}
                                >
                                    {showWinScreen ? (
                                        <span>Game<br/>Over</span>
                                    ) : yourTeamEmpty ? (
                                        <span>No<br/>Team</span>
                                    ) : isCountdown ? (
                                        <div className="flex flex-col items-center">
                                            <div className="text-6xl font-extrabold animate-pulse">
                                                {effectiveCountdown}
                                            </div>
                                            <div className="text-sm">Get Ready!</div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center">
                                            <div>PULL!</div>
                                        </div>
                                    )}
                                </Button>
                            
                            </div>
                        );
                    })()}
                </div>
            </div>
        </div>
    );
}

export default Game;