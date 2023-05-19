import { prop } from '@typegoose/typegoose';

export class PeerEndpoint {
  @prop({ required: true, unique: true })
  public peerId!: string;

  @prop({ required: true })
  public internetGatewayAddress!: string;
}
