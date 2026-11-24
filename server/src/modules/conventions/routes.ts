import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AttachConventionsInput, UpdateConventionInput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ConventionsRepository } from './repository.js';
import { ConventionsService } from './service.js';

const RepoParams = z.object({ repoId: z.string().uuid() });

/**
 * Conventions module — house-rules extracted from a repo (spec: server/specs/conventions.md).
 *   GET   /repos/:repoId/conventions         → items + stats + latest scan state
 *   POST  /repos/:repoId/conventions/scan    → enqueue a scan job (202; 409 while one runs)
 *   PATCH /conventions/:id                   → edit rule / accept / reject
 *   POST  /repos/:repoId/conventions/attach  → mark accepted ones as part of a skill
 */
export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new ConventionsService({
    repo: new ConventionsRepository(container.db),
    repoIntel: { getConventionSamples: (id, n) => container.repoIntel.getConventionSamples(id, n) },
    git: () => container.git,
    llm: (provider) => container.llm(provider),
    resolveModel: (workspaceId) => container.resolveFeatureModel(workspaceId, 'conventions'),
    jobs: container.jobs,
  });
  service.registerScanJobHandler();

  app.get('/repos/:repoId/conventions', { schema: { params: RepoParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.list(workspaceId, req.params.repoId);
  });

  app.post(
    '/repos/:repoId/conventions/scan',
    { schema: { params: RepoParams } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const result = await service.startScan(workspaceId, req.params.repoId);
      reply.code(202);
      return result;
    },
  );

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: UpdateConventionInput } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.update(workspaceId, req.params.id, req.body);
    },
  );

  app.post(
    '/repos/:repoId/conventions/attach',
    { schema: { params: RepoParams, body: AttachConventionsInput } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.attach(workspaceId, req.params.repoId, req.body);
    },
  );
}
