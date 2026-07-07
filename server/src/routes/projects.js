const express = require("express");
const {
    communityDb,
    usersDb,
    filesDb,
    moderationDb,
} = require("../db/connections");
const {
    requireAuth,
    cooldown,
    verifyTurnstile,
    checkBannedKeywords,
} = require("../middleware");
const { toJSON, fromJSON } = require("../utils/jsonField");
const usersModel = require("../models/usersModel");

const router = express.Router();

/**
 * GET /api/community/projects
 * Public feed lookup for active projects with search and status filters
 */
router.get("/", (req, res) => {
    const { status, search } = req.query;
    const page = parseInt(req.query.page || "1", 10);
    const limit = parseInt(req.query.limit || "10", 10);
    const offset = (page - 1) * limit;

    try {
        let baseQuery = `FROM projects WHERE visibility = 'public'`;
        const params = [];

        if (status) {
            baseQuery += ` AND status = ?`;
            params.push(status);
        }

        if (search) {
            baseQuery += ` AND (name LIKE ? OR description LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`);
        }

        const totalRow = communityDb
            .prepare(`SELECT COUNT(*) AS total ` + baseQuery)
            .get(...params);
        const total = totalRow ? totalRow.total : 0;

        const queryParams = [...params, limit, offset];
        const projects = communityDb
            .prepare(
                `
      SELECT *
      ` +
                    baseQuery +
                    `
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `,
            )
            .all(...queryParams);

        const detailedProjects = projects.map((proj) => {
            const memberCountRow = communityDb
                .prepare(
                    "SELECT COUNT(*) AS count FROM project_members WHERE project_id = ?",
                )
                .get(proj.id);

            const owner = usersDb
                .prepare(
                    "SELECT id, username, display_name, avatar_file_id FROM users WHERE id = ?",
                )
                .get(proj.owner_id);
            let avatarUrl = null;
            if (owner && owner.avatar_file_id) {
                const file = filesDb
                    .prepare("SELECT cdn_url FROM files WHERE id = ?")
                    .get(owner.avatar_file_id);
                avatarUrl = file ? file.cdn_url : null;
            }

            return {
                ...proj,
                memberCount: memberCountRow ? memberCountRow.count : 0,
                owner: owner
                    ? {
                          id: owner.id,
                          username: owner.username,
                          display_name: owner.display_name,
                          avatar_url: avatarUrl,
                      }
                    : null,
            };
        });

        return res.status(200).json({
            data: detailedProjects,
            pagination: {
                page,
                limit,
                total,
            },
        });
    } catch (error) {
        console.error("Failed to list projects:", error.message);
        return res.status(500).json({
            error: {
                code: "SERVER_ERROR",
                message: "An error occurred while listing projects",
            },
        });
    }
});

/**
 * GET /api/community/projects/invites/me
 * Protected: Retrieve all pending invitations for req.user
 */
router.get("/invites/me", requireAuth, (req, res) => {
    try {
        const invites = communityDb
            .prepare(
                `
      SELECT * FROM project_invites
      WHERE invited_user_id = ? AND status = 'pending'
      ORDER BY created_at DESC
    `,
            )
            .all(req.user.id);

        const detailedInvites = invites.map((invite) => {
            const project = communityDb
                .prepare(
                    "SELECT id, name, description, status, visibility FROM projects WHERE id = ?",
                )
                .get(invite.project_id);

            const inviter = usersDb
                .prepare(
                    "SELECT id, username, display_name, avatar_file_id FROM users WHERE id = ?",
                )
                .get(invite.invited_by);
            let avatarUrl = null;
            if (inviter && inviter.avatar_file_id) {
                const file = filesDb
                    .prepare("SELECT cdn_url FROM files WHERE id = ?")
                    .get(inviter.avatar_file_id);
                avatarUrl = file ? file.cdn_url : null;
            }

            return {
                ...invite,
                project: project || null,
                invited_by: inviter
                    ? {
                          id: inviter.id,
                          username: inviter.username,
                          display_name: inviter.display_name,
                          avatar_url: avatarUrl,
                      }
                    : null,
            };
        });

        return res.status(200).json({
            data: detailedInvites,
        });
    } catch (error) {
        console.error("Failed to get invites:", error.message);
        return res.status(500).json({
            error: {
                code: "SERVER_ERROR",
                message: "An error occurred while fetching invitations",
            },
        });
    }
});

