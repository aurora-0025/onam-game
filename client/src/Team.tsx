import { useEffect } from "react";
import type { Socket } from "socket.io-client";
import type { TeamState } from "./App";
import { Button } from "./components/ui/button";
import { Copy, Users, Hash } from "lucide-react";
import { toast } from "sonner";

interface TeamProps {
  socket: Socket;
  teamState: TeamState & { teamId?: string; maxSize?: number };
  setTeamState: React.Dispatch<React.SetStateAction<TeamState>>;
}

function Team({ socket, teamState, setTeamState }: TeamProps) {
  useEffect(() => {
    const queued = () => setTeamState(prev => ({ ...prev, inQueue: true }));
    const cancelled = () => setTeamState(prev => ({ ...prev, inQueue: false }));

    socket.on("team:match:queued", queued);
    socket.on("team:match:cancelled", cancelled);

    return () => {
      socket.off("team:match:queued", queued);
      socket.off("team:match:cancelled", cancelled);
    };
  }, [setTeamState, socket]);

  const handleLeaveTeam = () => {
    socket.emit("team:leave");
  };

  const handleStartQueue = () => {
    socket.emit("team:match:start");
  };

  const handleCopyInviteCode = () => {
    if (teamState.teamId) {
      navigator.clipboard.writeText(teamState.teamId);
      toast.success("Invite code copied to clipboard!");
    }
  };

  const playerCount = teamState.players?.length || 0;
  const maxSize = teamState.maxSize ?? 5;
  const teamName = teamState.name || "Unnamed Team";
  const inviteCode = teamState.teamId || "";

  return (
    <div className="p-8 bg-white rounded-lg shadow-lg max-w-md w-full">
      <div className="space-y-6">
        {/* Team Header */}
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-gray-800">{teamName}</h2>
          <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
            <Hash className="w-4 h-4" />
            <span className="font-mono text-lg">{inviteCode}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyInviteCode}
              className="p-1 h-6 w-6"
            >
              <Copy className="w-3 h-3" />
            </Button>
          </div>
          <p className="text-xs text-gray-500">Share this code with friends to join</p>
        </div>

        {/* Team Members */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-gray-600" />
            <h3 className="text-lg font-semibold text-gray-800">
              Members ({playerCount}/{maxSize})
            </h3>
          </div>
          
          <div className="space-y-2">
            {teamState.players?.map(player => (
              <div
                key={player.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border"
              >
                <span className="font-medium text-gray-800">{player.name}</span>
                {player.id === teamState.leaderId && (
                  <span className="text-xs bg-blue-500 text-white px-2 py-1 rounded-full font-medium">
                    Leader
                  </span>
                )}
              </div>
            ))}
            
            {/* Empty slots */}
            {Array.from({ length: maxSize - playerCount }).map((_, index) => (
              <div
                key={`empty-${index}`}
                className="flex items-center p-3 bg-gray-100 rounded-lg border-2 border-dashed border-gray-300"
              >
                <span className="text-gray-400 italic">Waiting for player...</span>
              </div>
            ))}
          </div>
        </div>

        {/* Queue Status */}
        {teamState.inQueue && (
          <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="text-blue-600 font-medium">🔍 Finding match...</div>
            <div className="text-xs text-blue-500 mt-1">
              Looking for teams with {playerCount} players
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          {teamState.leaderId === socket.id && (
            <Button
              onClick={handleStartQueue}
              disabled={teamState.inQueue || playerCount === 0}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              {teamState.inQueue ? "In Queue..." : "Start Matchmaking"}
            </Button>
          )}

          <Button
            variant="outline"
            onClick={handleLeaveTeam}
            className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
          >
            Leave Team
          </Button>
        </div>

        {/* Info for non-leaders */}
        {teamState.leaderId !== socket.id && (
          <div className="text-center text-sm text-gray-500 italic">
            Only the team leader can start matchmaking
          </div>
        )}
      </div>
    </div>
  );
}

export default Team;