const express = require("express");
const bcrypt = require("bcryptjs");
const { OAuth2Client } = require("google-auth-library");
const usersModel = require("../models/usersModel");
const { signToken } = require("../utils/jwt");
const { requireAuth, requireRole } = require("../middleware/auth");
const { authLimiter, verifyTurnstile } = require("../middleware");
const {
    normalizeGmailEmail,
    isGmailAddress,
} = require("../utils/emailNormalize");
const features = require('../config/features');

const router = express.Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Helper to strip password hashes and format the user object in API responses
 */
function formatUser(user) {
    if (!user) return null;
    const formatted = { ...user };
    delete formatted.password_hash;
    // Convert sqlite integer boolean must_change_password to true/false
    formatted.must_change_password = !!formatted.must_change_password;
    return formatted;
}

/**
 * POST /api/auth/google
 * Student Sign in/up with Google
 */
router.post("/google", async (req, res) => {
    if (!features.googleAuth) {
        return res.status(503).json({
            error: { code: 'FEATURE_DISABLED', message: 'Google sign-in is not configured on this server yet.' }
        });
    }

    const { credential } = req.body;
    if (!credential) {
        return res.status(400).json({
            error: {
                code: "INVALID_GOOGLE_TOKEN",
                message: "No Google credential token provided",
            },
        });
    }

    try {
        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        const googleId = payload["sub"];
        const email = payload["email"];
        const name = payload["name"];

        let user = usersModel.findByGoogleId(googleId);

        if (!user) {
            // If user with this email already exists but doesn't have googleId linked
            user = usersModel.findByEmail(email);
            if (user) {
                user = usersModel.updateUser(user.id, { google_id: googleId });
            } else {
                user = usersModel.createStudent({
                    email,
                    google_id: googleId,
                    display_name: name,
                });
            }
        }

        if (user.status === "banned") {
            return res.status(403).json({
                error: {
                    code: "ACCOUNT_BANNED",
                    message: "This account has been banned",
                },
            });
        }

        const token = signToken({
            id: user.id,
            role: user.role,
            username: user.username,
        });

        return res.status(200).json({
            data: {
                token,
                user: formatUser(user),
                needsUsername: !user.username,
            },
        });
    } catch (error) {
        return res.status(400).json({
            error: {
                code: "INVALID_GOOGLE_TOKEN",
                message: "Failed to verify Google ID token",
            },
        });
    }
});

/**
 * POST /api/auth/teacher/login
 * Teacher Login via Email + Password
 */
router.post("/teacher/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({
            error: {
                code: "INVALID_CREDENTIALS",
                message: "Email and password are required",
            },
        });
    }

    const user = usersModel.findByEmail(email);
    if (!user || user.role !== "teacher") {
        return res.status(401).json({
            error: {
                code: "INVALID_CREDENTIALS",
                message: "Invalid email or password",
            },
        });
    }

    // Check password hash
    if (!user.password_hash) {
        return res.status(401).json({
            error: {
                code: "INVALID_CREDENTIALS",
                message: "Invalid email or password",
            },
        });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
        return res.status(401).json({
            error: {
                code: "INVALID_CREDENTIALS",
                message: "Invalid email or password",
            },
        });
    }

    // Check status
    if (user.status === "banned") {
        return res.status(403).json({
            error: {
                code: "ACCOUNT_BANNED",
                message: "This account has been banned",
            },
        });
    }

    const token = signToken({
        id: user.id,
        role: user.role,
        username: user.username,
    });

    return res.status(200).json({
        data: {
            token,
            user: formatUser(user),
            mustChangePassword: !!user.must_change_password,
        },
    });
});

/**
 * POST /api/auth/admin/login
 * Admin Login via Env Credentials
 */
router.post("/admin/login", (req, res) => {
    const { email, password } = req.body;
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
        return res.status(500).json({
            error: {
                code: "SERVER_ERROR",
                message: "Admin credentials are not configured on the server",
            },
        });
    }

    if (email !== adminEmail || password !== adminPassword) {
        return res.status(401).json({
            error: {
                code: "INVALID_CREDENTIALS",
                message: "Invalid email or password",
            },
        });
    }

    const token = signToken({ id: 0, role: "admin", username: "admin" });

    return res.status(200).json({
        data: {
            token,
            user: {
                id: 0,
                role: "admin",
                username: "admin",
            },
        },
    });
});

