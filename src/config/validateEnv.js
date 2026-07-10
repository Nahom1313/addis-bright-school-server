/**
 * validateEnv.js — startup environment validation
 */
const REQUIRED = [
  {
    key: "MONGODB_URI",
    hint: "MongoDB connection string — get one at https://cloud.mongodb.com",
  },
  {
    key: "JWT_SECRET",
    hint: "Random string ≥32 chars — run: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"",
  },
  {
    key: "JWT_REFRESH_SECRET",
    hint: "A different random string ≥32 chars from JWT_SECRET",
  },
];

const WARNED = [
  { key: "CLIENT_URL", hint: "Set to your frontend domain in production" },
  {
    key: "GROQ_API_KEY",
    placeholder: "replace_me",
    hint: "Optional — enables AI status log summaries",
  },
  { key: "EMAIL_HOST", hint: "Optional — enables password reset emails" },
  {
    key: "REDIS_URL",
    hint: "Optional — enables shared Socket.io state across cluster workers",
  },
];

const R = "\x1b[31m",
  Y = "\x1b[33m",
  G = "\x1b[32m",
  X = "\x1b[0m",
  B = "\x1b[1m";

export const validateEnv = () => {
  const errors = [];
  const warnings = [];

  for (const { key, hint } of REQUIRED) {
    const val = process.env[key];
    if (!val || val.includes("<") || val.includes("replace")) {
      errors.push(`  ${R}✗ ${key}${X}\n    → ${hint}`);
    }
  }

  const secret = process.env.JWT_SECRET;
  if (secret && secret.length < 32) {
    errors.push(
      `  ${R}✗ JWT_SECRET too short (${secret.length} chars, need ≥32)${X}`,
    );
  }

  const refreshSecret = process.env.JWT_REFRESH_SECRET;
  if (refreshSecret && refreshSecret === process.env.JWT_SECRET) {
    errors.push(
      `  ${R}✗ JWT_REFRESH_SECRET must be different from JWT_SECRET${X}`,
    );
  }

  for (const { key, hint } of WARNED) {
    if (!process.env[key]) warnings.push(`  ${Y}⚠ ${key}${X}\n    → ${hint}`);
  }

  if (warnings.length) {
    console.warn(`\n${Y}${B}Environment warnings:${X}`);
    warnings.forEach((w) => console.warn(w));
    console.warn("");
  }

  if (errors.length) {
    console.error(
      `\n${R}${B}❌ Missing or invalid environment variables:${X}\n`,
    );
    errors.forEach((e) => console.error(e));
    console.error(`\n${R}Fix these in server/.env then restart.${X}\n`);
    process.exit(1);
  }

  console.log(`${G}✅ Environment validated${X}`);
};
