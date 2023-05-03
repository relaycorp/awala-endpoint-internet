export const RSA_PSS_IMPORT_ALGORITHM: RsaHashedImportParams = {
  name: 'RSA-PSS',
  hash: { name: 'SHA-256' },
};

export const RSA_PSS_KEY_USAGES: KeyUsage[] = ['sign', 'verify'];
