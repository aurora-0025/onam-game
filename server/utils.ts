import { rooms } from "./handlers/room.handler";

/**
 * Generates a unique 6-character invite code
 */
export function generateInviteCode(): string {
  let code: string;
  let attempts = 0;
  const maxAttempts = 100;

  do {
    code = Math.random().toString(36).substring(2, 8).toUpperCase();
    attempts++;

    if (attempts >= maxAttempts) {
      code = Math.random().toString(36).substring(2, 10).toUpperCase();
      break;
    }
  } while (rooms && rooms.has(code));

  return code;
}

/**
 * Generates a unique room ID
 */
export function generateRoomId(): string {
  return `room-${Math.random().toString(36).substring(2, 15)}`;
}
