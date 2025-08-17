import { Server } from "socket.io";
import { createServer as createHttpServer } from "http";
import express from "express";
import path from "path";
import { handleRoomEvents } from "./handlers/room.handler";
import { handleGameEvents } from "./handlers/game.handler";

export async function createServer(port: number) {
  const app = express();
  const httpServer = createHttpServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "http://localhost:5173",
      methods: ["GET", "POST"]
    }
  });

  const clientPath = path.resolve(__dirname, "..", "client", "dist");

  if (process.env.NODE_ENV === "production") {
    app.use(express.static(clientPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(clientPath, "index.html"));
    });
  }



  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    handleRoomEvents(io, socket);
    handleGameEvents(io, socket);
  });

  httpServer.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`Serving static files from: ${clientPath}`);
  });

  return { io, app, httpServer };
}