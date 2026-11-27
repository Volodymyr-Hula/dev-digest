import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrIntentUpdate, type PrIntentResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * PR intent — why a PR exists (spec: specs/intent-layer.md).
 *   GET  /pulls/:id/intent         → stored intent or null (never calls the LLM)
 *   POST /pulls/:id/intent/derive  → derive now, bypassing the cache
 *   PUT  /pulls/:id/intent         → save a user-written intent
 * The service is the Container's single instance, so a review and a "derive"
 * click on the same PR share one in-flight derivation.
 */
export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.intentService;

  app.get('/pulls/:id/intent', { schema: { params: IdParams } }, async (req): Promise<PrIntentResponse> => {
    const { workspaceId } = await getContext(container, req);
    return { intent: await service.get(workspaceId, req.params.id) };
  });

  app.post(
    '/pulls/:id/intent/derive',
    { schema: { params: IdParams }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return { intent: await service.derive(workspaceId, req.params.id, req.log) };
    },
  );

  app.put(
    '/pulls/:id/intent',
    { schema: { params: IdParams, body: PrIntentUpdate } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return { intent: await service.update(workspaceId, req.params.id, req.body) };
    },
  );
}
