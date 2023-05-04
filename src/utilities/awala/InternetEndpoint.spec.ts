import {
  derDeserializeECDHPrivateKey,
  derSerializePublicKey,
  MockKeyStoreSet,
  NodeConnectionParams,
  SessionKeyPair,
} from '@relaycorp/relaynet-core';

import { bufferToArrayBuffer } from '../buffer.js';
import { Config, ConfigKey } from '../config.js';
import { setUpTestDbConnection } from '../../testUtils/db.js';
import {
  INTERNET_ADDRESS,
  INTERNET_ENDPOINT_ID,
  INTERNET_ENDPOINT_ID_KEY_PAIR,
} from '../../testUtils/awala/stubs.js';

import { InternetEndpoint } from './InternetEndpoint.js';

function hexToBase64(keyIdHex: string) {
  return Buffer.from(keyIdHex, 'hex').toString('base64');
}

describe('InternetEndpoint', () => {
  const getDbConnection = setUpTestDbConnection();
  const keyStores = new MockKeyStoreSet();
  let config: Config;
  let endpoint: InternetEndpoint;
  beforeEach(() => {
    keyStores.clear();

    config = new Config(getDbConnection());

    endpoint = new InternetEndpoint(
      INTERNET_ENDPOINT_ID,
      INTERNET_ADDRESS,
      INTERNET_ENDPOINT_ID_KEY_PAIR.privateKey,
      keyStores,
      config,
    );
  });

  describe('makeInitialSessionKeyIfMissing', () => {
    test('Key should be generated if config item is unset', async () => {
      await endpoint.makeInitialSessionKeyIfMissing();

      const { sessionKeys } = keyStores.privateKeyStore;
      const [[keyIdHex, keyData]] = Object.entries(sessionKeys);
      expect(keyData.nodeId).toBe(INTERNET_ENDPOINT_ID);
      expect(keyData.peerId).toBeUndefined();
      await expect(config.get(ConfigKey.INITIAL_SESSION_KEY_ID_BASE64)).resolves.toBe(
        hexToBase64(keyIdHex),
      );
    });

    test('Key should not be generated if config item is set', async () => {
      const { privateKey, sessionKey } = await SessionKeyPair.generate();
      const keyIdBase64 = sessionKey.keyId.toString('base64');
      await config.set(ConfigKey.INITIAL_SESSION_KEY_ID_BASE64, keyIdBase64);
      await keyStores.privateKeyStore.saveSessionKey(
        privateKey,
        sessionKey.keyId,
        INTERNET_ENDPOINT_ID,
      );

      await endpoint.makeInitialSessionKeyIfMissing();

      expect(keyStores.privateKeyStore.sessionKeys).toHaveProperty(
        sessionKey.keyId.toString('hex'),
      );
      await expect(config.get(ConfigKey.INITIAL_SESSION_KEY_ID_BASE64)).resolves.toBe(keyIdBase64);
    });
  });

  describe('getConnectionParams', () => {
    test('Error should be thrown if config item is unset', async () => {
      await expect(endpoint.getConnectionParams()).rejects.toThrowWithMessage(
        Error,
        'Initial session key id is missing from config',
      );
    });

    describe('Connection params', () => {
      test('Internet address should be included', async () => {
        await endpoint.makeInitialSessionKeyIfMissing();

        const connectionParamsSerialised = await endpoint.getConnectionParams();

        const connectionParams = await NodeConnectionParams.deserialize(
          bufferToArrayBuffer(connectionParamsSerialised),
        );
        expect(connectionParams.internetAddress).toBe(INTERNET_ADDRESS);
      });

      test('Session public key should be included', async () => {
        await endpoint.makeInitialSessionKeyIfMissing();

        const connectionParamsSerialised = await endpoint.getConnectionParams();

        const connectionParams = await NodeConnectionParams.deserialize(
          bufferToArrayBuffer(connectionParamsSerialised),
        );
        const { sessionKeys } = keyStores.privateKeyStore;
        const [[keyIdHex, keyData]] = Object.entries(sessionKeys);
        expect(connectionParams.sessionKey.keyId).toMatchObject(Buffer.from(keyIdHex, 'hex'));
        const expectedPrivateKey = await derDeserializeECDHPrivateKey(keyData.keySerialized);
        await expect(
          derSerializePublicKey(connectionParams.sessionKey.publicKey),
        ).resolves.toMatchObject(await derSerializePublicKey(expectedPrivateKey));
      });

      test('Identity public key should be included', async () => {
        await endpoint.makeInitialSessionKeyIfMissing();

        const connectionParamsSerialised = await endpoint.getConnectionParams();

        const connectionParams = await NodeConnectionParams.deserialize(
          bufferToArrayBuffer(connectionParamsSerialised),
        );
        await expect(derSerializePublicKey(connectionParams.identityKey)).resolves.toMatchObject(
          await derSerializePublicKey(INTERNET_ENDPOINT_ID_KEY_PAIR.publicKey),
        );
      });
    });
  });
});
