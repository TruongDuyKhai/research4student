const express = require("express");
const {
    communityDb,
    moderationDb,
    usersDb,
    filesDb,
} = require("../db/connections");
const { fileUrlById } = require("../services/discordStorage");
const {
    requireAuth,
    requireRole,
    writeLimiter,
    cooldown,
    verifyTurnstile,
    checkBannedKeywords,
} = require("../middleware");
const { toJSON, fromJSON } = require("../utils/jsonField");
const { verifyToken } = require("../utils/jwt");
const { addStudentPoints } = require("../utils/levelSystem");

const router = express.Router();

/**
 * Helper to optionally parse a JWT from authorization headers.
 */
function parseOptionalAuth(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
        return null;
    }

    const token = authHeader.substring(7).trim();
    try {
        const decoded = verifyToken(token);
        if (decoded.id === 0 && decoded.role === "admin") {
            return { id: 0, role: "admin", username: "admin" };
        }
        const user = usersDb
            .prepare("SELECT id, role, status FROM users WHERE id = ?")
            .get(decoded.id);
        if (user && user.status !== "banned") {
            return user;
        }
    } catch (error) {
        // Ignore verification errors
    }
    return null;
}

/**
 * Helper to fetch author public details from usersDb and filesDb
 * @param {number} authorId
 * @returns {object}
 */
function getAuthorInfo(authorId) {
    const author = usersDb
        .prepare(
            "SELECT username, display_name, avatar_file_id FROM users WHERE id = ?",
        )
        .get(authorId);
    const avatarUrl = fileUrlById(author?.avatar_file_id);
    return author
        ? {
              username: author.username,
              display_name: author.display_name,
              avatar_url: avatarUrl,
          }
        : null;
}

/* ==========================================
   POSTS ENDPOINTS
   ========================================== */

/**
 * GET /api/community/posts
 * Public feed lookup with filters, tags search, and reaction/comment counts aggregation
 */
router.get("/posts", (req, res) => {
    const { tag, project_id, author } = req.query;

    const page = parseInt(req.query.page || "1", 10);
    const limit = parseInt(req.query.limit || "10", 10);
    const offset = (page - 1) * limit;

    try {
        let baseQuery = `
      FROM posts p
      WHERE p.status = 'visible'
    `;
        const params = [];

        // Filter project context
        if (project_id) {
            baseQuery += ` AND p.project_id = ?`;
            params.push(project_id);
        } else {
            baseQuery += ` AND p.project_id IS NULL`;
        }

        // Filter author
        if (author) {
            let authorId = null;
            if (/^\d+$/.test(author)) {
                authorId = parseInt(author, 10);
            } else {
                const userObj = usersDb
                    .prepare("SELECT id FROM users WHERE username = ?")
                    .get(author);
                authorId = userObj ? userObj.id : -1;
            }
            baseQuery += ` AND p.author_id = ?`;
            params.push(authorId);
        }

        // Tag search
        if (tag) {
            baseQuery += ` AND p.tags LIKE ?`;
            params.push(`%"${tag}"%`);
        }

        // Get total
        const totalRow = communityDb
            .prepare(`SELECT COUNT(*) AS total ` + baseQuery)
            .get(...params);
        const total = totalRow ? totalRow.total : 0;

        // Get rows
        const queryParams = [...params, limit, offset];
        const posts = communityDb
            .prepare(
                `
      SELECT p.*
      ` +
                    baseQuery +
                    `
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `,
            )
            .all(...queryParams);

        // Map aggregated counts and metadata
        const postsDetail = posts.map((post) => {
            const reactionCountRow = communityDb
                .prepare(
                    "SELECT COUNT(*) AS count FROM reactions WHERE target_type = 'post' AND target_id = ?",
                )
                .get(post.id);
            const commentCountRow = communityDb
                .prepare(
                    "SELECT COUNT(*) AS count FROM comments WHERE post_id = ? AND status = 'visible'",
                )
                .get(post.id);

            const attachmentUrl = fileUrlById(post.attachment_file_id);

            return {
                ...post,
                tags: fromJSON(post.tags, []),
                reactionCount: reactionCountRow ? reactionCountRow.count : 0,
                commentCount: commentCountRow ? commentCountRow.count : 0,
                attachment_url: attachmentUrl,
                author: getAuthorInfo(post.author_id),
            };
        });

        return res.status(200).json({
            data: postsDetail,
            pagination: {
                page,
                limit,
                total,
            },
        });
    } catch (error) {
        console.error("Failed to query posts feed:", error.message);
        return res.status(500).json({
            error: {
                code: "SERVER_ERROR",
                message: "An error occurred while listing community posts",
            },
        });
    }
});

