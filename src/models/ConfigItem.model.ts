import { prop } from '@typegoose/typegoose';

export class ConfigItem {
  @prop({ required: true, unique: true })
  public key!: string;

  @prop({ required: true })
  public value!: string;
}
