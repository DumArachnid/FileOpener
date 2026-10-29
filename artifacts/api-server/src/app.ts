import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { resolveAccountSession, sameOriginForWrites } from "./middlewares/accountSession";
import { resolveDeveloperSession } from "./middlewares/developerAuth";

const app: Express = express();
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(resolveAccountSession);
app.use(resolveDeveloperSession);
app.use(sameOriginForWrites);

app.use("/api", (_req, res, next) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  next();
});
app.use("/api", router);

export default app;