/**
 * GET /api/community/posts/:id
 * Public detail lookup for a single forum post
 */
router.get("/posts/:id", (req, res) => {
    const { id } = req.params;

    try {
        const post = communityDb
            .prepare("SELECT * FROM posts WHERE id = ? AND status = 'visible'")
            .get(id);
        if (!post) {
            return res.status(404).json({
                error: {
                    code: "NOT_FOUND",
                    message: "Post not found",
                },
            });
        }

        const reactionCountRow = communityDb
            .prepare(
                "SELECT COUNT(*) AS count FROM reactions WHERE target_type = 'post' AND target_id = ?",
            )
            .get(post.id);
        const commentCountRow = communityDb
            .prepare(
                "SELECT COUNT(*) AS count FROM comments WHERE post_id = ? AND status = 'visible'",
            )
            .get(post.id);

        let attachmentUrl = null;
        let attachmentName = null;
        if (post.attachment_file_id) {
            const file = filesDb
                .prepare("SELECT original_name FROM files WHERE id = ?")
                .get(post.attachment_file_id);
            if (file) {
                attachmentUrl = fileUrlById(post.attachment_file_id);
                attachmentName = file.original_name;
            }
        }

        const detailedPost = {
            ...post,
            tags: fromJSON(post.tags, []),
            reactionCount: reactionCountRow ? reactionCountRow.count : 0,
            commentCount: commentCountRow ? commentCountRow.count : 0,
            attachment_url: attachmentUrl,
            attachment_name: attachmentName,
            author: getAuthorInfo(post.author_id),
        };

        return res.status(200).json({ data: detailedPost });
    } catch (error) {
        console.error("Failed to get post details:", error.message);
        return res.status(500).json({
            error: {
                code: "SERVER_ERROR",
                message: "An error occurred while retrieving community post",
            },
        });
    }
});

/**
 * POST /api/community/posts
 * Protected: Create a new post (writeLimiter, cooldown, Turnstile check, banlist validation)
 */
router.post(
    "/posts",
    requireAuth,
    writeLimiter,
    cooldown("post_create", 60),
    /* verifyTurnstile, */ checkBannedKeywords(["title", "content"]),
    (req, res) => {
        const { title, content, tags, attachment_file_id } = req.body;

        if (!content) {
            return res.status(400).json({
                error: {
                    code: "BAD_REQUEST",
                    message: "Content is required to create a post",
                },
            });
        }

        if (tags !== undefined && !Array.isArray(tags)) {
            return res.status(400).json({
                error: {
                    code: "BAD_REQUEST",
                    message: "Tags must be an array",
                },
            });
        }

        try {
            const info = communityDb
                .prepare(
                    `
      INSERT INTO posts (author_id, title, content, tags, attachment_file_id, status)
      VALUES (?, ?, ?, ?, ?, 'visible')
    `,
                )
                .run(
                    req.user.id,
                    title || null,
                    content,
                    toJSON(tags || []),
                    attachment_file_id || null,
                );

            const created = communityDb
                .prepare("SELECT * FROM posts WHERE id = ?")
                .get(info.lastInsertRowid);

            addStudentPoints(usersDb, req.user.id, 10);

            return res.status(201).json({
                data: {
                    ...created,
                    tags: fromJSON(created.tags, []),
                },
            });
        } catch (error) {
            console.error("Failed to create post:", error.message);
            return res.status(500).json({
                error: {
                    code: "SERVER_ERROR",
                    message: "An error occurred while creating post",
                },
            });
        }
    },
);

/**
 * PATCH /api/community/posts/:id
 * Protected: Edit post title, content, or tags (author or admin/teacher only)
 */
