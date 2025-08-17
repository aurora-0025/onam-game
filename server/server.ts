import { Server } from "socket.io";
import { handleRoomEvents } from "./handlers/room.handler";
import { handleGameEvents } from "./handlers/game.handler";

export async function createServer(port: number) {
  const io = new Server(port, {
    cors: {
      origin: "http://localhost:5173",
      methods: ["GET", "POST"]
    }
  });

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    handleRoomEvents(io, socket);
    handleGameEvents(io, socket);
  });

  return io;
}
