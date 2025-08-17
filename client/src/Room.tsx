import { useEffect } from "react";
import type { Socket } from "socket.io-client";
import type { RoomState } from "./App";
import { Button } from "./components/ui/button";

interface RoomProps {
  socket: Socket;
  roomState: RoomState;
  setRoomState: React.Dispatch<React.SetStateAction<RoomState>>;
}

function Room({ socket, roomState, setRoomState }: RoomProps) {
  useEffect(() => {
    // Listen for matchmaking events
    socket.on("team:match:queued", () => {
      setRoomState(prevState => ({
        ...prevState,
        inQueue: true
      }));
    });

    socket.on("team:match:cancelled", () => {
      setRoomState(prevState => ({
        ...prevState,
        inQueue: false
      }));
    });

    return () => {
      socket.off("team:match:queued");
      socket.off("team:match:cancelled");
    };
  }, [setRoomState]);

  const handleLeaveRoom = () => {
    socket.emit("room:leave");
  };

  const handleStartQueue = () => {
    socket.emit("team:match:start");
  };

  return (
    <div className="p-8 bg-white rounded-lg shadow-lg max-w-md w-full">
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-center">Room: {roomState.roomId}</h2>
        
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Players ({roomState.players?.length || 0}/4)</h3>
          <ul className="space-y-1">
            {roomState.players?.map((player) => (
              <li key={player.id} className="flex items-center justify-between p-2 bg-gray-100 rounded">
                <span>{player.name}</span>
                {player.id === roomState.leaderId && (
                  <span className="text-xs bg-blue-500 text-white px-2 py-1 rounded">Leader</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        {roomState.inQueue && (
          <div className="text-center text-blue-600 font-medium">
            Finding match...
          </div>
        )}

        <div className="flex gap-2">
          {roomState.leaderId === socket.id && (
            <Button 
              onClick={handleStartQueue}
              disabled={roomState.inQueue}
              className="flex-1"
            >
              {roomState.inQueue ? "In Queue..." : "Start Queue"}
            </Button>
          )}
          
          <Button 
            variant="outline" 
            onClick={handleLeaveRoom}
            className="flex-1"
          >
            Leave Room
          </Button>
        </div>
      </div>
    </div>
  );
}

export default Room;