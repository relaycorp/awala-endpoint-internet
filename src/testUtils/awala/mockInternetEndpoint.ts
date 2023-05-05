import { jest } from '@jest/globals';
import { MockKeyStoreSet } from '@relaycorp/relaynet-core';
import type { Connection } from 'mongoose';

import { InternetEndpointManager } from '../../utilities/awala/InternetEndpointManager.js';
import { Config } from '../../utilities/config.js';
import { mockKms } from '../kms/mockKms.js';
import { Kms } from '../../utilities/kms/Kms.js';

import { ENDPOINT_ADDRESS, ENDPOINT_ID_KEY_REF } from './stubs.js';

export function mockInternetEndpoint(
  getDbConnection: () => Connection,
): () => InternetEndpointManager {
  const initMock = jest.spyOn(InternetEndpointManager, 'init');

  mockKms();

  let stub: InternetEndpointManager;
  beforeEach(async () => {
    stub = new InternetEndpointManager(
      ENDPOINT_ID_KEY_REF,
      ENDPOINT_ADDRESS,
      await Kms.init(),
      new Config(getDbConnection()),
      new MockKeyStoreSet(),
    );
    initMock.mockResolvedValue(stub);
  });

  afterAll(() => {
    initMock.mockRestore();
  });

  return () => stub;
}
