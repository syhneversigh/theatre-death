import { describe, expect, it } from 'vitest';
import { configuration } from '../server/v2/config.ts';
import { RateLimits } from '../server/v2/rate-limit.ts';

function env(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'production',
    PUBLIC_BASE_URL: 'https://game.example.test',
    PORT: '3000',
    SESSION_SECRET: 'a-production-session-secret',
    ...overrides,
  };
}

describe('v2 configuration validation', () => {
  it('生产环境拒绝 HTTP origin，且拒绝带 path 的 origin', () => {
    expect(() => configuration(env({ PUBLIC_BASE_URL: 'http://game.example.test' }))).toThrow(/HTTPS/);
    expect(() => configuration(env({ PUBLIC_BASE_URL: 'https://game.example.test/path' }))).toThrow(/origin/);
  });

  it('拒绝非法 PORT 与生产 placeholder SESSION_SECRET', () => {
    for (const port of ['0', '65536', 'not-a-port', '1.5']) {
      expect(() => configuration(env({ PORT: port }))).toThrow('Invalid PORT');
    }
    for (const secret of ['change-me', 'dev-secret-change-me', 'test-secret']) {
      expect(() => configuration(env({ SESSION_SECRET: secret }))).toThrow(/placeholder/);
    }
  });

  it('VOICE_ENABLED=true 时拒绝缺字段、非 wss、devkey 与短 secret', () => {
    expect(() => configuration(env({ VOICE_ENABLED: 'true' }))).toThrow(/incomplete/);
    expect(() => configuration(env({
      VOICE_ENABLED: 'true',
      VOICE_SERVICE_URL: 'http://livekit.example.test',
      LIVEKIT_API_KEY: 'production-key',
      LIVEKIT_API_SECRET: 'x'.repeat(32),
    }))).toThrow(/WebSocket/);
    expect(() => configuration(env({
      VOICE_ENABLED: 'true',
      VOICE_SERVICE_URL: 'wss://livekit.example.test',
      LIVEKIT_API_KEY: 'devkey',
      LIVEKIT_API_SECRET: 'x'.repeat(32),
    }))).toThrow(/development/);
    expect(() => configuration(env({
      VOICE_ENABLED: 'true',
      VOICE_SERVICE_URL: 'wss://livekit.example.test',
      LIVEKIT_API_KEY: 'production-key',
      LIVEKIT_API_SECRET: 'short',
    }))).toThrow(/development/);
  });

  it('合法 HTTPS/WSS 生产配置通过且返回值不包含测试 secret', () => {
    const secret = 'a-secret-that-must-not-be-returned';
    const result = configuration(env({
      SESSION_SECRET: secret,
      VOICE_ENABLED: 'true',
      VOICE_SERVICE_URL: 'wss://livekit.example.test',
      LIVEKIT_API_KEY: 'production-key',
      LIVEKIT_API_SECRET: 'x'.repeat(32),
    }));

    expect(result).toMatchObject({
      production: true,
      origin: 'https://game.example.test',
      port: 3000,
      secureCookies: true,
      voiceEnabled: true,
    });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain('x'.repeat(32));
  });
});

describe('v2 RateLimits', () => {
  it('额度耗尽后按时间恢复，不同 key 隔离，时间倒退不补 token', () => {
    let now = 0;
    const limits = new RateLimits(() => now);

    expect(limits.allow('a', 2, 1000)).toBe(true);
    expect(limits.allow('a', 2, 1000)).toBe(true);
    expect(limits.allow('a', 2, 1000)).toBe(false);
    expect(limits.allow('b', 2, 1000)).toBe(true);

    now = -1000;
    expect(limits.allow('a', 2, 1000)).toBe(false);
    now = 1000;
    expect(limits.allow('a', 2, 1000)).toBe(true);
  });
});
