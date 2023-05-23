import { prop } from '@typegoose/typegoose';

export class ConfigItem2 {
  @prop({ required: true, unique: true })
  public key!: string;

  @prop({ required: true })
  public value!: string;
}
