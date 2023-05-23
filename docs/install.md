---
permalink: /install
nav_order: 1
---

# Install

The app comprises two HTTP servers and a bootstrapping script that should be run on each deployment. They're all distributed in the same Docker image: [`ghcr.io/relaycorp/awala-endpoint`](https://github.com/relaycorp/awala-endpoint-internet/pkgs/container/awala-endpoint).

## Containers

### PoHTTP server

This is a [PoHTTP server](https://specs.awala.network/RS-007) that receives parcels from Awala gateways via the Internet. This server MUST be publicly accessible from the Internet.

To run this process, run the Docker container with the command argument `pohttp-server`.

### PoHTTP client

This is a [CloudEvents](https://cloudevents.io) server that receives service messages from the app, and sends the resulting parcels to the respective gateways. This server MUST NOT be publicly accessible.

To run this process, run the Docker container with the command argument `pohttp-client`.

### Bootstrapping script

This script is responsible for generating some initial data required by the app.

To run this process, run the Docker container with the command argument `pohttp-bootstrap`.

## Backing services

The middleware requires the uses backing services:

- [**MongoDB**](https://www.mongodb.com) 6 or newer.
- A **Key Management Service (KMS)** supported by [`@relaycorp/webcrypto-kms`](https://www.npmjs.com/package/@relaycorp/webcrypto-kms).
- A [CloudEvents](https://cloudevents.io)-compliant broker (e.g., [Google Eventarc](https://cloud.google.com/eventarc/docs/overview), RabbitMQ).

## Environment variables

All the processes use the following variables:

- `INTERNET_ADDRESS` (required): The Awala Internet address of the endpoint (e.g., `ping.awala.services`).
- `ACTIVE_ID_KEY_REF` (required): The [`@relaycorp/webcrypto-kms`](https://www.npmjs.com/package/@relaycorp/webcrypto-kms) reference for the endpoint's identity key pair (e.g., `arn:aws:kms:eu-west-2:<AWS-ACCOUNT>:key/<KEY-ID>`).
- `KMS_ADAPTER` (required): The [`@relaycorp/webcrypto-kms`](https://www.npmjs.com/package/@relaycorp/webcrypto-kms) adapter (e.g., `AWS`).
- `PRIVATE_KEY_STORE_ADAPTER` (required): The [`@relaycorp/awala-keystore-cloud`](https://www.npmjs.com/package/@relaycorp/awala-keystore-cloud) adapter (e.g., `VAULT`).

`@relaycorp/webcrypto-kms` and `@relaycorp/awala-keystore-cloud` require additional variables which are specific to the adapter.

The HTTP servers additionally support the environment variable `PORT` (default: `8080`), to specify the port on which it should listen.

## DNS requirements

The domain name specified as `INTERNET_ADDRESS` MUST have DNSSEC properly configured and contain an SRV record that maps the `_awala-pdc.tcp` service to the PoHTTP server's domain name.

For example, if the Internet address is `example.com` and the PoHTTP server runs on `awala-pohttp.example.com:443`, a valid SRV record could be:

```
_awala-pdc._tcp.example.com. 86400 IN SRV 0 5 443 awala-pohttp.example.com.
```

## TLS requirements

The PoHTTP server MUST use TLS 1.2+ host and a valid certificate.

## Example with Knative

We use Knative to run the app in development and CI, so you can refer to [the Kubernetes resources in the repository](https://github.com/relaycorp/awala-endpoint-internet/tree/main/k8s) to see a fully-operation example.
