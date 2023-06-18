const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const databasePath = path.join(__dirname, "twitterClone.db");

const app = express();
app.use(express.json());

let database = null;

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });
    app.listen(3004, console.log("Server Running at http://localhost:3003/"));
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
  }
};

initializeDbAndServer();

// Authentication with JWT Token

const authenticateToken = (request, response, next) => {
  const { tweet } = request.body;
  const { tweetId } = request.params;
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.payload = payload;
        request.tweet = tweet;
        request.tweetId = tweetId;
        next();
      }
    });
  }
};

// API 1 user register

app.post("/register/", async (request, response) => {
  const { name, username, password, gender } = request.body;
  //get users from table
  const selectUserQuery = `SELECT * FROM user WHERE username='${username}'`;
  const user = await database.get(selectUserQuery);
  if (user === undefined) {
    // create new user
    if (password.length >= 6) {
      const hashedPassword = await bcrypt.hash(password, 10);
      const createUserQuery = `
        INSERT INTO
            user(name, username, password, gender)
        VALUES
            ('${name}',
            '${username}', 
            '${hashedPassword}',
            '${gender}'
            );`;
      await database.run(createUserQuery);
      response.status(200);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

// API 2 user login

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  //get users from table
  const selectUserQuery = `SELECT * FROM user WHERE username='${username}'`;
  const user = await database.get(selectUserQuery);
  if (user === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, user.password);
    if (isPasswordMatched) {
      const jwtToken = jwt.sign(user, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// API 3 Returns the latest tweets of people whom the user follows

app.get("/user/tweets/feed", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, username, name, gender } = payload;
  const getTweetsFeedQuery = `
        SELECT
            username,
            tweet,
            date_time AS dateTime
        FROM
            follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id
            INNER JOIN user ON user.user_id = follower.following_user_id
        WHERE
            follower.follower_user_id = ${user_id}
        ORDER BY
            date_time DESC
        limit 4;`;
  const tweets = await database.all(getTweetsFeedQuery);
  response.send(tweets);
});

// API 4 Returns the list of all names of people whom the user follows

app.get("/user/following", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, username, name, gender } = payload;
  const getUserFollowsQuery = `
    SELECT
        name
    FROM
        user INNER JOIN follower on user.user_id = follower.following_user_id
    WHERE
        follower.follower_user_id = ${user_id};`;
  const userFollows = await database.all(getUserFollowsQuery);
  response.send(userFollows);
});

// API 5 Returns the list of all names of people who follows the user

app.get("/user/followers", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, username, name, gender } = payload;
  const getUserFollowersQuery = `
    SELECT
        name
    FROM
        user INNER JOIN follower on user.user_id = follower.follower_user_id
    WHERE
        follower.following_user_id = ${user_id}
        ;`;
  const userFollowers = await database.all(getUserFollowersQuery);
  response.send(userFollowers);
});

// API 6 getting tweets

