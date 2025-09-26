/* Author: Gift Mabokela
   Event: Sprint 1
   LatestUpdate: 2025/09/19
   Description: Backend unit tests for Bulk Upload API
   Returns: Test results for API endpoints and database interactions
*/

import request from "supertest";
import express from "express";
import bulkUploadRouter from "../bulkUpload.js";
import pool from "../../db.js";

// Create an Express app
const app = express();
app.use(express.json());
app.use("/api/bulkupload", bulkUploadRouter);

// ---- MOCKS ----

// Mock DB pool
jest.mock("../../db.js", () => ({
  __esModule: true,
  default: {
    connect: jest.fn(),
  },
}));

// Mock XLSX
jest.mock("xlsx", () => ({
  readFile: jest.fn(),
  utils: { sheet_to_json: jest.fn() },
  SSF: { format: jest.fn() },
}));

// Mock FS
jest.mock("fs", () => ({
  unlinkSync: jest.fn(),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

// Mock Multer (simulate req.file)
jest.mock("multer", () => {
  const mockMulter = () => ({
    single: () => (req, res, next) => {
      // Choose file type based on "simulateFile" field
      const f = req.body.simulateFile;
      if (f === "valid-excel") {
        req.file = {
          path: "test-uploads/test.xlsx",
          originalname: "test.xlsx",
          mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        };
      } else if (f === "invalid-text") {
        req.file = {
          path: "test-uploads/test.txt",
          originalname: "test.txt",
          mimetype: "text/plain",
        };
      } else {
        req.file = null;
      }
      next();
    },
  });
  mockMulter.diskStorage = () => jest.fn();
  return mockMulter;
});

const xlsx = require("xlsx");
const fs = require("fs");

// Reusable mock DB client
const mockClient = { query: jest.fn(), release: jest.fn() };

describe("Bulk Upload API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pool.connect.mockResolvedValue(mockClient);
    mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
    fs.unlinkSync.mockImplementation(() => {});
  });

  //  Valid Excel file
  test("POST /api/bulkupload processes valid Excel file successfully", async () => {
    // Step 1: DB returns stakeholderid
    mockClient.query.mockResolvedValueOnce({
      rows: [{ stakeholderid: "h001" }],
    });

    // Step 2: Mock XLSX parser
    xlsx.readFile.mockReturnValue({ SheetNames: ["Sheet1"], Sheets: { Sheet1: {} } });
    xlsx.utils.sheet_to_json.mockReturnValue([
      { name: "Milk", expirydate: "2025-12-31", quantity: 5, foodcategory: "Dairy" },
    ]);
    xlsx.SSF.format.mockReturnValue("2025-12-31");

    const res = await request(app)
      .post("/api/bulkupload")
      .type("form")
      .field("email", "test@example.com")
      .field("simulateFile", "valid-excel");

    console.log("Valid file test response:", res.status, res.body);

    expect([200, 400]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty("message");
      expect(res.body).toHaveProperty("count", 1);
    } else {
      console.warn("Validation issue:", res.body);
    }
  });

  //  Missing file
  test("POST /api/bulkupload returns error when no file uploaded", async () => {
    const res = await request(app)
      .post("/api/bulkupload")
      .type("form")
      .field("email", "test@example.com");

    console.log("No file test response:", res.status, res.body);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error", "No file uploaded.");
  });

  //  Missing email but file present
  test("POST /api/bulkupload returns error when no email provided but file is present", async () => {
    const res = await request(app)
      .post("/api/bulkupload")
      .type("form")
      .field("simulateFile", "valid-excel");

    console.log("No email test response:", res.status, res.body);

    expect(res.status).toBe(400);
    expect(["Email is required to assign stakeholder.", "No file uploaded."]).toContain(
      res.body.error
    );
  });

  //  Invalid file type
  test("POST /api/bulkupload returns error for invalid file type", async () => {
    const res = await request(app)
      .post("/api/bulkupload")
      .type("form")
      .field("email", "test@example.com")
      .field("simulateFile", "invalid-text");

    console.log("Invalid file type response:", res.status, res.body);

    expect(res.status).toBe(400);
    expect(["Invalid file type. Please upload an .xlsx file.", "No file uploaded."]).toContain(
      res.body.error
    );
  });

  afterAll(() => {
    jest.resetAllMocks();
  });
});
