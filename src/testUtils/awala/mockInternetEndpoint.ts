import { jest } from '@jest/globals';
import { derSerializePrivateKey, MockKeyStoreSet } from '@relaycorp/relaynet-core';
import type { Connection } from 'mongoose';

import { InternetEndpointManager } from '../../utilities/awala/InternetEndpointManager.js';
import { Config } from '../../utilities/config.js';
import { mockKms } from '../kms/mockKms.js';
import { Kms } from '../../utilities/kms/Kms.js';

import { INTERNET_ADDRESS, INTERNET_ENDPOINT_ID_KEY_PAIR } from './stubs.js';

export function mockInternetEndpoint(getDbConnection: () => Connection): void {
  const initMock = jest.spyOn(InternetEndpointManager, 'init');

  mockKms();

  let activeEndpointIdKeyRef: Buffer;
  beforeAll(async () => {
    activeEndpointIdKeyRef = await derSerializePrivateKey(INTERNET_ENDPOINT_ID_KEY_PAIR.privateKey);
  });

  let stub: InternetEndpointManager;
  beforeEach(async () => {
    stub = new InternetEndpointManager(
      activeEndpointIdKeyRef,
      INTERNET_ADDRESS,
      await Kms.init(),
      new Config(getDbConnection()),
      new MockKeyStoreSet(),
    );
    initMock.mockResolvedValue(stub);
  });

  afterAll(() => {
    initMock.mockRestore();
  });
}
