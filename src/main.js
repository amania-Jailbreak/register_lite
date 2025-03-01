/*

    * register_lite backend
    * 簡易的なレジシステムのバックエンド
    * author: @amania-Jailbreak

*/

const express = require("express");
// TODO: MongoDBを使用しいろいろな管理を行えるようにする
const { MongoClient } = require("mongodb");
var crypto = require("crypto");
const app = express();
const port = 5010;
const jwt = require("jsonwebtoken");
const { consola, createConsola } = require("consola");
const expressws = require("express-ws");
const { json } = require("stream/consumers");
expressws(app);
consola.start("Starting backend server");
app.use(express.json());

var creating = [];
let category = ["ラーメン", "トッピング", "ドリンク"];
// is_debug
if (process.env.NODE_ENV === "dev") {
  consola.info("Development mode");
  consola.level = 5;
} else {
  consola.info("Production mode");
  consola.level = 1;
}

// mongodb connection
const uri = "mongodb://192.168.1.214:27017";
const client = new MongoClient(uri);
client
  .connect()
  .then(() => {
    consola.success("Connected to MongoDB");
  })
  .catch((err) => {
    consola.error("Error connecting to MongoDB", err);
  });

// * API Version 1
// TODO: AstroAccountsサービスを作成し、ユーザーの登録、ログイン、ログアウト、ユーザー情報の取得を行う
// * WebSocket API

app.ws("/api/v1/websocket", (ws) => {
  consola.info("WebSocket connected");
  ws.send("Connected to WebSocket");

  ws.on("message", async (msg) => {
    if (msg.startsWith("buy")) {
      const found = [];
      const items = msg.split(" ");
      items.shift();
      for (const item of items) {
        const itemData = await client
          .db("register_lite")
          .collection("items")
          .findOne({ name: item });
        if (!itemData) {
          consola.warn("Item not found: " + item);
        } else {
          consola.info("Item found: " + item);
          found.push(itemData);
        }
      }
      const sort = {};
      found.forEach((item) => {
        if (!sort[item.category]) {
          sort[item.category] = [];
        }
        sort[item.category].push(item);
      });
      const random = Math.floor(Math.random() * 10000);
      creating.push(random);
      sort["num"] = random;
      let totalAmount = 0;
      for (const category in sort) {
        if (category !== "num") {
          sort[category].forEach((item) => {
            totalAmount += item.price;
          });
        }
      }
      sort["totalAmount"] = totalAmount;
      ws.send(JSON.stringify(sort));
    }
  });

  ws.on("close", (code, reason) => {
    consola.info(`WebSocket closed with code: ${code}, reason: ${reason}`);
  });
});

app.use((req, res, next) => {
  if (process.env.NODE_ENV === "dev") {
    ip_address = "Local Network";
  } else {
    if (!req.headers["cf-connecting-ip"])
      return res.status(503).json({ message: "Internal Server Error" });
    ip_address = req.headers["cf-connecting-ip"];
  }
  consola.info(`[${req.method}] ${ip_address} : ${req.url}`);

  if (
    (req.url === "/api/v1/login" || req.url === "/api/v1/register",
    req.url === "/api/v1/websocket")
  ) {
    return next();
  }

  const token = req.headers.authorization.split(" ")[1];
  if (!token) {
    consola.warn("トークンがありません: " + ip_address);
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    const decoded = jwt.verify(token, "AstroNetwork");
    req.user = decoded;
    next();
  } catch (err) {
    consola.error("トークンが無効です: " + ip_address);
    consola.fail(err);
    return res.status(401).json({ message: "Unauthorized" });
  }
});

