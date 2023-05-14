import { prop } from '@typegoose/typegoose';

export class PrivateEndpointModelSchema {
  @prop({ required: true, unique: true })
  public peerId!: string;

  @prop({ required: true })
  public internetGatewayAddress!: string;
}
