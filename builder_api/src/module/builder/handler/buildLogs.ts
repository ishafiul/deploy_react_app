import {HonoApp, upgradeWebSocket} from "../../../type";
import {ServerWebSocket} from "bun";
import {Queue, QueueEvents} from "bullmq";
import {buildLogs} from "../../../db/schema";
import {getDbClient} from "../../../utils/db/client";

// Initialize log queue
const logQueue = new Queue('buildLogs', {
    connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
    },
});

// Listen for completed jobs
const queueEvents = new QueueEvents('buildLogs', {
    connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
    },
});

queueEvents.on('completed', async ({ jobId }) => {
    const job = await logQueue.getJob(jobId);
    if (!job) return;

    const { projectId, userId, message, level, timestamp } = job.data;
    const db = getDbClient();
    // Store log in database
    await db.insert(buildLogs).values({
        projectId,
        message,
        level,
        timestamp,
    });

    /*// Send log update to the user's WebSocket connection if they are online
    const ws = activeConnections.get(userId);
    if (ws) {
        ws.send(JSON.stringify({ projectId, message, level, timestamp }));
    }*/
});

export default (app: HonoApp) => {
    app.get(
        '/build/:projectId/logs/ws',
        upgradeWebSocket((c) => {
            return {
                onOpen(event, ws) {
                    const rawWs = ws.raw as ServerWebSocket;
                    console.log(`User  connected.`);
                },
                onMessage(event, ws) {
                    console.log(`Message from : ${event.data}`);
                    ws.send("Message from")
                },
                onClose() {
                    console.log(`User  disconnected.`);
                    //activeConnections.delete(userId);
                },
            };
        })
    );
}

/*
export default (app: HonoApp) =>
    app.get('/build/:projectId/logs/ws', async (c) => {
        const projectId = c.req.param('projectId');
        const {authID} = c.get('jwtPayload');

        if (!authID) {
            return c.json({message: "Unauthorized"}, 401);
        }

        // Verify project exists and belongs to user
        const project = await db.query.projects.findFirst({
            where: eq(projects.id, projectId),
        });

        if (!project || project.userId !== authID) {
            return c.json({message: "Project not found"}, 404);
        }

        // Define WebSocket handler
        const wsHandler: WebSocketHandler = {
            open(ws: ServerWebSocket) {
                // Add to connections store
                if (!connections.has(projectId)) {
                    connections.set(projectId, new Set());
                }
                connections.get(projectId)!.add(ws);

                // Send existing logs
                db.query.buildLogs.findMany({
                    where: eq(buildLogs.projectId, projectId),
                    orderBy: (logs: typeof buildLogs, {asc}: { asc: any }) => [asc(logs.timestamp)],
                }).then(logs => {
                    logs.forEach((log: any) => {
                        ws.send(JSON.stringify({
                            type: 'log',
                            data: {
                                message: log.message,
                                level: log.level,
                                timestamp: new Date(log.timestamp).toISOString(),
                            },
                        }));
                    });
                });
            },
            message(ws: ServerWebSocket, message: string | Buffer) {
                console.log('Received message:', message.toString());
            },
            close(ws: ServerWebSocket) {
                const projectConnections = connections.get(projectId);
                if (projectConnections) {
                    projectConnections.delete(ws);
                    if (projectConnections.size === 0) {
                        connections.delete(projectId);
                    }
                }
            },
        };

        // Upgrade the connection
        if (!c.req.raw.headers.get("upgrade")?.toLowerCase().includes("websocket")) {
            return c.json({message: "Expected websocket upgrade"}, 400);
        }

        const upgraded = Bun.upgradeWebSocket(c.req.raw, wsHandler);
        if (!upgraded.success) {
            return c.json({message: "Failed to upgrade connection"}, 500);
        }

        return new Response(null, {
            status: 101,
            headers: upgraded.headers,
        });
    }); */