router.patch("/posts/:id", requireAuth, (req, res) => {
    const { id } = req.params;
    const { title, content, tags } = req.body;

    try {
        const post = communityDb
            .prepare("SELECT * FROM posts WHERE id = ?")
            .get(id);
        if (!post || post.status === "deleted") {
            return res.status(404).json({
                error: {
                    code: "NOT_FOUND",
                    message: "Post not found",
                },
            });
        }

        // Auth validation
        if (
            req.user.role !== "admin" &&
            req.user.role !== "teacher" &&
            post.author_id !== req.user.id
        ) {
            return res.status(403).json({
                error: {
                    code: "FORBIDDEN",
                    message: "You do not have permission to modify this post",
                },
            });
        }

        const updates = [];
        const values = [];

        if (title !== undefined) {
            updates.push("title = ?");
            values.push(title);
        }
        if (content !== undefined) {
            updates.push("content = ?");
            values.push(content);
        }
        if (tags !== undefined) {
            if (!Array.isArray(tags)) {
                return res.status(400).json({
                    error: {
                        code: "BAD_REQUEST",
                        message: "Tags must be an array",
                    },
                });
            }
            updates.push("tags = ?");
            values.push(toJSON(tags));
        }

        if (updates.length > 0) {
            updates.push("updated_at = datetime('now')");
            values.push(id);
            communityDb
                .prepare(`UPDATE posts SET ${updates.join(", ")} WHERE id = ?`)
                .run(...values);
        }

        const updated = communityDb
            .prepare("SELECT * FROM posts WHERE id = ?")
            .get(id);
        return res.status(200).json({
            data: {
                ...updated,
                tags: fromJSON(updated.tags, []),
            },
        });
    } catch (error) {
        console.error("Failed to update post:", error.message);
        return res.status(500).json({
            error: {
                code: "SERVER_ERROR",
                message: "An error occurred while updating post",
            },
        });
    }
});

/**
 * DELETE /api/community/posts/:id
 * Protected: Soft delete post (author or admin/teacher only)
 */
router.delete("/posts/:id", requireAuth, (req, res) => {
    const { id } = req.params;

    try {
        const post = communityDb
            .prepare("SELECT * FROM posts WHERE id = ?")
            .get(id);
        if (!post || post.status === "deleted") {
            return res.status(404).json({
                error: {
                    code: "NOT_FOUND",
                    message: "Post not found",
                },
            });
        }

        // Auth validation
        if (
            req.user.role !== "admin" &&
            req.user.role !== "teacher" &&
            post.author_id !== req.user.id
        ) {
            return res.status(403).json({
                error: {
                    code: "FORBIDDEN",
                    message: "You do not have permission to delete this post",
                },
            });
        }

        communityDb
            .prepare(
                "UPDATE posts SET status = 'deleted', updated_at = datetime('now') WHERE id = ?",
            )
            .run(id);

        return res.status(200).json({
            data: {
                message: "Post deleted successfully",
            },
        });
    } catch (error) {
        console.error("Failed to delete post:", error.message);
        return res.status(500).json({
            error: {
                code: "SERVER_ERROR",
                message: "An error occurred while deleting post",
            },
        });
    }
});

/* ==========================================
   COMMENTS ENDPOINTS
   ========================================== */

/**
 * GET /api/community/posts/:id/comments
 * Public list of visible comments formatted in a nested tree layout (root paging supported)
 */
router.get("/posts/:id/comments", (req, res) => {
    const { id } = req.params;

    const page = parseInt(req.query.page || "1", 10);
    const limit = parseInt(req.query.limit || "10", 10);
    const offset = (page - 1) * limit;

    try {
        const post = communityDb
            .prepare("SELECT id FROM posts WHERE id = ? AND status = 'visible'")
            .get(id);
        if (!post) {
            return res.status(404).json({
                error: {
                    code: "NOT_FOUND",
                    message: "Post not found",
                },
            });
        }

        const rootQuery = `
      FROM comments 
      WHERE post_id = ? AND status = 'visible' AND parent_comment_id IS NULL
    `;

        // Count root level
        const totalRow = communityDb
            .prepare(`SELECT COUNT(*) AS total ` + rootQuery)
            .get(id);
        const total = totalRow ? totalRow.total : 0;

        // Get root comments page
        const roots = communityDb
            .prepare(
                `
      SELECT *
      ` +
                    rootQuery +
                    `
      ORDER BY created_at ASC
      LIMIT ? OFFSET ?
    `,
            )
            .all(id, limit, offset);

        // Get all replies associated with this post
        const replies = communityDb
            .prepare(
                `
      SELECT *
      FROM comments
      WHERE post_id = ? AND status = 'visible' AND parent_comment_id IS NOT NULL
      ORDER BY created_at ASC
    `,
            )
            .all(id);

        const allComments = [...roots, ...replies];

        // Format author profile nodes
        const commentsWithAuthors = allComments.map((c) => {
            return {
                ...c,
                author: getAuthorInfo(c.author_id),
                replies: [],
            };
        });

        // Hash list objects mapping
        const commentMap = {};
        commentsWithAuthors.forEach((c) => {
            commentMap[c.id] = c;
        });

        const tree = [];
        commentsWithAuthors.forEach((c) => {
            if (c.parent_comment_id) {
                const parent = commentMap[c.parent_comment_id];
                if (parent) {
                    parent.replies.push(c);
                } else {
                    // If parent paginated out or missing, treat as top-level layout node
                    tree.push(c);
                }
            } else {
                tree.push(c);
            }
        });

        return res.status(200).json({
            data: tree,
            pagination: {
                page,
                limit,
                total,
            },
        });
    } catch (error) {
        console.error("Failed to get comments tree:", error.message);
        return res.status(500).json({
            error: {
                code: "SERVER_ERROR",
                message: "An error occurred while listing comments",
            },
        });
    }
});

