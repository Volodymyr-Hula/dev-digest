import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { SmartDiffResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * Smart diff — a PR's files grouped by role, with the lines that carry findings
 * (spec: specs/smart-diff.md).
 *   GET /pulls/:id/smart-diff → SmartDiff (never calls the LLM)
 */
export default async function smartDiffRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.smartDiffService;

  app.get('/pulls/:id/smart-diff', { schema: { params: IdParams } }, async (req): Promise<SmartDiffResponse> => {
    const { workspaceId } = await getContext(container, req);
    return service.get(workspaceId, req.params.id);
  });
}
