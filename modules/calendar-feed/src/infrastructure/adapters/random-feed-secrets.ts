import { createHash, randomBytes } from "node:crypto";
import type { IFeedSecrets, IssuedFeedSecret } from "../../application/ports/feed-secrets.port";

const SECRET_BYTES = 32;

function sha256Hex(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export const randomFeedSecrets: IFeedSecrets = {
  issue(): IssuedFeedSecret {
    const secret = randomBytes(SECRET_BYTES).toString("base64url");
    return { secret, hash: sha256Hex(secret) };
  },

  hashOf: sha256Hex,
};
