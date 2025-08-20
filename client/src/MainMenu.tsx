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
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Users, UserPlus, Trophy, MousePointer } from "lucide-react";

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
    <div className="min-h-screen w-full bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full text-center">
        {/* Game Title */}
        <div className="mb-12">
          <h1 className="text-6xl font-bold text-amber-800 mb-4 tracking-tight">
            VADAMVALI
          </h1>
          <p className="text-xl text-amber-700 mb-2">
            Rally your team and pull your way to victory!
          </p>

        </div>

        {/* Action Cards */}
        <div className="grid md:grid-cols-2 gap-8 max-w-2xl mx-auto">
          {/* Create Team Card */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-amber-200 hover:shadow-2xl transition-all duration-300 hover:-translate-y-1">
            <div className="mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Create Team</h2>
              <p className="text-gray-600">Start your own team and invite friends to join the battle!</p>
            </div>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="lg" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3">
                  Create New Team
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md bg-white">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-bold text-center text-gray-800">
                    Create Your Team
                  </DialogTitle>
                  <DialogDescription className="text-center text-gray-600">
                    Set up your team and get ready to pull!
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreate} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="create-username" className="text-sm font-semibold text-gray-700 ">
                      Your Name
                    </Label>
                    <Input
                      id="create-username"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Enter your name"
                      className="border-2 border-gray-200 focus:border-blue-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="create-teamname" className="text-sm font-semibold text-gray-700">
                      Team Name
                    </Label>
                    <Input
                      id="create-teamname"
                      required
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      placeholder="The Rope Pullers"
                      className="border-2 border-gray-200 focus:border-blue-500"
                    />
                  </div>
                  <DialogFooter className="gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCreateOpen(false)}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700">
                      Create Team
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Join Team Card */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-amber-200 hover:shadow-2xl transition-all duration-300 hover:-translate-y-1">
            <div className="mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <UserPlus className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Join Team</h2>
              <p className="text-gray-600">Have an invite code? Join an existing team and start pulling!</p>
            </div>
            <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
              <DialogTrigger asChild>
                <Button size="lg" variant="secondary" className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3">
                  Join Existing Team
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md bg-white">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-bold text-center text-gray-800">
                    Join the Battle
                  </DialogTitle>
                  <DialogDescription className="text-center text-gray-600">
                    Enter your details and team invite code
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleJoin} className="space-y-6 text-center">
                  <div className="space-y-2">
                    <Label htmlFor="join-username" className="text-sm font-semibold text-gray-700">
                      Your Name
                    </Label>
                    <Input
                      id="join-username"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Enter your name"
                      className="border-2 border-gray-200 focus:border-green-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-gray-700">
                      Team Invite Code
                    </Label>
                    <div className="flex">
                      <InputOTP
                        maxLength={6}
                        value={inviteCode}
                        onChange={(value) => setInviteCode(value.toUpperCase())}
                      >
                        <InputOTPGroup>
                          <InputOTPSlot index={0} className="border-2 border-gray-200 focus:border-green-500" />
                          <InputOTPSlot index={1} className="border-2 border-gray-200 focus:border-green-500" />
                          <InputOTPSlot index={2} className="border-2 border-gray-200 focus:border-green-500" />
                          <InputOTPSlot index={3} className="border-2 border-gray-200 focus:border-green-500" />
                          <InputOTPSlot index={4} className="border-2 border-gray-200 focus:border-green-500" />
                          <InputOTPSlot index={5} className="border-2 border-gray-200 focus:border-green-500" />
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                  </div>
                  <DialogFooter className="gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setJoinOpen(false)}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit" 
                      className="flex-1 bg-green-600 hover:bg-green-700"
                      disabled={inviteCode.length !== 6}
                    >
                      Join Team
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Game Instructions */}
        <div className="mt-12 bg-white/60 backdrop-blur-sm rounded-xl p-6 max-w-2xl mx-auto border border-amber-200">
          <h3 className="text-lg font-bold text-amber-800 mb-3">How to Play</h3>
          <div className="grid md:grid-cols-3 gap-4 text-sm text-amber-700">
            <div className="text-center">
              <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-2">
                <Users className="w-6 h-6 text-amber-600" />
              </div>
              <p><strong>Form Teams:</strong> Create or join a team with your friends</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-2">
                <MousePointer className="w-6 h-6 text-amber-600" />
              </div>
              <p><strong>Grab the Rope:</strong> Click rapidly to pull the rope toward your side</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-2">
                <Trophy className="w-6 h-6 text-amber-600" />
              </div>
              <p><strong>Win the Game:</strong> Pull the rope past your victory line!</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MainMenu;