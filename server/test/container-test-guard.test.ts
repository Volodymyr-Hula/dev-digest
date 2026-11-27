import { describe, it, expect } from 'vitest';
import { Container } from '../src/platform/container.js';
import { loadConfig } from '../src/platform/config.js';
import { ConfigError } from '../src/platform/errors.js';
import { MockGitHubClient, MockLLMProvider, MockSecretsProvider } from '../src/adapters/mocks.js';
import type { Db } from '../src/db/client.js';

/**
 * Under NODE_ENV=test the container never builds a real GitHub / LLM adapter
 * from the developer's own keys: a test that needs one injects a mock. Otherwise
 * quiet features (PR-intent pre-work in a review) would hit real services on a
 * machine with keys and behave differently in CI.
 */
const db = {} as Db; // never reached: the guard throws before any DB access
const cfg = (nodeEnv: string) => loadConfig({ ...process.env, NODE_ENV: nodeEnv } as NodeJS.ProcessEnv);
// Keys present in the secrets store: without the guard these would build real adapters.
const secrets = new MockSecretsProvider({
  GITHUB_TOKEN: 'ghp_x',
  OPENAI_API_KEY: 'sk-x',
  ANTHROPIC_API_KEY: 'sk-ant-x',
  OPENROUTER_API_KEY: 'sk-or-x',
});

describe('Container NODE_ENV=test adapter guard', () => {
  it('refuses to build a real GitHub client or LLM provider even when keys are configured', async () => {
    const c = new Container(cfg('test'), db, { secrets });
    await expect(c.github()).rejects.toBeInstanceOf(ConfigError);
    await expect(c.github()).rejects.toThrow(/not injected/);
    for (const id of ['openai', 'anthropic', 'openrouter'] as const) {
      await expect(c.llm(id)).rejects.toBeInstanceOf(ConfigError);
    }
  });

  it('still serves injected mocks', async () => {
    const gh = new MockGitHubClient();
    const llm = new MockLLMProvider('openai');
    const c = new Container(cfg('test'), db, { secrets, github: gh, llm: { openai: llm } });
    expect(await c.github()).toBe(gh);
    expect(await c.llm('openai')).toBe(llm);
    // only the injected provider is available; the others stay refused
    await expect(c.llm('openrouter')).rejects.toBeInstanceOf(ConfigError);
  });

  it('is specific to NODE_ENV=test: elsewhere a missing key is the ordinary "not configured" error', async () => {
    const c = new Container(cfg('development'), db, { secrets: new MockSecretsProvider({}) });
    await expect(c.github()).rejects.toThrow(/GITHUB_TOKEN is not configured/);
    await expect(c.llm('openrouter')).rejects.toThrow(/OPENROUTER_API_KEY is not configured/);
  });
});
