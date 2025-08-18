import { Server } from "socket.io";
import http from 'node:http';
import express from "express";
import path from "path";
import { handleRoomEvents } from "./handlers/room.handler";
import { handleGameEvents } from "./handlers/game.handler";

export async function createServer(port: number) {
  const app = express();
  const clientPath = path.resolve(__dirname, "..", "client", "dist");
  app.use(express.static(clientPath));

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === "production" ? undefined : "http://localhost:5173",
      methods: ["GET", "POST"]
    }
  });

  if (process.env.NODE_ENV === "production") {
    app.get("/{*any}", (req, res) => {
      res.sendFile(path.join(clientPath, "index.html"));
    });
  }


  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    handleRoomEvents(io, socket);
    handleGameEvents(io, socket);
  });

  io.engine.on("connection_error", (err) => {
    console.log(err.code);     // 3
    console.log(err.message);  // "Bad request"
    console.log(err.context);  // { name: 'TRANSPORT_MISMATCH', transport: 'websocket', previousTransport: 'polling' }
  });

  httpServer.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });

  return { io, app, httpServer };

}

