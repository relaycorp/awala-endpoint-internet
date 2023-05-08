import { jest } from '@jest/globals';
import {
  derSerializePrivateKey,
  derSerializePublicKey,
  MockCertificateStore,
  MockKeyStoreSet,
  MockPublicKeyStore,
  type PrivateKeyStore,
} from '@relaycorp/relaynet-core';
import envVar from 'env-var';
import type { Connection } from 'mongoose';

import { configureMockEnvVars } from '../../testUtils/envVars.js';
import { mockSpy } from '../../testUtils/jest.js';
import { MockKms, mockKms } from '../../testUtils/kms/mockKms.js';
import { Config } from '../config.js';
import { setUpTestDbConnection } from '../../testUtils/db.js';
import {
  ENDPOINT_ID_PUBLIC_KEY_DER,
  ENDPOINT_ADDRESS,
  ENDPOINT_ID,
  ENDPOINT_ID_KEY_PAIR,
  ENDPOINT_ID_KEY_REF,
} from '../../testUtils/awala/stubs.js';

import { InternetEndpoint } from './InternetEndpoint.js';

const mockCloudKeystoreInit = mockSpy(jest.fn<() => PrivateKeyStore>());
jest.unstable_mockModule('@relaycorp/awala-keystore-cloud', () => ({
  initPrivateKeystoreFromEnv: mockCloudKeystoreInit,
}));

// eslint-disable-next-line @typescript-eslint/naming-convention
const { InternetEndpointManager } = await import('./InternetEndpointManager.js');

const REQUIRED_ENV_VARS = {
  INTERNET_ADDRESS: ENDPOINT_ADDRESS,
  ACTIVE_ID_KEY_REF: ENDPOINT_ID_KEY_REF.toString(),
  ACTIVE_ID_PUBLIC_KEY: ENDPOINT_ID_PUBLIC_KEY_DER.toString('base64'),
  PRIVATE_KEY_STORE_ADAPTER: 'GCP',
};

const KEY_STORE_SET = new MockKeyStoreSet();

