import { getModelForClass, type ReturnModelType } from '@typegoose/typegoose';
import type { Connection } from 'mongoose';

import { ConfigItem } from '../models/ConfigItem.model.js';

export enum ConfigKey {
  INITIAL_SESSION_KEY_ID_BASE64 = 'initial_session_key_id_b64',
}

export class Config {
  private readonly configItemModel: ReturnModelType<typeof ConfigItem>;

  public constructor(connection: Connection) {
    this.configItemModel = getModelForClass(ConfigItem, { existingConnection: connection });
  }

  public async set(key: ConfigKey, value: string): Promise<void> {
    const record: ConfigItem = { key, value };
    await this.configItemModel.updateOne({ key }, record, { upsert: true });
  }

  public async get(key: ConfigKey): Promise<string | null> {
    const record = await this.configItemModel.findOne({ key }).exec();
    return record?.value ?? null;
  }
}
