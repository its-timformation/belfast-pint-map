import { router } from "./trpc";
import { healthRouter } from "./routers/health";
import { barsRouter } from "./routers/bars";
import { adminRouter } from "./routers/admin";
import { resortRouter } from "./routers/resort";
import { authRouter } from "./routers/auth";
import { crawlsRouter } from "./routers/crawls";

export const appRouter = router({
  health: healthRouter,
  bars: barsRouter,
  admin: adminRouter,
  resort: resortRouter,
  auth: authRouter,
  crawls: crawlsRouter,
});

export type AppRouter = typeof appRouter;
