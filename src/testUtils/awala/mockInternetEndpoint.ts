import { jest } from '@jest/globals';
import { MockKeyStoreSet } from '@relaycorp/relaynet-core';
import type { Connection } from 'mongoose';

import { Config } from '../../utilities/config.js';
import { mockKms } from '../kms/mockKms.js';
import { InternetEndpoint } from '../../utilities/awala/InternetEndpoint.js';

import { ENDPOINT_ADDRESS, ENDPOINT_ID, ENDPOINT_ID_KEY_PAIR } from './stubs.js';

export function mockInternetEndpoint(getDbConnection: () => Connection): () => InternetEndpoint {
  const initMock = jest.spyOn(InternetEndpoint, 'getActive');

  mockKms();

  let stub: InternetEndpoint;
  beforeEach(() => {
    stub = new InternetEndpoint(
      ENDPOINT_ID,
      ENDPOINT_ADDRESS,
      ENDPOINT_ID_KEY_PAIR,
      new MockKeyStoreSet(),
      new Config(getDbConnection()),
    );
    initMock.mockResolvedValue(stub);
  });

  afterAll(() => {
    initMock.mockRestore();
  });

  return () => stub;
}
