import Groq from 'groq-sdk';

let client = null;

export const getGroqClient = () => {
  if (!client) {
    if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'replace_me') {
      throw new Error('GROQ_API_KEY is not configured in server/.env');
    }
    client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return client;
};

export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const isRetryableGroqError = (err) =>
  err.status >= 500 ||
  err.status === 429 ||
  err.code === 'ECONNRESET' ||
  err.code === 'ETIMEDOUT';
