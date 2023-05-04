import { Crypto } from '@peculiar/webcrypto';

export const NODEJS_PROVIDER = new Crypto().subtle;
