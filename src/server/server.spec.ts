import { jest } from '@jest/globals';
import { MAX_RAMF_MESSAGE_LENGTH } from '@relaycorp/relaynet-core';
import pino from 'pino';
import type { FastifyInstance } from 'fastify';

import { mockSpy } from '../testUtils/jest.js';

const mockFastify: FastifyInstance = {
  register: mockSpy(jest.fn()),
} as any;
jest.unstable_mockModule('../utilities/fastify/server.js', () => ({
  makeFastify: jest.fn<() => Promise<any>>().mockResolvedValue(mockFastify),
}));

const { makePohttpServer } = await import('./server.js');
const { makeFastify } = await import('../utilities/fastify/server.js');

describe('makePohttpServer', () => {
  test('No logger should be passed by default', async () => {
    await makePohttpServer();

    expect(makeFastify).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ logger: undefined }),
    );
  });

  test('Any explicit logger should be honored', async () => {
    const logger = pino();

    await makePohttpServer(logger);

    expect(makeFastify).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ logger }),
    );
  });

  test('Request body should not be bigger than biggest RAMF message', async () => {
    await makePohttpServer();

    expect(makeFastify).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ bodyLimit: MAX_RAMF_MESSAGE_LENGTH }),
    );
  });

  test('Server instance should be returned', async () => {
    const serverInstance = await makePohttpServer();

    expect(serverInstance).toBe(mockFastify);
  });
});
