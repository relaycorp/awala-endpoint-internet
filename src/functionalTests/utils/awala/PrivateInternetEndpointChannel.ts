import { Channel, type ServiceMessage } from '@relaycorp/relaynet-core';

export class PrivateInternetEndpointChannel extends Channel<ServiceMessage, string> {}
