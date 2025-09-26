import express from "express"; // Import Express framework
import pool from "../db.js";   // Import DB connection pool
import axios from "axios"; // Import Axios for HTTP requests
import dotenv from "dotenv";
import { getLoggedInUser } from "./auth.js"; // Import helper function for user authentication

dotenv.config();

const router = express.Router();
// Middleware to ensure user is logged in before accessing routes
function ensureLoggedIn(req, res, next) {
  const email = req.query.email || req.body.email; // Get email from query or body
  if (!email) return res.status(401).json({ error: "Missing email for authentication" }); // 401 if missing

  const user = getLoggedInUser(email); // Look up user by email
  if (!user) return res.status(401).json({ error: "Unauthorized" }); // 401 if user not found

  req.user = user; // Attach user info to request for use in routes
  next(); // Proceed to next middleware or route
}
// POST /generate
router.post('/generate', async (req, res) => {
  const { ingredients, preferences } = req.body;

  if (!ingredients || !Array.isArray(ingredients)) {
    return res.status(400).json({ error: 'Ingredients must be an array.' });
  }

  try {
    // 1. Prepare prompt for DeepSeek
    const prompt = `
You are a helpful AI chef. Generate 3 different recipes based on the following ingredients and user preferences. Don't mind the number of items.
Ingredients: ${ingredients.join(', ')}
Preferences: ${preferences.join(', ') || "None"}
Return the recipes in JSON format as an array like this:
[
  {
    "title": "...",
    "prepTime": "...",
    "ingredients": [...],
    "steps": [...],
    "preferences": [...]
  },
  {
    "title": "...",
    "prepTime": "...",
    "ingredients": [...],
    "steps": [...],
    "preferences": [...]
  },
  {
    "title": "...",
    "prepTime": "...",
    "ingredients": [...],
    "steps": [...],
    "preferences": [...]
  }
]
`;

    // 2. Call OpenRouter API
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: "x-ai/grok-4-fast:free",
        messages: [{ role: "user", content: prompt }],
        max_output_tokens: 500
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.DEEP_SEEK_API}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // 3. Extract AI output
    const aiMessage = response.data?.choices?.[0]?.message?.content;

    // 4. Parse JSON safely
    let recipe = [];
    try {
      recipe = JSON.parse(aiMessage);
    } catch (err) {
      console.error("Failed to parse AI response:", err);
      return res.status(500).json({ error: "AI returned invalid JSON.", raw: aiMessage });
    }

    res.json({ suggestions: recipe });

  } catch (err) {
    console.error("Error calling DeepSeek:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to generate recipe." });
  }
});

// Save a recipe
router.post("/save", ensureLoggedIn, async (req, res) => {
  const { title, prep_time, ingredients, steps, preferences } = req.body;
  const stakeholderID = req.user.stakeholderID;

  if (!title || !prep_time || !ingredients || !steps) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO recipedb 
        (stakeholderid, title, prep_time, ingredients, steps, preferences)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [stakeholderID, title, prep_time, JSON.stringify(ingredients), JSON.stringify(steps), JSON.stringify(preferences) ]
    );

    res.json({ message: "Recipe saved", recipe: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Failed to save recipe" });
  }
});

function getExpiryDays(expiryDate) {
  const today = new Date();
  const expDate = new Date(expiryDate);
  const diffTime = expDate - today;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // days
}

// GET /api/recipe/saved
router.get("/saved", ensureLoggedIn, async (req, res) => {
  try {
    const stakeholderID = req.user.stakeholderID;

    const result = await pool.query(
      `SELECT id, title, prep_time AS "prepTime", ingredients, steps, preferences
       FROM recipedb
       WHERE stakeholderid = $1
       ORDER BY id DESC`,
      [stakeholderID]
    );

    const recipes = result.rows.map((row) => {
      let ingredients = [];
      let steps = [];
      let prefs = []; // declare the variable
      try {
        ingredients = typeof row.ingredients === "string" ? JSON.parse(row.ingredients) : row.ingredients;
      } catch (err) {
        console.warn("Failed to parse ingredients JSON, returning empty array", err);
      }

      try {
        steps = typeof row.steps === "string" ? JSON.parse(row.steps) : row.steps;
      } catch (err) {
        console.warn("Failed to parse steps JSON, returning empty array", err);
      }

      // Parse preferences
  try {
    prefs = typeof row.preferences === "string" ? JSON.parse(row.preferences) : row.preferences;
  } catch (err) {
    prefs = []; // fallback if parsing fails
  }

  if (!prefs || !Array.isArray(prefs)) prefs = []; // ensure it's always an array

      return {
        id: row.id, 
        title: row.title,
        prepTime: row.prepTime,
        ingredients,
        steps,
        preferences: prefs
      };
    });

    res.json({ recipes });
  } catch (err) {
    console.error("Error fetching saved recipes:", err);
    res.status(500).json({ error: "Failed to fetch saved recipes." });
  }
});

// DELETE /api/recipe/delete
router.delete("/delete", ensureLoggedIn, async (req, res) => {
  const { recipeId } = req.body;  // recipeId comes from frontend
  const stakeholderID = req.user.stakeholderID;

  if (!recipeId) {
    return res.status(400).json({ error: "Missing recipeId" });
  }

  try {
    const result = await pool.query(
      `DELETE FROM recipedb 
       WHERE id = $1 AND stakeholderid = $2
       RETURNING *`,
      [recipeId, stakeholderID]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Recipe not found or not yours" });
    }

    res.json({ message: "Recipe deleted successfully" });
  } catch (err) {
    console.error("Error deleting recipe:", err);
    res.status(500).json({ error: "Failed to delete recipe" });
  }
});

router.get("/items", ensureLoggedIn, async (req, res) => {
  const stakeholderID = req.user.stakeholderID;

  try {
    const result = await pool.query(
      `SELECT fooditemid, name, expirydate, quantity 
       FROM fooditemdb 
       WHERE stakeholderid = $1
       ORDER BY expirydate ASC`,
      [stakeholderID]
    );

    const items = result.rows.map(row => ({
      id: row.fooditemid,
      name: `${row.quantity} ${row.name}`,
      expiryDate: row.expirydate,
      expiryDays: getExpiryDays(row.expirydate)
    }));

    res.json({ items });
  } catch (err) {
    console.error("Error fetching items:", err.message);
    res.status(500).json({ error: "Failed to fetch items." });
  }
});

export default router;