/**
 * POST /api/community/projects/invites/:inviteId/respond
 * Protected: Respond (accept/decline) to a project invitation
 */
router.post("/invites/:inviteId/respond", requireAuth, (req, res) => {
    const { inviteId } = req.params;
    const { action } = req.body;

    if (!action || !["accept", "decline"].includes(action)) {
        return res.status(400).json({
            error: {
                code: "BAD_REQUEST",
                message: 'action must be either "accept" or "decline"',
            },
        });
    }

    try {
        const invite = communityDb
            .prepare("SELECT * FROM project_invites WHERE id = ?")
            .get(inviteId);
        if (!invite) {
            return res.status(404).json({
                error: {
                    code: "NOT_FOUND",
                    message: "Invitation not found",
                },
            });
        }

        if (invite.status !== "pending") {
            return res.status(400).json({
                error: {
                    code: "BAD_REQUEST",
                    message: "This invitation has already been responded to",
                },
            });
        }

        if (invite.invited_user_id !== req.user.id) {
            return res.status(403).json({
                error: {
                    code: "FORBIDDEN",
                    message:
                        "You do not have permission to respond to this invitation",
                },
            });
        }

        if (action === "accept") {
            const dbTransaction = communityDb.transaction(() => {
                communityDb
                    .prepare(
                        "UPDATE project_invites SET status = 'accepted' WHERE id = ?",
                    )
                    .run(inviteId);

                const exists = communityDb
                    .prepare(
                        "SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?",
                    )
                    .get(invite.project_id, req.user.id);
                if (!exists) {
                    communityDb
                        .prepare(
                            `
            INSERT INTO project_members (project_id, user_id, role)
            VALUES (?, ?, 'member')
          `,
                        )
                        .run(invite.project_id, req.user.id);
                }
            });
            dbTransaction();
        } else {
            communityDb
                .prepare(
                    "UPDATE project_invites SET status = 'declined' WHERE id = ?",
                )
                .run(inviteId);
        }

        return res.status(200).json({
            data: {
                message: `Invitation successfully ${action}ed`,
            },
        });
    } catch (error) {
        console.error("Failed to respond to invite:", error.message);
        return res.status(500).json({
            error: {
                code: "SERVER_ERROR",
                message: "An error occurred while responding to invitation",
            },
        });
    }
});

/**
 * GET /api/community/projects/:id
 * Public: Get a single project's details including members list
 */
router.get("/:id", (req, res) => {
    const { id } = req.params;

    try {
        const project = communityDb
            .prepare("SELECT * FROM projects WHERE id = ?")
            .get(id);
        if (!project) {
            return res.status(404).json({
                error: {
                    code: "NOT_FOUND",
                    message: "Project not found",
                },
            });
        }

        const memberRows = communityDb
            .prepare(
                "SELECT user_id, role FROM project_members WHERE project_id = ?",
            )
            .all(id);
        const members = memberRows.map((row) => {
            const user = usersDb
                .prepare(
                    "SELECT id, username, display_name, avatar_file_id FROM users WHERE id = ?",
                )
                .get(row.user_id);
            let avatarUrl = null;
            if (user && user.avatar_file_id) {
                const file = filesDb
                    .prepare("SELECT cdn_url FROM files WHERE id = ?")
                    .get(user.avatar_file_id);
                avatarUrl = file ? file.cdn_url : null;
            }
            return {
                user_id: row.user_id,
                username: user ? user.username : null,
                display_name: user ? user.display_name : null,
                avatar_url: avatarUrl,
                role: row.role,
            };
        });

        return res.status(200).json({
            data: {
                ...project,
                members,
            },
        });
    } catch (error) {
        console.error("Failed to get project detail:", error.message);
        return res.status(500).json({
            error: {
                code: "SERVER_ERROR",
                message: "An error occurred while fetching project details",
            },
        });
    }
});

/**
 * POST /api/community/projects
 * Protected: Create a project (cooldown, Turnstile, keyword validation)
 */
