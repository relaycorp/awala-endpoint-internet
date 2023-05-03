import { getModelForClass, type ReturnModelType } from '@typegoose/typegoose';

import { ConfigItem } from '../models/ConfigItem.model.js';
import { setUpTestDbConnection } from '../testUtils/db.js';

import { Config, ConfigKey } from './config.js';

const getConnection = setUpTestDbConnection();
let configItemModel: ReturnModelType<typeof ConfigItem>;
beforeAll(() => {
  configItemModel = getModelForClass(ConfigItem, { existingConnection: getConnection() });
});

const PRIVATE_ADDRESS = '0deafbeef';

describe('Config', () => {
  describe('set', () => {
    test('Item should be created if it does not already exist', async () => {
      const config = new Config(getConnection());

      await config.set(ConfigKey.INITIAL_SESSION_KEY_ID_BASE64, PRIVATE_ADDRESS);

      await expect(
        configItemModel.countDocuments({
          key: ConfigKey.INITIAL_SESSION_KEY_ID_BASE64,
          value: PRIVATE_ADDRESS,
        }),
      ).resolves.toBe(1);
    });

    test('Item should be updated if it already exists', async () => {
      const config = new Config(getConnection());
      await config.set(ConfigKey.INITIAL_SESSION_KEY_ID_BASE64, PRIVATE_ADDRESS);
      const newValue = `new ${PRIVATE_ADDRESS}`;
      await config.set(ConfigKey.INITIAL_SESSION_KEY_ID_BASE64, newValue);

      await expect(
        configItemModel.countDocuments({
          key: ConfigKey.INITIAL_SESSION_KEY_ID_BASE64,
          value: newValue,
        }),
      ).resolves.toBe(1);
    });
  });

  describe('get', () => {
    test('Null should be returned for non-existing item', async () => {
      const config = new Config(getConnection());

      await expect(config.get(ConfigKey.INITIAL_SESSION_KEY_ID_BASE64)).resolves.toBeNull();
    });

    test('Value should be returned if item exists', async () => {
      const config = new Config(getConnection());
      await config.set(ConfigKey.INITIAL_SESSION_KEY_ID_BASE64, PRIVATE_ADDRESS);

      await expect(config.get(ConfigKey.INITIAL_SESSION_KEY_ID_BASE64)).resolves.toEqual(
        PRIVATE_ADDRESS,
      );
    });
  });
});
