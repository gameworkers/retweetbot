import { setTimeout } from "timers/promises";

import { TwitterClient } from "twitter-api-client";
import { close as flushSentry } from "@sentry/node";

import {
  TWITTER_ACCESS_KEY,
  TWITTER_ACCESS_SECRET,
  TWITTER_CONSUMER_KEY,
  TWITTER_CONSUMER_SECRET,
} from "./env";

// the number of tweets that should be considered in the window of tweets to
// retweet for each user.
const MAX_TL_LENGTH_PER_USER = 10;

const argv = process.argv.slice(2);

// ok for future reference using this twitter-api-client package is a very bad
// idea... a significant proportion of its typings are simply incorrect, and it
// throws non-Error objects when something goes wrong (so stack traces are lost
// and it's impossible to tell where in your code something actually threw).
// avoid.
function getEnsuredError(err: any, extraContext?: any) {
  if (err instanceof Error) return err;
  return new Error(
    `Non-Error error (probably from the perfidious twitter-api-client):\n${JSON.stringify(
      err,
      undefined,
      2
    )}${
      extraContext
        ? `\n(extra context: ${JSON.stringify(extraContext, undefined, 2)})`
        : ""
    }`
  );
}

async function main() {
  const client = new TwitterClient({
    apiKey: TWITTER_CONSUMER_KEY,
    apiSecret: TWITTER_CONSUMER_SECRET,
    accessToken: TWITTER_ACCESS_KEY,
    accessTokenSecret: TWITTER_ACCESS_SECRET,
  });

  const { users: follows } = await client.accountsAndUsers
    .friendsList({
      skip_status: true,
      include_user_entities: false,
      // we should be so lucky to have to worry about pagination
      count: 200,
    })
    .catch((e) => {
      throw getEnsuredError(e);
    });

  const toRt: { tweetId: string; from: string }[] = [];

  for (const { id_str: userId, screen_name } of follows) {
    const tl = await client.tweets
      .statusesUserTimeline({
        user_id: userId,
        count: MAX_TL_LENGTH_PER_USER,
        trim_user: true,
        include_rts: false,
        // this will also exclude replies to a user's own threads, which i think
        // is what we want.
        exclude_replies: true,
      })
      .catch((e) => {
        throw getEnsuredError(e, { userId });
      });

    for (const tweet of tl) {
      if (!tweet.retweeted) {
        toRt.push({ tweetId: tweet.id_str, from: screen_name });
      }
    }

    // a little ritual to try to avoid rate limits
    await setTimeout(500);
  }

  if (argv.includes("local")) {
    console.log("to RT:\n", toRt);
    console.log("count:", toRt.length);
    return;
  }

  // iterate in reverse to preserve timeline order. unfortunately we don't
  // necessarily know when retweets were made, so we can't really sort all
  // tweets by date. this will retweet everything by each account in turn. in
  // practice this should run frequently enough that it won't be a problem.
  for (let i = toRt.length - 1; i >= 0; i--) {
    const { tweetId, from } = toRt[i];
    console.log(
      `retweeting https://twitter.com/anyone/status/${tweetId} (from ${from})`
    );
    await client.tweets
      .statusesRetweetById({ id: tweetId, trim_user: true })
      .catch((e) => {
        throw getEnsuredError(e, { id: toRt[i] });
      });
    await setTimeout(5000);
  }
}

void main()
  .then(() => {
    console.log("ok");
  })
  .then(() => flushSentry(2000))
  .then(() => {
    console.log("done.");
    process.exit(0);
  });