describe('InternetEndpointManager', () => {
  const getMockKms = mockKms();
  const getDbConnection = setUpTestDbConnection();

  let dbConnection: Connection;
  beforeEach(() => {
    dbConnection = getDbConnection();
  });

  describe('init', () => {
    const mockEnvVars = configureMockEnvVars(REQUIRED_ENV_VARS);

    beforeEach(() => {
      mockCloudKeystoreInit.mockReturnValue(KEY_STORE_SET.privateKeyStore);
    });

    test.each(Object.keys(REQUIRED_ENV_VARS))('%s should be defined', async (envVarName) => {
      mockEnvVars({ ...REQUIRED_ENV_VARS, [envVarName]: undefined });

      await expect(InternetEndpointManager.init(dbConnection)).rejects.toThrow(envVar.EnvVarError);
    });

    test('Certificate key store should temporarily be mocked', async () => {
      const manager = await InternetEndpointManager.init(dbConnection);

      expect(manager.keyStores.certificateStore).toBeInstanceOf(MockCertificateStore);
    });

    test('Public key store should temporarily be mocked', async () => {
      const manager = await InternetEndpointManager.init(dbConnection);

      expect(manager.keyStores.publicKeyStore).toBeInstanceOf(MockPublicKeyStore);
    });

    test('Private key store should be the cloud-based one', async () => {
      const manager = await InternetEndpointManager.init(dbConnection);

      expect(mockCloudKeystoreInit).toHaveBeenCalledOnceWith(
        REQUIRED_ENV_VARS.PRIVATE_KEY_STORE_ADAPTER,
        dbConnection,
      );
      expect(manager.keyStores.privateKeyStore).toBe(KEY_STORE_SET.privateKeyStore);
    });

    test('KMS should be initialised', async () => {
      const kmsInitMock = getMockKms();
      expect(kmsInitMock).not.toHaveBeenCalled();

      await InternetEndpointManager.init(dbConnection);

      expect(kmsInitMock).toHaveBeenCalledOnce();
    });

    test('Public key should be loaded from env var', async () => {
      const manager = await InternetEndpointManager.init(dbConnection);

      expect(manager.activeEndpointIdPublicKeyDer).toMatchObject(ENDPOINT_ID_PUBLIC_KEY_DER);
    });
  });

  describe('getActiveEndpoint', () => {
    const kms = new MockKms();

    let config: Config;
    beforeEach(() => {
      config = new Config(dbConnection);
    });

    test('Endpoint should be an Internet one', async () => {
      const manager = new InternetEndpointManager(
        ENDPOINT_ID_KEY_REF,
        ENDPOINT_ID_PUBLIC_KEY_DER,
        ENDPOINT_ADDRESS,
        kms,
        config,
        KEY_STORE_SET,
      );

      const endpoint = await manager.getActiveEndpoint();

      expect(endpoint).toBeInstanceOf(InternetEndpoint);
    });

    test('Internet address should be set', async () => {
      const manager = new InternetEndpointManager(
        ENDPOINT_ID_KEY_REF,
        ENDPOINT_ID_PUBLIC_KEY_DER,
        ENDPOINT_ADDRESS,
        kms,
        config,
        KEY_STORE_SET,
      );

      const { internetAddress } = await manager.getActiveEndpoint();

      expect(internetAddress).toBe(ENDPOINT_ADDRESS);
    });

    test('Private key should be loaded by reference from KMS', async () => {
      const manager = new InternetEndpointManager(
        ENDPOINT_ID_KEY_REF,
        ENDPOINT_ID_PUBLIC_KEY_DER,
        ENDPOINT_ADDRESS,
        kms,
        config,
        KEY_STORE_SET,
      );

      const {
        identityKeyPair: { privateKey },
      } = await manager.getActiveEndpoint();

      await expect(derSerializePrivateKey(privateKey)).resolves.toStrictEqual(
        await derSerializePrivateKey(ENDPOINT_ID_KEY_PAIR.privateKey),
      );
    });

    test('Public key should be deserialised', async () => {
      const manager = new InternetEndpointManager(
        ENDPOINT_ID_KEY_REF,
        ENDPOINT_ID_PUBLIC_KEY_DER,
        ENDPOINT_ADDRESS,
        kms,
        config,
        KEY_STORE_SET,
      );

      const {
        identityKeyPair: { publicKey },
      } = await manager.getActiveEndpoint();

      await expect(derSerializePublicKey(publicKey)).resolves.toMatchObject(
        ENDPOINT_ID_PUBLIC_KEY_DER,
      );
    });

    test('Id should be derived from public key', async () => {
      const manager = new InternetEndpointManager(
        ENDPOINT_ID_KEY_REF,
        ENDPOINT_ID_PUBLIC_KEY_DER,
        ENDPOINT_ADDRESS,
        kms,
        config,
        KEY_STORE_SET,
      );

      const { id } = await manager.getActiveEndpoint();

      expect(id).toBe(ENDPOINT_ID);
    });

    test('Key store set should be inherited from manager', async () => {
      const manager = new InternetEndpointManager(
        ENDPOINT_ID_KEY_REF,
        ENDPOINT_ID_PUBLIC_KEY_DER,
        ENDPOINT_ADDRESS,
        kms,
        config,
        KEY_STORE_SET,
      );

      const { keyStores } = await manager.getActiveEndpoint();

      expect(keyStores).toBe(KEY_STORE_SET);
    });

    test('Config instance should be initialised and passed to endpoint', async () => {
      const manager = new InternetEndpointManager(
        ENDPOINT_ID_KEY_REF,
        ENDPOINT_ID_PUBLIC_KEY_DER,
        ENDPOINT_ADDRESS,
        kms,
        config,
        KEY_STORE_SET,
      );

      const endpoint = await manager.getActiveEndpoint();

      expect(endpoint.config).toBe(config);
    });
  });
});