router.post(
    "/",
    requireAuth,
    cooldown("project_create", 120),
    /* verifyTurnstile, */ checkBannedKeywords(["name", "description"]),
    (req, res) => {
        const { name, description, status, visibility } = req.body;

        if (!name) {
            return res.status(400).json({
                error: {
                    code: "BAD_REQUEST",
                    message: "Project name is required",
                },
            });
        }

        try {
            const dbTransaction = communityDb.transaction(() => {
                const info = communityDb
                    .prepare(
                        `
        INSERT INTO projects (owner_id, name, description, status, visibility)
        VALUES (?, ?, ?, ?, ?)
      `,
                    )
                    .run(
                        req.user.id,
                        name,
                        description || null,
                        status || "recruiting",
                        visibility || "public",
                    );

                const projectId = info.lastInsertRowid;

                communityDb
                    .prepare(
                        `
        INSERT INTO project_members (project_id, user_id, role)
        VALUES (?, ?, 'owner')
      `,
                    )
                    .run(projectId, req.user.id);

                return projectId;
            });

            const projectId = dbTransaction();
            const createdProject = communityDb
                .prepare("SELECT * FROM projects WHERE id = ?")
                .get(projectId);

            return res.status(201).json({
                data: createdProject,
            });
        } catch (error) {
            console.error("Failed to create project:", error.message);
            return res.status(500).json({
                error: {
                    code: "SERVER_ERROR",
                    message: "An error occurred while creating project",
                },
            });
        }
    },
);

/**
 * PATCH /api/community/projects/:id
 * Protected: Modify project information (Owner only)
 */
router.patch("/:id", requireAuth, (req, res) => {
    const { id } = req.params;
    const { name, description, status, visibility } = req.body;

    try {
        const project = communityDb
            .prepare("SELECT * FROM projects WHERE id = ?")
            .get(id);
        if (!project) {
            return res.status(404).json({
                error: {
                    code: "NOT_FOUND",
                    message: "Project not found",
                },
            });
        }

        if (project.owner_id !== req.user.id) {
            return res.status(403).json({
                error: {
                    code: "FORBIDDEN",
                    message: "Only the project owner can update this project",
                },
            });
        }

        const updates = [];
        const values = [];

        if (name !== undefined) {
            updates.push("name = ?");
            values.push(name);
        }
        if (description !== undefined) {
            updates.push("description = ?");
            values.push(description);
        }
        if (status !== undefined) {
            updates.push("status = ?");
            values.push(status);
        }
        if (visibility !== undefined) {
            updates.push("visibility = ?");
            values.push(visibility);
        }

        if (updates.length > 0) {
            updates.push("updated_at = datetime('now')");
            values.push(id);
            communityDb
                .prepare(
                    `UPDATE projects SET ${updates.join(", ")} WHERE id = ?`,
                )
                .run(...values);
        }

        const updatedProject = communityDb
            .prepare("SELECT * FROM projects WHERE id = ?")
            .get(id);
        return res.status(200).json({
            data: updatedProject,
        });
    } catch (error) {
        console.error("Failed to update project:", error.message);
        return res.status(500).json({
            error: {
                code: "SERVER_ERROR",
                message: "An error occurred while updating project",
            },
        });
    }
});

/**
 * DELETE /api/community/projects/:id
 * Protected: Delete project and cascade posts (Owner or Admin only)
 */
router.delete("/:id", requireAuth, (req, res) => {
    const { id } = req.params;

    try {
        const project = communityDb
            .prepare("SELECT * FROM projects WHERE id = ?")
            .get(id);
        if (!project) {
            return res.status(404).json({
                error: {
                    code: "NOT_FOUND",
                    message: "Project not found",
                },
            });
        }

        if (
            project.owner_id !== req.user.id &&
            req.user.role !== "admin" &&
            req.user.role !== "teacher"
        ) {
            return res.status(403).json({
                error: {
                    code: "FORBIDDEN",
                    message:
                        "You do not have permission to delete this project",
                },
            });
        }

        const dbTransaction = communityDb.transaction(() => {
            communityDb
                .prepare("DELETE FROM posts WHERE project_id = ?")
                .run(id);
            communityDb.prepare("DELETE FROM projects WHERE id = ?").run(id);
        });
        dbTransaction();

        return res.status(200).json({
            data: {
                message: "Project and all related data deleted successfully",
            },
        });
    } catch (error) {
        console.error("Failed to delete project:", error.message);
        return res.status(500).json({
            error: {
                code: "SERVER_ERROR",
                message: "An error occurred while deleting project",
            },
        });
    }
});

/**
 * POST /api/community/projects/:id/invite
 * Protected: Invite user to project by username (Owner only)
 */
