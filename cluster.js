/**
 * cluster.js — Production entry point
 * Forks one worker per CPU core. Dead workers are automatically
 * restarted so a crash never takes down the whole server.
 *
 * Usage:  NODE_ENV=production node src/cluster.js
 * (PM2 already handles clustering — use src/index.js with PM2)
 */
import cluster from 'cluster';
import os from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const NUM_CPUS = os.cpus().length;

if (cluster.isPrimary) {
  console.log(`🧠 Primary ${process.pid} started — forking ${NUM_CPUS} workers`);

  for (let i = 0; i < NUM_CPUS; i++) cluster.fork();

  cluster.on('exit', (worker, code, signal) => {
    console.warn(`⚠️  Worker ${worker.process.pid} died (${signal || code}). Restarting…`);
    cluster.fork();
  });

  cluster.on('online', (worker) => {
    console.log(`✅ Worker ${worker.process.pid} online`);
  });
} else {
  // Each worker imports the real server
  await import('./index.js');
}
