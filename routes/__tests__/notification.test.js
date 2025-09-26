/* Author: Kemo Mokoena
   Event: Sprint 1
   LatestUpdate: 2025/09/22
   Description: Backend unit tests for Notification API
   Returns: Test results for API endpoints and database interactions
*/

import request from "supertest";        // For testing HTTP endpoints
import express from "express";          // Express framework
import notificationsRouter from "../../routes/notification.js"; // Import the notifications routes
import * as auth from "../auth.js";     // Import auth helpers for mocking
import pool from "../../db.js";         // DB pool connection

// Create a mock Express app for testing
const app = express();
app.use(express.json()); // Middleware to parse JSON bodies
app.use("/api/notifications", notificationsRouter); // Mount notifications routes

// Mock the database to prevent real DB access
jest.mock("../../db.js", () => ({
  __esModule: true,
  default: {
    query: jest.fn(), // Mock the query method
  },
}));

// Ensure pool.query is a Jest mock function
pool.query = jest.fn();

// Mock getLoggedInUser to simulate logged-in users
jest.spyOn(auth, "getLoggedInUser").mockImplementation(email => {
  if (email === "test@example.com") return { stakeholderID: "h001", email }; // Valid test user
  return null; // Unknown users return null (unauthorized)
});

// Group all tests for Notifications API
describe("Notifications API", () => {
  beforeEach(() => {
    jest.clearAllMocks(); // Reset mocks before each test
  });

  // Test: GET returns notifications for logged-in user
  test("GET /api/notifications returns notifications for logged in user", async () => {
    // Mock DB response
    pool.query.mockResolvedValueOnce({
      rows: [
        { fooditemid: 1, name: "Milk", expirydate: new Date(), quantity: 2, notificationRead: false },
      ],
    });

    // Make GET request to the API
    const res = await request(app)
      .get("/api/notifications")
      .query({ email: "test@example.com" });

    // Assertions
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0]).toHaveProperty("name", "2 Milk");
    expect(res.body[0]).toHaveProperty("notificationRead", false);
  });

  // Test: Unauthorized user cannot fetch notifications
  test("GET /api/notifications fails if not logged in", async () => {
    const res = await request(app)
      .get("/api/notifications")
      .query({ email: "unknown@example.com" });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error", "Unauthorized");
  });

  // Test: PUT marks notification as read
  test("PUT /api/notifications/:id/read marks notification as read", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{}] }); // Mock successful update

    const res = await request(app)
      .put("/api/notifications/1/read")
      .send({ email: "test@example.com" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("success", true);
  });

  // Test: PUT returns 404 if notification not found
  test("PUT /api/notifications/:id/read returns 404 if not found", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0 }); // No rows updated

    const res = await request(app)
      .put("/api/notifications/999/read")
      .send({ email: "test@example.com" });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error", "Notification not found");
  });

  // Test: GET returns empty array when no notifications
  test("GET /api/notifications returns empty array when no notifications", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }); // Empty DB

    const res = await request(app)
      .get("/api/notifications")
      .query({ email: "test@example.com" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  // Test: GET calculates correct expiry status
  test("GET /api/notifications returns correct expiry status", async () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const expired = new Date(today);
    expired.setDate(today.getDate() - 1);

    pool.query.mockResolvedValueOnce({
      rows: [
        { fooditemid: 1, name: "ExpiredMilk", expirydate: expired, quantity: 1, notificationRead: false },
        { fooditemid: 2, name: "MilkTomorrow", expirydate: tomorrow, quantity: 2, notificationRead: false },
      ],
    });

    const res = await request(app)
      .get("/api/notifications")
      .query({ email: "test@example.com" });

    expect(res.status).toBe(200);
    expect(res.body[0]).toHaveProperty("status", "expired");
    expect(res.body[1]).toHaveProperty("status", "warning");
  });

  // Test: PUT does not fail if notification already read
  test("PUT /api/notifications/:id/read does not fail if already read", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ notificationRead: true }] });

    const res = await request(app)
      .put("/api/notifications/1/read")
      .send({ email: "test@example.com" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("success", true);
  });

  // Test: GET fails if email missing
  test("GET /api/notifications fails if email missing", async () => {
    const res = await request(app).get("/api/notifications");
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error", "Missing email for authentication");
  });

  // Test: PUT fails for invalid ID
  test("PUT /api/notifications/:id/read fails for invalid ID", async () => {
    const res = await request(app)
      .put("/api/notifications/abc/read")
      .send({ email: "test@example.com" });

    expect(res.status).toBe(404); // Or 400 depending on implementation
  });

  // Test: GET handles multiple notifications
  test("GET /api/notifications handles multiple notifications", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      fooditemid: i + 1,
      name: `Item${i+1}`,
      expirydate: new Date(),
      quantity: i + 1,
      notificationRead: false,
    }));
    pool.query.mockResolvedValueOnce({ rows });

    const res = await request(app)
      .get("/api/notifications")
      .query({ email: "test@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(5);
  });

  // Test: DELETE marks notification as deleted
  test("PUT /api/notifications/:id/delete marks notification as deleted", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ fooditemid: 1 }] });

    const res = await request(app)
      .put("/api/notifications/1/delete")
      .send({ email: "test@example.com" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("success", true);
    expect(res.body.updated).toHaveProperty("fooditemid", 1);
  });

  // Test: DELETE returns 404 if notification not found
  test("PUT /api/notifications/:id/delete returns 404 if notification not found", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0 });

    const res = await request(app)
      .put("/api/notifications/999/delete")
      .send({ email: "test@example.com" });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error", "Notification not found or not owned by user");
  });

  // Test: DELETE returns 400 for invalid ID
  test("PUT /api/notifications/:id/delete returns 400 for invalid ID", async () => {
    const res = await request(app)
      .put("/api/notifications/abc/delete")
      .send({ email: "test@example.com" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error", "Invalid notification ID");
  });

  // Test: DELETE fails if email missing
  test("PUT /api/notifications/:id/delete fails if email missing", async () => {
    const res = await request(app).put("/api/notifications/1/delete");
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error", "Missing email for authentication");
  });

});
