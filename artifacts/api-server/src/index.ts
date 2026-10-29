import app from "./app";
import { logger } from "./lib/logger";
import { expireDueSuspensions } from "./lib/suspensions";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const runSuspensionExpiry = (): void => {
  void expireDueSuspensions().catch((err) => {
    logger.error({ err }, "Could not expire timed suspensions");
  });
};

runSuspensionExpiry();
const suspensionExpiryTimer = setInterval(runSuspensionExpiry, 60_000);
suspensionExpiryTimer.unref();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
