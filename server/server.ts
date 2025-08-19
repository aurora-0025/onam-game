import { Server } from "socket.io";
import http from 'node:http';
import { handleTeamEvents } from "./handlers/team.handler";
import { handleGameEvents } from "./handlers/game.handler";

export async function createServer(port: number) {
  const ORIGIN = process.env.ORIGIN;
  const DEV = process.env.NODE_ENV === 'development';

  const httpServer = http.createServer((req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('The Socket Server Is Up and Running\n');
  });


  const io = new Server(httpServer, {
    cors: {
      origin: DEV ? "http://localhost:5173" : ORIGIN,
      methods: ["GET", "POST"]
    }
  });

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    handleTeamEvents(io, socket);
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

  return { io, httpServer };

}