/**
 * POST /api/auth/change-password
 * Change password for Teacher role (must be authenticated)
 */
router.post(
    "/change-password",
    requireAuth,
    requireRole("teacher"),
    async (req, res) => {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                error: {
                    code: "INVALID_CREDENTIALS",
                    message: "Current password and new password are required",
                },
            });
        }

        // Fetch fresh user data just in case
        const user = usersModel.findById(req.user.id);
        if (!user || !user.password_hash) {
            return res.status(401).json({
                error: {
                    code: "INVALID_CREDENTIALS",
                    message: "User authentication failed",
                },
            });
        }

        const isPasswordValid = await bcrypt.compare(
            currentPassword,
            user.password_hash,
        );
        if (!isPasswordValid) {
            return res.status(400).json({
                error: {
                    code: "INVALID_CREDENTIALS",
                    message: "Current password is incorrect",
                },
            });
        }

        // Hash new password and update
        const salt = await bcrypt.genSalt(10);
        const newHash = await bcrypt.hash(newPassword, salt);
        usersModel.setPasswordHash(user.id, newHash);

        return res.status(200).json({
            data: {
                message: "Password changed successfully",
            },
        });
    },
);

/**
 * HẠN CHẾ HỆ THỐNG (LIMITATION NOTE):
 * Vì không tích hợp dịch vụ gửi email, hệ thống không có chức năng "quên mật khẩu" cho sinh viên đăng ký bằng email/password.
 * Nếu sinh viên quên mật khẩu, họ có thể đăng nhập lại bằng "Sign in with Google" nếu Gmail đó từng được dùng để
 * đăng nhập Google (2 phương thức đăng nhập tự động liên kết theo cùng email đã chuẩn hóa), hoặc liên hệ Admin.
 */
/**
 * POST /api/auth/student/register
 * Student Registration via Gmail + Password
 */
router.post(
    "/student/register",
    authLimiter,
    /* verifyTurnstile, */ async (req, res) => {
        const { email, password, display_name } = req.body;

        // a. Required fields validation
        if (!email || !password || !display_name) {
            return res.status(400).json({
                error: {
                    code: "BAD_REQUEST",
                    message: "email, password and display_name are required",
                },
            });
        }

        // b. Password strength validation
        if (password.length < 8) {
            return res.status(400).json({
                error: {
                    code: "WEAK_PASSWORD",
                    message: "Password must be at least 8 characters long",
                },
            });
        }

        // c. Email format regex validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                error: {
                    code: "INVALID_EMAIL_FORMAT",
                    message: "Invalid email format",
                },
            });
        }

        // d. Domain limitation check (Gmail only)
        if (!isGmailAddress(email)) {
            return res.status(400).json({
                error: {
                    code: "INVALID_EMAIL_DOMAIN",
                    message: "Only Gmail addresses (@gmail.com) are accepted",
                },
            });
        }

        try {
            // e. Email unique normalization check
            const normalizedEmail = normalizeGmailEmail(email);
            const existingUser = usersModel.findByEmail(normalizedEmail);
            if (existingUser) {
                return res.status(409).json({
                    error: {
                        code: "EMAIL_ALREADY_EXISTS",
                        message:
                            "An account with this Gmail address already exists. Try logging in instead (with Email or Google).",
                    },
                });
            }

            // Success validation flow: hash password and insert
            const salt = await bcrypt.genSalt(10);
            const hash = await bcrypt.hash(password, salt);
            const user = usersModel.createStudentWithPassword({
                email: normalizedEmail,
                password_hash: hash,
                display_name,
            });

            const token = signToken({
                id: user.id,
                role: "student",
                username: null,
            });

            return res.status(201).json({
                data: {
                    token,
                    user: formatUser(user),
                    needsUsername: true,
                },
            });
        } catch (error) {
            console.error("Failed to register student:", error.message);
            return res.status(500).json({
                error: {
                    code: "SERVER_ERROR",
                    message: "An error occurred during registration",
                },
            });
        }
    },
);

/**
 * POST /api/auth/student/login
 * Student Login via Gmail + Password
 */
