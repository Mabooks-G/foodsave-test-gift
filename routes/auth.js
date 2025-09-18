/* Author: Bethlehem Shimelis
   Event: Sprint 1: Manually Input Food Items with Expiry dates
   LatestUpdate: Established User Login and Registration, Added Capacity Field
   Description: Processes User requests for Login and Registration
   Returns: A result JSON file
*/

import express from "express";
import bcrypt from "bcrypt";
import pool from "../db.js";

const router = express.Router();

// In-memory store of logged-in users
// Key: email, Value: user object { stakeholderID, name, email, region, capacity }
const loggedInUsers = {};

// Helper: map account type to prefix
function getPrefix(accountType) {
  if (accountType.toLowerCase().includes("household")) return "h";
  if (accountType.toLowerCase().includes("business")) return "b";
  if (accountType.toLowerCase().includes("charity")) return "c";
  throw new Error("Invalid account type");
}

// REGISTER
router.post("/register", async (req, res) => {
  const { accountType, name, email, region, password, capacity } = req.body;

  try {
    // check if stakeholder exists
    const userCheck = await pool.query(
      "SELECT * FROM stakeholderDB WHERE email=$1",
      [email]
    );
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: "Email already registered" });
    }

    // hash password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // generate stakeholderID
    const prefix = getPrefix(accountType);
    const maxIdResult = await pool.query(
      "SELECT stakeholderID FROM stakeholderDB WHERE stakeholderID LIKE $1 ORDER BY stakeholderID DESC LIMIT 1",
      [`${prefix}%`]
    );

    let newNumber = 0;
    if (maxIdResult.rows.length > 0) {
      const lastId = maxIdResult.rows[0].stakeholderid; // e.g. "h23"
      const lastNum = parseInt(lastId.slice(1), 10);
      newNumber = lastNum + 1;
    }

    const stakeholderID = `${prefix}${newNumber}`;

    // determine capacity
    let finalCapacity = -1; // default for household/business
    if (prefix === "c") {
      // charity: use provided capacity, ensure it's a number >= 0
      finalCapacity = capacity && !isNaN(Number(capacity)) ? Number(capacity) : null;
      if (finalCapacity === null) {
        return res.status(400).json({ error: "Capacity required for charity users" });
      }
    }

    // insert stakeholder
    const newUser = await pool.query(
      "INSERT INTO stakeholderDB (stakeholderID, name, email, password, region, capacity) VALUES ($1,$2,$3,$4,$5,$6) RETURNING stakeholderID, name, email, region, capacity",
      [stakeholderID, name, email, password_hash, region, finalCapacity]
    );

    res.json({
      message: "Account created successfully",
      user: newUser.rows[0],
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const userQuery = await pool.query(
      "SELECT * FROM stakeholderDB WHERE email=$1",
      [email]
    );
    if (userQuery.rows.length === 0) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const user = userQuery.rows[0];

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    // Save user in memory for later access in users.js
    loggedInUsers[email] = {
      stakeholderID: user.stakeholderid,
      name: user.name,
      email: user.email,
      region: user.region,
      capacity: user.capacity,
    };

    // return only safe fields
    res.json({
      message: "Login successful",
      user: loggedInUsers[email],
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Helper function to get a logged-in user by email
export function getLoggedInUser(email) {
  return loggedInUsers[email];
}

export default router;
