import { readFile } from "fs/promises";
import { setTimeout } from "timers/promises";

import { TwitterClient } from "twitter-api-client";
import retry from "async-retry";

import {
  TWITTER_ACCESS_KEY,
  TWITTER_ACCESS_SECRET,
  TWITTER_CONSUMER_KEY,
  TWITTER_CONSUMER_SECRET,
} from "./env";

type Status =
  | string
  | {
      status: string;
      pathToMedia: string;
      caption?: string;
      focus?: string;
    }
  | {
      status: string;
      media: Buffer;
      caption?: string;
      focus?: string;
    };

export async function doTweet(statuses: Status[]): Promise<void> {
  const twitterClient = new TwitterClient({
    apiKey: TWITTER_CONSUMER_KEY,
    apiSecret: TWITTER_CONSUMER_SECRET,
    accessToken: TWITTER_ACCESS_KEY,
    accessTokenSecret: TWITTER_ACCESS_SECRET,
  });

  let inReplyToId: string | undefined = undefined;

  let i = 0;
  for (const s of statuses) {
    const { status } = typeof s === "string" ? { status: s } : s;

    let mediaId: string | undefined = undefined;
    if (typeof s === "object") {
      if ("media" in s) {
        // typings don't seem to let us append the buffer directly
        const { media_id_string } = await twitterClient.media.mediaUpload({
          media_data: s.media.toString("base64"),
        });

        mediaId = media_id_string;
      } else {
        const buf = await readFile(s.pathToMedia);

        const { media_id_string } = await twitterClient.media.mediaUpload({
          media_data: buf.toString("base64"),
        });

        mediaId = media_id_string;
      }
    }

    const publishedTweet = await retry(
      // eslint-disable-next-line @typescript-eslint/no-loop-func
      () =>
        twitterClient.tweets.statusesUpdate({
          status,
          in_reply_to_status_id: inReplyToId,
          auto_populate_reply_metadata: true,
          media_ids: mediaId,
        }),
      { retries: 5 }
    );

    inReplyToId = publishedTweet.id_str;

    console.log("======\n", status);
    console.log(
      [
        `${publishedTweet.created_at} -> `,
        `https://twitter.com/${publishedTweet.user.screen_name}/status/${publishedTweet.id_str}\n======`,
      ].join("")
    );

    i++;
    if (i < statuses.length) {
      await setTimeout(3000);
    }
  }
}
