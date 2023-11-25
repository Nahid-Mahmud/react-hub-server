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

    // announcements
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
        console.log("search value", search);
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
