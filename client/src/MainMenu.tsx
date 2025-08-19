import { useState } from "react";
import { Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface GameProps {
  socket: Socket;
}

function MainMenu({ socket }: GameProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [teamName, setTeamName] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  function resetForm() {
    setUsername("");
    setTeamName("");
    setInviteCode("");
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    socket.emit("team:create", { name: username, teamName });
    resetForm();
    setCreateOpen(false);
  }

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    socket.emit("team:join", { name: username, inviteCode });
    resetForm();
    setJoinOpen(false);
  }

  return (
    <div className="flex gap-4 p-8">
      {/* Create Team Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogTrigger asChild>
          <Button>Create Team</Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Team</DialogTitle>
            <DialogDescription>
              Enter your username and team name to create a new team.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-username">Username</Label>
              <Input
                id="create-username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Your name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-teamname">Team Name</Label>
              <Input
                id="create-teamname"
                required
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="Team name"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Join Team Dialog */}
      <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
        <DialogTrigger asChild>
          <Button variant="secondary">Join Team</Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Join Team</DialogTitle>
            <DialogDescription>
              Enter your username and an invite code to join an existing team.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleJoin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="join-username">Username</Label>
              <Input
                id="join-username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Your name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="join-inviteCode">Invite Code</Label>
              <Input
                id="join-inviteCode"
                required
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setJoinOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Join</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default MainMenu;