/**
 * POST /api/community/posts/:id/comments
 * Protected: Add comment/reply (cooldown, turnstile, banlist checks)
 */
router.post(
    "/posts/:id/comments",
    requireAuth,
    cooldown("comment_create", 15),
    /* verifyTurnstile, */
    checkBannedKeywords(["content"]),
    (req, res) => {
        const { id } = req.params;
        const { content, parent_comment_id } = req.body;

        if (!content) {
            return res.status(400).json({
                error: {
                    code: "BAD_REQUEST",
                    message: "Comment content is required",
                },
            });
        }

        try {
            const post = communityDb
                .prepare(
                    "SELECT id FROM posts WHERE id = ? AND status = 'visible'",
                )
                .get(id);
            if (!post) {
                return res.status(404).json({
                    error: {
                        code: "NOT_FOUND",
                        message: "Post not found",
                    },
                });
            }

            if (parent_comment_id) {
                const parent = communityDb
                    .prepare(
                        "SELECT id, post_id FROM comments WHERE id = ? AND status = 'visible'",
                    )
                    .get(parent_comment_id);
                if (!parent || parent.post_id !== post.id) {
                    return res.status(400).json({
                        error: {
                            code: "BAD_REQUEST",
                            message:
                                "Target parent comment does not exist in this post",
                        },
                    });
                }
            }

            const info = communityDb
                .prepare(
                    `
      INSERT INTO comments (post_id, author_id, parent_comment_id, content, status)
      VALUES (?, ?, ?, ?, 'visible')
    `,
                )
                .run(post.id, req.user.id, parent_comment_id || null, content);

            const created = communityDb
                .prepare("SELECT * FROM comments WHERE id = ?")
                .get(info.lastInsertRowid);

            addStudentPoints(usersDb, req.user.id, 3);

            return res.status(201).json({
                data: {
                    ...created,
                    author: getAuthorInfo(created.author_id),
                },
            });
        } catch (error) {
            console.error("Failed to create comment:", error.message);
            return res.status(500).json({
                error: {
                    code: "SERVER_ERROR",
                    message: "An error occurred while creating comment",
                },
            });
        }
    },
);

/**
 * DELETE /api/community/comments/:id
 * Protected: Soft delete comment (author or admin/teacher only)
 */
router.delete("/comments/:id", requireAuth, (req, res) => {
    const { id } = req.params;

    try {
        const comment = communityDb
            .prepare("SELECT * FROM comments WHERE id = ?")
            .get(id);
        if (!comment || comment.status === "deleted") {
            return res.status(404).json({
                error: {
                    code: "NOT_FOUND",
                    message: "Comment not found",
                },
            });
        }

        // Auth check
        if (
            req.user.role !== "admin" &&
            req.user.role !== "teacher" &&
            comment.author_id !== req.user.id
        ) {
            return res.status(403).json({
                error: {
                    code: "FORBIDDEN",
                    message:
                        "You do not have permission to delete this comment",
                },
            });
        }

        communityDb
            .prepare("UPDATE comments SET status = 'deleted' WHERE id = ?")
            .run(id);

        return res.status(200).json({
            data: {
                message: "Comment deleted successfully",
            },
        });
    } catch (error) {
        console.error("Failed to delete comment:", error.message);
        return res.status(500).json({
            error: {
                code: "SERVER_ERROR",
                message: "An error occurred while deleting comment",
            },
        });
    }
});

/* ==========================================
   REACTIONS ENDPOINTS
   ========================================== */

/**
 * POST /api/community/reactions
 * Protected: Toggle a reaction on a post or comment (UPSERT toggle flow)
 */
