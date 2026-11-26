import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CreateSkillInput, SkillImportRequest, UpdateSkillInput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { SkillsRepository } from './repository.js';
import { SkillsService } from './service.js';
import { IMPORT_BODY_LIMIT } from './constants.js';

const VersionParams = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});

/**
 * Skills module — reusable markdown rules linked to agents.
 *   GET    /skills                        → list (with linked-agent counts)
 *   GET    /skills/tags                   → distinct tags (editor suggestions)
 *   GET    /skills/:id                    → one skill
 *   POST   /skills                        → create (manual)
 *   PUT    /skills/:id                    → update / toggle (versions config)
 *   DELETE /skills/:id                    → delete (agent links cascade)
 *   GET    /skills/:id/versions           → history (newest first)
 *   GET    /skills/:id/versions/:version  → one snapshot
 *   POST   /skills/:id/versions/:version/activate → make that version active
 *   POST   /skills/import/preview         → parse a URL / uploaded file into a draft (no save)
 */
export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService({
    repo: new SkillsRepository(app.container.db),
    fetcher: app.container.fetcher,
  });

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.get('/skills/tags', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.tags(workspaceId);
  });

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.post('/skills', { schema: { body: CreateSkillInput } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.create(workspaceId, req.body);
    reply.status(201);
    return skill;
  });

  app.post(
    '/skills/import/preview',
    {
      schema: { body: SkillImportRequest },
      bodyLimit: IMPORT_BODY_LIMIT,
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.previewImport(workspaceId, req.body);
    },
  );

  app.put(
    '/skills/:id',
    { schema: { params: IdParams, body: UpdateSkillInput } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.update(workspaceId, req.params.id, req.body);
      if (!skill) throw new NotFoundError('Skill not found');
      return skill;
    },
  );

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Skill not found');
    return { ok: true };
  });

  app.get('/skills/:id/versions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const versions = await service.listVersions(workspaceId, req.params.id);
    if (!versions) throw new NotFoundError('Skill not found');
    return versions;
  });

  app.get(
    '/skills/:id/versions/:version',
    { schema: { params: VersionParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const v = await service.getVersion(workspaceId, req.params.id, req.params.version);
      if (!v) throw new NotFoundError('Skill version not found');
      return v;
    },
  );

  app.post(
    '/skills/:id/versions/:version/activate',
    { schema: { params: VersionParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.activateVersion(workspaceId, req.params.id, req.params.version);
      if (!skill) throw new NotFoundError('Skill version not found');
      return skill;
    },
  );
}
