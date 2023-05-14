import { jest } from '@jest/globals';

import { Kms } from '../../utilities/kms/Kms.js';

import { MockKmsRsaPssProvider } from './MockKmsRsaPssProvider.js';

class MockKms extends Kms {
  public constructor() {
    super(new MockKmsRsaPssProvider());
  }
}

export function mockKms() {
  const initMock = jest.spyOn(Kms, 'init');

  let mock: MockKms;
  beforeEach(() => {
    mock = new MockKms();
    initMock.mockResolvedValue(mock);
  });

  afterAll(() => {
    initMock.mockRestore();
  });

  return () => initMock;
}
