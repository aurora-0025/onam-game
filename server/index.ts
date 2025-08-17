import { createServer } from "./server";
import path from 'path'

async function startServer() {
  try {
    const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
    const clientPath = path.resolve(__dirname, "..", "client", "dist");
    const io = await createServer(PORT);
    console.log(`Server running on port ${PORT}`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();