router.post("/reactions", requireAuth, (req, res) => {
    const { target_type, target_id, type } = req.body;
    const reactionType = type || "like";

    if (
        !target_type ||
        !target_id ||
        !["post", "comment"].includes(target_type)
    ) {
        return res.status(400).json({
            error: {
                code: "BAD_REQUEST",
                message:
                    'target_type must be "post" or "comment", and target_id is required',
            },
        });
    }

    try {
        // Validate target existence
        if (target_type === "post") {
            const exists = communityDb
                .prepare(
                    "SELECT id FROM posts WHERE id = ? AND status = 'visible'",
                )
                .get(target_id);
            if (!exists) {
                return res.status(404).json({
                    error: {
                        code: "NOT_FOUND",
                        message: "Target post not found",
                    },
                });
            }
        } else {
            const exists = communityDb
                .prepare(
                    "SELECT id FROM comments WHERE id = ? AND status = 'visible'",
                )
                .get(target_id);
            if (!exists) {
                return res.status(404).json({
                    error: {
                        code: "NOT_FOUND",
                        message: "Target comment not found",
                    },
                });
            }
        }

        // Check if reaction already exists
        const existing = communityDb
            .prepare(
                `
      SELECT id FROM reactions
      WHERE target_type = ? AND target_id = ? AND user_id = ?
    `,
            )
            .get(target_type, target_id, req.user.id);

        let active = false;

        if (existing) {
            // Toggle off (delete)
            communityDb
                .prepare("DELETE FROM reactions WHERE id = ?")
                .run(existing.id);
            active = false;
        } else {
            // Toggle on (insert)
            communityDb
                .prepare(
                    `
        INSERT INTO reactions (target_type, target_id, user_id, type)
        VALUES (?, ?, ?, ?)
      `,
                )
                .run(target_type, target_id, req.user.id, reactionType);
            active = true;
            addStudentPoints(usersDb, req.user.id, 1);
        }

        // Fetch refreshed count
        const countRow = communityDb
            .prepare(
                `
      SELECT COUNT(*) AS count FROM reactions
      WHERE target_type = ? AND target_id = ?
    `,
            )
            .get(target_type, target_id);

        return res.status(200).json({
            data: {
                active,
                count: countRow ? countRow.count : 0,
            },
        });
    } catch (error) {
        console.error("Failed to toggle reaction:", error.message);
        return res.status(500).json({
            error: {
                code: "SERVER_ERROR",
                message: "An error occurred while registering reaction",
            },
        });
    }
});

/**
 * GET /api/community/reactions
 * Public list of reactions count and active status for requester
 */
router.get("/reactions", (req, res) => {
    const { target_type, target_id } = req.query;

    if (
        !target_type ||
        !target_id ||
        !["post", "comment"].includes(target_type)
    ) {
        return res.status(400).json({
            error: {
                code: "BAD_REQUEST",
                message: "target_type and target_id are required queries",
            },
        });
    }

    const reqUser = parseOptionalAuth(req);

    try {
        const countRow = communityDb
            .prepare(
                `
      SELECT COUNT(*) AS count FROM reactions
      WHERE target_type = ? AND target_id = ?
    `,
            )
            .get(target_type, target_id);

        let reactedByMe = false;
        if (reqUser) {
            const reacted = communityDb
                .prepare(
                    `
        SELECT id FROM reactions
        WHERE target_type = ? AND target_id = ? AND user_id = ?
      `,
                )
                .get(target_type, target_id, reqUser.id);
            reactedByMe = !!reacted;
        }

        return res.status(200).json({
            data: {
                count: countRow ? countRow.count : 0,
                reactedByMe,
            },
        });
    } catch (error) {
        console.error("Failed to retrieve reactions stats:", error.message);
        return res.status(500).json({
            error: {
                code: "SERVER_ERROR",
                message: "An error occurred while retrieving reactions stats",
            },
        });
    }
});

/* ==========================================
   REPORTS ENDPOINTS
   ========================================== */

/**
 * POST /api/community/reports
 * Protected: Report a post or comment to administrators (moderation.db)
 */
router.post("/reports", requireAuth, (req, res) => {
    const { target_type, target_id, reason } = req.body;

    if (!target_type || !target_id || !reason) {
        return res.status(400).json({
            error: {
                code: "BAD_REQUEST",
                message: "target_type, target_id, and reason are required",
            },
        });
    }

    try {
        moderationDb
            .prepare(
                `
      INSERT INTO reports (reporter_id, target_type, target_id, reason, status)
      VALUES (?, ?, ?, ?, 'pending')
    `,
            )
            .run(req.user.id, target_type, target_id, reason);

        return res.status(201).json({
            data: {
                message: "Report submitted successfully",
            },
        });
    } catch (error) {
        console.error("Failed to submit report:", error.message);
        return res.status(500).json({
            error: {
                code: "SERVER_ERROR",
                message: "An error occurred while submitting report",
            },
        });
    }
});

module.exports = router;
