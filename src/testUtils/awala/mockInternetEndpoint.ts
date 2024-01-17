import { jest } from '@jest/globals';
import { MockKeyStoreSet } from '@relaycorp/relaynet-core';

import { mockKms } from '../kms/mockKms.js';
import { InternetEndpoint } from '../../utilities/awala/InternetEndpoint.js';

import { ENDPOINT_ADDRESS, ENDPOINT_ID, ENDPOINT_ID_KEY_PAIR } from './stubs.js';

export function mockInternetEndpoint(): () => InternetEndpoint {
  const initMock = jest.spyOn(InternetEndpoint, 'getActive');

  mockKms();

  let stub: InternetEndpoint;
  beforeEach(() => {
    stub = new InternetEndpoint(
      ENDPOINT_ID,
      ENDPOINT_ADDRESS,
      ENDPOINT_ID_KEY_PAIR,
      new MockKeyStoreSet(),
    );
    initMock.mockResolvedValue(stub);
  });

  afterAll(() => {
    initMock.mockRestore();
  });

  return () => stub;
}
