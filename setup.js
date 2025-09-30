const mysql = require("mysql2");

const db = mysql.createConnection({
  host: "crossover.proxy.rlwy.net", // Railway host
  user: "root", // Replace with your Railway username
  password: "gNMPyGDYspAmelotYLeNBnqcZhNmGRcD", // Replace with your Railway password
  database: "railway", // Replace with your Railway database name
  port: 19462,
});

db.connect((err) => {
  if (err) {
    console.error("Connection failed:", err.message);
    return;
  }
  console.log("Connected to Railway MySQL!");
});

// SQL to create table
const createTableSQL = `
DROP TABLE IF EXISTS mytable;
CREATE TABLE mytable (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

db.query(createTableSQL, (err, results) => {
  if (err) throw err;
  console.log("Table created successfully!");
  db.end();
});
