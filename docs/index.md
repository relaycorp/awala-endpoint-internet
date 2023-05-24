# Awala Internet Endpoint

This is a middleware for server-side apps to communicate over [Awala](https://awala.network) without implementing any of the networking or cryptography from the protocol suite. Such as apps can be written in any language and run on any platform thanks to the use of [CloudEvents](https://cloudevents.io).

## Overview

As an Awala Internet Endpoint, this middleware acts as the bridge between Awala users' gateways and a server-side app, thus enabling both to exchange _parcels_. A parcel is a signed message that contains an encrypted _service message_. The service message is the actual payload (e.g., a social media post, an email).

The middleware communicates with the gateways via [PoHTTP](https://specs.awala.network/RS-007), and with the app via CloudEvents. The app is required to comply with a [contract](./integration.md).

The following diagram illustrates the flow of a parcel from the gateway to the app:

![](assets/diagram-incoming-message.svg)

On the other hand, the following diagram illustrates the flow of a parcel from the app to the gateway:

![](assets/diagram-outgoing-message.svg)

## Parcel Delivery Authorisations (PDAs)

As required by Awala, parcels bound for _private endpoints_ (e.g., Android/desktop apps) must be previously authorised by the recipient. This is done by providing the sender with a Parcel Delivery Authorisation (PDA) beforehand, which the sender should then use when generating parcels. This middleware will automatically import incoming PDAs. As of this writing, apps are not notified about PDAs.

For example, the following diagram illustrates the flow of parcels and service messages (as CloudEvents) in an app implementing the [Awala Ping service](https://specs.awala.network/RS-014):

![](./assets/diagram-ping.svg)

## Architecture

As shown above, the middleware itself is split into a [PoHTTP](https://specs.awala.network/RS-007) server and a client:

- The PoHTTP server, which is responsible for receiving parcels from the gateways, and passing on the encapsulated service messages to the app via a broker. Consequently, it MUST be accessible from the Internet.
- PoHTTP client, which is responsible for receiving service messages from the app, and passing on the service messages encapsulated in parcels to the gateways. It MUST NOT be accessible from the Internet.
