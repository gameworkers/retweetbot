/* eslint-disable node/no-process-env */

import { config } from "dotenv";
import { parseEnv, z } from "znv";
import { init as initSentry } from "@sentry/node";
import { CaptureConsole } from "@sentry/integrations";

config();

export const {
  TWITTER_CONSUMER_KEY,
  TWITTER_CONSUMER_SECRET,
  TWITTER_ACCESS_KEY,
  TWITTER_ACCESS_SECRET,
  DATA_DIR,
  SENTRY_DSN,
} = parseEnv(process.env, {
  TWITTER_CONSUMER_KEY: z.string().nonempty(),
  TWITTER_CONSUMER_SECRET: z.string().nonempty(),
  TWITTER_ACCESS_KEY: z.string().nonempty(),
  TWITTER_ACCESS_SECRET: z.string().nonempty(),
  DATA_DIR: {
    schema: z.string().nonempty(),
    defaults: {
      development: "persist",
    },
  },
  SENTRY_DSN: z.string().nonempty().optional(),
});

export const isDev = process.env["NODE_ENV"] !== "production";

if (!SENTRY_DSN) {
  console.warn(
    `Sentry DSN is invalid! Error reporting to sentry will be disabled.`
  );
} else {
  initSentry({
    dsn: SENTRY_DSN,
    environment: isDev ? "dev" : "prod",
    integrations: [
      new CaptureConsole({ levels: ["warn", "error", "debug", "assert"] }),
    ],
  });
}
