import { createAuthBroadcast } from "@packages/web-kit/auth/auth-broadcast";

export const { broadcastAuthChange, onAuthChange } = createAuthBroadcast({
  channelName: "classroom-parents-auth",
});
