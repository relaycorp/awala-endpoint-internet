import { jest } from '@jest/globals';
import { derSerializePrivateKey } from '@relaycorp/relaynet-core';
import type { KmsRsaPssProvider } from '@relaycorp/webcrypto-kms';

import { getMockContext } from '../../testUtils/jest.js';
import { MockKmsRsaPssProvider } from '../../testUtils/kms/MockKmsRsaPssProvider.js';
import {
  INTERNET_ENDPOINT_ID_KEY_PAIR,
  INTERNET_ENDPOINT_ID_KEY_REF,
} from '../../testUtils/awala/stubs.js';

jest.unstable_mockModule('./provider.js', () => ({
  getKmsProvider: jest.fn(() => new MockKmsRsaPssProvider()),
}));
// eslint-disable-next-line @typescript-eslint/naming-convention
const { Kms } = await import('./Kms.js');
const { getKmsProvider } = await import('./provider.js');

describe('Kms', () => {
  describe('init', () => {
    test('Global provider should be passed to KMS', async () => {
      const kms = await Kms.init();

      expect(getKmsProvider).toHaveBeenCalledOnce();
      const provider = getMockContext(getKmsProvider).results[0].value as KmsRsaPssProvider;
      const keyImportSpy = jest.spyOn(provider, 'importKey');
      await kms.retrievePrivateKeyByRef(INTERNET_ENDPOINT_ID_KEY_REF);
      expect(keyImportSpy).toHaveBeenCalledOnce();
    });
  });

  describe('retrieveKeyByRef', () => {
    test('Specified key should be imported as raw', async () => {
      const provider = new MockKmsRsaPssProvider();
      const kms = new Kms(provider);

      const retrievedKey = await kms.retrievePrivateKeyByRef(INTERNET_ENDPOINT_ID_KEY_REF);

      const { privateKey } = INTERNET_ENDPOINT_ID_KEY_PAIR;
      const originalKeySerialised = await derSerializePrivateKey(privateKey);
      const retrievedKeySerialised = await derSerializePrivateKey(retrievedKey);
      expect(retrievedKeySerialised).toStrictEqual(originalKeySerialised);
    });
  });
});
