// Prints fresh values for ENCRYPTION_KEY, TRACKING_SECRET and IP_HASH_SALT.
import { randomBytes } from "node:crypto";
console.log(`ENCRYPTION_KEY=${randomBytes(32).toString("base64")}`);
console.log(`TRACKING_SECRET=${randomBytes(32).toString("base64url")}`);
console.log(`IP_HASH_SALT=${randomBytes(24).toString("base64url")}`);