router.post(
    "/student/login",
    authLimiter,
    /* verifyTurnstile, */
    async (req, res) => {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                error: {
                    code: "BAD_REQUEST",
                    message: "Email and password are required",
                },
            });
        }

        try {
            const normalizedEmail = normalizeGmailEmail(email);
            const user = usersModel.findByEmail(normalizedEmail);

            // Validate account existence, role, and password existence
            if (!user || user.role !== "student" || !user.password_hash) {
                return res.status(401).json({
                    error: {
                        code: "INVALID_CREDENTIALS",
                        message: "Invalid email or password",
                    },
                });
            }

            // Verify password match
            const isPasswordValid = await bcrypt.compare(
                password,
                user.password_hash,
            );
            if (!isPasswordValid) {
                return res.status(401).json({
                    error: {
                        code: "INVALID_CREDENTIALS",
                        message: "Invalid email or password",
                    },
                });
            }

            // Verify ban status
            if (user.status === "banned") {
                return res.status(403).json({
                    error: {
                        code: "ACCOUNT_BANNED",
                        message: "This account has been banned",
                    },
                });
            }

            // Generate JWT session
            const token = signToken({
                id: user.id,
                role: "student",
                username: user.username,
            });

            return res.status(200).json({
                data: {
                    token,
                    user: formatUser(user),
                    needsUsername: !user.username,
                },
            });
        } catch (error) {
            console.error("Failed to log in student:", error.message);
            return res.status(500).json({
                error: {
                    code: "SERVER_ERROR",
                    message: "An error occurred during login",
                },
            });
        }
    },
);

/**
 * POST /api/auth/teacher/apply
 * Teacher self-registration — creates a pending application for admin review
 */
router.post('/teacher/apply', authLimiter, async (req, res) => {
    const { email, password, display_name, employee_code, department } = req.body;

    if (!email || !password || !display_name || !employee_code || !department) {
        return res.status(400).json({
            error: { code: 'BAD_REQUEST', message: 'email, password, display_name, employee_code and department are required' }
        });
    }

    if (password.length < 8) {
        return res.status(400).json({
            error: { code: 'WEAK_PASSWORD', message: 'Password must be at least 8 characters long' }
        });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({
            error: { code: 'INVALID_EMAIL_FORMAT', message: 'Invalid email format' }
        });
    }

    try {
        // Check if email already exists in users or pending applications
        const existingUser = usersModel.findByEmail(email);
        if (existingUser) {
            return res.status(409).json({
                error: { code: 'EMAIL_ALREADY_EXISTS', message: 'An account with this email already exists.' }
            });
        }

        const { usersDb } = require('../db/connections');
        const existingApp = usersDb.prepare('SELECT id FROM teacher_applications WHERE email = ?').get(email);
        if (existingApp) {
            return res.status(409).json({
                error: { code: 'APPLICATION_ALREADY_EXISTS', message: 'An application with this email is already pending review.' }
            });
        }

        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        usersDb.prepare(`
            INSERT INTO teacher_applications (email, display_name, employee_code, department, password_hash)
            VALUES (?, ?, ?, ?, ?)
        `).run(email.trim().toLowerCase(), display_name.trim(), employee_code.trim(), department.trim(), hash);

        return res.status(201).json({
            data: { message: 'Application submitted. You will be notified once an admin reviews your request.' }
        });
    } catch (error) {
        console.error('Failed to submit teacher application:', error.message);
        return res.status(500).json({
            error: { code: 'SERVER_ERROR', message: 'An error occurred while submitting the application' }
        });
    }
});

/**
 * GET /api/auth/me
 * Retrieve profile information for current session user
 */
router.get('/me', requireAuth, (req, res) => {
    try {
      if (req.user.role === 'admin') {
        return res.status(200).json({ data: req.user });
      }
      const profile = usersModel.getFullUserProfile(req.user.id);
      if (!profile) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
      }
      if (profile.status === 'banned') {
        return res.status(403).json({ error: { code: 'ACCOUNT_BANNED', message: 'This account has been banned' } });
      }
      return res.status(200).json({ data: profile });
    } catch (error) {
      console.error('Failed to fetch current user:', error.message);
      return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'An error occurred while fetching user info' } });
    }
  });

module.exports = router;
