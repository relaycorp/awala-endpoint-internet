import { jest } from '@jest/globals';
import * as cloudKeyStore from '@relaycorp/awala-keystore-cloud';

import { configureMockEnvVars } from '../testUtils/envVars';
import { initVaultKeyStore } from './vault';

jest.mock('@relaycorp/awala-keystore-cloud');

const BASE_ENV_VARS = {
  KS_VAULT_KV_PREFIX: 'kv-prefix',
  KS_VAULT_TOKEN: 'token',
  KS_VAULT_URL: 'http://hi.lol',
};
const mockEnvVars = configureMockEnvVars(BASE_ENV_VARS);

describe('initVaultKeyStore', () => {
  test.each(['KS_VAULT_KV_PREFIX', 'KS_VAULT_TOKEN', 'KS_VAULT_URL'])(
    'Environment variable %s should be present',
    (envVar) => {
      mockEnvVars({ ...BASE_ENV_VARS, [envVar]: undefined });

      expect(initVaultKeyStore).toThrow(new RegExp(envVar));
    },
  );

  test('Key store should be returned if env vars are present', () => {
    const keyStore = initVaultKeyStore();

    expect(keyStore).toBeInstanceOf(cloudKeyStore.VaultPrivateKeyStore);
    expect(cloudKeyStore.VaultPrivateKeyStore).toBeCalledWith(
      BASE_ENV_VARS.KS_VAULT_URL,
      BASE_ENV_VARS.KS_VAULT_TOKEN,
      BASE_ENV_VARS.KS_VAULT_KV_PREFIX,
    );
  });
});
