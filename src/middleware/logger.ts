import type { BurgerNext, BurgerRequest, BurgerResponse, Middleware} from "@src/types";
import { generateRandomUID } from "@src/utils/helper";
import {CreateChildLogger} from "@src/utils/logger";

export function CreateLoggingMiddleware(): Middleware{
    return async (req: BurgerRequest, res: BurgerResponse, next: BurgerNext): Promise<Response>=>{
        // Create random string for RequestId if not supplied in [x-request-id] header
        const reqId = req.headers.get("x-request-id") ?? generateRandomUID()
        // Prepare URL object
        const url = new URL(req.url);
        const pathname = url.pathname; // Use pre-extracted pathname
        // Create a child logger
        // Log incoming request
        // logger.info(`Started reqId=${reqId} method=${req.method.toUpperCase()}} path=${pathname} timestamp=${getTimestampInStr()}`)
        const requestLogger = CreateChildLogger({requestId: reqId, method: req.method.toUpperCase(), path:pathname})
        // Setting requestId so that requestId can be logged later to keep track of request
        req.requestId = reqId
        req.logger = requestLogger
        req.logger.info("Serving Request")
        return await next()
    }
}