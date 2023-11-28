const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 5000;

// console.log(process.env.STRIPE_SECRET_KEY)
// middleware
app.use(cors());
app.use(express.json());

// mongodb codes
// console.log( "access token", process.env.ACCESS_TOKEN_SECRET)

const uri = `mongodb+srv://${process.env.DB_user}:${process.env.DB_Pass}@cluster0.htztern.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    // my codes here
    const usersCollection = client.db("reactHubDb").collection("users");
    const tagsCollection = client.db("reactHubDb").collection("tags");
    const announcementsCollection = client
      .db("reactHubDb")
      .collection("announcements");
    const postsCollection = client.db("reactHubDb").collection("posts");
    const commentsCollection = client.db("reactHubDb").collection("comments");

    // custom middlewares
    // verify token
    const veryfyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "Unauthorized" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(403).send({ message: "Forbidden" });
        }
        req.decoded = decoded;
        next();
      });
    };

    // verify admin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      next();
    };

    // get admin data
    app.get("/user/admin/:email", veryfyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(401).send({ message: "Unauthorized Request" });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user.role === "admin";
      }
      res.send({ admin });
    });

    // get user data
    app.get("/user/:email", veryfyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(401).send({ message: "Unauthorized Request" });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      res.send(user);
    });

    // get all user data
    app.get(
      "/users/admin/:email",
      veryfyToken,
      verifyAdmin,
      async (req, res) => {
        const size = 10;
        const page = parseInt(req.query.page);
        const result = await usersCollection
          .find()
          .skip(page * size)
          .limit(size)
          .toArray();

        res.send(result);
      }
    );

    // update user role
    app.put("/user/role/:email", veryfyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(401).send({ message: "Unauthorized Request" });
      }
      const query = { email: email };
      const updateRole = req.body;
      const updateUserRole = {
        $set: {
          badge: updateRole.badge,
          paymentId: updateRole.paymentId,
        },
      };
      options = { upsert: true };
      const result = await usersCollection.updateOne(
        query,
        updateUserRole,
        options
      );
      res.send(result);
    });

    // jwt related apis
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "8760h",
      });
      res.send({ token });
    });

    // post users
    app.post("/users", async (req, res) => {
      const user = req.body;
      //   console.log(user);
      const query = { email: user.email };

      const existingUser = await usersCollection.findOne(query);
      //   console.log(existingUser);
      if (existingUser) {
        return res.send({ message: "User already exists" });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // get all users
    app.get("/users", async (req, res) => {
      const users = await usersCollection.find({}).toArray();
      res.send(users);
    });

    // make a user admin
    app.put(
      "/user/updaterole/:email",
      veryfyToken,
      verifyAdmin,
      async (req, res) => {
        const data = req.body;
        const name = data.name;
        const role = data.role;
        const filter = { name: name };
        const options = { upsert: true };
        const updateRole = {
          $set: {
            role: role,
          },
        };
        const result = await usersCollection.updateOne(
          filter,
          updateRole,
          options
        );
        console.log("User data for requesign update role", data);
        res.send(result);
      }
    );

    // get all tags

    app.get("/tags", async (req, res) => {
      const tags = await tagsCollection.find({}).toArray();
      res.send(tags);
    });
    // post tags
    app.post("/tags", veryfyToken, verifyAdmin, async (req, res) => {
      const tag = req.body;
      const result = await tagsCollection.insertOne(tag);
      res.send(result);
    });

    // get all announcements
    app.get("/announcements", async (req, res) => {
      const announcements = await announcementsCollection
        .find()
        .sort({ time: -1 })
        .toArray();
      res.send(announcements);
    });

    // post announcements
    app.post("/announcements", veryfyToken, verifyAdmin, async (req, res) => {
      const announcement = req.body;
      const result = await announcementsCollection.insertOne(announcement);
      res.send(result);
    });

    // get all posts
    app.get("/posts", async (req, res) => {
      try {
        // getting the query data
        const size = 5;
        const page = parseInt(req.query.page);

        const sortQuery = req.query.sort;
        const search = req.query.search;
        // console.log("search value", search);
        if (search !== "undefined") {
          const query = { tags: search };
          const data = await postsCollection
            .find(query)
            .skip(page * size)
            .limit(size)
            .toArray();
          return res.send(data);
        }

        // setting sort order to {} initially

        let sortOrder = {};

        // setting sort order based on query data

        if (sortQuery === "popularity") {
          sortOrder = { popularity: -1 };
        } else {
          sortOrder = { time: -1 };
        }
        // console.log(sortOrder);
        const postsbyAggregation = await postsCollection
          .aggregate([
            {
              $addFields: {
                popularity: {
                  $subtract: ["$upVoteCount", "$downVoteCount"],
                },
              },
            },
            {
              $sort: sortOrder,
            },
            {
              $skip: page * size,
            },
            {
              $limit: size,
            },
          ])
          .toArray();
        res.send(postsbyAggregation);
      } catch (err) {
        console.log(err);
        res.send({ err });
      }
    });

    // get total post count
    app.get("/posts-count", async (req, res) => {
      const postsCount = await postsCollection.estimatedDocumentCount();
      res.send({ postsCount });
    });

    // get indivisuval post
    app.get("/posts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const post = await postsCollection.findOne(query);
      res.send(post);
    });

    // update post vote count
    app.put("/posts/:id", veryfyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updatePostVoteData = req.body;
      console.log("vote data update", updatePostVoteData);
      const updatePostVote = {
        $set: {
          upVoteCount: updatePostVoteData.upVoteCount,
          downVoteCount: updatePostVoteData.downVoteCount,
        },
      };

      const result = await postsCollection.updateOne(
        filter,
        updatePostVote,
        options
      );
      res.send(result);
    });

    // post posts
    app.post("/posts", veryfyToken, async (req, res) => {
      const post = req.body;
      const result = await postsCollection.insertOne(post);
      res.send(result);
    });

    // get indiviusal posts and post count by user email

    app.get("/posts/user/:email", veryfyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const userCeatedPosts = await postsCollection
        .find(query)
        .sort({ time: -1 })
        .toArray();
      const totalPostByUser = userCeatedPosts.length;
      res.send({ userCeatedPosts, totalPostByUser });
    });

    app.get("/posts/user/table/:email", veryfyToken, async (req, res) => {
      const size = 10;
      const page = parseInt(req.query.page);
      const email = req.params.email;
      const query = { email: email };
      const userCeatedPosts = await postsCollection
        .find(query)
        .skip(page * size)
        .limit(size)
        .sort({ time: -1 })
        .toArray();
      const totalPostByUser = userCeatedPosts.length;
      res.send({ userCeatedPosts, totalPostByUser });
    });

    // delete post by id
    app.delete("/post/delete/:id", veryfyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await postsCollection.deleteOne(query);
      res.send(result);
    });

    // get all comments
    app.get("/comments", async (req, res) => {
      const comments = await commentsCollection.find().toArray();
      res.send(comments);
    });
    // post comments
    app.post("/comments", veryfyToken, async (req, res) => {
      const comment = req.body;
      const result = await commentsCollection.insertOne(comment);
      res.send(result);
    });
    // get spesific comments
    app.get("/comments/:email", async (req, res) => {
      const query = { email: req.params.email };
      const comments = await commentsCollection.find(query).toArray();
      res.send({ totalUserComments: comments.length });
    });

    // get reported comments
    app.get(
      "/comments/status/reported",
      veryfyToken,
      verifyAdmin,
      async (req, res) => {
        // Ref: https://docs.mongodb.com/manual/reference/operator/query/exists/
        const size = 10;
        const page = parseInt(req.query.page);

        const reportedComments = await commentsCollection
          .find({ report: { $exists: true } })
          .skip(page * size)
          .limit(size)
          .toArray();
        res.send(reportedComments);
      }
    );

    // remove false reported comments field
    app.put("/comments/report/remove/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      result = await commentsCollection.updateOne(filter, {
        $unset: { report: "" },
      });
      res.send(result);
    });

    // delete comment
    app.delete("/comments/delete/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await commentsCollection.deleteOne(query);
      res.send(result);
    });

    // post reported comments
    app.put("/comments/report/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateReportedComment = req.body;
      const updateReport = {
        $set: {
          report: updateReportedComment.report,
          reportedBy: updateReportedComment.reportedBy,
        },
      };
      const result = await commentsCollection.updateOne(
        filter,
        updateReport,
        options
      );
      res.send(result);
    });

    // payment related api
    // create payment intent
    app.get("/create-payment-intent", veryfyToken, async (req, res) => {
      const price = 500;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: price,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // get statistics
    app.get("/statistics", veryfyToken, async (req, res) => {
      const email = req.query.email;
      const totalUsers = await usersCollection.estimatedDocumentCount();
      const totalPosts = await postsCollection.estimatedDocumentCount();
      const totalComments = await commentsCollection.estimatedDocumentCount();
      const reportedComments = await commentsCollection
        .find({ report: { $exists: true } })
        .toArray();
      const reportedCommentsCount = reportedComments.length;
      // find indivisual post count
      const query = { email: email };
      const userCeatedPosts = await postsCollection.find(query).toArray();
      const totalPostByUser = userCeatedPosts.length;

      const statistics = {
        totalUsers,
        totalPosts,
        totalComments,
        reportedCommentsCount,
        totalPostByUser,
      };
      res.send(statistics);
    });

    // time stamp 2.16 29/11/2023
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

//mongodb codes end

app.get("/", (req, res) => {
  res.send({ status: "React Hub is running" });
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
