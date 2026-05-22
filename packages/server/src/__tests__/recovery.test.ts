import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { authRouter, verifyToken } from "../auth.js";
import express from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../db.js";

// Build a minimal test app (no auth middleware, just the router mounted directly)
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRouter);
  return app;
}

// Simple fetch-like helper using node http
async function request(app: express.Express, method: string, path: string, body?: unknown) {
  return new Promise<{ status: number; data: unknown }>((resolve, reject) => {
    const server = app.listen(0, () => {
      const addr = server.address() as { port: number };
      const http = require("http");
      const data = body ? JSON.stringify(body) : "";
      const opts = {
        hostname: "localhost",
        port: addr.port,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      };
      const req = http.request(opts, (res: any) => {
        let body2 = "";
        res.on("data", (chunk: any) => body2 += chunk);
        res.on("end", () => {
          server.close();
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body2) });
          } catch {
            resolve({ status: res.statusCode, data: body2 });
          }
        });
      });
      req.on("error", reject);
      if (body) req.write(data);
      req.end();
    });
  });
}

describe("Account recovery", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = buildApp();
  });

  afterEach(async () => {
    // Clean up test users
    await prisma.user.deleteMany({ where: { username: { startsWith: "recovery_test_" } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function registerUser(username: string, password: string, q1?: string, a1?: string, q2?: string, a2?: string) {
    return request(app, "POST", "/api/auth/register", {
      username,
      password,
      securityQuestion1: q1,
      securityAnswer1: a1,
      securityQuestion2: q2,
      securityAnswer2: a2,
    });
  }

  async function loginUser(username: string, password: string) {
    return request(app, "POST", "/api/auth/login", { username, password });
  }

  async function verifyRecovery(username: string, answer1: string, answer2: string) {
    return request(app, "POST", "/api/auth/recovery/verify", {
      username,
      securityAnswer1: answer1,
      securityAnswer2: answer2,
    });
  }

  async function resetPassword(recoveryToken: string, newPassword: string) {
    return request(app, "POST", "/api/auth/recovery/reset-password", {
      recoveryToken,
      newPassword,
    });
  }

  it("full recovery flow: register with security questions, verify, reset password, login with new password", async () => {
    const username = "recovery_test_user1";
    const password = "OriginalPass1";
    const q1 = "What is your pet's name?";
    const a1 = "fluffy";
    const q2 = "What city were you born in?";
    const a2 = "bangkok";

    // 1. Register with security questions
    const regRes = await registerUser(username, password, q1, a1, q2, a2);
    expect(regRes.status).toBe(200);
    expect((regRes.data as any).token).toBeDefined();

    // 2. Verify recovery with correct answers (both correct)
    const verifyRes = await verifyRecovery(username, a1, a2);
    expect(verifyRes.status).toBe(200);
    const recoveryToken = (verifyRes.data as any).recoveryToken;
    expect(recoveryToken).toBeDefined();

    // Verify the recovery token is a valid JWT
    const payload = verifyToken(recoveryToken);
    expect(payload).not.toBeNull();
    expect((payload as any).uid).toBeDefined();
    expect((payload as any).type).toBe("recovery");

    // 3. Reset password using recovery token
    const newPassword = "NewPassword2";
    const resetRes = await resetPassword(recoveryToken, newPassword);
    expect(resetRes.status).toBe(200);
    expect((resetRes.data as any).ok).toBe(true);

    // 4. Login with old password should fail
    const oldLoginRes = await loginUser(username, password);
    expect(oldLoginRes.status).toBe(401);

    // 5. Login with new password should succeed
    const newLoginRes = await loginUser(username, newPassword);
    expect(newLoginRes.status).toBe(200);
    expect((newLoginRes.data as any).token).toBeDefined();
    expect((newLoginRes.data as any).username).toBe(username);
  });

  it("recovery fails with wrong answers", async () => {
    const username = "recovery_test_user2";
    const password = "OriginalPass1";
    const a1 = "secretanswer";

    // Register with one security question
    const regRes = await registerUser(username, password, "Favorite color?", a1);
    expect(regRes.status).toBe(200);

    // Try to verify with wrong answer
    const verifyRes = await verifyRecovery(username, "wronganswer", "");
    expect(verifyRes.status).toBe(401);
    expect((verifyRes.data as any).error).toBe("bad credentials");
  });

  it("recovery fails with non-existent user", async () => {
    const verifyRes = await verifyRecovery("nonexistent_user_xyz", "answer", "answer");
    expect(verifyRes.status).toBe(401);
  });

  it("reset password fails with invalid token", async () => {
    const resetRes = await resetPassword("invalid.token.here", "NewPass1");
    expect(resetRes.status).toBe(401);
    expect((resetRes.data as any).error).toBe("invalid or expired token");
  });

  it("reset password fails with wrong type token (login token)", async () => {
    // First register and get a login token
    const username = "recovery_test_user3";
    const password = "OriginalPass1";
    const regRes = await registerUser(username, password);
    expect(regRes.status).toBe(200);
    const loginToken = (regRes.data as any).token;

    // Try to use login token for password reset
    const resetRes = await resetPassword(loginToken, "NewPass1");
    expect(resetRes.status).toBe(401);
    expect((resetRes.data as any).error).toBe("invalid token type");
  });

  it("reset password validates new password strength", async () => {
    const username = "recovery_test_user4";
    const password = "OriginalPass1";

    // Register with security questions
    const regRes = await registerUser(username, password, "color?", "blue");
    expect(regRes.status).toBe(200);

    // Get recovery token
    const verifyRes = await verifyRecovery(username, "blue", "");
    expect(verifyRes.status).toBe(200);
    const recoveryToken = (verifyRes.data as any).recoveryToken;

    // Try to reset with weak password
    const weakRes = await resetPassword(recoveryToken, "weak");
    expect(weakRes.status).toBe(400);
    expect((weakRes.data as any).error).toContain("8");
  });

  it("user with only one security question can still recover", async () => {
    const username = "recovery_test_user5";
    const password = "OriginalPass1";
    const a1 = "onlyanswer";

    // Register with only one security question
    const regRes = await registerUser(username, password, "Favorite game?", a1);
    expect(regRes.status).toBe(200);

    // Verify with correct single answer
    const verifyRes = await verifyRecovery(username, a1, "");
    expect(verifyRes.status).toBe(200);
    const recoveryToken = (verifyRes.data as any).recoveryToken;
    expect(recoveryToken).toBeDefined();

    // Reset password
    const newPassword = "NewPassword2";
    const resetRes = await resetPassword(recoveryToken, newPassword);
    expect(resetRes.status).toBe(200);

    // Login with new password works
    const loginRes = await loginUser(username, newPassword);
    expect(loginRes.status).toBe(200);
  });
});