app.get("/tweets/:tweetId", authenticateToken, async (request, response) => {
  const { tweetId } = request;
  const { payload } = request;
  const { user_id, username, name, gender } = payload;
  const getTweetQuery = `SELECT * FROM tweet WHERE tweet_id=${tweetID};`;
  const tweetResult = await database.get(getTweetQuery);
  const getUserFollowersQuery = `
    SELECT
        *
    FROM
        follower INNER JOIN user ON user.user_id = follower.following_user_id
    WHERE
        follower.follower_user_id = ${user_id};`;
  const userFollowers = await database.all(getUserFollowersQuery);
  if (userFollowers.some((e) => e.following_user_id === tweetResult.user_id)) {
    const getTweetDetailsQuery = `
        SELECT
            tweet.tweet AS tweet,
            COUNT(DISTINCT(like.like_id)) AS likes,
            COUNT(DISTINCT(reply.reply_id)) AS replies,
            tweet.date_time AS dateTime
        FROM
            tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id
            INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
        WHERE
            tweet.tweet_id = ${tweetId} AND tweet.user_id = ${userFollowers[0].user_id};`;
    const tweetDetails = await database.get(getTweetDetailsQuery);
    response.send(tweetDetails);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

// API 7 getting liked usernames

app.get(
  "/tweets/:tweetId/likes",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request;
    const { payload } = request;
    const { user_id, username, name, gender } = payload;
    const getLikedUsersQuery = `
        SELECT
            *
        FROM
            follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id
            INNER JOIN like ON like.tweet_id = tweet.tweet_id
            INNER JOIN user ON user.user_id = like.user_id
        WHERE
            tweet.tweet_id = ${tweetId} AND follower.follower_user_id=${user_id};`;
    const likedUsers = await database.all(getLikedUsersQuery);
    if (likedUsers.length !== 0) {
      let likes = [];
      const getNamesArray = (likedUsers) => {
        for (let each of likedUsers) {
          likes.push(each.username);
        }
      };
      getNamesArray(likedUsers);
      response.send({ likes });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

// API 8 getting replies object
app.get(
  "/tweets/:tweetId/replies",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request;
    const { payload } = request;
    const { user_id, username, name, gender } = payload;
    const getRepliedUsersQuery = `
        SELECT
            *
        FROM
            follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id
            INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
            INNER JOIN user ON user.user_id = reply.user_id
        WHERE
            tweet.tweet_id = ${tweetId} AND follower.follower_user_id=${user_id};`;
    const repliedUsers = await database.all(getRepliedUsersQuery);
    if (repliedUsers.length !== 0) {
      let replies = [];
      const getNamesArray = (repliedUsers) => {
        for (let each of repliedUsers) {
          let object = {
            name: each.name,
            reply: each.reply,
          };
          replies.push(object);
        }
      };
      getNamesArray(repliedUsers);
      response.send({ replies });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

// API 9 all tweets of user

app.get("/user/tweets", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, username, name, gender } = payload;
  const getTweetsDetailsQuery = `
    SELECT
        tweet.tweet AS tweet,
        COUNT(DISTINCT(like.like_id)) AS likes,
        COUNT(DISTINCT(reply.reply_id)) AS replies,
        tweet.date_time AS dateTime
    FROM
        user INNER JOIN tweet ON user.user_id = tweet.user_id
        INNER JOIN like ON like.tweet_id = tweet.tweet_id
        INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
    WHERE
        user.user_id = ${user_id}
    GROUP BY
        tweet.tweet_id;`;
  const tweetsDetails = await database.all(getTweetsDetailsQuery);
  response.send(tweetsDetails);
});

// API 10 create a tweet in tweet table

app.post("/user/tweets", authenticateToken, async (request, response) => {
  const { tweet } = request;
  const { tweetId } = request;
  const { payload } = request;
  const { user_id, username, name, gender } = payload;
  const postTweetQuery = `
        INSERT INTO
            tweet (tweet, user_id)
        VALUES(
            '${tweet}',
            '${user_id}'
        );`;
  await database.run(postTweetQuery);
  response.send("Created a Tweet");
});

// API 11 Delete a tweet from tweet table

app.delete("/tweets/:tweetId", authenticateToken, async (request, response) => {
  const { tweetId } = request;
  const { payload } = request;
  const { user_id, username, name, gender } = payload;
  const selectTweetUserQuery = `
        SELECT
            *
        FROM
            tweet
        WHERE
            tweet.user_id=${user_id} AND tweet.tweet_id=${tweetId};`;
  const userTweets = await database.all(selectTweetUserQuery);
  console.log(userTweets);
  if (userTweets.length !== 0) {
    const deleteTweetQuery = `
        DELETE FROM
            tweet
        WHERE
            tweet.user_id=${user_id} AND tweet.tweet_id=${tweetId};`;
    await database.run(deleteTweetQuery);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

module.exports = app;
