import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import workspaceSyncRouter from "./workspaceSync";
import communityExtensionsRouter from "./communityExtensions";
import moderationRouter from "./moderation";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(workspaceSyncRouter);
router.use(communityExtensionsRouter);
router.use(moderationRouter);

export default router;