// login API MongoDB
app.post("/api/v1/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: "Invalid request" });
  }
  const user = await client
    .db("register_lite")
    .collection("users")
    .findOne({ username });
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }
  const savedPassword = user.password;
  const salt = user.salt;
  const hashPassword = (password, salt) => {
    const hash = crypto.createHash("sha256");
    hash.update(password + salt);
    let hashed = hash.digest("hex").toString();

    for (let i = 0; i < 10000; i++) {
      var hashs = crypto.createHash("sha256");
      hashs.update(hashed);
      hashed = hashs.digest("hex").toString();
    }
    return hashed;
  };

  const hashedPassword = hashPassword(password, salt);

  if (hashedPassword !== savedPassword) {
    return res.status(401).json({ message: "Invalid password" });
  }
  // create JWT token
  const token = jwt.sign({ username }, "AstroNetwork", { expiresIn: "2w" });
  res.status(200).json({ message: "Login successful", token: token });
});

// register API MongoDB
app.post("/api/v1/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: "Invalid request" });
  }
  const user = await client
    .db("register_lite")
    .collection("users")
    .findOne({ username });
  if (user) {
    return res.status(409).json({ message: "User already exists" });
  }

  const hashPassword = (password, salt) => {
    const hash = crypto.createHash("sha256");
    hash.update(password + salt);
    let hashed = hash.digest("hex").toString();
    for (let i = 0; i < 10000; i++) {
      var hashs = crypto.createHash("sha256");
      hashs.update(hashed);
      hashed = hashs.digest("hex").toString();
    }
    return hashed;
  };

  const salt = crypto.randomBytes(16).toString("hex");
  const hashedPassword = hashPassword(password, salt);
  await client
    .db("register_lite")
    .collection("users")
    .insertOne({ username, password: hashedPassword, salt });
  res.status(201).json({ message: "User created successfully" });
});

// Get Status

app.get("/api/v1/status", (req, res) => {
  res.status(200).json({ message: "API is running" });
});

app.get("/api/v1/item", async (req, res) => {
  const items = await client
    .db("register_lite")
    .collection("items")
    .find()
    .toArray();
  res.status(200).json({ items });
});

app.post("/api/v1/item", async (req, res) => {
  const { name, price, category } = req.body;
  if (!name || !price) {
    return res.status(400).json({ message: "Invalid request" });
  }
  if (typeof price !== "number") {
    return res.status(400).json({ message: "Price must be a number" });
  }
  if (!category.includes(category)) {
    return res.status(400).json({ message: "Allowed categories:" + category });
  }
  const item = await client
    .db("register_lite")
    .collection("items")
    .findOne({ name });
  if (item) {
    return res.status(409).json({ message: "Item already exists" });
  }
  await client
    .db("register_lite")
    .collection("items")
    .insertOne({ name, price, category });
  res.status(201).json({ message: "Item added successfully" });
});

app.put("/api/v1/item", async (req, res) => {
  const { name, price, category } = req.body;
  if (!name || !price) {
    return res.status(400).json({ message: "Invalid request" });
  }
  if (typeof price !== "number") {
    return res.status(400).json({ message: "Price must be a number" });
  }
  if (!category.includes(category)) {
    return res.status(400).json({ message: "Allowed categories:" + category });
  }
  const item = await client
    .db("register_lite")
    .collection("items")
    .findOne({ name });
  if (!item) {
    return res.status(404).json({ message: "Item not found" });
  }
  await client
    .db("register_lite")
    .collection("items")
    .updateOne({ name }, { $set: { price, category } });
  res.status(200).json({ message: "Item updated successfully" });
});

app.delete("/api/v1/item", async (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ message: "Invalid request" });
  }
  const item = await client
    .db("register_lite")
    .collection("items")
    .findOne({ name });
  if (!item) {
    return res.status(404).json({ message: "Item not found" });
  }
  await client.db("register_lite").collection("items").deleteOne({ name });
  res.status(200).json({ message: "Item deleted successfully" });
});

app.get("/api/v1/category", (req, res) => {
  res.status(200).json({ category });
});

app.listen(port, () => {
  consola.success(`Server running on port ${port}`);
  if (process.env.NODE_ENV === "dev") {
    consola.warn("開発環境で実行しています");
  }
});
