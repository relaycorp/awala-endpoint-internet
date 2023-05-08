import { VaultPrivateKeyStore } from '@relaycorp/awala-keystore-cloud';
import env from 'env-var';
export function initVaultKeyStore(): VaultPrivateKeyStore {
  const vaultUrl = env.get('KS_VAULT_URL').required().asString();
  const vaultToken = env.get('KS_VAULT_TOKEN').required().asString();
  const vaultKvPath = env.get('KS_VAULT_KV_PREFIX').required().asString();
  return new VaultPrivateKeyStore(vaultUrl, vaultToken, vaultKvPath);
}
