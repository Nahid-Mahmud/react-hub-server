const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 5000;

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

    // get all tags

    app.get("/tags", async (req, res) => {
      const tags = await tagsCollection.find({}).toArray();
      res.send(tags);
    });

    // get all announcements
    app.get("/announcements", async (req, res) => {
      const announcements = await announcementsCollection.find().toArray();
      res.send(announcements);
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
        if (search) {
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

    // get all post count
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
    app.put("/posts/:id",veryfyToken, async (req, res) => {
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

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
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
