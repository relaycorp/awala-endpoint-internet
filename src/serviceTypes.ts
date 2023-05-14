import type { Connection } from 'mongoose';
import type { BaseLogger } from 'pino';

import type { InternetEndpoint } from './utilities/awala/InternetEndpoint.js';

export interface ServiceOptions {
  readonly dbConnection: Connection;
  readonly logger: BaseLogger;
  readonly activeEndpoint: InternetEndpoint;
}
