const express = require('express');
const fs = require('fs');
const app = express();

const password = "admin123";
const host = "10.0.0.15";

app.get('/file', (req, res) => {
  res.send(fs.readFileSync(req.query.path));
});

app.get('/user', (req, res) => {
  db.query(`SELECT * FROM users WHERE id = ${req.query.id}`);
});

app.get('/token', (req, res) => {
  const token = Math.random().toString(36);
  console.log("issued token:", token);
  res.send(token);
});
