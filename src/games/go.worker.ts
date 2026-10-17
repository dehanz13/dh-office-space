// Module worker: receives { id, req: GoAIRequest }, replies { id, res: GoAIReply }.
import { serveWorker } from './aiRunner'
import { thinkGo } from './goCore'

serveWorker(thinkGo)
