/* Author: Gift Mabokela
   Event: Sprint 1 
   LatestUpdate: 2025/09/18 Removed getLoggedInUser dependency
   Description: Handles bulk uploading food items from Excel into DB
*/
import express from "express";
import multer from "multer";
import XLSX from "xlsx";
import fs from "fs";
import pool from "../db.js";

const router = express.Router();
const upload = multer({ dest: "uploads/" }); // Configure multer for file uploads

/* Author: Gift Mabokela
   Event: Sprint 1
   LatestUpdate: 2025/09/18
   Description: Process Excel file upload and import data to database
*/
router.post("/", upload.single("file"), async (req, res) => {
  try {
    // Check if file was uploaded
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });

    const email = req.body.email;
    // Validate email parameter
    if (!email) {
      fs.unlinkSync(req.file.path); // Clean up uploaded file
      return res.status(400).json({ error: "Email is required to assign stakeholder." });
    }

    let stakeholderId;
    try {
      // Get database client connection
      const client = await pool.connect();
      // Query database for user based on email
      const result = await client.query(
        "SELECT stakeholderID FROM stakeholderDB WHERE email = $1",
        [email]
      );
      client.release(); // Release connection back to pool

      // Check if user exists
      if (result.rows.length === 0) {
        fs.unlinkSync(req.file.path); // Clean up uploaded file
        return res.status(400).json({ error: "User not found for given email." });
      }

      // Extract stakeholder ID from query result
      stakeholderId = result.rows[0].stakeholderid; 
      console.log("Resolved stakeholderId:", stakeholderId);
    } catch (err) {
      console.error("Error fetching stakeholderId:", err);
      fs.unlinkSync(req.file.path); // Clean up uploaded file
      return res.status(500).json({ error: "Database error looking up user." });
    }

    // Validate file type
    if (!req.file.originalname.endsWith(".xlsx")) {
      fs.unlinkSync(req.file.path); // Clean up uploaded file
      return res.status(400).json({ error: "Invalid file type. Please upload an .xlsx file." });
    }

    // Parse Excel file (extract contents)
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });

    const today = new Date();
    const rows = []; // Store valid rows for database insertion
    const errors = []; // Store validation errors

    // Process each row in the Excel sheet
    sheet.forEach((row, idx) => {
      const originalName = row.name || row.Name || "Unnamed Item";
      const expirydate = row.expirydate || row.ExpiryDate;
      const quantity = row.quantity || row.Quantity;
      const foodcategory = row.foodcategory || row.FoodCategory;
      const donationid = row.donationid || row.DonationID;
      const Measure_per_Unit = row.Measure_per_Unit || row["Measure_per_Unit"];
      const Unit = row.Unit || row.unit;

      // Validate required fields
      if (!expirydate || !quantity) {
        errors.push(`Row ${idx + 2}: Missing required fields.`);
        return; // Skip this row
      }

      let parsedDate;
      // Handle Excel date format (numeric) or string date
      if (typeof expirydate === "number") {
        const dateString = XLSX.SSF.format("yyyy-mm-dd", expirydate);
        parsedDate = new Date(dateString);
      } else {
        parsedDate = new Date(expirydate);
      }

      // Validate date
      if (isNaN(parsedDate.getTime()) || parsedDate < today) {
        errors.push(`Row ${idx + 2}: Invalid or past expiry date.`);
        return; // Skip this row
      }

      // Format item name
      const name = `${originalName} [Bulk Upload]`;

      // Add valid row to insertion array
      rows.push({
        name,
        expirydate: parsedDate,
        quantity: parseInt(quantity),
        stakeholderid: stakeholderId,
        foodcategory: foodcategory || null,
        donationid: donationid || null,
        Measure_per_Unit: Measure_per_Unit || null,
        Unit: Unit || null,
      });
    });

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    // Return validation errors if any
    if (errors.length > 0) {
      return res.status(400).json({ error: "Validation errors", details: errors });
    }

    // Insert valid rows into database
    try {
      const client = await pool.connect();
      const query = `
        INSERT INTO fooditemdb
        (name, expirydate, quantity, stakeholderid, foodcategory, donationid, "Measure_per_Unit", "Unit")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `;

      // Insert each row individually
      for (const item of rows) {
        console.log("Inserting row:", item);
        await client.query(query, [
          item.name,
          item.expirydate,
          item.quantity,
          item.stakeholderid,
          item.foodcategory,
          item.donationid,
          item.Measure_per_Unit,
          item.Unit,
        ]);
      }

      client.release(); // Release connection back to pool
      res.json({ message: "Items saved to database", count: rows.length });
    } catch (err) {
      console.error("Database insert error:", err);
      res.status(500).json({ error: "Database insert failed." });
    }
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Server error while uploading file." });
  }
});

export default router;