router.post("/:id/invite", requireAuth, (req, res) => {
    const { id } = req.params;
    const { username } = req.body;

    if (!username) {
        return res.status(400).json({
            error: {
                code: "BAD_REQUEST",
                message: "username is required to send an invitation",
            },
        });
    }

    try {
        const project = communityDb
            .prepare("SELECT * FROM projects WHERE id = ?")
            .get(id);
        if (!project) {
            return res.status(404).json({
                error: {
                    code: "NOT_FOUND",
                    message: "Project not found",
                },
            });
        }

        if (project.owner_id !== req.user.id) {
            return res.status(403).json({
                error: {
                    code: "FORBIDDEN",
                    message: "Only the project owner can invite members",
                },
            });
        }

        const targetUser = usersModel.findByUsername(username);
        if (!targetUser) {
            return res.status(404).json({
                error: {
                    code: "NOT_FOUND",
                    message: "User not found",
                },
            });
        }

        const isMember = communityDb
            .prepare(
                "SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?",
            )
            .get(id, targetUser.id);
        if (isMember) {
            return res.status(409).json({
                error: {
                    code: "INVITE_EXISTS",
                    message: "User is already a member of this project",
                },
            });
        }

        const hasInvite = communityDb
            .prepare(
                "SELECT 1 FROM project_invites WHERE project_id = ? AND invited_user_id = ? AND status = 'pending'",
            )
            .get(id, targetUser.id);
        if (hasInvite) {
            return res.status(409).json({
                error: {
                    code: "INVITE_EXISTS",
                    message:
                        "A pending invitation already exists for this user",
                },
            });
        }

        communityDb
            .prepare(
                `
      INSERT INTO project_invites (project_id, invited_user_id, invited_by, status)
      VALUES (?, ?, ?, 'pending')
    `,
            )
            .run(id, targetUser.id, req.user.id);

        return res.status(201).json({
            data: {
                message: "Invite sent successfully",
            },
        });
    } catch (error) {
        console.error("Failed to invite member:", error.message);
        return res.status(500).json({
            error: {
                code: "SERVER_ERROR",
                message: "An error occurred while sending invitation",
            },
        });
    }
});

/**
 * DELETE /api/community/projects/:id/members/:userId
 * Protected: Remove member from project (Owner only)
 */
router.delete("/:id/members/:userId", requireAuth, (req, res) => {
    const { id, userId } = req.params;
    const targetUserId = parseInt(userId, 10);

    try {
        const project = communityDb
            .prepare("SELECT * FROM projects WHERE id = ?")
            .get(id);
        if (!project) {
            return res.status(404).json({
                error: {
                    code: "NOT_FOUND",
                    message: "Project not found",
                },
            });
        }

        if (project.owner_id !== req.user.id) {
            return res.status(403).json({
                error: {
                    code: "FORBIDDEN",
                    message: "Only the project owner can remove members",
                },
            });
        }

        if (targetUserId === project.owner_id) {
            return res.status(400).json({
                error: {
                    code: "BAD_REQUEST",
                    message: "Cannot remove the project owner",
                },
            });
        }

        const result = communityDb
            .prepare(
                "DELETE FROM project_members WHERE project_id = ? AND user_id = ?",
            )
            .run(id, targetUserId);
        if (result.changes === 0) {
            return res.status(404).json({
                error: {
                    code: "NOT_FOUND",
                    message: "Member not found in this project",
                },
            });
        }

        return res.status(200).json({
            data: {
                message: "Member removed successfully",
            },
        });
    } catch (error) {
        console.error("Failed to remove member:", error.message);
        return res.status(500).json({
            error: {
                code: "SERVER_ERROR",
                message: "An error occurred while removing member",
            },
        });
    }
});

/**
 * GET /api/community/projects/:id/posts
 * Public: Get posts under a specific project (with access checks for private visibility)
 */
