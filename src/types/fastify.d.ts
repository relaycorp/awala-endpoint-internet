import { Connection } from 'mongoose';
import { InternetEndpoint } from '../utilities/awala/InternetEndpoint';

declare module 'fastify' {
  export interface FastifyInstance {
    mongoose: Connection;
    activeEndpoint: InternetEndpoint;
  }
}
