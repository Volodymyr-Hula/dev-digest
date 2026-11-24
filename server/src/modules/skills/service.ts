import type {
  CreateSkillInput,
  Skill,
  SkillImportPreview,
  SkillImportRequest,
  SkillVersion,
  UpdateSkillInput,
} from '@devdigest/shared';
import type { RemoteFetcher } from '../../adapters/http/index.js';
import { ConflictError, ValidationError } from '../../platform/errors.js';
import { IMPORT_FETCH_TIMEOUT_MS, IMPORT_MAX_FILE_BYTES } from './constants.js';
import { kindFromName, parseImport, toRawGitHubUrl, type ImportFileKind } from './import.js';
import type { SkillsRepository } from './repository.js';
import { defaultTrusted, normalizeTags, toSkillDto, toSkillVersionDto } from './helpers.js';

export interface SkillsServiceDeps {
  repo: SkillsRepository;
  /** Outbound fetch for URL imports (SSRF-guarded adapter). */
  fetcher: RemoteFetcher;
}

/**
 * Skills service — CRUD + version history for reusable prompt rules that agents
 * link to. A skill is markdown text only; the review run injects every enabled,
 * linked skill into the prompt in full.
 */
export class SkillsService {
  constructor(private readonly deps: SkillsServiceDeps) {}

  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.deps.repo.list(workspaceId);
    return rows.map((r) => toSkillDto(r.row, r.agentCount));
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const r = await this.deps.repo.getById(workspaceId, id);
    return r ? toSkillDto(r.row, r.agentCount) : undefined;
  }

  async tags(workspaceId: string): Promise<string[]> {
    return this.deps.repo.distinctTags(workspaceId);
  }

  /** Create a skill — from scratch, or the confirmed draft of an import. */
  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    await this.assertNameFree(workspaceId, input.name);
    const source = input.source ?? 'manual';
    const row = await this.deps.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description ?? '',
      type: input.type,
      source,
      body: input.body,
      tags: normalizeTags(input.tags ?? []),
      trusted: input.trusted ?? defaultTrusted(source),
      enabled: input.enabled ?? true,
    });
    return toSkillDto(row, 0);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillInput,
  ): Promise<Skill | undefined> {
    if (patch.name !== undefined) await this.assertNameFree(workspaceId, patch.name, id);
    const row = await this.deps.repo.update(workspaceId, id, {
      ...patch,
      ...(patch.tags !== undefined ? { tags: normalizeTags(patch.tags) } : {}),
    });
    if (!row) return undefined;
    return this.get(workspaceId, row.id);
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.deps.repo.deleteById(workspaceId, id);
  }

  /** Version history, newest first; undefined when the skill isn't in the workspace. */
  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[] | undefined> {
    if (!(await this.deps.repo.getById(workspaceId, id))) return undefined;
    const rows = await this.deps.repo.listVersions(id);
    return rows.map(toSkillVersionDto);
  }

  async getVersion(
    workspaceId: string,
    id: string,
    version: number,
  ): Promise<SkillVersion | undefined> {
    if (!(await this.deps.repo.getById(workspaceId, id))) return undefined;
    const row = await this.deps.repo.getVersion(id, version);
    return row ? toSkillVersionDto(row) : undefined;
  }

  /**
   * Make an older (or newer) version the active one — its content is what
   * linked agents receive from now on. 409 when that version's name is now
   * used by another skill.
   */
  async activateVersion(workspaceId: string, id: string, version: number): Promise<Skill | undefined> {
    const snap = (await this.deps.repo.getById(workspaceId, id))
      ? await this.deps.repo.getVersion(id, version)
      : undefined;
    if (!snap) return undefined;
    await this.assertNameFree(workspaceId, snap.name, id);
    const row = await this.deps.repo.activateVersion(workspaceId, id, version);
    return row ? this.get(workspaceId, row.id) : undefined;
  }

  /**
   * Parse an import (URL or uploaded file) into a draft. Never persists: the
   * user reviews/edits the draft, then creates it via `create` with its source.
   */
  async previewImport(workspaceId: string, req: SkillImportRequest): Promise<SkillImportPreview> {
    let bytes: Uint8Array;
    let kind: ImportFileKind;
    let source: SkillImportPreview['draft']['source'];
    if (req.kind === 'url') {
      const file = await this.deps.fetcher.get(toRawGitHubUrl(req.url), {
        maxBytes: IMPORT_MAX_FILE_BYTES,
        timeoutMs: IMPORT_FETCH_TIMEOUT_MS,
      });
      bytes = file.bytes;
      kind =
        kindFromName(new URL(file.url).pathname) ??
        (/zip/i.test(file.contentType) ? 'archive' : 'markdown');
      source = 'imported_url';
    } else {
      const k = kindFromName(req.filename);
      if (!k) throw new ValidationError('Unsupported file type — use .md, .markdown, .zip or .skill');
      kind = k;
      bytes = Buffer.from(req.content_base64, 'base64');
      if (bytes.byteLength === 0) throw new ValidationError('The file is empty');
      if (bytes.byteLength > IMPORT_MAX_FILE_BYTES) {
        throw new ValidationError(`The file is larger than ${IMPORT_MAX_FILE_BYTES} bytes`);
      }
      source = 'imported_file';
    }
    const parsed = parseImport(bytes, kind);
    return {
      draft: { ...parsed.draft, source },
      warnings: parsed.warnings,
      ignored_files: parsed.ignored,
      name_taken: await this.deps.repo.nameTaken(workspaceId, parsed.draft.name),
    };
  }

  private async assertNameFree(workspaceId: string, name: string, excludeId?: string) {
    if (await this.deps.repo.nameTaken(workspaceId, name, excludeId)) {
      throw new ConflictError(`A skill named "${name}" already exists`);
    }
  }
}