router.get("/:id/posts", (req, res) => {
    const { id } = req.params;
    const page = parseInt(req.query.page || "1", 10);
    const limit = parseInt(req.query.limit || "10", 10);
    const offset = (page - 1) * limit;

    try {
        const project = communityDb
            .prepare("SELECT * FROM projects WHERE id = ?")
            .get(id);
        if (!project) {
            return res.status(404).json({
                error: {
                    code: "NOT_FOUND",
                    message: "Project not found",
                },
            });
        }

        // Access check for private visibility
        if (project.visibility === "private") {
            const authHeader = req.headers.authorization;
            if (
                !authHeader ||
                !authHeader.toLowerCase().startsWith("bearer ")
            ) {
                return res.status(401).json({
                    error: {
                        code: "UNAUTHORIZED",
                        message:
                            "Authentication required for private project posts",
                    },
                });
            }

            const token = authHeader.substring(7).trim();
            const { verifyToken } = require("../utils/jwt");
            let decoded;
            try {
                decoded = verifyToken(token);
            } catch (err) {
                return res.status(401).json({
                    error: {
                        code: "UNAUTHORIZED",
                        message: "Invalid token",
                    },
                });
            }

            if (decoded.id !== 0 || decoded.role !== "admin") {
                const isMember = communityDb
                    .prepare(
                        "SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?",
                    )
                    .get(id, decoded.id);
                if (!isMember) {
                    return res.status(403).json({
                        error: {
                            code: "FORBIDDEN",
                            message:
                                "Only members can view posts in this private project",
                        },
                    });
                }
            }
        }

        const baseQuery = `FROM posts WHERE project_id = ? AND status = 'visible'`;
        const totalRow = communityDb
            .prepare(`SELECT COUNT(*) AS total ` + baseQuery)
            .get(id);
        const total = totalRow ? totalRow.total : 0;

        const posts = communityDb
            .prepare(
                `
      SELECT *
      ` +
                    baseQuery +
                    `
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `,
            )
            .all(id, limit, offset);

        const detailedPosts = posts.map((post) => {
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

            const author = usersDb
                .prepare(
                    "SELECT username, display_name, avatar_file_id FROM users WHERE id = ?",
                )
                .get(post.author_id);
            let avatarUrl = null;
            if (author && author.avatar_file_id) {
                const file = filesDb
                    .prepare("SELECT cdn_url FROM files WHERE id = ?")
                    .get(author.avatar_file_id);
                avatarUrl = file ? file.cdn_url : null;
            }

            return {
                ...post,
                tags: fromJSON(post.tags, []),
                reactionCount: reactionCountRow ? reactionCountRow.count : 0,
                commentCount: commentCountRow ? commentCountRow.count : 0,
                author: author
                    ? {
                          username: author.username,
                          display_name: author.display_name,
                          avatar_url: avatarUrl,
                      }
                    : null,
            };
        });

        return res.status(200).json({
            data: detailedPosts,
            pagination: {
                page,
                limit,
                total,
            },
        });
    } catch (error) {
        console.error("Failed to get project posts:", error.message);
        return res.status(500).json({
            error: {
                code: "SERVER_ERROR",
                message: "An error occurred while fetching project posts",
            },
        });
    }
});

/**
 * POST /api/community/projects/:id/posts
 * Protected: Create a post within a project (Project members only)
 */
router.post(
    "/:id/posts",
    requireAuth,
    cooldown("post_create", 60),
    checkBannedKeywords(["title", "content"]),
    (req, res) => {
        const { id } = req.params;
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
            const project = communityDb
                .prepare("SELECT * FROM projects WHERE id = ?")
                .get(id);
            if (!project) {
                return res.status(404).json({
                    error: {
                        code: "NOT_FOUND",
                        message: "Project not found",
                    },
                });
            }

            if (req.user.role !== "admin") {
                const isMember = communityDb
                    .prepare(
                        "SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?",
                    )
                    .get(id, req.user.id);
                if (!isMember) {
                    return res.status(403).json({
                        error: {
                            code: "FORBIDDEN",
                            message:
                                "Only members of this project can create posts here",
                        },
                    });
                }
            }

            const info = communityDb
                .prepare(
                    `
      INSERT INTO posts (author_id, project_id, title, content, tags, attachment_file_id, status)
      VALUES (?, ?, ?, ?, ?, ?, 'visible')
    `,
                )
                .run(
                    req.user.id,
                    id,
                    title || null,
                    content,
                    toJSON(tags || []),
                    attachment_file_id || null,
                );

            const created = communityDb
                .prepare("SELECT * FROM posts WHERE id = ?")
                .get(info.lastInsertRowid);
            return res.status(201).json({
                data: {
                    ...created,
                    tags: fromJSON(created.tags, []),
                },
            });
        } catch (error) {
            console.error("Failed to create project post:", error.message);
            return res.status(500).json({
                error: {
                    code: "SERVER_ERROR",
                    message: "An error occurred while creating project post",
                },
            });
        }
    },
);

module.exports = router;
