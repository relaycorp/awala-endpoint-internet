import type { BaseLogger } from 'pino';

export function configureErrorHandling(logger: BaseLogger): void {
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaughtException');

    process.exitCode = 1;
  });
}
