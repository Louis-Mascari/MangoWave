import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SNSEvent } from 'aws-lambda';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: class {
    send = send;
  },
  PutFunctionConcurrencyCommand: class {
    constructor(public input: Record<string, unknown>) {}
  },
}));

import { handler } from '../budget-kill-switch';

const API_FUNCTIONS = ['auth-callback', 'auth-refresh', 'settings-save', 'settings-load'];

const event = {
  Records: [{ Sns: { Subject: 'AWS Budgets: MangoWave-CostGuard has exceeded your limit' } }],
} as unknown as SNSEvent;

function sentInputs(): unknown[] {
  return send.mock.calls.map(([command]) => (command as { input: unknown }).input);
}

describe('budget-kill-switch handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    send.mockResolvedValue({});
    vi.stubEnv('API_FUNCTION_NAMES', API_FUNCTIONS.join(','));
    vi.stubEnv('AWS_LAMBDA_FUNCTION_NAME', 'budget-kill-switch');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('sets reserved concurrency to 0 on all four API functions', async () => {
    await expect(handler(event)).resolves.toBeUndefined();

    expect(send).toHaveBeenCalledTimes(4);
    expect(sentInputs()).toEqual(
      API_FUNCTIONS.map((name) => ({ FunctionName: name, ReservedConcurrentExecutions: 0 })),
    );
  });

  it('is safe to run again after the functions are already disabled', async () => {
    await handler(event);
    await expect(handler(event)).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(8);
  });

  it('never sets concurrency on itself', async () => {
    vi.stubEnv('API_FUNCTION_NAMES', [...API_FUNCTIONS, 'budget-kill-switch'].join(','));

    await handler(event);

    expect(send).toHaveBeenCalledTimes(4);
    expect(sentInputs()).not.toContainEqual(
      expect.objectContaining({ FunctionName: 'budget-kill-switch' }),
    );
  });

  it('rejects when a function cannot be disabled, after trying the rest', async () => {
    send.mockRejectedValueOnce(new Error('AccessDenied'));

    await expect(handler(event)).rejects.toThrow('Budget kill-switch failed for: auth-callback');
    expect(send).toHaveBeenCalledTimes(4);
  });

  it('rejects when no function names are configured', async () => {
    vi.stubEnv('API_FUNCTION_NAMES', '');

    await expect(handler(event)).rejects.toThrow('API_FUNCTION_NAMES is empty');
    expect(send).not.toHaveBeenCalled();
  });
});
