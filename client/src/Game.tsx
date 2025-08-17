import { useState, useEffect } from "react";
import type { Socket } from "socket.io-client";
import { Button } from "./components/ui/button";
import { toast } from "sonner";
import CharacterSprite from "./components/CharacterSprite";

export type GameState = {
    gameId: string;
    yourTeam: {
        roomId: string;
        name: string;
        players: { id: string; name: string; clicks?: number }[];
        leaderId: string;
        totalClicks?: number;
    };
    opponent: {
        roomId: string;
        name: string;
        players: { id: string; name: string; clicks?: number }[];
        leaderId: string;
        totalClicks?: number;
    };
    barPosition?: number;
    status?: 'active' | 'finished';
    winner?: 'teamA' | 'teamB';
    maxClicks?: number;
    yourTeamIsA?: boolean;
};

interface GameProps {
    socket: Socket;
    gameState: GameState;
    onLeaveGame: () => void;
}

function Game({ socket, gameState: initialGameState, onLeaveGame }: GameProps) {
    const [gameState, setGameState] = useState<GameState>(initialGameState);
    const [ropeFrame, setRopeFrame] = useState(1);

    // Rope animation effect
    useEffect(() => {
        const interval = setInterval(() => {
            setRopeFrame(prev => prev === 3 ? 1 : prev + 1);
        }, 200);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        socket.on('game:update', (data) => {
            setGameState(prevState => {
                // Use the yourTeamIsA from the server data
                const yourTeamIsA = data.yourTeamIsA;

                const prevYourTeamCount = prevState.yourTeam.players.length;
                const prevOpponentCount = prevState.opponent.players.length;

                // Map the correct teams based on which team you belong to
                const newYourTeam = yourTeamIsA ? data.teamA : data.teamB;
                const newOpponentTeam = yourTeamIsA ? data.teamB : data.teamA;

                const newYourTeamCount = newYourTeam.players.length;
                const newOpponentCount = newOpponentTeam.players.length;

                // Alert for player leaving your team
                if (newYourTeamCount < prevYourTeamCount) {
                    const leftCount = prevYourTeamCount - newYourTeamCount;
                    toast.warning(`${leftCount} player(s) left your team`, {
                        duration: 3000,
                    });
                }

                // Alert for player leaving opponent team
                if (newOpponentCount < prevOpponentCount) {
                    const leftCount = prevOpponentCount - newOpponentCount;
                    toast.info(`${leftCount} opponent player(s) disconnected`, {
                        duration: 3000,
                    });
                }

                return {
                    ...prevState,
                    yourTeam: {
                        ...prevState.yourTeam,
                        players: newYourTeam.players,
                        totalClicks: newYourTeam.totalClicks
                    },
                    opponent: {
                        ...prevState.opponent,
                        players: newOpponentTeam.players,
                        totalClicks: newOpponentTeam.totalClicks
                    },
                    barPosition: data.barPosition,
                    status: data.status,
                    winner: data.winner,
                    yourTeamIsA: data.yourTeamIsA
                };
            });
        });

        socket.on('game:error', (data) => {
            console.error('Game error:', data.message);
            toast.error(`Game error: ${data.message}`, {
                duration: 5000,
            });
        });

        return () => {
            socket.off('game:update');
            socket.off('game:error');
        };
    }, [socket]);

    const handleClick = () => {
        if (gameState.status === 'active') {
            socket.emit('game:click');
        }
    };

    const handleLeaveGame = () => {
        socket.emit("game:leave");
        onLeaveGame();
    };

    const barPosition = gameState.barPosition || 0;
    const isGameOver = gameState.status === 'finished';
    const opponentTeamEmpty = gameState.opponent.players.length === 0;
    const yourTeamEmpty = gameState.yourTeam.players.length === 0;

    // Determine win condition based on your team position
    let myTeamWon = false;
    let winReason = '';

    if (isGameOver) {
        // If your team is teamA, you win when winner is 'teamA'
        // If your team is teamB, you win when winner is 'teamB'
        const yourTeamIsA = gameState.yourTeamIsA ?? true; // Default to true if not set
        myTeamWon = (yourTeamIsA && gameState.winner === 'teamA') ||
            (!yourTeamIsA && gameState.winner === 'teamB');
        winReason = 'Game finished - ' + (myTeamWon ? 'Your team won!' : 'Opponent team won!');
    } else if (opponentTeamEmpty && !yourTeamEmpty) {
        myTeamWon = true;
        winReason = 'All opponents disconnected!';
    } else if (yourTeamEmpty && !opponentTeamEmpty) {
        myTeamWon = false;
        winReason = 'Your team has no players left!';
    }

    const showWinScreen = isGameOver || opponentTeamEmpty || yourTeamEmpty;

    const yourTeamIsA = gameState.yourTeamIsA ?? true;
    const adjustedBarPosition = yourTeamIsA ? barPosition : -barPosition;

    // Calculate rope width based on total number of players (max 6 players total)
    const totalPlayers = gameState.yourTeam.players.length + gameState.opponent.players.length;
    const maxPlayers = 6; // 3 per team max

    // Rope width: scales from 40% (2 players) to 100% (6 players)
    const minRopeWidth = 40;
    const maxRopeWidth = 100;
    const ropeWidth = minRopeWidth + ((totalPlayers - 2) / (maxPlayers - 2)) * (maxRopeWidth - minRopeWidth);
    const clampedRopeWidth = Math.max(minRopeWidth, Math.min(maxRopeWidth, ropeWidth));

    // Player positioning functions
    const getLeftTeamPositions = (playerCount: number) => {
        switch (playerCount) {
            case 1:
                return [35]; // Single player at 35%
            case 2:
                return [20, 35]; // Two players spread out
            case 3:
                return [20, 32, 44]; // Three players evenly spaced
            default:
                return [];
        }
    };

    const getRightTeamPositions = (playerCount: number) => {
        switch (playerCount) {
            case 1:
                return [65]; // Single player at 65%
            case 2:
                return [58, 72]; // Two players spread out
            case 3:
                return [56, 68, 80]; // Three players evenly spaced
            default:
                return [];
        }
    };

    const leftPositions = getLeftTeamPositions(gameState.yourTeam.players.length);
    const rightPositions = getRightTeamPositions(gameState.opponent.players.length);

    return (
        <div className="w-full relative min-h-screen">
            <div className="relative z-10 space-y-6">
                {/* Game Status / Win Screen */}
                {showWinScreen && (
                    <div className={`text-center p-6 rounded-lg backdrop-blur-sm ${myTeamWon ? 'bg-green-100/90 text-green-800' : 'bg-red-100/90 text-red-800'}`}>
                        <h2 className="text-3xl font-bold mb-2">
                            {myTeamWon ? '🎉 Victory!' : '💔 Defeat!'}
                        </h2>
                        <p className="text-lg">{winReason}</p>
                        {opponentTeamEmpty && !isGameOver && (
                            <p className="text-sm mt-2 text-gray-600">
                                Game will end automatically when all opponents disconnect.
                            </p>
                        )}
                    </div>
                )}

                {/* Tug of War Scene with Rope */}
                <div className="p-2 min-h-[200px] space-y-2 flex items-center justify-center relative"
                    style={{
                        backgroundSize: "cover",
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "bottom",
                        backgroundImage: "url('/game-bg.png')"
                    }}>

                    {/* Ground Lines */}
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full h-32 pointer-events-none">
                        <div
                            className={`absolute bottom-1/2 w-2 h-20 shadow-lg transition-colors duration-300 ${adjustedBarPosition <= -25 ? 'bg-green-400' : 'bg-white'
                                }`}
                            style={{
                                left: 'calc(50% - 50px)',
                                transform: 'skewX(-10deg)',
                                opacity: 0.9
                            }}
                        />
                        <div
                            className={`absolute bottom-1/2 w-2 h-20 shadow-lg transition-colors duration-300 ${adjustedBarPosition >= 25 ? 'bg-red-400' : 'bg-white'
                                }`}
                            style={{
                                left: 'calc(50% + 35px)',
                                transform: 'skewX(10deg)',
                                opacity: 0.9
                            }}
                        />
                    </div>

                    <div className="relative w-full max-w-4xl h-40 flex items-center justify-center">
                        {/* Animated Rope Background - Dynamic width */}
                        <div
                            className="absolute -top-8 scale-y-50 bg-contain bg-no-repeat bg-center transition-all duration-300"
                            style={{
                                width: `${clampedRopeWidth}%`,
                                height: '100%',
                                backgroundImage: `url('/rope${ropeFrame}.png')`,
                                transform: `translateX(${adjustedBarPosition * 2}px)`,
                                filter: adjustedBarPosition <= -25 ? 'hue-rotate(120deg) brightness(1.2)' :
                                    adjustedBarPosition >= 25 ? 'hue-rotate(0deg) brightness(1.2)' : 'none'
                            }}
                        />

                        {/* Left Team (Your Team) - Positioned based on player count */}
                        {gameState.yourTeam.players.map((player, index) => {
                            const basePosition = leftPositions[index] || 35;
                            // LEFT TEAM: Add adjustedBarPosition (moves right when you're winning)
                            const finalPosition = basePosition + (adjustedBarPosition / 3);

                            return (
                                <div
                                    key={`left-${player.id}`}
                                    className="absolute -top-4 transition-all duration-300 transform"
                                    style={{
                                        left: `${Math.max(5, Math.min(85, finalPosition))}%`,
                                        zIndex: gameState.yourTeam.players.length - index
                                    }}
                                >
                                    {/* Player name above sprite */}
                                    <div className="absolute  -top-2 left-1/2 transform -translate-x-1/2 z-20">
                                        <span className="text-xs font-semibold text-white px-2 py-1 rounded-full whitespace-nowrap shadow-sm">
                                            {player.name.length > 10 ? `${player.name.slice(0, 10)}...` : player.name}
                                        </span>
                                    </div>
                                    <CharacterSprite scale={0.18} imgSrc="man" />
                                </div>
                            );
                        })}

                        {/* Right Team (Opponent) - Positioned based on player count */}
                        {gameState.opponent.players.map((player, index) => {
                            const basePosition = rightPositions[index] || 65;
                            // RIGHT TEAM: Add adjustedBarPosition (moves right when you're winning, which is correct for opponent)
                            const finalPosition = basePosition + (adjustedBarPosition / 3);

                            return (
                                <div
                                    key={`right-${player.id}`}
                                    className="absolute -top-4 transition-all duration-300 scale-x-[-1]"
                                    style={{
                                        left: `${Math.max(15, Math.min(95, finalPosition))}%`,
                                        zIndex: gameState.opponent.players.length - index
                                    }}
                                >
                                    {/* Player name above sprite (flip back the text since character is flipped) */}
                                    <div className="absolute  -top-2 left-1/2 transform -translate-x-1/2 z-20 scale-x-[-1]">
                                        <span className="text-xs font-semibold text-white px-2 py-1 rounded-full whitespace-nowrap shadow-sm">
                                            {player.name.length > 10 ? `${player.name.slice(0, 10)}...` : player.name}
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
                    {showWinScreen ? 'Game Over' : yourTeamEmpty ? 'No Team' : 'PULL!'}
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